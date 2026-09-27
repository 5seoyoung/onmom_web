// AI 상담 화면의 순수 로직 — ChatView.swift.
// 답은 rules/chat이 정한다: 서버(LLM)가 설정돼 있으면 먼저 묻고, 미설정·실패·빈 응답이면 규칙 폴백(chatReply).
// 여기서는 "무엇을 보일지(배너·FAQ)", "보낼 수 있는지", "어떤 의존성으로 답을 구할지"만 정한다.
// 대화는 화면 메모리에만 둔다(iOS와 같음) — 저장하지 않는다.
//
// 서버에 보내는 산모 정보는 산후 주차·분만 방식·수유 여부 셋뿐이다(chatLlmContext — 검수 #14, 처리방침 "AI 국외 이전 항목").
// iOS가 보내던 BMI·목표·최근 위험 신호 여부(rules/chat buildChatContext)는 보내지 않는다.
//
// 위기 표현(자해·자살)은 AI를 부르지 않는다 — AI 스위치·동의와 상관없이 바로 고정 위기 안내(content.json)로 답하고,
// 그 질문과 위기 안내는 뒤에 AI에 묻는 대화에도 싣지 않는다(가장 민감한 내용을 국외로 보내지 않게).

import type { LLMContext, LLMOptions, LLMRequest, LLMResult } from "@/api/llm";
import content from "@/content";
import { parseLocalDate, postpartumDayCount, weekFromDayCount } from "@/domain/date";
import type { UserProfile } from "@/domain/types";
import { localizedCaseInsensitiveContains } from "@/rules/substance";
// Edge Function chat의 안전 선필터와 같은 목록(가져오는 것이 없는 순수 모듈 — 웹 번들에도 그대로 들어간다)
import { isSelfHarmMessage } from "../../../supabase/functions/_shared/safety";
import type { AiMode } from "./aiConsent";
import {
  CHAT_FALLBACK_BANNER,
  CHAT_GREETING,
  resolveChatReply,
  shouldShowChatBanner,
  shouldShowFaq,
  type ChatDeps,
  type ChatLlmRequest,
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
 * 자해·자살 표현인가 — 앱 규칙 폴백(rules/chat chatReply)의 키워드(content.json self_harm_keywords)
 * 또는 Edge Function chat의 안전 선필터 목록(supabase/functions/_shared/safety.ts — 띄어쓰기·영어 표현 포함).
 * 둘 중 하나라도 걸리면 위기 표현으로 본다(놓치는 것보다 잘못 걸리는 쪽이 낫다).
 */
export function isCrisisMessage(text: string): boolean {
  return (
    content.chat_fallback.self_harm_keywords.some((k) => localizedCaseInsensitiveContains(text, k)) || isSelfHarmMessage(text)
  );
}

/**
 * 보낸 질문을 어떻게 다룰지 — ai: 서버(LLM)에 묻는다, rules: 앱 내 안내로 답한다, consent: 먼저 AI 국외 이전 동의를 묻는다.
 * 위기 표현은 어느 방식이든 AI에 보내지 않고 동의도 기다리게 하지 않는다(rules → 위기 안내).
 */
export function chatSendAction(mode: AiMode, text: string): "ai" | "rules" | "consent" {
  if (isCrisisMessage(text)) return "rules";
  if (mode === "on") return "ai";
  if (mode === "off") return "rules";
  return "consent";
}

/**
 * AI에 보낼 대화에서 위기 턴을 뺀다 — 위기 표현인 사용자 메시지와 바로 뒤의 답(앱의 위기 안내).
 * 동의 전에 앱이 답한 위기 질문이, 나중에 동의하고 묻는 질문과 함께 국외로 나가지 않게.
 */
export function withoutCrisisTurns<M extends { role: "user" | "assistant"; content: string }>(messages: readonly M[]): M[] {
  const out: M[] = [];
  let skipReply = false;
  for (const m of messages) {
    if (m.role === "user") {
      skipReply = isCrisisMessage(m.content);
      if (!skipReply) out.push(m);
    } else {
      if (!skipReply) out.push(m);
      skipReply = false;
    }
  }
  return out;
}

const DEFAULT_REPLY_NOT_CONNECTED = "지금은 AI 서버에 연결되지 않아";
// 웹 신규 문구 — CPO 확인 필요 (AI 국외 이전에 동의하지 않았을 때 배너·기본 답의 첫머리. 나머지는 content.json 원문 그대로)
const DECLINED_LEAD = "AI 답변에 동의하지 않아";

/** 동의하지 않았을 때의 배너 — content.json disclaimers.chat_banner의 "지금은 AI 서버에 연결되지 않아"만 바꾼다 */
export const CHAT_DECLINED_BANNER = CHAT_FALLBACK_BANNER.replace(DEFAULT_REPLY_NOT_CONNECTED, DECLINED_LEAD);
/** 동의하지 않았을 때의 기본 답 — content.json chat_fallback.replies.default의 같은 첫머리만 바꾼다 */
export const CHAT_DECLINED_DEFAULT_REPLY = content.chat_fallback.replies.default.replace(DEFAULT_REPLY_NOT_CONNECTED, DECLINED_LEAD);

/** 규칙 폴백 답 + 위기 안내였는가(화면은 위기 안내로 배너 상태를 바꾸지 않는다) */
export interface ChatScreenReply extends ChatReplyResult {
  crisis: boolean;
}

/**
 * 서버에 함께 보내는 산모 정보 — 산후 주차·분만 방식·수유 여부만. 출산일이 없으면 주차를, 분만 방식이 없으면 그것을 뺀다
 * (모르는 값을 0주차 같은 값으로 채워 보내지 않는다).
 */
export function chatLlmContext(
  profile: Pick<UserProfile, "deliveryDate" | "deliveryMethod" | "isBreastfeeding">,
  now: Date,
): LLMContext {
  const ctx: LLMContext = { breastfeeding: profile.isBreastfeeding };
  if (parseLocalDate(profile.deliveryDate) !== null) ctx.week = weekFromDayCount(postpartumDayCount(profile.deliveryDate, now));
  if (profile.deliveryMethod) ctx.delivery = profile.deliveryMethod;
  return ctx;
}

/**
 * 답 구하기(ChatView.swift:170-185). 서버를 쓸 때만(llmConfigured — AI 스위치 + 이 사람의 AI 국외 이전 동의) llmComplete를 붙이고
 * (preset patient_edu, 인사말은 빼고 보냄 — rules/chat buildChatLlmRequest), 실패하면 규칙 폴백 + 배너.
 * 쓰지 않으면 서버에 아무것도 보내지 않는다.
 * rules의 요청에 붙는 iOS 컨텍스트 문자열은 쓰지 않고, 대화(messages)·preset에 chatLlmContext의 세 항목만 붙여 보낸다.
 * - 마지막 질문이 위기 표현이면 어떤 경우에도 서버에 묻지 않고 고정 위기 안내(content.json replies.self_harm)로 답한다.
 * - 서버에 물을 때도 앞선 위기 턴은 뺀다(withoutCrisisTurns).
 * - declined(이번에 AI 국외 이전에 동의하지 않음)면 기본 답의 "AI 서버에 연결되지 않아"를 "AI 답변에 동의하지 않아"로 바꾼다.
 */
export async function requestChatReply(
  history: readonly ChatMessage[],
  input: { llmConfigured: boolean; complete: LlmCompleteFn; context: LLMContext | null; signal?: AbortSignal; declined?: boolean },
): Promise<ChatScreenReply> {
  if (isCrisisMessage(lastUserText(history))) {
    return { text: content.chat_fallback.replies.self_harm, fromFallback: true, crisis: true };
  }
  const deps: ChatDeps = input.llmConfigured
    ? {
        llmComplete: async (request: ChatLlmRequest) => {
          const llmRequest: LLMRequest = {
            preset: request.preset,
            messages: withoutCrisisTurns(request.messages),
            context: input.context,
          };
          const res = await input.complete(llmRequest, { signal: input.signal });
          if (!res.ok) throw new Error(res.kind);
          return res.text;
        },
      }
    : {};
  // 둘째 인자(iOS 컨텍스트 문자열)는 서버로 보내지 않으므로 비워 둔다
  const reply = await resolveChatReply(history, "", deps);
  if (input.declined === true && reply.fromFallback && reply.text === content.chat_fallback.replies.default) {
    return { text: CHAT_DECLINED_DEFAULT_REPLY, fromFallback: true, crisis: false };
  }
  return { ...reply, crisis: false };
}

function lastUserText(history: readonly ChatMessage[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "user") return history[i].text;
  }
  return "";
}
