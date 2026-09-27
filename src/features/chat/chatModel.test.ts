import { describe, expect, it, vi } from "vitest";
import type { LLMRequest, LLMResult } from "@/api/llm";
import content from "@/content";
import { CHAT_FALLBACK_BANNER } from "@/rules/chat";
import {
  CHAT_DECLINED_BANNER,
  CHAT_DECLINED_DEFAULT_REPLY,
  canSendChat,
  chatBackHref,
  chatLlmContext,
  chatScreenState,
  chatSendAction,
  isCrisisMessage,
  initialChatMessages,
  normalizeChatDraft,
  requestChatReply,
  shouldSendOnEnter,
  withoutCrisisTurns,
} from "./chatModel";

const GREETING =
  "안녕하세요, 온맘이에요. 산후 회복에 대해 궁금한 점을 편하게 물어보세요. (제공되는 답변은 정보 안내이며 진단·처방이 아닙니다.)";

describe("첫 화면", () => {
  it("인사말 하나 — ChatView.swift:13 원문", () => {
    expect(initialChatMessages()).toEqual([{ id: 0, role: "assistant", text: GREETING }]);
  });
  it("배너 문구는 content.json disclaimers.chat_banner", () => {
    expect(CHAT_FALLBACK_BANNER).toBe(content.disclaimers.chat_banner);
  });
});

describe("chatScreenState — 배너·FAQ(ChatView.swift:20, :31-36, :161)", () => {
  it("서버 미설정: 처음부터 배너, FAQ 숨김(결정 D8)", () => {
    expect(
      chatScreenState({ llmConfigured: false, messageCount: 1, thinking: false, lastReplyFromFallback: null }),
    ).toEqual({ showBanner: true, showFaq: false });
  });
  it("서버 설정: 첫 화면은 배너 없음 + FAQ", () => {
    expect(
      chatScreenState({ llmConfigured: true, messageCount: 1, thinking: false, lastReplyFromFallback: null }),
    ).toEqual({ showBanner: false, showFaq: true });
  });
  it("서버 설정 + 마지막 답이 폴백이면 배너, 정상 답이면 배너 내림", () => {
    expect(
      chatScreenState({ llmConfigured: true, messageCount: 3, thinking: false, lastReplyFromFallback: true }).showBanner,
    ).toBe(true);
    expect(
      chatScreenState({ llmConfigured: true, messageCount: 5, thinking: false, lastReplyFromFallback: false }).showBanner,
    ).toBe(false);
  });
  it("FAQ는 인사말만 있고 대기 중이 아닐 때만", () => {
    expect(chatScreenState({ llmConfigured: true, messageCount: 2, thinking: true, lastReplyFromFallback: null }).showFaq).toBe(
      false,
    );
    expect(chatScreenState({ llmConfigured: true, messageCount: 1, thinking: true, lastReplyFromFallback: null }).showFaq).toBe(
      false,
    );
  });
});

describe("보내기", () => {
  it("앞뒤 공백·줄바꿈을 자른다", () => {
    expect(normalizeChatDraft("  운동 언제부터?\n")).toBe("운동 언제부터?");
    expect(normalizeChatDraft("\n \t")).toBe("");
  });
  it("글이 있고, 대기 중이 아니고, 저장소를 읽었을 때만", () => {
    expect(canSendChat({ draft: "안녕", thinking: false, hydrated: true })).toBe(true);
    expect(canSendChat({ draft: "  ", thinking: false, hydrated: true })).toBe(false);
    expect(canSendChat({ draft: "안녕", thinking: true, hydrated: true })).toBe(false);
    expect(canSendChat({ draft: "안녕", thinking: false, hydrated: false })).toBe(false);
  });
  it("Enter는 보내고 Shift+Enter·한글 조합 중 Enter는 보내지 않는다", () => {
    expect(shouldSendOnEnter({ key: "Enter", shiftKey: false, isComposing: false, keyCode: 13 })).toBe(true);
    expect(shouldSendOnEnter({ key: "Enter", shiftKey: true, isComposing: false, keyCode: 13 })).toBe(false);
    expect(shouldSendOnEnter({ key: "Enter", shiftKey: false, isComposing: true, keyCode: 13 })).toBe(false);
    expect(shouldSendOnEnter({ key: "Enter", shiftKey: false, isComposing: false, keyCode: 229 })).toBe(false);
    expect(shouldSendOnEnter({ key: "a", shiftKey: false, isComposing: false, keyCode: 65 })).toBe(false);
  });
});

