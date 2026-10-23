/* eslint-disable @typescript-eslint/ban-ts-comment -- Deno는 ".ts" 확장자가 있어야 가져온다. Next tsc(TS5097)만 그 줄을 넘기게 한다. */
// Edge Function "chat"의 바깥 연결 — 로그인 확인(Supabase Auth)·동의 확인(ai_consents)·요청 한도(llm_consume_quota·llm_refund_quota)·LLM 호출(Anthropic)을
// 클라이언트를 받아 만드는 함수로 둔다. index.ts(Deno)는 진짜 클라이언트를 넣고, vitest(src/api/edgeAdapters.test.ts)는 가짜를 넣는다.
// 여기서는 SDK를 가져오지 않는다(타입도) — 필요한 모양만 적고, 진짜 SDK와 맞는지는 index.ts를 `deno check`가 확인한다.
//
// LLM 규칙(claude-api 안내):
// - 모델 claude-opus-5, 서버 쪽 거절 대체(fallbacks: "default" + 베타 헤더 server-side-fallback-2026-07-01).
// - content보다 stop_reason을 먼저 본다 — "refusal"이면 content가 비었거나 일부만 있다. 잘린 답(max_tokens·문맥 창)은 쓰지 않는다.
// - 대체 모델이 답했는지는 usage.iterations의 fallback_message로 안다(대체가 이어진 대화에는 fallback 블록이 없을 수 있다).
// - 어시스턴트 선채움 없음. 약물은 structured outputs(output_config.format json_schema).
// - SDK 오류는 종류(클래스)로만 나눈다. 오류 메시지는 기록하지도 내보내지도 않는다.

// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { isGuestUser, isTokenRejection } from "../_shared/auth.ts";
import type { AuthErrorLike, VerifiedUserLike } from "../_shared/auth.ts";
// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { parseQuotaResult } from "../_shared/chat.ts";
import type { ChatLimits, QuotaResult } from "../_shared/chat.ts";
// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { LLM_DEADLINE_MS, LLM_EFFORT, LLM_FALLBACK_BETA, LLM_MAX_TOKENS, LLM_MODEL } from "../_shared/prompts.ts";
import type { LlmCallInput, LlmCallResult, LlmUsage, VerifiedUser } from "./handler.ts";

// MARK: 로그인 확인

/** supabase-js `auth`에서 쓰는 것만 — getUser(token)는 Auth 서버에 토큰·세션·계정이 아직 유효한지 묻는다 */
export interface AuthClientLike {
  getUser(token: string): Promise<{ data: { user: ({ id: string } & VerifiedUserLike) | null }; error: AuthErrorLike | null }>;
}

/**
 * 로그인 확인. 토큰이 틀림·만료·로그아웃·계정 없음이면 null(→ 401),
 * 확인 자체를 못 하면 throw(→ 503 auth_unavailable) — 서버 키가 없거나 틀린 경우 포함(_shared/auth.ts isTokenRejection).
 * 게스트 여부는 Auth가 돌려준 사용자 객체로 정한다(_shared/auth.ts isGuestUser — 게스트는 1시간 한도가 더 낮다).
 */
export function createVerifyUser(auth: AuthClientLike | null): (token: string) => Promise<VerifiedUser | null> {
  return async (token) => {
    if (!auth) throw new Error("auth_not_configured");
    const { data, error } = await auth.getUser(token);
    if (error) {
      if (isTokenRejection(error)) return null;
      throw new Error("auth_check_failed");
    }
    return data.user ? { id: data.user.id, guest: isGuestUser(data.user) } : null;
  };
}

// MARK: AI 국외 이전 동의(0008_ai_consents.sql)

/**
 * 이 사용자의 동의 행을 읽는 함수 — index.ts는 서버 키 클라이언트로
 * `admin.from(AI_CONSENTS_TABLE).select("user_id, version").eq("user_id", userId).maybeSingle()`을 넣는다.
 * 서버 키는 RLS를 건너뛰므로 사용자 id로 거르는 것이 유일한 경계다.
 */
export type AiConsentQuery = (userId: string) => PromiseLike<{ data: unknown; error: unknown }>;

/**
 * 동의 판 읽기. 행이 없으면 null(→ 403 ai_consent_required), 읽지 못하면(연결 안 됨·오류) throw(→ 503, LLM을 부르지 않는다).
 * 돌아온 행의 user_id가 물은 id와 다르면 동의가 없는 것으로 본다(다른 사람의 동의로 통과하지 않게 — 닫힌 쪽으로).
 */
