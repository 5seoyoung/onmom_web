import { describe, expect, it, vi } from "vitest";
import content from "@/content";
import type { UserProfile } from "@/domain/types";
import {
  CHAT_GREETING,
  buildChatContext,
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

  it("'피'는 커피·피곤에도 걸린다(iOS 그대로 — 그래서 폴백에서는 FAQ를 숨긴다)", () => {
    expect(replyTo("수유 중에 커피 마셔도 되나요?")).toBe(replies.bleeding);
    expect(replyTo("피곤해요")).toBe(replies.bleeding);
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

describe("서버 우선, 실패하면 규칙 폴백 (ChatView.swift:170-185)", () => {
  const context = "산후 12일차(1주차), 모유수유 중";

  it("서버 미설정 → 폴백", async () => {
    expect(await resolveChatReply(ask("출혈이 있어요"), context)).toEqual({ text: replies.bleeding, fromFallback: true });
  });

  it("서버 답이 있으면 그대로 — 클라이언트 안전 선필터 없음(iOS 그대로, 검수 #7)", async () => {
    const llmComplete = vi.fn(async () => "서버 답");
    expect(await resolveChatReply(ask("죽고 싶어요"), context, { llmComplete })).toEqual({
      text: "서버 답",
      fromFallback: false,
    });
    expect(llmComplete).toHaveBeenCalledTimes(1);
  });

  it("서버 오류·빈 답 → 폴백", async () => {
    const failing = async (): Promise<string> => {
      throw new Error("offline");
    };
    expect(await resolveChatReply(ask("죽고 싶어요"), context, { llmComplete: failing })).toEqual({
      text: replies.self_harm,
      fromFallback: true,
    });
    expect(await resolveChatReply(ask("운동"), context, { llmComplete: async () => "" })).toEqual({
      text: replies.exercise,
      fromFallback: true,
    });
  });

  it("요청: 앞쪽 인사말 제외 · preset patient_edu · maxTokens는 넘기지 않는다(LLMClient 기본값, iOS 그대로)", () => {
    const history: ChatMessage[] = [greeting, { role: "user", text: "q1" }, { role: "assistant", text: "a1" }, { role: "user", text: "q2" }];
    expect(buildChatLlmRequest(history, context)).toEqual({
      messages: [
        { role: "user", content: "q1" },
        { role: "assistant", content: "a1" },
        { role: "user", content: "q2" },
      ],
      preset: "patient_edu",
      context,
    });
    expect(buildChatLlmRequest(history, context)).not.toHaveProperty("maxTokens");
  });
});

describe("산모 컨텍스트 (ChatView.swift:188-196)", () => {
  const base: UserProfile = {
    deliveryDate: "2026-07-22",
    deliveryMethod: "cesarean",
    goal: "homemaker",
    returnToWorkDate: null,
    isBreastfeeding: true,
    consentAccepted: true,
    consentVersion: null,
    consentAcceptedAt: null,
    heightCm: 162,
    currentWeightKg: 64,
    prePregnancyWeightKg: 56,
    neighborhood: "",
  };
  const now = new Date("2026-09-23T12:00:00+09:00");

  it("모든 항목이 있을 때 — 05 §2 예시와 같은 형식", () => {
    expect(buildChatContext({ profile: base, symptomHistory: [{ redFlagCode: "pph_suspect" }], now })).toBe(
      "산후 63일차(9주차), 제왕절개, 모유수유 중, 목표: 전업, BMI 24.4, 최근 기록에 위험 신호 있음",
    );
  });

  it("없는 항목은 뺀다 — 가장 최근 기록만 본다", () => {
    const profile = { ...base, deliveryMethod: null, goal: null, isBreastfeeding: false, heightCm: 0 };
    const history = [{ redFlagCode: null }, { redFlagCode: "pph_suspect" }];
    expect(buildChatContext({ profile, symptomHistory: history, now })).toBe("산후 63일차(9주차), 모유수유 안 함");
  });

  it("출산일 미입력이면 0일차", () => {
    const profile = { ...base, deliveryDate: null, deliveryMethod: "vaginal" as const, goal: "returningToWork" as const };
    expect(buildChatContext({ profile, symptomHistory: [], now })).toBe(
      "산후 0일차(0주차), 자연분만, 모유수유 중, 목표: 복직 예정, BMI 24.4",
    );
  });

  it("BMI는 Swift %.1f와 같게 — 정확히 반이면 짝수 쪽", () => {
    const ctx = (heightCm: number, currentWeightKg: number) =>
      buildChatContext({ profile: { ...base, deliveryMethod: null, goal: null, heightCm, currentWeightKg }, symptomHistory: [], now });
    expect(ctx(200, 97)).toBe("산후 63일차(9주차), 모유수유 중, BMI 24.2"); // 24.25
    expect(ctx(200, 99)).toBe("산후 63일차(9주차), 모유수유 중, BMI 24.8"); // 24.75
    expect(ctx(160, 58.8)).toBe("산후 63일차(9주차), 모유수유 중, BMI 23.0");
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
