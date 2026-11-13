import { describe, expect, it, vi } from "vitest";
import content from "@/content";
import {
  BLEEDING_BENIGN_WORDS,
  SELF_HARM_BENIGN_PHRASES,
  VANISHING_SUBJECTS,
  isSelfHarmMessage,
  withoutBleedingBenign,
} from "../../supabase/functions/_shared/safety";
import {
  CHAT_GREETING,
  buildChatLlmRequest,
  chatReply,
  resolveChatReply,
  shouldShowChatBanner,
  shouldShowFaq,
  type ChatMessage,
} from "./chat";

// 분기 기대값은 iOS OnmomEngine.chatReply를 직접 실행해 확인했다(2026-09-23).
const replies = content.chat_fallback.replies;
const greeting: ChatMessage = { role: "assistant", text: CHAT_GREETING };
const ask = (text: string): ChatMessage[] => [greeting, { role: "user", text }];
const replyTo = (text: string) => chatReply(ask(text)).text;

describe("규칙 폴백 — 분기 순서 (02 §9)", () => {
  it("자해가 최우선 — 기분·출혈 단어가 함께 있어도", () => {
    expect(replyTo("죽고 싶고 우울해요")).toBe(replies.self_harm);
    expect(replyTo("사라지고 싶어요")).toBe(replies.self_harm);
    expect(replyTo("자해하고 피가 나요")).toBe(replies.self_harm);
  });

  it("위기 번호 — 위기 답은 1577-0199·109·119, 기분 답에도 109·119(임상 사전 검토 B3)", () => {
    for (const n of ["1577-0199", "109", "119"]) expect(replies.self_harm, n).toContain(n);
    for (const n of ["1577-0199", "109", "119"]) expect(replies.mood, n).toContain(n);
  });

  it("기분이 출혈보다 먼저", () => {
    expect(replyTo("우울하고 피가 나요")).toBe(replies.mood);
    expect(replyTo("수유 자세가 힘들어요")).toBe(replies.mood);
    expect(replyTo("산후 우울감, 어디에 도움을 요청하나요?")).toBe(replies.mood);
  });

  it("출혈이 운동보다 먼저", () => {
    expect(replyTo("피가 나요 운동해도 되나요")).toBe(replies.bleeding);
    expect(replyTo("출혈이 있어요")).toBe(replies.bleeding);
  });

  it("'피'를 품은 무해한 낱말(커피·피곤 …)만으로는 출혈 안내가 아니다(웹 신규 — iOS는 걸렸다)", () => {
    expect(replyTo("커피 마셨어요")).toBe(replies.default);
    expect(replyTo("수유 중에 커피 마셔도 되나요?")).toBe(replies.default);
    expect(replyTo("피곤해요")).toBe(replies.default);
  });

  it("운동", () => {
    expect(replyTo("운동 언제부터?")).toBe(replies.exercise);
    expect(replyTo("산후 운동은 언제부터 할 수 있나요?")).toBe(replies.exercise);
  });

  it("그 외는 이해한 척하지 않는 기본 안내", () => {
    expect(replyTo("산후 검진은 언제 받아야 하나요?")).toBe(replies.default);
    expect(replyTo("안녕")).toBe(replies.default);
    expect(replyTo("")).toBe(replies.default);
  });

  it("마지막 사용자 문장만 본다 — assistant 문장·이전 질문은 보지 않는다", () => {
    const history: ChatMessage[] = [
      { role: "assistant", text: "자살 피 운동" },
      { role: "user", text: "우울해요" },
      { role: "assistant", text: "자살" },
      { role: "user", text: "산후 검진은 언제 받나요?" },
      { role: "assistant", text: "피" },
    ];
    expect(chatReply(history)).toEqual({ role: "assistant", text: replies.default });
    expect(chatReply([greeting]).text).toBe(replies.default);
  });
});