export function createReadAiConsentVersion(query: AiConsentQuery | null): (userId: string) => Promise<string | null> {
  return async (userId) => {
    if (!query) throw new Error("consent_not_configured");
    const { data, error } = await query(userId);
    if (error) throw new Error("consent_check_failed");
    if (data === null || typeof data !== "object") return null;
    const row = data as { user_id?: unknown; version?: unknown };
    if (row.user_id !== userId) return null;
    return typeof row.version === "string" ? row.version : null;
  };
}

// MARK: 요청 한도(0008_ai_consents.sql llm_consume_quota 5인자 · llm_refund_quota)

export interface QuotaArgs {
  p_user_id: string;
  p_user_limit: number;
  p_window_seconds: number;
  p_global_daily_limit: number;
  p_global_hourly_limit: number;
}

/** supabase-js `rpc`를 부르는 함수 — service_role 권한 클라이언트(함수 실행은 service_role만) */
export type QuotaRpc = (fn: "llm_consume_quota", args: QuotaArgs) => PromiseLike<{ data: unknown; error: unknown }>;
export type RefundRpc = (fn: "llm_refund_quota", args: { p_user_id: string }) => PromiseLike<{ data: unknown; error: unknown }>;

export interface QuotaLimits extends ChatLimits {
  windowSeconds: number;
}

/**
 * 한도 확인 + 한 번 기록. 사용자 1시간 한도는 게스트면 guestHourlyLimit, 아니면 hourlyLimit. 전체 1시간·하루 상한도 함께 본다.
 * 확인하지 못하면(연결 안 됨·오류·모르는 값) null → 함수는 LLM을 부르지 않는다(503).
 */
export function createConsumeQuota(rpc: QuotaRpc | null, limits: QuotaLimits): (user: VerifiedUser) => Promise<QuotaResult | null> {
  return async (user) => {
    if (!rpc) return null;
    const { data, error } = await rpc("llm_consume_quota", {
      p_user_id: user.id,
      p_user_limit: user.guest ? limits.guestHourlyLimit : limits.hourlyLimit,
      p_window_seconds: limits.windowSeconds,
      p_global_daily_limit: limits.globalDailyLimit,
      p_global_hourly_limit: limits.globalHourlyLimit,
    });
    return error ? null : parseQuotaResult(data);
  };
}

/**
 * 방금 쓴 한도 한 번을 돌려준다(그 사용자의 가장 최근 기록 한 줄을 지움) — LLM이 답을 만들지 않은 실패에만(_shared/chat.ts
 * CHAT_REFUNDABLE_LLM_ERRORS). 돌려줬으면 true. 클라이언트가 없거나 실패하면 false(던지지 않는다 — 응답은 원래 실패 그대로).
 */
export function createRefundQuota(rpc: RefundRpc | null): (userId: string) => Promise<boolean> {
  return async (userId) => {
    if (!rpc) return false;
    try {
      const { data, error } = await rpc("llm_refund_quota", { p_user_id: userId });
      return !error && data === true;
    } catch {
      return false;
    }
  };
}

// MARK: LLM 호출

/** client.beta.messages.create에 넘기는 값 — 비스트리밍. index.ts에서 SDK 타입과 맞는지 deno check가 본다. */
export interface LlmMessageParams {
  model: string;
  max_tokens: number;
  betas: string[];
  fallbacks: "default";
  system: { type: "text"; text: string }[];
  messages: { role: "user" | "assistant"; content: string }[];
  output_config: {
    effort: "low" | "medium" | "high";
    format?: { type: "json_schema"; schema: Record<string, unknown> };
  };
}

/** 응답에서 읽는 것만(BetaMessage) */
export interface LlmResponseLike {
  stop_reason: string | null;
  content: readonly { type: string }[];
  usage: {
    input_tokens: number;
    output_tokens: number;
    iterations?: readonly { type: string }[] | null;
  };
}

type ErrorClass = abstract new (...args: never[]) => Error;

/** 나눠 볼 SDK 오류 클래스 — index.ts는 SDK의 Anthropic(정적 속성으로 같은 이름을 가진다)을 그대로 넘긴다 */
export interface LlmErrorClasses {
  APIUserAbortError: ErrorClass;
  APIConnectionTimeoutError: ErrorClass;
  APIConnectionError: ErrorClass;
  RateLimitError: ErrorClass;
  AuthenticationError: ErrorClass;
  PermissionDeniedError: ErrorClass;
  NotFoundError: ErrorClass;
  BadRequestError: ErrorClass;
  InternalServerError: ErrorClass;
}