describe("chatBackHref", () => {
  it("?from=home이면 홈, 아니면 프로필", () => {
    expect(chatBackHref("?from=home")).toBe("/home/");
    expect(chatBackHref("")).toBe("/profile/");
    expect(chatBackHref("?from=profile")).toBe("/profile/");
  });
});

describe("requestChatReply — 서버 우선, 실패면 규칙 폴백(ChatView.swift:170-185)", () => {
  const history = [...initialChatMessages(), { id: 1, role: "user" as const, text: "출혈이 많아요" }];

  it("서버 미설정: 서버를 부르지 않고 폴백 답", async () => {
    const complete = vi.fn(async (): Promise<LLMResult> => ({ ok: true, text: "x" }));
    const r = await requestChatReply(history, { llmConfigured: false, complete, context: { week: 1 } });
    expect(r).toEqual({ text: content.chat_fallback.replies.bleeding, fromFallback: true, crisis: false });
    expect(complete).not.toHaveBeenCalled();
  });

  it("서버 설정 + 성공: LLM 답, 인사말은 빼고 patient_edu로 보낸다", async () => {
    const complete = vi.fn(async (): Promise<LLMResult> => ({ ok: true, text: "병원에 가 보세요." }));
    const signal = new AbortController().signal;
    const context = { week: 0, delivery: "vaginal" as const, breastfeeding: true };
    const r = await requestChatReply(history, { llmConfigured: true, complete, context, signal });
    expect(r).toEqual({ text: "병원에 가 보세요.", fromFallback: false, crisis: false });
    const [req, opts] = complete.mock.calls[0] as unknown as [LLMRequest, { signal?: AbortSignal }];
    // rules가 만드는 iOS 컨텍스트 문자열(BMI·목표·위험 신호 포함 가능)은 보내지 않고 세 항목만
    expect(req).toEqual({
      messages: [{ role: "user", content: "출혈이 많아요" }],
      preset: "patient_edu",
      context,
    });
    expect(req).not.toHaveProperty("maxTokens");
    expect(opts.signal).toBe(signal);
  });

  it("서버 설정 + 실패(연결·빈 응답): 규칙 폴백 + 배너", async () => {
    for (const kind of ["network", "server", "empty", "notConfigured"] as const) {
      const complete = vi.fn(async (): Promise<LLMResult> => ({ ok: false, kind, message: "" }));
      const r = await requestChatReply(history, { llmConfigured: true, complete, context: null });
      expect(r).toEqual({ text: content.chat_fallback.replies.bleeding, fromFallback: true, crisis: false });
    }
  });

  it("자해 표현은 폴백에서 최우선 응급 연계", async () => {
    const h = [...initialChatMessages(), { id: 1, role: "user" as const, text: "요즘 죽고 싶어요" }];
    const complete = vi.fn(async (): Promise<LLMResult> => ({ ok: true, text: "x" }));
    const r = await requestChatReply(h, { llmConfigured: false, complete, context: null });
    expect(r.text).toBe(content.chat_fallback.replies.self_harm);
  });
});

describe("chatLlmContext — 서버에 보내는 산모 정보는 세 항목뿐(검수 #14)", () => {
  const now = new Date(2026, 8, 27, 10);

  it("산후 주차·분만 방식·수유 여부", () => {
    expect(chatLlmContext({ deliveryDate: "2026-09-01", deliveryMethod: "cesarean", isBreastfeeding: true }, now)).toEqual({
      week: 3,
      delivery: "cesarean",
      breastfeeding: true,
    });
  });

  it("모르는 값은 빼고 보낸다 — 출산일이 없으면 0주차로 채우지 않는다", () => {
    expect(chatLlmContext({ deliveryDate: null, deliveryMethod: null, isBreastfeeding: false }, now)).toEqual({ breastfeeding: false });
  });

  it("BMI·목표·위험 신호 여부는 프로필에 있어도 담지 않는다", () => {
    const profile = {
      deliveryDate: "2026-09-01",
      deliveryMethod: "vaginal" as const,
      isBreastfeeding: true,
      goal: "homemaker",
      heightCm: 160,
      currentWeightKg: 62,
    };
    expect(Object.keys(chatLlmContext(profile, now)).sort()).toEqual(["breastfeeding", "delivery", "week"]);
  });
});

