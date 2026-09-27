// LLM 호출 — iOS LLMClient.swift 이식. 결과 모양(LLMResult)은 어느 경로든 같다.
//
// 어디로 묻나
// - Supabase가 설정된 빌드: Edge Function "chat"(`{functionsURL}/chat`) — AI 스위치(NEXT_PUBLIC_AI_CHAT_ENABLED)가 켜졌을 때만.
//   Authorization = 이 브라우저의 Supabase 로그인 토큰(익명 게스트 포함), apikey = 공개 키. Anthropic 키는 함수 비밀에만 있다.
//   보내는 것: preset · 대화(최근 20개, 각 2000자) · 컨텍스트 {week, delivery, breastfeeding}뿐(검수 #14 — BMI·목표·위험 신호 여부 없음).
//   시스템 프롬프트·모델·토큰 수는 함수가 정한다 — max_tokens도 보내지 않는다(함수가 모르는 필드는 거절한다).
// - 설정이 없는 빌드(지금 배포): 예전처럼 NEXT_PUBLIC_LLM_URL의 POST /chat → { text } (비어 있으면 notConfigured).
//
// LLM은 판정 경로 밖이다(원칙 2): 이 함수는 텍스트만 돌려주고, 실패 시 무엇을 보여줄지는 호출하는 화면이 정한다.
// 응답 text는 신뢰할 수 없는 값이다 — 마크다운·HTML로 렌더하지 말고 plain text로만 보여준다(검수 #51, iOS Text()와 동일).
// 질문·답·컨텍스트는 기록(console)하지 않는다.

import { getSupabaseClient } from "@/auth/client";
import type { DeliveryMethod } from "@/domain/types";
import { DELIVERY_TITLE } from "@/rules/exercise";
import { defaultBackendConfig, joinBackendUrl, requestJson, type BackendConfig } from "./http";

/** 서버가 소유한 시스템 프롬프트 프리셋 */
export type LLMPreset = "patient_edu" | "substance";

export type LLMMessage = { role: "user" | "assistant"; content: string };

/**
 * LLM에 함께 보내는 산모 정보 — 이 셋뿐이다(처리방침·동의 문구 "산후 주차, 분만 방식, 수유 여부" — features/privacy/dataItems.ts).
 * 모르는 값은 빼고 보낸다(출산일이 없으면 week 없음).
 */
export interface LLMContext {
  week?: number;
  delivery?: DeliveryMethod;
  breastfeeding?: boolean;
}

export type LLMFailureKind = "notConfigured" | "server" | "network" | "empty";

export type LLMResult =
  | { ok: true; text: string }
  | { ok: false; kind: LLMFailureKind; message: string; status?: number };

export const LLM_MESSAGES: Record<LLMFailureKind, string> = {
  notConfigured: "AI 상담은 준비 중이에요.", // 원문: LLMClient.swift:33
  network: "AI 서버에 연결할 수 없어요.", // 원문: LLMClient.swift:34
  server: "AI 응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.", // 원문: LLMClient.swift:35
  empty: "응답이 비어 있어요.", // 원문: LLMClient.swift:36
};

/** 호출 지점별 iOS 값 — 챗봇은 LLMClient 기본값, 약물 조회는 SubstanceCheckView가 준 값(예전 NEXT_PUBLIC_LLM_URL 경로) */
export const LLM_PRESET_DEFAULTS: Record<LLMPreset, { maxTokens: number; timeoutMs: number }> = {
  patient_edu: { maxTokens: 1024, timeoutMs: 40_000 }, // LLMClient.swift:27, :64
  substance: { maxTokens: 512, timeoutMs: 25_000 }, // SubstanceCheckView.swift:121, :125
};

/**
 * Edge Function을 거칠 때의 대기 — 함수가 Anthropic을 최대 50초 기다린다(LLM_DEADLINE_MS,
 * supabase/functions/_shared/prompts.ts). 생각(adaptive thinking)이 켜진 모델이라 iOS 값(40초·25초)보다 길다.
 */
export const LLM_FUNCTION_TIMEOUT_MS = 60_000;
/** 함수가 받는 대화 한도 — supabase/functions/_shared/chat.ts와 같은 값(edgeFunctions.test.ts가 비교) */
export const LLM_FUNCTION_MAX_MESSAGES = 20;
export const LLM_FUNCTION_MAX_MESSAGE_CHARS = 2000;
/** 함수가 받는 산후 주차 상한(CHAT_MAX_WEEK) — 넘는 값(잘못 고른 출산 연도 등)은 요청 전체가 400이 되므로 빼고 보낸다 */
export const LLM_FUNCTION_MAX_WEEK = 520;

