// AI 상담 화면의 순수 로직 — ChatView.swift.
// 답은 rules/chat이 정한다: 서버(LLM)가 설정돼 있으면 먼저 묻고, 미설정·실패·빈 응답이면 규칙 폴백(chatReply).
// 여기서는 "무엇을 보일지(배너·FAQ)", "보낼 수 있는지", "어떤 의존성으로 답을 구할지"만 정한다.
// 대화는 화면 메모리에만 둔다(iOS와 같음) — 저장하지 않는다.
//
// 서버에 보내는 산모 정보는 산후 주차·분만 방식·수유 여부 셋뿐이다(chatLlmContext — 검수 #14, 처리방침 "AI 국외 이전 항목").
// iOS가 보내던 BMI·목표·최근 위험 신호 여부(ChatView.swift:188-196)는 보내지 않는다.
//
// 위기 표현(자해·자살)은 AI를 부르지 않는다 — AI 스위치·동의와 상관없이 바로 고정 위기 안내(content.json)로 답하고,
// 그 질문과 위기 안내는 뒤에 AI에 묻는 대화에도 싣지 않는다(가장 민감한 내용을 국외로 보내지 않게).
//
// 답마다 어디서 왔는지(origin: 인사말·앱 안내·AI)를 말풍선에 남긴다 — 실패 뒤 섞인 대화에서 AI 답과 앱 안내가 구분되게(LAUNCH_CHECKLIST 5-3).
// 앱 안내로 답한 이유(fallbackReason)도 남긴다 — 서버 함수의 한도(429)·혼잡(503)·거절(422)을 "연결되지 않아"로 뭉개지 않고
// 배너·기본 답의 첫머리를 이유에 맞게 바꾼다(supabase/functions/chat/handler.ts, docs/SUPABASE_FUNCTIONS.md §5).

import type { LLMContext, LLMOptions, LLMRequest, LLMResult } from "@/api/llm";
import content from "@/content";
import { parseLocalDate, postpartumDayCount, weekFromDayCount } from "@/domain/date";
import type { UserProfile } from "@/domain/types";
import { localizedCaseInsensitiveContains } from "@/rules/substance";
// Edge Function chat의 안전 선필터와 같은 목록·고정 위기 안내(가져오는 것이 없는 순수 모듈 — 웹 번들에도 그대로 들어간다)
import { CRISIS_REPLY, isSelfHarmMessage } from "../../../supabase/functions/_shared/safety";
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

/** 온맘 답이 어디서 왔나 — greeting: 앱이 심은 인사말, rules: 앱 안내(규칙 폴백·위기 안내), ai: 서버(LLM) 답 */
export type ChatOrigin = "greeting" | "rules" | "ai";

/** 화면에 그리는 말풍선 — key용 id, 온맘 답에는 origin을 붙인다(사용자 말풍선에는 없다) */
export interface ChatBubbleMessage extends ChatMessage {
  id: number;
  origin?: ChatOrigin;
}

/** 첫 화면 — 앱이 심은 인사말 하나(ChatView.swift:12-14). */
export function initialChatMessages(): ChatBubbleMessage[] {
  return [{ id: 0, role: "assistant", text: CHAT_GREETING, origin: "greeting" }];
}

/**
 * 말풍선 아래 작은 글씨 — 어디서 온 답인지. 인사말에는 붙이지 않는다(문장 안에 이미 "정보 안내이며 진단·처방이 아닙니다"가 있다).
 * AI 답은 plain text로만 그리므로(검수 #51) 이 표시가 유일한 "AI 답변" 표기다(약물 체크의 "AI 답변" 칩과 같은 역할).
 */
export const CHAT_ORIGIN_CAPTION: Readonly<Record<ChatOrigin, string | null>> = {
  greeting: null,
  // 웹 신규 문구 — CPO 확인 필요 (규칙 폴백·위기 안내 말풍선 아래 — 앱에 담긴 안내로 답했다는 표시)
  rules: "앱 안내",
  // 웹 신규 문구 — CPO 확인 필요 (AI 답 말풍선 아래 — 약물 체크의 "AI 답변" 칩 + 병기 문구(SubstanceCheckView.swift:137-139)를 한 줄로)
  ai: "AI 답변 · 진단·처방이 아닙니다",
};

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

