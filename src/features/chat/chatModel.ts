// AI 상담 화면의 순수 로직 — ChatView.swift.
// 답은 rules/chat이 정한다: 서버(LLM)가 설정돼 있으면 먼저 묻고, 미설정·실패·빈 응답이면 규칙 폴백(chatReply).
// 여기서는 "무엇을 보일지(배너·FAQ)", "보낼 수 있는지", "어떤 의존성으로 답을 구할지"만 정한다.
// 대화는 화면 메모리에만 둔다(iOS와 같음) — 저장하지 않는다.

import type { LLMOptions, LLMRequest, LLMResult } from "@/api/llm";
import {
  CHAT_GREETING,
  resolveChatReply,
  shouldShowChatBanner,
  shouldShowFaq,
  type ChatDeps,
  type ChatMessage,
  type ChatReplyResult,
} from "@/rules/chat";
import { ROUTES } from "@/routes";

/** src/api/llm.ts `llmComplete`와 같은 모양 — 테스트에서 가짜로 바꿔 넣는다. */
export type LlmCompleteFn = (req: LLMRequest, opts?: LLMOptions) => Promise<LLMResult>;

/** 화면에 그리는 말풍선 — key용 id를 붙인다 */
export interface ChatBubbleMessage extends ChatMessage {
  id: number;
}

/** 첫 화면 — 앱이 심은 인사말 하나(ChatView.swift:12-14). */
export function initialChatMessages(): ChatBubbleMessage[] {
  return [{ id: 0, role: "assistant", text: CHAT_GREETING }];
}

/**
 * 보낼 글 다듬기. iOS는 공백·탭만 잘랐지만(ChatView.swift:151 `.whitespaces`),
 * 웹은 줄바꿈도 앞뒤에서 자른다 — 줄바꿈만 있는 메시지가 나가지 않게.
 */
export function normalizeChatDraft(draft: string): string {
  return draft.trim();
}

/** 보내기 버튼 활성 — 글이 있고 답을 기다리는 중이 아니며, 저장소를 읽은 뒤(ChatView.swift:147). */
export function canSendChat(input: { draft: string; thinking: boolean; hydrated: boolean }): boolean {
  return input.hydrated && !input.thinking && normalizeChatDraft(input.draft).length > 0;
}

/** 폴백 배너·FAQ 칩 표시 여부(ChatView.swift:20, :24, :31-36, :161). */
export function chatScreenState(input: {
  llmConfigured: boolean;
  messageCount: number;
  thinking: boolean;
  lastReplyFromFallback: boolean | null;
}): { showBanner: boolean; showFaq: boolean } {
  return {
    showBanner: shouldShowChatBanner({
      llmConfigured: input.llmConfigured,
      lastReplyFromFallback: input.lastReplyFromFallback,
    }),
    showFaq: shouldShowFaq({
      llmConfigured: input.llmConfigured,
      messageCount: input.messageCount,
      thinking: input.thinking,
    }),
  };
}

/**
 * Enter로 보낼지 — Shift+Enter는 줄바꿈. 한글 조합 중 Enter(isComposing, keyCode 229)는 보내지 않는다
 * (조합 중 보내면 마지막 글자가 입력창에 남거나 두 번 들어간다).
 */
export function shouldSendOnEnter(e: { key: string; shiftKey: boolean; isComposing: boolean; keyCode?: number }): boolean {
  return e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229;
}

/**
 * 뒤로 갈 곳. iOS는 홈(말로 물어보기 → 시트)과 프로필 메뉴(푸시) 두 곳에서 연다.
 * 주소에 `?from=home`이 있으면 홈, 아니면 프로필.
 */
export function chatBackHref(search: string): typeof ROUTES.home | typeof ROUTES.profile {
  return new URLSearchParams(search).get("from") === "home" ? ROUTES.home : ROUTES.profile;
}

/**
 * 답 구하기(ChatView.swift:170-185). 서버가 설정돼 있을 때만 llmComplete를 붙이고(preset patient_edu,
 * 인사말은 빼고 보냄 — rules/chat buildChatLlmRequest), 실패하면 규칙 폴백 + 배너.
 * 미설정이면 서버에 아무것도 보내지 않는다.
 */
export function requestChatReply(
  history: readonly ChatMessage[],
  input: { llmConfigured: boolean; complete: LlmCompleteFn; context: string; signal?: AbortSignal },
): Promise<ChatReplyResult> {
  const deps: ChatDeps = input.llmConfigured
    ? {
        llmComplete: async (request) => {
          const res = await input.complete(request, { signal: input.signal });
          if (!res.ok) throw new Error(res.kind);
          return res.text;
        },
      }
    : {};
  return resolveChatReply(history, input.context, deps);
}
