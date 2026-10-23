import { describe, expect, it, vi } from "vitest";
import content from "@/content";
import {
  BLEEDING_BENIGN_WORDS,
  SELF_HARM_BENIGN_PHRASES,
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
    expect(replyTo("오로는 언제까지 나오나요?")).toBe(replies.default);
    expect(replyTo("안녕")).toBe(replies.default);
    expect(replyTo("")).toBe(replies.default);
  });

  it("마지막 사용자 문장만 본다 — assistant 문장·이전 질문은 보지 않는다", () => {
    const history: ChatMessage[] = [
      { role: "assistant", text: "자살 피 운동" },
      { role: "user", text: "우울해요" },
      { role: "assistant", text: "자살" },
      { role: "user", text: "오로는 언제까지 나오나요?" },
      { role: "assistant", text: "피" },
    ];
    expect(chatReply(history)).toEqual({ role: "assistant", text: replies.default });
    expect(chatReply([greeting]).text).toBe(replies.default);
  });
});

describe("오탐 줄이기 — 무해한 낱말을 지운 뒤 원래 키워드로 찾는다(진짜 신호는 놓치지 않는다)", () => {
  /** 예전 규칙(iOS 그대로) — 지우지 않고 키워드만 */
  const oldHas = (text: string, keywords: readonly string[]) => keywords.some((k) => text.includes(k));

  it("목록은 정한 낱말 그대로 — 출혈 '피' 27개, 위기 '사라지' 10개", () => {
    expect(BLEEDING_BENIGN_WORDS.map((b) => b.phrase)).toEqual([
      "피곤", "피로", "커피", "피부", "피임", "피자", "피아노", "피해", "피하", "피드", "피크", "피트니스", "피클", "피망",
      "피규어", "피어싱", "스피커", "해피", "슬리피", "피칭", "피날레", "피라미드", "피서", "피난", "피동", "피의자", "피어나",
    ]);
    expect(SELF_HARM_BENIGN_PHRASES.map((b) => b.phrase)).toEqual([
      "붓기가 사라지", "부기가 사라지", "통증이 사라지", "증상이 사라지", "열이 사라지",
      "멍이 사라지", "자국이 사라지", "흉터가 사라지", "오로가 사라지", "젖몸살이 사라지",
    ]);
    // 모두 원래 키워드를 품은 낱말이다(그래서 예전에는 걸렸다)
    for (const { phrase } of BLEEDING_BENIGN_WORDS) expect(phrase).toContain("피");
    for (const { phrase } of SELF_HARM_BENIGN_PHRASES) expect(phrase).toContain("사라지");
    expect(content.chat_fallback.bleeding_keywords).toEqual(["출혈", "피"]);
    expect(content.chat_fallback.self_harm_keywords).toContain("사라지고");
  });

  it.each([
    "커피 마셨어요",
    "아이스커피 한 잔은 괜찮을까요?",
    "요즘 너무 피곤해요",
    "피로가 쌓였어요",
    "만성 피로",
    "피부가 가려워요",
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