describe("chatSendAction — 보낸 질문을 AI·앱 안내·동의 중 어디로", () => {
  it("AI를 쓰는 중이면 ai, 꺼져 있거나 거절했으면 rules", () => {
    expect(chatSendAction("on", "오로가 언제까지 나오나요?")).toBe("ai");
    expect(chatSendAction("off", "오로가 언제까지 나오나요?")).toBe("rules");
  });
  it("동의 전(ask)이면 먼저 동의를 묻는다", () => {
    expect(chatSendAction("ask", "오로가 언제까지 나오나요?")).toBe("consent");
  });
  it("위기 표현은 동의 카드로 기다리게 하지 않고 바로 앱 안내(위기 안내)", async () => {
    expect(chatSendAction("ask", "요즘 죽고 싶어요")).toBe("rules");
    const h = [...initialChatMessages(), { id: 1, role: "user" as const, text: "요즘 죽고 싶어요" }];
    const complete = vi.fn(async (): Promise<LLMResult> => ({ ok: true, text: "x" }));
    const r = await requestChatReply(h, { llmConfigured: false, complete, context: null });
    expect(r.text).toBe(content.chat_fallback.replies.self_harm);
  });
  it("isCrisisMessage는 앱 규칙 폴백과 같은 키워드(content.json self_harm_keywords)", () => {
    for (const k of content.chat_fallback.self_harm_keywords) expect(isCrisisMessage(`요즘 ${k} 생각`)).toBe(true);
    expect(isCrisisMessage("커피 마셔도 되나요?")).toBe(false);
  });
});

/** content.json 키워드(죽고·자해·자살·사라지고)에는 없고 서버 선필터 목록(_shared/safety.ts)에만 있는 표현 */
const SERVER_ONLY_CRISIS = [
  "극단적 선택을 하고 싶어요",
  "살기 싫어요",
  "목숨을 끊고 싶어",
  "I want to kill myself",
  "자 살",
  "내가 없어졌으면 좋겠어",
];

describe("위기 표현 — AI 방식(ask·off·on)과 상관없이 AI에 보내지 않고 바로 위기 안내", () => {
  it("서버 선필터 목록도 위기 표현으로 본다(content.json 키워드와 합집합)", () => {
    for (const text of SERVER_ONLY_CRISIS) {
      expect(content.chat_fallback.self_harm_keywords.some((k) => text.includes(k))).toBe(false);
      expect(isCrisisMessage(text)).toBe(true);
    }
    // 서버 목록이 뺀 "사라지고"도 앱은 그대로 위기 표현으로 본다(content.json)
    expect(isCrisisMessage("사라지고만 싶어요")).toBe(true);
    // 산후 질문에 흔한 말은 걸리지 않는다
    for (const text of ["뱃살이 없어졌으면 좋겠어요", "출혈이 많아서 죽을까 봐 무서워요", "오로가 언제까지 나오나요?"]) {
      expect(isCrisisMessage(text)).toBe(false);
    }
  });

  it.each(["ask", "off", "on"] as const)("%s — 동의 카드도 AI도 거치지 않는다(rules)", (mode) => {
    for (const text of [...SERVER_ONLY_CRISIS, "사라지고만 싶어요", "요즘 죽고 싶어요"]) expect(chatSendAction(mode, text)).toBe("rules");
  });

  it.each([
    ["off", false, false],
    ["ask(거절)", false, true],
    ["on", true, false],
  ] as const)("%s — requestChatReply는 서버를 부르지 않고 content.json 위기 안내", async (_mode, llmConfigured, declined) => {
    for (const text of [...SERVER_ONLY_CRISIS, "사라지고만 싶어요"]) {
      const h = [...initialChatMessages(), { id: 1, role: "user" as const, text }];
      const complete = vi.fn(async (): Promise<LLMResult> => ({ ok: true, text: "x" }));
      const r = await requestChatReply(h, { llmConfigured, complete, context: { week: 2 }, declined });
      expect(r).toEqual({ text: content.chat_fallback.replies.self_harm, fromFallback: true, crisis: true });
      expect(r.text).toContain("1577-0199");
      expect(complete).not.toHaveBeenCalled();
    }
  });
});