export type LLMRequest = {
  preset: LLMPreset;
  messages: LLMMessage[];
  /** 산모 정보 — LLMContext의 세 항목만. 화면이 정하지 않으면 보내지 않는다. */
  context?: LLMContext | null;
  /** 예전 NEXT_PUBLIC_LLM_URL 경로에서만 보낸다(함수 경로는 서버가 정한다) */
  maxTokens?: number;
};

export type LLMOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  config?: BackendConfig;
  /** Supabase 로그인 토큰 — 테스트가 바꿔 넣는다. 기본은 src/auth의 Supabase 세션. */
  getAccessToken?: () => Promise<string | null>;
};

const fail = (kind: LLMFailureKind, status?: number): LLMResult => ({
  ok: false,
  kind,
  message: LLM_MESSAGES[kind],
  status,
});

/**
 * 한 턴 질의. 호출자가 signal로 취소하면 network로 끝나므로, 취소한 쪽은 자기 signal을 보고 결과를 버린다.
 */
export async function llmComplete(req: LLMRequest, opts: LLMOptions = {}): Promise<LLMResult> {
  const cfg = opts.config ?? defaultBackendConfig;
  if (cfg.functionsURL !== null) return completeViaFunction(req, cfg, opts);

  // iOS와 같은 순서 — 설정 확인이 먼저다(LLMClient.swift:66)
  const url = joinBackendUrl(cfg.llmURL, "chat");
  if (!url) return fail("notConfigured");

  // 첫 메시지는 항상 user여야 한다 — 화면이 심은 인사말(assistant)은 빼고 보낸다(ChatView.swift:171-172)
  const firstUser = req.messages.findIndex((m) => m.role === "user");
  // user 턴이 없으면 iOS는 빈 대화를 보내 서버에 거절당했다(→ server). 결과는 같게, 요청은 보내지 않는다.
  // 던지지 않는다 — 호출자는 실패 시 규칙 기반 폴백을 보여줘야 한다(ChatView.swift:175-185).
  if (firstUser < 0) return fail("server");
  const messages = req.messages.slice(firstUser).map(({ role, content }) => ({ role, content }));

  const defaults = LLM_PRESET_DEFAULTS[req.preset];
  const body: Record<string, unknown> = {
    messages,
    preset: req.preset,
    max_tokens: req.maxTokens ?? defaults.maxTokens,
  };
  const context = legacyContextText(req.context);
  if (context !== null) body.context = context;

  const res = await requestJson(url.toString(), {
    method: "POST",
    body,
    timeoutMs: opts.timeoutMs ?? defaults.timeoutMs,
    signal: opts.signal,
    config: cfg,
  });
  if (!res.ok) return res.kind === "status" ? fail("server", res.status) : fail("network");

  const text = (res.data as { text?: unknown } | null)?.text;
  // iOS는 디코딩 실패를 unreachable로 묶는다(LLMClient.swift:90-91)
  if (typeof text !== "string") return fail("network");
  if (text.trim() === "") return fail("empty");
  return { ok: true, text };
}

// MARK: Edge Function "chat"

async function completeViaFunction(req: LLMRequest, cfg: BackendConfig, opts: LLMOptions): Promise<LLMResult> {
  // 스위치가 꺼져 있으면 함수를 부르지 않는다(화면은 isLLMBackendConfigured로 먼저 거른다 — 여기는 한 번 더)
  if (!cfg.aiChatEnabled) return fail("notConfigured");
  const url = joinBackendUrl(cfg.functionsURL, "chat");
  if (!url) return fail("notConfigured");

  const messages = functionMessages(req.messages);
  // 보낼 질문이 없거나 너무 길다 — 함수가 거절할 요청은 보내지 않는다(호출자는 규칙 안내로 답한다)
  if (messages === null) return fail("server");

  let token: string | null;
  try {
    token = await (opts.getAccessToken ?? supabaseAccessToken)();
  } catch {
    token = null;
  }
  // 로그인 세션이 없다(게스트 계정을 만들지 못한 브라우저 등) — 함수는 401로 답할 것이므로 보내지 않는다
  if (!token) return fail("server", 401);

  const body: { preset: LLMPreset; messages: LLMMessage[]; context?: LLMContext } = { preset: req.preset, messages };
  const context = functionContext(req.context);
  if (context !== null) body.context = context;

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (cfg.supabaseKey) headers.apikey = cfg.supabaseKey;

  const res = await requestJson(url.toString(), {
    method: "POST",
    headers,
    body,
    timeoutMs: opts.timeoutMs ?? LLM_FUNCTION_TIMEOUT_MS,
    signal: opts.signal,
    config: cfg,
  });
  // 4xx·5xx(한도 429, 거절 422, 잘못된 요청 400, 로그인 401 …) → server. 연결 실패·시간 초과 → network.
  if (!res.ok) return res.kind === "status" ? fail("server", res.status) : fail("network");
  return parseFunctionReply(res.data);
}