export type LlmSend = (params: LlmMessageParams, signal: AbortSignal) => Promise<LlmResponseLike>;

/** 요청 본문 — 모델·토큰 상한·거절 대체·생각 깊이는 서버가 정한다. 약물만 답 형식(json_schema)을 붙인다. */
export function buildMessageParams(input: LlmCallInput): LlmMessageParams {
  const effort = LLM_EFFORT[input.preset];
  return {
    model: LLM_MODEL,
    max_tokens: LLM_MAX_TOKENS,
    // 안전 분류기가 거절하면 거절 종류에 맞는 대체 모델이 같은 요청을 이어 받는다(서버 쪽, 한 번의 호출)
    betas: [LLM_FALLBACK_BETA],
    fallbacks: "default",
    system: input.system.map((text) => ({ type: "text" as const, text })),
    messages: input.messages.map((m) => ({ role: m.role, content: m.content })),
    output_config: input.jsonSchema ? { effort, format: { type: "json_schema", schema: input.jsonSchema } } : { effort },
  };
}

const isTextBlock = (block: { type: string }): block is { type: "text"; text: string } =>
  block.type === "text" && typeof (block as { text?: unknown }).text === "string";

/** 응답 → 결과. stop_reason을 content보다 먼저 본다. */
export function interpretLlmResponse(response: LlmResponseLike): LlmCallResult {
  const usage: LlmUsage = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    fallback: (response.usage.iterations ?? []).some((entry) => entry.type === "fallback_message"),
  };
  if (response.stop_reason === "refusal") return { kind: "refusal", usage };
  if (response.stop_reason === "max_tokens" || response.stop_reason === "model_context_window_exceeded") {
    return { kind: "truncated", usage };
  }
  const text = response.content
    .filter(isTextBlock)
    .map((block) => block.text)
    .join("");
  return { kind: "text", text, usage };
}

/** SDK 오류 → 상태·코드. 구체적인 클래스부터(시간 초과는 연결 오류의 하위 클래스다). */
export function mapLlmError(error: unknown, classes: LlmErrorClasses): Extract<LlmCallResult, { kind: "error" }> {
  if (error instanceof classes.APIUserAbortError) return { kind: "error", status: 504, code: "timeout" };
  if (error instanceof classes.APIConnectionTimeoutError) return { kind: "error", status: 504, code: "timeout" };
  if (error instanceof classes.APIConnectionError) return { kind: "error", status: 502, code: "llm_unreachable" };
  if (error instanceof classes.RateLimitError) return { kind: "error", status: 503, code: "llm_busy" };
  if (error instanceof classes.AuthenticationError || error instanceof classes.PermissionDeniedError) {
    return { kind: "error", status: 503, code: "not_configured" };
  }
  // 404 = 모델을 이 조직에서 쓸 수 없음(모델 이름·조직 권한 확인)
  if (error instanceof classes.NotFoundError) return { kind: "error", status: 503, code: "llm_model_unavailable" };
  if (error instanceof classes.BadRequestError) return { kind: "error", status: 502, code: "llm_rejected" };
  // 500·529(과부하)
  if (error instanceof classes.InternalServerError) return { kind: "error", status: 503, code: "llm_busy" };
  return { kind: "error", status: 502, code: "llm_error" };
}

export interface CompleteDeps {
  /** Anthropic 키가 없으면 null → 503 not_configured */
  send: LlmSend | null;
  errors: LlmErrorClasses;
  /** 한 번의 호출을 기다리는 최대 시간(기본 LLM_DEADLINE_MS) — 넘기면 APIUserAbortError → 504 timeout */
  deadlineMs?: number;
}

export function createComplete(deps: CompleteDeps): (input: LlmCallInput) => Promise<LlmCallResult> {
  return async (input) => {
    if (!deps.send) return { kind: "error", status: 503, code: "not_configured" };
    try {
      const response = await deps.send(buildMessageParams(input), AbortSignal.timeout(deps.deadlineMs ?? LLM_DEADLINE_MS));
      return interpretLlmResponse(response);
    } catch (error) {
      return mapLlmError(error, deps.errors);
    }
  };
}
