import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { LLMRequest, LLMResult } from "@/api/llm";
import content from "@/content";
import { CHAT_FALLBACK_BANNER } from "@/rules/chat";
import {
  CHAT_DECLINED_BANNER,
  CHAT_DECLINED_DEFAULT_REPLY,
  CHAT_ORIGIN_CAPTION,
  canSendChat,
  chatBackHref,
  chatBannerText,
  chatDefaultReplyText,
  chatFallbackReasonFor,
  chatLlmContext,
  chatReplyOnError,
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
    expect(initialChatMessages()).toEqual([{ id: 0, role: "assistant", text: GREETING, origin: "greeting" }]);
  });
  it("배너 문구는 content.json disclaimers.chat_banner", () => {
    expect(CHAT_FALLBACK_BANNER).toBe(content.disclaimers.chat_banner);
  });
});

describe("chatScreenState — 배너·FAQ(ChatView.swift:20, :31-36, :161)", () => {
  it("서버 미설정: 처음부터 배너, FAQ 숨김(결정 D8)", () => {
    expect(
      chatScreenState({ mode: "off", messageCount: 1, thinking: false, lastReplyFromFallback: null }),
    ).toEqual({ showBanner: true, showFaq: false });
  });
  it("서버 설정: 첫 화면은 배너 없음 + FAQ", () => {
    expect(
      chatScreenState({ mode: "on", messageCount: 1, thinking: false, lastReplyFromFallback: null }),
    ).toEqual({ showBanner: false, showFaq: true });
  });
  it("서버 설정 + 마지막 답이 폴백이면 배너, 정상 답이면 배너 내림", () => {
    expect(
      chatScreenState({ mode: "on", messageCount: 3, thinking: false, lastReplyFromFallback: true }).showBanner,
    ).toBe(true);
    expect(
      chatScreenState({ mode: "on", messageCount: 5, thinking: false, lastReplyFromFallback: false }).showBanner,
    ).toBe(false);
  });
  it("FAQ는 인사말만 있고 대기 중이 아닐 때만", () => {
    expect(chatScreenState({ mode: "on", messageCount: 2, thinking: true, lastReplyFromFallback: null }).showFaq).toBe(
      false,
    );
    expect(chatScreenState({ mode: "on", messageCount: 1, thinking: true, lastReplyFromFallback: null }).showFaq).toBe(
      false,
    );
  });
  it("동의를 묻는 중(ask): 배너 없음, FAQ도 숨김 — AI가 실제로 답할 때(on)만 FAQ", () => {
    expect(chatScreenState({ mode: "ask", messageCount: 1, thinking: false, lastReplyFromFallback: null })).toEqual({
      showBanner: false,
      showFaq: false,
    });
  });
  it("FAQ 칩 → [동의하지 않기]가 생길 수 없는 이유: 규칙은 FAQ 질문에 맞춘 답을 주지 못한다(기본 안내)", async () => {
    const coffee = "수유 중에 커피 마셔도 되나요?";
    expect(content.chat_faq).toContain(coffee);
    const complete = vi.fn();
    const declined = await requestChatReply([...initialChatMessages(), { id: 1, role: "user", text: coffee }], {
      llmConfigured: false,
      complete,
      context: null,
      declined: true,
    });
    // 규칙 폴백은 FAQ 질문을 이해하지 못한다("커피"의 '피'는 이제 출혈 안내로 가지 않고 기본 안내) — 그래서 ask에서는 칩을 보이지 않는다(위 테스트)
    expect(declined.text).toBe(CHAT_DECLINED_DEFAULT_REPLY);
    expect(declined.text).not.toBe(content.chat_fallback.replies.bleeding);
    expect(complete).not.toHaveBeenCalled();
    // 거절하면 off — 칩은 계속 없다. 동의하면 on — 인사말만 있는 다음 방문 첫 화면에만 칩
    expect(chatScreenState({ mode: "off", messageCount: 1, thinking: false, lastReplyFromFallback: null }).showFaq).toBe(false);
    expect(chatScreenState({ mode: "on", messageCount: 1, thinking: false, lastReplyFromFallback: null }).showFaq).toBe(true);
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
    expect(r).toEqual({ text: content.chat_fallback.replies.bleeding, fromFallback: true, crisis: false, origin: "rules", fallbackReason: "notConnected" });
    expect(complete).not.toHaveBeenCalled();
  });

  it("서버 설정 + 성공: LLM 답, 인사말은 빼고 patient_edu로 보낸다", async () => {
    const complete = vi.fn(async (): Promise<LLMResult> => ({ ok: true, text: "병원에 가 보세요." }));
    const signal = new AbortController().signal;
    const context = { week: 0, delivery: "vaginal" as const, breastfeeding: true };
    const r = await requestChatReply(history, { llmConfigured: true, complete, context, signal });
    expect(r).toEqual({ text: "병원에 가 보세요.", fromFallback: false, crisis: false, origin: "ai", fallbackReason: null });
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
      expect(r).toEqual({ text: content.chat_fallback.replies.bleeding, fromFallback: true, crisis: false, origin: "rules", fallbackReason: "notConnected" });
    }
  });

  it("자해 표현은 폴백에서 최우선 응급 연계", async () => {
    const h = [...initialChatMessages(), { id: 1, role: "user" as const, text: "요즘 죽고 싶어요" }];
    const complete = vi.fn(async (): Promise<LLMResult> => ({ ok: true, text: "x" }));
    const r = await requestChatReply(h, { llmConfigured: false, complete, context: null });
    expect(r.text).toBe(content.chat_fallback.replies.self_harm);
  });
});

