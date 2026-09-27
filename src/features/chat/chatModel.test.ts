import { describe, expect, it, vi } from "vitest";
import type { LLMRequest, LLMResult } from "@/api/llm";
import content from "@/content";
import { buildChatContext, CHAT_FALLBACK_BANNER } from "@/rules/chat";
import {
  canSendChat,
  chatBackHref,
  chatScreenState,
  initialChatMessages,
  normalizeChatDraft,
  requestChatReply,
  shouldSendOnEnter,
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
    const r = await requestChatReply(history, { llmConfigured: false, complete, context: "ctx" });
    expect(r).toEqual({ text: content.chat_fallback.replies.bleeding, fromFallback: true });
    expect(complete).not.toHaveBeenCalled();
  });

  it("서버 설정 + 성공: LLM 답, 인사말은 빼고 patient_edu로 보낸다", async () => {
    const complete = vi.fn(async (): Promise<LLMResult> => ({ ok: true, text: "병원에 가 보세요." }));
    const signal = new AbortController().signal;
    const r = await requestChatReply(history, { llmConfigured: true, complete, context: "산후 3일차(0주차)", signal });
    expect(r).toEqual({ text: "병원에 가 보세요.", fromFallback: false });
    const [req, opts] = complete.mock.calls[0] as unknown as [LLMRequest, { signal?: AbortSignal }];
    expect(req).toEqual({
      messages: [{ role: "user", content: "출혈이 많아요" }],
      preset: "patient_edu",
      context: "산후 3일차(0주차)",
    });
    expect(req).not.toHaveProperty("maxTokens");
    expect(opts.signal).toBe(signal);
  });

  it("서버 설정 + 실패(연결·빈 응답): 규칙 폴백 + 배너", async () => {
    for (const kind of ["network", "server", "empty", "notConfigured"] as const) {
      const complete = vi.fn(async (): Promise<LLMResult> => ({ ok: false, kind, message: "" }));
      const r = await requestChatReply(history, { llmConfigured: true, complete, context: "" });
      expect(r).toEqual({ text: content.chat_fallback.replies.bleeding, fromFallback: true });
    }
  });

  it("자해 표현은 폴백에서 최우선 응급 연계", async () => {
    const h = [...initialChatMessages(), { id: 1, role: "user" as const, text: "요즘 죽고 싶어요" }];
    const complete = vi.fn(async (): Promise<LLMResult> => ({ ok: true, text: "x" }));
    const r = await requestChatReply(h, { llmConfigured: false, complete, context: "" });
    expect(r.text).toBe(content.chat_fallback.replies.self_harm);
  });
});

describe("컨텍스트(서버가 설정됐을 때만 전송)", () => {
  it("rules/chat buildChatContext 형식", () => {
    const ctx = buildChatContext({
      profile: {
        deliveryDate: "2026-09-01",
        deliveryMethod: "cesarean",
        goal: null,
        isBreastfeeding: true,
        heightCm: 0,
        currentWeightKg: 0,
      },
      symptomHistory: [],
      now: new Date(2026, 8, 27, 10),
    });
    expect(ctx).toBe("산후 26일차(3주차), 제왕절개, 모유수유 중");
  });
});