describe("앞선 위기 턴은 AI 요청에 싣지 않는다", () => {
  it("withoutCrisisTurns — 위기 질문과 바로 뒤의 답을 뺀다", () => {
    const self = content.chat_fallback.replies.self_harm;
    expect(
      withoutCrisisTurns([
        { role: "user", content: "요즘 죽고 싶어요" },
        { role: "assistant", content: self },
        { role: "user", content: "오로가 언제까지 나오나요?" },
        { role: "assistant", content: "보통 4~6주예요." },
        { role: "user", content: "I want to kill myself" },
        { role: "assistant", content: self },
        { role: "user", content: "운동은 언제부터?" },
      ]),
    ).toEqual([
      { role: "user", content: "오로가 언제까지 나오나요?" },
      { role: "assistant", content: "보통 4~6주예요." },
      { role: "user", content: "운동은 언제부터?" },
    ]);
  });

  it("동의 전에 앱이 답한 위기 질문은 동의 뒤 첫 AI 요청 본문에 없다", async () => {
    // ask: 위기 질문 → 앱이 위기 안내로 답함 → 다음 질문에서 동의 → 그 대화 전체로 AI에 묻는다
    const history = [
      ...initialChatMessages(),
      { id: 1, role: "user" as const, text: "극단적 선택을 하고 싶어요" },
      { id: 2, role: "assistant" as const, text: content.chat_fallback.replies.self_harm },
      { id: 3, role: "user" as const, text: "산후 우울감이 있어요" },
    ];
    const complete = vi.fn(async (): Promise<LLMResult> => ({ ok: true, text: "가족에게 알려 주세요." }));
    const r = await requestChatReply(history, { llmConfigured: true, complete, context: null });
    expect(r).toEqual({ text: "가족에게 알려 주세요.", fromFallback: false, crisis: false });
    const [req] = complete.mock.calls[0] as unknown as [LLMRequest];
    expect(req.messages).toEqual([{ role: "user", content: "산후 우울감이 있어요" }]);
    const body = JSON.stringify(req);
    expect(body).not.toContain("극단적");
    expect(body).not.toContain("1577-0199");
  });
});

describe("AI 동의를 거절했을 때 — \"연결되지 않아\"가 아니라 \"동의하지 않아\"", () => {
  it("배너·기본 답은 content.json 원문에서 첫머리만 바꾼다", () => {
    expect(content.disclaimers.chat_banner.startsWith("지금은 AI 서버에 연결되지 않아")).toBe(true);
    expect(content.chat_fallback.replies.default.startsWith("지금은 AI 서버에 연결되지 않아")).toBe(true);
    expect(CHAT_DECLINED_BANNER).toBe(content.disclaimers.chat_banner.replace("지금은 AI 서버에 연결되지 않아", "AI 답변에 동의하지 않아"));
    expect(CHAT_DECLINED_DEFAULT_REPLY).toBe(
      content.chat_fallback.replies.default.replace("지금은 AI 서버에 연결되지 않아", "AI 답변에 동의하지 않아"),
    );
    expect(CHAT_DECLINED_BANNER).not.toContain("연결되지 않아");
    expect(CHAT_DECLINED_DEFAULT_REPLY).not.toContain("연결되지 않아");
  });

  it("거절했으면 기본 답만 바꾸고(키워드 답은 그대로), 거절하지 않았으면 원문", async () => {
    const complete = vi.fn(async (): Promise<LLMResult> => ({ ok: true, text: "x" }));
    const ask = (text: string) => [...initialChatMessages(), { id: 1, role: "user" as const, text }];
    const declined = await requestChatReply(ask("오로가 언제까지?"), { llmConfigured: false, complete, context: null, declined: true });
    expect(declined).toEqual({ text: CHAT_DECLINED_DEFAULT_REPLY, fromFallback: true, crisis: false });
    const bleeding = await requestChatReply(ask("출혈이 많아요"), { llmConfigured: false, complete, context: null, declined: true });
    expect(bleeding.text).toBe(content.chat_fallback.replies.bleeding);
    const off = await requestChatReply(ask("오로가 언제까지?"), { llmConfigured: false, complete, context: null });
    expect(off.text).toBe(content.chat_fallback.replies.default);
    expect(complete).not.toHaveBeenCalled();
  });
});