describe("서버에 AI 동의 기록이 없다(403 ai_consent_required) — 답 대신 동의 카드를 다시", () => {
  const history = [...initialChatMessages(), { id: 1, role: "user" as const, text: "오로가 언제까지 나오나요?" }];
  const consentRequired = async (): Promise<LLMResult> => ({ ok: false, kind: "server", message: "", status: 403, code: "ai_consent_required" });

  it("consentRequired를 붙인다 — 다른 실패(429·503·코드 없는 403)에는 붙이지 않는다", async () => {
    const r = await requestChatReply(history, { llmConfigured: true, complete: vi.fn(consentRequired), context: null });
    expect(r.consentRequired).toBe(true);
    expect(r).toMatchObject({ fromFallback: true, crisis: false, origin: "rules" });
    for (const failure of [
      { ok: false, kind: "server", message: "", status: 429, code: "rate_limited" },
      { ok: false, kind: "server", message: "", status: 503, code: "busy" },
      { ok: false, kind: "server", message: "", status: 403 },
      { ok: false, kind: "network", message: "" },
    ] as LLMResult[]) {
      const other = await requestChatReply(history, { llmConfigured: true, complete: async () => failure, context: null });
      expect(other.consentRequired, JSON.stringify(failure)).toBeUndefined();
    }
  });

  it("AI를 쓰지 않으면(꺼짐·거절) 서버를 부르지 않으므로 생길 수 없다", async () => {
    const complete = vi.fn(consentRequired);
    const r = await requestChatReply(history, { llmConfigured: false, complete, context: null, declined: true });
    expect(r.consentRequired).toBeUndefined();
    expect(complete).not.toHaveBeenCalled();
  });

  it("화면 — 답 말풍선 대신 이 계정의 동의를 지우고(revoke) 같은 질문으로 동의 카드를 띄운다, 요청은 동의 기록 뒤에", () => {
    const src = readFileSync(fileURLToPath(new URL("./ChatScreen.tsx", import.meta.url)), "utf8");
    const chain = src.slice(src.indexOf("void Promise.resolve()"), src.indexOf("function onAcceptAi"));
    expect(chain).toContain("complete: afterAiConsentRecord(accountId, llmComplete),");
    const handled = chain.indexOf("if (reply.consentRequired === true) {");
    expect(handled).toBeGreaterThan(0);
    const branch = chain.slice(handled, chain.indexOf("return;", handled));
    expect(branch).toContain("revoke();");
    expect(branch).toContain("setAwaitingConsent(history);");
    // 말풍선을 더하기 전에 돌아간다
    expect(handled).toBeLessThan(chain.indexOf("setMessages((prev)"));
    expect(src).toContain("const { consented, accept, revoke } = useAiConsent(accountId);");
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

describe("위기 선필터 오탐 줄이기 — 몸의 증상이 '사라지고'는 위기 표현이 아니다(무해한 구절을 지운 뒤 찾는다)", () => {
  it.each([
    "붓기가 사라지고 있어요",
    "부기가 사라지고 나서 운동해도 되나요?",
    "통증이 사라지고 나서 운동해도 되나요?",
    "증상이 사라지고 있어요",
    "열이 사라지고 몸이 가벼워요",
    "멍이 사라지고 있어요",
    "자국이 사라지고 있어요",
    "흉터가 사라지고 있어요",
    "오로가 사라지고 나면 운동해도 되나요?",
    "젖몸살이 사라지고 편해졌어요",
    "다리 붓기가  사라지고 있어요",
    "얼굴붓기가사라지고 있어요",
  ])("위기 표현 아님 → AI·동의 흐름 그대로: %s", (text) => {
    expect(text.includes("사라지고")).toBe(true); // 예전에는 content.json "사라지고"로 걸렸다
    expect(isCrisisMessage(text)).toBe(false);
    expect(chatSendAction("on", text)).toBe("ai");
    expect(chatSendAction("ask", text)).toBe("consent");
  });

  it.each([
    "다 사라지고 싶어요",
    "그냥 사라지고 싶어요",
    "사라지고만 싶어요",
    "통증이 사라지지 않아서 나도 사라지고 싶어요",
    "붓기가 사라지고 있는데 그냥 다 사라지고 싶다",
    "흉터가 사라지면 좋겠고 죽고 싶어요",
    "붓기가 사라지고 있지만 자살 생각이 들어요",
  ])("위기 표현은 그대로 → AI에 보내지 않고 위기 안내: %s", async (text) => {
    expect(isCrisisMessage(text)).toBe(true);
    for (const mode of ["ask", "off", "on"] as const) expect(chatSendAction(mode, text)).toBe("rules");
    const complete = vi.fn(async (): Promise<LLMResult> => ({ ok: true, text: "x" }));
    const r = await requestChatReply([...initialChatMessages(), { id: 1, role: "user", text }], { llmConfigured: true, complete, context: null });
    expect(r).toMatchObject({ text: content.chat_fallback.replies.self_harm, crisis: true });
    expect(complete).not.toHaveBeenCalled();
  });

  it("앞선 턴의 '붓기가 사라지고'는 AI 대화에서 빼지 않는다(위기 턴이 아니다)", () => {
    const turns = [
      { role: "user" as const, content: "붓기가 사라지고 있어요" },
      { role: "assistant" as const, content: "좋은 신호예요." },
      { role: "user" as const, content: "운동해도 되나요?" },
    ];
    expect(withoutCrisisTurns(turns)).toEqual(turns);
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
      expect(r).toEqual({ text: content.chat_fallback.replies.self_harm, fromFallback: true, crisis: true, origin: "rules", fallbackReason: null });
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

  it("서버 함수가 자기 선필터로 고정 위기 안내를 돌려주면 AI 답이 아니라 위기 안내(앱 안내)로 다룬다 — 'AI 답변' 표시 없음", async () => {
    // 웹 선필터가 먼저 거르므로 보통 오지 않는다(handler.ts `{ ok, text: CRISIS_REPLY, flagged }`) — 와도 정직하게 표시한다
    const history = [...initialChatMessages(), { id: 1, role: "user" as const, text: "오로가 언제까지 나오나요?" }];
    const complete = vi.fn(async (): Promise<LLMResult> => ({ ok: true, text: content.chat_fallback.replies.self_harm }));
    const r = await requestChatReply(history, { llmConfigured: true, complete, context: null });
    expect(r).toEqual({ text: content.chat_fallback.replies.self_harm, fromFallback: true, crisis: true, origin: "rules", fallbackReason: null });
    expect(complete).toHaveBeenCalledTimes(1);
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
    expect(r).toEqual({ text: "가족에게 알려 주세요.", fromFallback: false, crisis: false, origin: "ai", fallbackReason: null });
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
    expect(declined).toEqual({ text: CHAT_DECLINED_DEFAULT_REPLY, fromFallback: true, crisis: false, origin: "rules", fallbackReason: "declined" });
    const bleeding = await requestChatReply(ask("출혈이 많아요"), { llmConfigured: false, complete, context: null, declined: true });
    expect(bleeding.text).toBe(content.chat_fallback.replies.bleeding);
    const off = await requestChatReply(ask("오로가 언제까지?"), { llmConfigured: false, complete, context: null });
    expect(off.text).toBe(content.chat_fallback.replies.default);
    expect(complete).not.toHaveBeenCalled();
  });
});

describe("앱 안내로 답한 이유 — 서버 함수의 한도·혼잡·거절을 \"연결되지 않아\"로 뭉개지 않는다(handler.ts · SUPABASE_FUNCTIONS §5)", () => {
  const history = [...initialChatMessages(), { id: 1, role: "user" as const, text: "오로가 언제까지 나오나요?" }];
  const serverFail = (status: number) => vi.fn(async (): Promise<LLMResult> => ({ ok: false, kind: "server", message: "", status }));

  it("chatFallbackReasonFor — 429 한도 · 503 혼잡/이용 불가 · 422 거절, 그 밖은 연결되지 않아", () => {
    expect(chatFallbackReasonFor({ ok: false, kind: "server", message: "", status: 429 })).toBe("rateLimited");
    expect(chatFallbackReasonFor({ ok: false, kind: "server", message: "", status: 503 })).toBe("busy");
    expect(chatFallbackReasonFor({ ok: false, kind: "server", message: "", status: 422 })).toBe("refused");
    for (const status of [400, 401, 413, 500, 502, 504, undefined]) {
      expect(chatFallbackReasonFor({ ok: false, kind: "server", message: "", status })).toBe("notConnected");
    }
    for (const kind of ["network", "empty", "notConfigured"] as const) {
      expect(chatFallbackReasonFor({ ok: false, kind, message: "", status: 429 })).toBe("notConnected");
    }
  });

  it("배너·기본 답은 content.json 원문에서 첫머리만 바꾼다 — 나머지 문장은 그대로", () => {
    const bannerTail = content.disclaimers.chat_banner.slice("지금은 AI 서버에 연결되지 않아".length);
    const replyTail = content.chat_fallback.replies.default.slice("지금은 AI 서버에 연결되지 않아".length);
    expect(chatBannerText("notConnected")).toBe(content.disclaimers.chat_banner);
    expect(chatDefaultReplyText("notConnected")).toBe(content.chat_fallback.replies.default);
    expect(chatBannerText("declined")).toBe(CHAT_DECLINED_BANNER);
    expect(chatBannerText("rateLimited")).toBe(`AI 상담 이용 횟수가 잠시 한도에 닿아${bannerTail}`);
    expect(chatBannerText("busy")).toBe(`지금은 AI 서버를 잠시 이용할 수 없어${bannerTail}`);
    expect(chatBannerText("refused")).toBe(`AI가 이 질문에는 답하지 않아${bannerTail}`);
    expect(chatDefaultReplyText("rateLimited")).toBe(`AI 상담 이용 횟수가 잠시 한도에 닿아${replyTail}`);
    expect(chatDefaultReplyText("busy")).toBe(`지금은 AI 서버를 잠시 이용할 수 없어${replyTail}`);
    expect(chatDefaultReplyText("refused")).toBe(`AI가 이 질문에는 답하지 않아${replyTail}`);
    for (const reason of ["declined", "rateLimited", "busy", "refused"] as const) {
      expect(chatBannerText(reason)).not.toContain("연결되지 않아");
      expect(chatDefaultReplyText(reason)).not.toContain("연결되지 않아");
    }
  });

  it("requestChatReply — 429·503·422면 기본 답의 첫머리와 이유가 바뀌고, 답은 앱 안내(rules)", async () => {
    for (const [status, reason] of [
      [429, "rateLimited"],
      [503, "busy"],
      [422, "refused"],
    ] as const) {
      const complete = serverFail(status);
      const r = await requestChatReply(history, { llmConfigured: true, complete, context: null });
      expect(r).toEqual({ text: chatDefaultReplyText(reason), fromFallback: true, crisis: false, origin: "rules", fallbackReason: reason });
      expect(complete).toHaveBeenCalledTimes(1);
    }
  });

  it("키워드 답(출혈·운동·기분)은 이유와 무관하게 원문 그대로 — 이유만 남긴다", async () => {
    const h = [...initialChatMessages(), { id: 1, role: "user" as const, text: "출혈이 많아요" }];
    const r = await requestChatReply(h, { llmConfigured: true, complete: serverFail(429), context: null });
    expect(r).toEqual({ text: content.chat_fallback.replies.bleeding, fromFallback: true, crisis: false, origin: "rules", fallbackReason: "rateLimited" });
  });

  it("502·504·연결 실패는 원문(연결되지 않아) — 잘린 답·시간 초과를 다른 이유로 꾸미지 않는다", async () => {
    for (const complete of [serverFail(502), serverFail(504), vi.fn(async (): Promise<LLMResult> => ({ ok: false, kind: "network", message: "" }))]) {
      const r = await requestChatReply(history, { llmConfigured: true, complete, context: null });
      expect(r).toEqual({ text: content.chat_fallback.replies.default, fromFallback: true, crisis: false, origin: "rules", fallbackReason: "notConnected" });
    }
  });

  it("거절(declined)이 서버 실패 이유보다 먼저 — 거절했으면 서버를 부르지 않았으니 이유는 declined", async () => {
    const complete = serverFail(429);
    const r = await requestChatReply(history, { llmConfigured: false, complete, context: null, declined: true });
    expect(r.fallbackReason).toBe("declined");
    expect(complete).not.toHaveBeenCalled();
  });
});

describe("말풍선 표시(origin) — LAUNCH_CHECKLIST 5-3 \"AI 답변\" 표시", () => {
  it("인사말에는 표시가 없고, 앱 안내·AI 답에는 있다", () => {
    expect(CHAT_ORIGIN_CAPTION.greeting).toBeNull();
    expect(CHAT_ORIGIN_CAPTION.rules).toBe("앱 안내");
    expect(CHAT_ORIGIN_CAPTION.ai).toBe("AI 답변 · 진단·처방이 아닙니다");
  });
});

describe("예상하지 못한 오류 — '생각 중'이 남지 않고 앱 안내로 마무리(L6)", () => {
  const user = (text: string) => [...initialChatMessages(), { id: 1, role: "user" as const, text }];

  it("새 문구 없이 기본 답(원문) — 거절 직후면 거절 첫머리", () => {
    expect(chatReplyOnError(user("오로 색이 궁금해요"))).toEqual({
      text: content.chat_fallback.replies.default,
      fromFallback: true,
      crisis: false,
      origin: "rules",
      fallbackReason: "notConnected",
    });
    expect(chatReplyOnError(user("오로 색이 궁금해요"), true)).toMatchObject({ text: CHAT_DECLINED_DEFAULT_REPLY, fallbackReason: "declined" });
  });

  it("위기 표현이면 오류여도 위기 안내", () => {
    expect(chatReplyOnError(user("죽고 싶어요"))).toMatchObject({ text: content.chat_fallback.replies.self_harm, crisis: true, fallbackReason: null });
  });

  it("화면의 요청 사슬에 catch·finally가 있다 — 요청 준비부터 약속 안에서", () => {
    const src = readFileSync(fileURLToPath(new URL("./ChatScreen.tsx", import.meta.url)), "utf8");
    const chain = src.slice(src.indexOf("void Promise.resolve()"), src.indexOf("function onAcceptAi"));
    expect(chain).toContain("requestChatReply(history");
    expect(chain).toContain(".catch(() => chatReplyOnError(history, declinedNow))");
    expect(chain).toMatch(/\.finally\(\(\) => \{[\s\S]*setThinking\(false\);/);
  });
});