/**
 * 함수 응답 → LLMResult. { ok: true, text } 그대로, 약물 { ok: true, json }은 JSON 문자열로 바꿔
 * 예전 경로와 같은 모양(text 안의 JSON — rules/substance parseSubstanceAnswer)으로 넘긴다. 모양이 틀리면 network(iOS 디코딩 실패와 같게).
 */
export function parseFunctionReply(data: unknown): LLMResult {
  if (typeof data !== "object" || data === null || (data as { ok?: unknown }).ok !== true) return fail("network");
  const { text, json } = data as { text?: unknown; json?: unknown };
  if (typeof text === "string") return text.trim() === "" ? fail("empty") : { ok: true, text };
  if (typeof json === "object" && json !== null && !Array.isArray(json)) return { ok: true, text: JSON.stringify(json) };
  return fail("network");
}

const charCount = (s: string) => Array.from(s).length;
const clip = (s: string, max: number) => (charCount(s) <= max ? s : Array.from(s).slice(0, max).join(""));

/**
 * 함수로 보낼 대화 — 함수의 형식 검증(supabase/functions/_shared/chat.ts validateChatRequest)을 통과하는 모양으로.
 * - 최근 20개만, 첫 메시지는 user(앞쪽 인사말·잘린 답은 뺀다), 마지막은 user여야 한다.
 * - 지난 메시지는 2000자에서 자른다(대화 맥락일 뿐이다). 지금 보내는 마지막 질문이 2000자를 넘으면 보내지 않는다(null).
 * - 빈 메시지는 뺀다. role·content 외 필드는 보내지 않는다.
 */
export function functionMessages(messages: readonly LLMMessage[]): LLMMessage[] | null {
  const nonEmpty = messages
    .filter((m) => m.content.trim() !== "")
    .map(({ role, content }) => ({ role, content }));
  const last = nonEmpty.at(-1);
  if (!last || last.role !== "user" || charCount(last.content) > LLM_FUNCTION_MAX_MESSAGE_CHARS) return null;
  const recent = nonEmpty.slice(-LLM_FUNCTION_MAX_MESSAGES);
  const firstUser = recent.findIndex((m) => m.role === "user");
  return recent.slice(firstUser).map((m) => ({ role: m.role, content: clip(m.content, LLM_FUNCTION_MAX_MESSAGE_CHARS) }));
}

/**
 * 컨텍스트 허용 목록 — 세 항목만 새 객체로 옮긴다(호출자가 다른 값을 섞어도 나가지 않게). 비면 null.
 * 주차는 함수가 받는 범위(0~LLM_FUNCTION_MAX_WEEK)일 때만 — 밖이면 그 항목만 뺀다(요청 전체가 400으로 거절되지 않게).
 */
export function functionContext(ctx: LLMContext | null | undefined): LLMContext | null {
  if (!ctx) return null;
  const out: LLMContext = {};
  if (typeof ctx.week === "number" && Number.isInteger(ctx.week) && ctx.week >= 0 && ctx.week <= LLM_FUNCTION_MAX_WEEK) {
    out.week = ctx.week;
  }
  if (ctx.delivery === "vaginal" || ctx.delivery === "cesarean") out.delivery = ctx.delivery;
  if (typeof ctx.breastfeeding === "boolean") out.breastfeeding = ctx.breastfeeding;
  return Object.keys(out).length > 0 ? out : null;
}

/** 예전 경로(NEXT_PUBLIC_LLM_URL)의 context 문자열 — 같은 세 항목만. 예: "산후 3주차, 제왕절개, 모유수유 중" */
export function legacyContextText(ctx: LLMContext | null | undefined): string | null {
  const c = functionContext(ctx);
  if (!c) return null;
  const parts: string[] = [];
  if (c.week !== undefined) parts.push(`산후 ${c.week}주차`);
  if (c.delivery) parts.push(DELIVERY_TITLE[c.delivery]); // 원문: Models.swift:13-14
  if (c.breastfeeding !== undefined) parts.push(c.breastfeeding ? "모유수유 중" : "모유수유 안 함"); // 원문: ChatView.swift:191
  return parts.join(", ");
}

/** 이 브라우저의 Supabase 로그인 토큰(만료됐으면 supabase-js가 새로 받는다). 세션이 없으면 null. */
async function supabaseAccessToken(): Promise<string | null> {
  const client = await getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error) return null;
  return data.session?.access_token ?? null;
}