describe("오탐 줄이기 — 무해한 낱말을 지운 뒤 원래 키워드로 찾는다(진짜 신호는 놓치지 않는다)", () => {
  /** 예전 규칙(iOS 그대로) — 지우지 않고 키워드만 */
  const oldHas = (text: string, keywords: readonly string[]) => keywords.some((k) => text.includes(k));

  it("목록은 정한 낱말 그대로 — 출혈 '피'·'오로' 36개 + '패드' 4개, 위기 '사라지' 12개 + 몸 증상 주어 구절", () => {
    expect(BLEEDING_BENIGN_WORDS.map((b) => b.phrase)).toEqual([
      "피곤", "피로", "커피", "피부", "피임", "피자", "피아노", "피해", "피하", "피드", "피크", "피트니스", "피클", "피망",
      "피규어", "피어싱", "스피커", "해피", "슬리피", "피칭", "피날레", "피라미드", "피서", "피난", "피동", "피의자", "피어나",
      "레시피", "테라피", "에피소드", "오피스", "스피닝", "피스타치오", "피톤치드", "오로지", "오로라",
      // 2026-11-13 출혈 키워드 "패드"를 품은 물건 이름
      "수유 패드", "아이스 패드", "방수 패드", "패드형",
    ]);
    expect(SELF_HARM_BENIGN_PHRASES.slice(0, 12).map((b) => b.phrase)).toEqual([
      "붓기가 사라지", "부기가 사라지", "통증이 사라지", "증상이 사라지", "열이 사라지",
      "멍이 사라지", "자국이 사라지", "흉터가 사라지", "오로가 사라지", "오로가 다 사라지", "튼살이 사라지", "젖몸살이 사라지",
    ]);
    // 2026-11-13: 몸 증상 주어 × 조사(이·가·은·는·도) × 사이 말("", 다·싹·거의·점점·조금씩) — "혹은"(접속사)만 뺀다
    const generated = SELF_HARM_BENIGN_PHRASES.slice(12).map((b) => b.phrase);
    expect(generated.length).toBe(VANISHING_SUBJECTS.length * 5 * 6 - 6);
    for (const p of ["뱃살이 사라지", "기미가 사라지", "두통이 점점 사라지", "모유가 다 사라지", "젖이 사라지"]) expect(generated, p).toContain(p);
    expect(generated.some((p) => p.startsWith("혹은 "))).toBe(false);
    // 모두 원래 키워드를 품은 낱말이다(그래서 예전에는 걸렸다)
    for (const { phrase } of BLEEDING_BENIGN_WORDS) expect(/피|오로|패드/.test(phrase), phrase).toBe(true);
    for (const { phrase } of SELF_HARM_BENIGN_PHRASES) expect(phrase).toContain("사라지");
    expect(content.chat_fallback.bleeding_keywords).toEqual(["출혈", "피", "하혈", "핏덩이", "핏덩어리", "핏물", "혈괴", "선홍", "오로"]);
    expect(content.chat_fallback.self_harm_keywords).toContain("사라지고");
  });

  it.each([
    "하혈이 있어요",
    "핏덩이가 나왔어요",
    "핏덩어리가 나와요",
    "핏물이 비쳐요",
    "혈괴가 나왔어요",
    "선홍색 오로가 다시 나와요",
    "선홍빛이 돌아요",
    "오로가 갑자기 늘었어요",
    "오로 양이 많아요",
    "오로는 언제까지 나오나요?",
    "오로지금도 많이 나와요",
    "오로지속되고 있어요",
  ])("놓치던 출혈 표현은 출혈 안내(임상 사전 검토 질문 18): %s", (text) => {
    expect(replyTo(text)).toBe(replies.bleeding);
  });

  it.each([
    "미역국 레시피 알려주세요",
    "아로마테라피 해도 되나요?",
    "웃긴 에피소드가 있어요",
    "오피스 복귀를 준비해요",
    "스피닝 수업",
    "피스타치오 먹어도 되나요?",
    "피톤치드 산책",
    "오로지 모유만 먹여요",
    "오로라 보러 가고 싶어요",
  ])("뜻이 확실한 낱말은 출혈 안내가 아니다: %s", (text) => {
    expect(replyTo(text)).not.toBe(replies.bleeding);
  });

  it.each(["아기피가 나요", "오늘도피가 나요", "하루 3회피가 비쳐요", "레시피 보다가 피가 나요", "오로지 피가 나요"])(
    "뜻이 확실하지 않은 낱말은 넣지 않았다 — 붙여 쓴 피를 놓치지 않는다: %s",
    (text) => {
      expect(replyTo(text)).toBe(replies.bleeding);
    },
  );

  it("출혈 답은 기록 탭의 다량 출혈 신호와 같은 기준 — 양 기준·날짜 무관·119, 회복 가이드의 오로 변화", () => {
    for (const phrase of ["1시간 안에 패드 1장", "달걀만 한 핏덩이", "날짜와 상관없이", "119", "회복 가이드"]) expect(replies.bleeding, phrase).toContain(phrase);
  });

  it.each([
    "커피 마셨어요",
    "아이스커피 한 잔은 괜찮을까요?",
    "요즘 너무 피곤해요",
    "피로가 쌓였어요",
    "만성 피로",
    "피부가 가려워요",
    "피부 트러블이 생겼어요",
    "피임약 먹어도 되나요?",
    "피자 먹어도 되나요?",
    "피아노 소리에 아기가 깨요",
    "무리한 운동은 피해야 하나요?",
    "카페인은 피하세요",
    "아기 수유 피드백",
    "통증이 피크예요",
    "피트니스 센터 다녀도 될까요",
    "피클이랑 피망 먹었어요",
    "스피커로 자장가 틀어요",
    "해피 엔딩",
    "슬리피 키즈",
    "여름 피서 가도 될까요",
    "피난처",
    "꽃이 피어나요",
  ])("무해한 낱말만 있으면 출혈 안내가 아니다: %s", (text) => {
    expect(oldHas(text, content.chat_fallback.bleeding_keywords)).toBe(true); // 예전에는 걸렸다
    expect(replyTo(text)).not.toBe(replies.bleeding);
  });

  it.each([
    "커피 마셨는데 피가 나요",
    "피가 나요",
    "피곤한데 피가 비쳐요",
    "피부에서 피가 나요",
    "커피 마시고 나서 출혈이 늘었어요",
    "코피가 나요",
    "패드가 피로 젖었어요",
    "패드가 피로가득해요",
    "피로 시트가 젖었어요",
    "아래에서 피난다",
    "피난 것 같아요",
    "속옷에 피자국이 있어요",
    "피자꾸 나와요",
    "피하고 덩어리가 같이 나와요",
    "피하루종일 나와요",
    "피하혈종이 생겼어요",
    "어떡해피가안멈춰요",
    "빈혈이라 피부족이래요",
    "피하출혈이 있어요",
    "커피색 분비물이 나와요",
    "커피 빛 오로가 계속 나와요",
    "피부터 닦았어요",
  ])("진짜 출혈 신호는 그대로 출혈 안내: %s", (text) => {
    expect(replyTo(text)).toBe(replies.bleeding);
  });

  it("무해한 낱말이 어떤 꼴로 붙어 있어도 그 밖의 '피'는 그대로 걸린다(지운 자리는 공백 — 앞뒤가 붙지 않는다)", () => {
    for (const { phrase } of BLEEDING_BENIGN_WORDS) {
      for (const text of [`${phrase} 피가 나요`, `피가 나요 ${phrase}`, `${phrase}${phrase} 그리고 피`]) {
        expect(replyTo(text), text).toBe(replies.bleeding);
      }
    }
    expect(withoutBleedingBenign("커피 마셨어요")).toBe("  마셨어요");
  });

  it("지운 뒤에도 걸리면 예전에도 걸렸다 — 새로 걸리는 문장은 없다(예전 결과의 부분집합)", () => {
    const corpus = ["커피", "피", "출혈", "운동", "피곤해서 운동", "해피", "피자", "오로", "피난", "피로", "사라지고", "붓기가 사라지고"];
    for (const a of corpus) {
      for (const b of corpus) {
        const text = `${a} ${b}`;
        if (replyTo(text) === replies.bleeding) expect(oldHas(text, content.chat_fallback.bleeding_keywords), text).toBe(true);
        if (replyTo(text) === replies.self_harm) expect(oldHas(text, content.chat_fallback.self_harm_keywords), text).toBe(true);
      }
    }
  });

  it.each([
    "붓기가 사라지고 있어요",
    "부기가 사라지고 나서 운동해도 되나요?",
    "통증이 사라지고 나서 운동해도 되나요?",
    "증상이 사라지고 있어요",
    "열이 사라지고 몸이 가벼워요",
    "멍이 사라지고 있어요",
    "수술 자국이 사라지고 있어요",
    "흉터가 사라지고 있어요",
    "오로가 사라지고 나면 운동해도 되나요?",
    "젖몸살이 사라지고 편해졌어요",
    "얼굴붓기가사라지고 있어요",
  ])("몸의 증상이 '사라지고'는 위기 안내가 아니다(규칙 폴백): %s", (text) => {
    expect(oldHas(text, content.chat_fallback.self_harm_keywords)).toBe(true); // 예전에는 걸렸다
    expect(replyTo(text)).not.toBe(replies.self_harm);
  });

  it.each([
    "다 사라지고 싶어요",
    "그냥 사라지고 싶어요",
    "통증이 사라지지 않아서 나도 사라지고 싶어요",
    "붓기가 사라지고 있는데 그냥 다 사라지고 싶다",
    "붓기가 사라지고 있어요. 근데 죽고 싶어요",
    "흉터가 사라지면 좋겠고 자해하고 싶어요",
  ])("주어가 없거나 자기인 '사라지고'·다른 위기 낱말은 그대로 위기 안내(규칙 폴백): %s", (text) => {
    expect(replyTo(text)).toBe(replies.self_harm);
  });
});