/**
 * 폴백 배너·FAQ 칩 표시 여부(ChatView.swift:20, :24, :31-36, :161).
 * - 배너: 서버에 물을 수 있으면(동의를 묻는 중 ask 포함) 첫 화면에는 없다 — 동의 전이라도 "연결되지 않아"는 사실이 아니다.
 * - FAQ: AI가 실제로 답할 때(on)만. 동의를 묻는 중(ask)에는 숨긴다 — 칩을 누르고 [동의하지 않기]를 고르면 앱의 질문이
 *   규칙 폴백으로 가는데, 규칙은 FAQ 대부분에 엉뚱하게 답한다("수유 중에 커피…"의 '피' → 출혈 안내, rules/chat.ts chatReply).
 *   동의는 처음 직접 쓴 질문에서 묻고, 동의한 뒤 다음 방문부터 칩이 보인다.
 */
export function chatScreenState(input: {
  mode: AiMode;
  messageCount: number;
  thinking: boolean;
  lastReplyFromFallback: boolean | null;
}): { showBanner: boolean; showFaq: boolean } {
  return {
    showBanner: shouldShowChatBanner({
      llmConfigured: input.mode !== "off",
      lastReplyFromFallback: input.lastReplyFromFallback,
    }),
    showFaq: shouldShowFaq({
      llmConfigured: input.mode === "on",
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

/**
 * 앱 안내로 답한 이유 — 배너·기본 답의 첫머리를 정한다.
 * - notConnected: 서버 미설정·연결 실패·시간 초과·빈 답·답을 쓸 수 없음(5xx) — content.json 원문 그대로
 * - declined: 이번에 AI 국외 이전에 동의하지 않음
 * - rateLimited: 이 사용자의 1시간 한도(429 rate_limited)
 * - busy: 서비스가 지금 AI를 내줄 수 없음(503 — 하루 전체 상한 busy·한도 확인 실패·Auth 확인 실패·Anthropic 혼잡/키 없음)
 * - refused: AI가 이 질문에 답하지 않음(422 refused)
 */
export type ChatFallbackReason = "notConnected" | "declined" | "rateLimited" | "busy" | "refused";

const DEFAULT_REPLY_NOT_CONNECTED = "지금은 AI 서버에 연결되지 않아";
/**
 * 이유별 첫머리 — content.json disclaimers.chat_banner·chat_fallback.replies.default의 "지금은 AI 서버에 연결되지 않아"만 바꾼다.
 * 나머지 문장은 원문 그대로다.
 */
const FALLBACK_LEAD: Readonly<Record<ChatFallbackReason, string>> = {
  notConnected: DEFAULT_REPLY_NOT_CONNECTED,
  // 웹 신규 문구 — CPO 확인 필요 (AI 국외 이전에 동의하지 않았을 때 배너·기본 답의 첫머리)
  declined: "AI 답변에 동의하지 않아",
  // 웹 신규 문구 — CPO 확인 필요 (이 사용자의 AI 상담 1시간 한도에 닿았을 때 — 서버 함수 429 rate_limited)
  rateLimited: "AI 상담 이용 횟수가 잠시 한도에 닿아",
  // 웹 신규 문구 — CPO 확인 필요 (서비스가 지금 AI를 내줄 수 없을 때 — 서버 함수 503 busy·unavailable 등)
  busy: "지금은 AI 서버를 잠시 이용할 수 없어",
  // 웹 신규 문구 — CPO 확인 필요 (AI가 이 질문에 답하지 않았을 때 — 서버 함수 422 refused)
  refused: "AI가 이 질문에는 답하지 않아",
};

/** 배너 — 이유에 맞는 첫머리 + content.json disclaimers.chat_banner의 나머지 */
export function chatBannerText(reason: ChatFallbackReason): string {
  return CHAT_FALLBACK_BANNER.replace(DEFAULT_REPLY_NOT_CONNECTED, FALLBACK_LEAD[reason]);
}

/** 기본 답 — 이유에 맞는 첫머리 + content.json chat_fallback.replies.default의 나머지 */
export function chatDefaultReplyText(reason: ChatFallbackReason): string {
  return content.chat_fallback.replies.default.replace(DEFAULT_REPLY_NOT_CONNECTED, FALLBACK_LEAD[reason]);
}

/** 동의하지 않았을 때의 배너 — content.json disclaimers.chat_banner의 "지금은 AI 서버에 연결되지 않아"만 바꾼다 */
export const CHAT_DECLINED_BANNER = chatBannerText("declined");
/** 동의하지 않았을 때의 기본 답 — content.json chat_fallback.replies.default의 같은 첫머리만 바꾼다 */
export const CHAT_DECLINED_DEFAULT_REPLY = chatDefaultReplyText("declined");

/**
 * 서버(LLM) 실패 → 앱 안내로 답한 이유. 상태 코드는 Edge Function chat의 것(handler.ts): 429 rate_limited, 503 busy·unavailable,
 * 422 refused. 그 밖(400·401·5xx·연결 실패·시간 초과·빈 답·미설정)은 모두 "연결되지 않아"(원문).
 * 예전 NEXT_PUBLIC_LLM_URL 서버가 같은 코드를 쓰면 같은 뜻으로 본다.
 */
export function chatFallbackReasonFor(failure: Extract<LLMResult, { ok: false }>): ChatFallbackReason {
  if (failure.kind !== "server") return "notConnected";
  switch (failure.status) {
    case 429:
      return "rateLimited";
    case 503:
      return "busy";
    case 422:
      return "refused";
    default:
      return "notConnected";
  }
}

/**
 * 화면용 답 — 규칙 폴백 여부(fromFallback) · 위기 안내였는가(crisis — 화면은 위기 안내로 배너 상태를 바꾸지 않는다) ·
 * 말풍선 표시(origin) · 앱 안내로 답한 이유(fallbackReason — AI 답·위기 안내면 null).
 */
export interface ChatScreenReply extends ChatReplyResult {
  crisis: boolean;
  origin: Exclude<ChatOrigin, "greeting">;
  fallbackReason: ChatFallbackReason | null;
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
 * - 서버가 (자기 선필터로) 같은 고정 위기 안내를 돌려주면 AI 답이 아니라 위기 안내(origin rules·crisis)로 다룬다.
 * - 기본 답의 첫머리 "지금은 AI 서버에 연결되지 않아"는 이유에 맞게 바꾼다(chatDefaultReplyText) — declined(이번에 AI 국외 이전에
 *   동의하지 않음)·rateLimited·busy·refused. 다른 폴백 답(출혈·운동·기분)은 이유와 무관하게 원문 그대로다.
 */
export async function requestChatReply(
  history: readonly ChatMessage[],
  input: { llmConfigured: boolean; complete: LlmCompleteFn; context: LLMContext | null; signal?: AbortSignal; declined?: boolean },
): Promise<ChatScreenReply> {
  if (isCrisisMessage(lastUserText(history))) {
    return { text: content.chat_fallback.replies.self_harm, fromFallback: true, crisis: true, origin: "rules", fallbackReason: null };
  }
  /** 서버가 실패한 이유 — 규칙 폴백이 된 까닭을 화면에 정직하게 알리려고 잡아 둔다 */
  let failure: Extract<LLMResult, { ok: false }> | null = null;
  const deps: ChatDeps = input.llmConfigured
    ? {
        llmComplete: async (request: ChatLlmRequest) => {
          const llmRequest: LLMRequest = {
            preset: request.preset,
            messages: withoutCrisisTurns(request.messages),
            context: input.context,
          };
          const res = await input.complete(llmRequest, { signal: input.signal });
          if (!res.ok) {
            failure = res;
            throw new Error(res.kind);
          }
          return res.text;
        },
      }
    : {};
  // 둘째 인자(iOS 컨텍스트 문자열)는 서버로 보내지 않으므로 비워 둔다
  const reply = await resolveChatReply(history, "", deps);
  if (!reply.fromFallback) {
    // 서버 함수의 안전 선필터가 걸려 LLM 대신 고정 위기 안내를 돌려줬다(handler.ts `{ ok, text: CRISIS_REPLY, flagged }`) —
    // 웹 선필터가 먼저 거르므로 보통 오지 않지만, 오면 AI 답이 아니라 앱 안내(위기 안내)로 표시한다("AI 답변" 표시를 붙이지 않는다).
    if (reply.text === CRISIS_REPLY) return { text: reply.text, fromFallback: true, crisis: true, origin: "rules", fallbackReason: null };
    return { ...reply, crisis: false, origin: "ai", fallbackReason: null };
  }

  const reason: ChatFallbackReason =
    input.declined === true ? "declined" : failure !== null ? chatFallbackReasonFor(failure) : "notConnected";
  const text =
    reason !== "notConnected" && reply.text === content.chat_fallback.replies.default ? chatDefaultReplyText(reason) : reply.text;
  return { text, fromFallback: true, crisis: false, origin: "rules", fallbackReason: reason };
}

function lastUserText(history: readonly ChatMessage[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "user") return history[i].text;
  }
  return "";
}
