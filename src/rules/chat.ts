// AI 상담 — iOS `OnmomEngine.chatReply`(규칙 폴백)와 `ChatView`의 서버 호출·폴백 흐름·표시 조건을 옮긴 것.
//
// 서버(LLM)에 먼저 묻고, 미설정·오류·빈 응답이면 앱 내 규칙 답으로 폴백한다(ChatView.swift:170-185).
// iOS는 서버 호출 전에 클라이언트 안전 선필터를 두지 않는다 — 이 모듈도 iOS 흐름 그대로 두지 않는다(검수 #7).
// 웹의 위기 표현 선필터는 화면 쪽 features/chat/chatModel.ts(isCrisisMessage)가 이 모듈을 부르기 전에 건다.
// 규칙 폴백은 질문을 이해하지 못한다. 키워드 5분기로 안전 연계만 하고, 이해한 척하지 않는다.
// 정보 제공·안내만 한다. 진단·처방이 아니다.

import content from "@/content";
import { localizedCaseInsensitiveContains } from "./substance";

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

/**
 * iOS ChatView는 maxTokens·timeout을 넘기지 않고 LLMClient 기본값(1024토큰·40초, LLMClient.swift:27, :64)을 쓴다.
 * 웹도 넘기지 않는다 — 기본값의 단일 출처는 src/api/llm.ts `LLM_PRESET_DEFAULTS.patient_edu`.
 */
export interface ChatLlmRequest {
  messages: { role: "user" | "assistant"; content: string }[];
  preset: "patient_edu";
  /** iOS 컨텍스트 문자열 자리 — 웹은 비워 둔다(서버에는 features/chat/chatModel.ts chatLlmContext의 세 항목만 따로 보낸다) */
  context: string;
}

export interface ChatReplyResult {
  text: string;
  /** 서버 대신 규칙 폴백으로 답했는가 — 배너 표시에 쓴다 */
  fromFallback: boolean;
}

export interface ChatDeps {
  /** LLM 서버가 설정돼 있을 때만 넘긴다. 응답 text를 돌려주고, 실패하면 throw. */
  llmComplete?: (request: ChatLlmRequest) => Promise<string>;
}

// 원문: ChatView.swift:13
export const CHAT_GREETING =
  "안녕하세요, 온맘이에요. 산후 회복에 대해 궁금한 점을 편하게 물어보세요. (제공되는 답변은 정보 안내이며 진단·처방이 아닙니다.)";
// 원문: ChatView.swift:123
export const CHAT_FAQ_TITLE = "자주 묻는 질문";
/** 질문 목록만 큐레이션이고, 답은 서버 LLM이 한다 */
export const CHAT_FAQ: readonly string[] = content.chat_faq;
/** 서버 대신 규칙으로 답하고 있음을 알리는 배너 */
export const CHAT_FALLBACK_BANNER = content.disclaimers.chat_banner;

const fallback = content.chat_fallback;

/**
 * 규칙 폴백 답(OnmomEngine.swift:120-140). 마지막 사용자 문장에서 순서대로 첫 일치:
 * 자해(최우선 응급 연계) → 기분(상담하지 않고 연계만) → 출혈·피 → 운동 → 기본 안내.
 * "피"는 "커피"에도 걸린다 — 그래서 FAQ 칩은 서버가 있을 때만 보인다(shouldShowFaq).
 */
export function chatReply(history: readonly ChatMessage[]): ChatMessage {
  const last = lastUserText(history);
  const has = (keywords: readonly string[]) => keywords.some((k) => localizedCaseInsensitiveContains(last, k));

  let text: string;
  if (has(fallback.self_harm_keywords)) {
    text = fallback.replies.self_harm;
  } else if (has(fallback.mood_keywords)) {
    // 우울·기분 상담은 의료행위라 챗봇이 진행하지 않는다 — 알림·연계만 안내
    text = fallback.replies.mood;
  } else if (has(fallback.bleeding_keywords)) {
    text = fallback.replies.bleeding;
  } else if (has(fallback.exercise_keywords)) {
    text = fallback.replies.exercise;
  } else {
    text = fallback.replies.default;
  }
  return { role: "assistant", text };
}

/**
 * 서버에 보낼 대화 — 첫 메시지가 user여야 하므로 앱이 심은 인사말(앞쪽 assistant)은 뺀다(ChatView.swift:171-174).
 * 시스템 프롬프트와 임산부 수첩 코퍼스는 서버가 소유하므로 보내지 않는다.
 */
export function buildChatLlmRequest(history: readonly ChatMessage[], context: string): ChatLlmRequest {
  const firstUser = history.findIndex((m) => m.role !== "assistant");
  const messages = (firstUser === -1 ? [] : history.slice(firstUser)).map((m) => ({
    role: m.role,
    content: m.text,
  }));
  return { messages, preset: "patient_edu", context };
}

/** 서버 우선, 미설정·실패·빈 응답이면 규칙 폴백(ChatView.swift:170-185). */
export async function resolveChatReply(
  history: readonly ChatMessage[],
  context: string,
  deps: ChatDeps = {},
): Promise<ChatReplyResult> {
  if (deps.llmComplete) {
    try {
      const text = await deps.llmComplete(buildChatLlmRequest(history, context));
      // LLMClient는 빈 text를 오류로 본다(LLMClient.swift:86)
      if (typeof text === "string" && text.length > 0) return { text, fromFallback: false };
    } catch {
      // 서버 미연결·오프라인 — 아래 규칙 폴백
    }
  }
  return { text: chatReply(history).text, fromFallback: true };
}

/** FAQ 칩 — 서버가 답할 수 있고, 인사말만 있고, 응답 대기 중이 아닐 때만(ChatView.swift:31-36, 검수 #6). */
export function shouldShowFaq(state: { llmConfigured: boolean; messageCount: number; thinking: boolean }): boolean {
  return state.llmConfigured && state.messageCount === 1 && !state.thinking;
}

/**
 * 폴백 배너(ChatView.swift:20, :161). 서버 주소가 없으면 첫 질문 전부터 보이고,
 * 이후에는 마지막 답이 규칙 폴백이었는지를 따른다. lastReplyFromFallback은 아직 답이 없으면 null.
 */
export function shouldShowChatBanner(state: { llmConfigured: boolean; lastReplyFromFallback: boolean | null }): boolean {
  return state.lastReplyFromFallback ?? !state.llmConfigured;
}

function lastUserText(history: readonly ChatMessage[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "user") return history[i].text;
  }
  return "";
}