describe("서버 우선, 실패하면 규칙 폴백 (ChatView.swift:170-185)", () => {
  it("서버 미설정 → 폴백", async () => {
    expect(await resolveChatReply(ask("출혈이 있어요"))).toEqual({ text: replies.bleeding, fromFallback: true });
  });

  it("서버 답이 있으면 그대로 — 클라이언트 안전 선필터 없음(iOS 그대로, 검수 #7)", async () => {
    const llmComplete = vi.fn(async () => "서버 답");
    expect(await resolveChatReply(ask("죽고 싶어요"), { llmComplete })).toEqual({
      text: "서버 답",
      fromFallback: false,
    });
    expect(llmComplete).toHaveBeenCalledTimes(1);
  });

  it("서버 오류·빈 답 → 폴백", async () => {
    const failing = async (): Promise<string> => {
      throw new Error("offline");
    };
    expect(await resolveChatReply(ask("죽고 싶어요"), { llmComplete: failing })).toEqual({
      text: replies.self_harm,
      fromFallback: true,
    });
    expect(await resolveChatReply(ask("운동"), { llmComplete: async () => "" })).toEqual({
      text: replies.exercise,
      fromFallback: true,
    });
  });

  it("요청: 앞쪽 인사말 제외 · preset patient_edu · maxTokens는 넘기지 않는다(LLMClient 기본값, iOS 그대로)", () => {
    const history: ChatMessage[] = [greeting, { role: "user", text: "q1" }, { role: "assistant", text: "a1" }, { role: "user", text: "q2" }];
    expect(buildChatLlmRequest(history)).toEqual({
      messages: [
        { role: "user", content: "q1" },
        { role: "assistant", content: "a1" },
        { role: "user", content: "q2" },
      ],
      preset: "patient_edu",
    });
    expect(buildChatLlmRequest(history)).not.toHaveProperty("maxTokens");
    // iOS의 컨텍스트 문자열은 만들지 않는다 — 산모 정보는 chatModel의 chatLlmContext가 서버 요청에 따로 싣는다
    expect(buildChatLlmRequest(history)).not.toHaveProperty("context");
  });
});

describe("표시 조건", () => {
  it("FAQ 칩: 서버 설정 && 인사말만 && 응답 대기 아님 (검수 #6)", () => {
    expect(shouldShowFaq({ llmConfigured: true, messageCount: 1, thinking: false })).toBe(true);
    expect(shouldShowFaq({ llmConfigured: false, messageCount: 1, thinking: false })).toBe(false);
    expect(shouldShowFaq({ llmConfigured: true, messageCount: 2, thinking: false })).toBe(false);
    expect(shouldShowFaq({ llmConfigured: true, messageCount: 1, thinking: true })).toBe(false);
  });

  it("폴백 배너: 미설정이면 처음부터, 이후엔 마지막 답이 폴백일 때만", () => {
    expect(shouldShowChatBanner({ llmConfigured: false, lastReplyFromFallback: null })).toBe(true);
    expect(shouldShowChatBanner({ llmConfigured: true, lastReplyFromFallback: null })).toBe(false);
    expect(shouldShowChatBanner({ llmConfigured: true, lastReplyFromFallback: true })).toBe(true);
    expect(shouldShowChatBanner({ llmConfigured: true, lastReplyFromFallback: false })).toBe(false);
  });
});

// 2026-11-13 임상 자체 검토(docs/dev/clinical/CLINICAL_SELF_REVIEW_2026-11.md §7-1 예문 재실행) — 놓치던 표현·잘못 걸리던 표현을 시험으로 고정한다
describe("2026-11 챗 키워드 — 임상 자체 검토 §7-1 예문", () => {
  it.each([
    "아기를 해칠 것 같아요",
    "아기를 해치고 싶은 생각이 들어요",
    "나를 해치고 싶어요",
    "애를 던져버리고 싶어요",
    "아기를 때릴 것 같아요",
    "죽어야겠다",
    "사는 게 의미가 없어요",
    "아기랑 같이 죽을까",
    "이 세상에 없었으면",
    "태어나지 말걸",
    "나 자신이나 아기를 해칠 것 같은 생각이 들어요",
  ])("위기 표현 '%s'는 위기 안내로 간다(웹 선필터·서버 선필터가 같은 목록)", (text) => {
    expect(isSelfHarmMessage(text)).toBe(true);
  });

  it.each(["커피가 아기 건강을 해칠까요?", "수유 다 끝내고 싶어요", "친구랑 같이 죽 먹을까", "힘들어 죽겠어요"])(
    "위기가 아닌 말 '%s'는 위기 안내로 가지 않는다",
    (text) => {
      expect(isSelfHarmMessage(text)).toBe(false);
    },
  );

  it.each(["뱃살이 사라지고 있어요", "기미가 사라지고 있어요", "두통이 점점 사라지고 있어요", "모유가 사라지고 있어요", "젖이 다 사라지고 있어요"])(
    "몸 증상이 '사라지고' — '%s'는 위기 안내로 가지 않는다(웹 규칙 폴백·서버 선필터)",
    (text) => {
      expect(isSelfHarmMessage(text)).toBe(false);
      expect(replyTo(text)).not.toBe(replies.self_harm);
    },
  );

  it.each(["통증이 사라지고 나니 이제 내가 사라지고 싶어요", "뱃살이 사라지고 나도 사라지고 싶어", "그냥 혹은 사라지고 싶어요"])(
    "증상 구절 뒤의 진짜 위기 표현 '%s'는 그대로 걸린다",
    (text) => {
      expect(isSelfHarmMessage(text)).toBe(true);
    },
  );

  it.each(["수유패드 추천해 주세요", "수유 패드 뭐가 좋아요?", "생리는 언제 다시 해요?"])("'%s'는 출혈 안내가 아니다", (text) => {
    expect(replyTo(text)).not.toBe(replies.bleeding);
  });
});
