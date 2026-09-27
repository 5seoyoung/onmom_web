// Edge Function chat 공용 — 요청 검증과 컨텍스트 허용 목록(Deno·vitest 양쪽에서 읽는다. cors.ts 머리말 참고).
//
// 받는 것: { preset: "patient_edu" | "substance", messages: [{ role, content }], context?: { week?, delivery?, breastfeeding? } }
// - 개인정보 최소화(검수 #14): 컨텍스트는 산후 주차·분만 방식·수유 여부 세 항목만. 다른 필드가 하나라도 있으면 요청 전체를 거절한다
//   (BMI·목표·위험 신호 여부·출산일 같은 값이 실수로 섞여 들어와도 LLM으로 넘기지 않게 — 조용히 지우지 않고 거절).
// - 알 수 없는 최상위 필드(system·max_tokens·model 등)도 거절한다. 시스템 프롬프트·모델·토큰 수는 서버가 정한다(검수 #50).
// 웹 src/api/llm.ts가 같은 한도로 보낼 대화를 자른다 — 두 값은 src/api/edgeFunctions.test.ts가 비교한다.

export const CHAT_PRESETS = ["patient_edu", "substance"] as const;
export type ChatPreset = (typeof CHAT_PRESETS)[number];

/** 한 요청에 담는 메시지 수 상한 */
export const CHAT_MAX_MESSAGES = 20;
/** 메시지 한 개의 글자 수(유니코드 코드 포인트) 상한 */
export const CHAT_MAX_MESSAGE_CHARS = 2000;
/** 요청 본문 바이트 상한 — 20개 × 2000자 × 최대 4바이트에 여유 */
export const CHAT_MAX_BODY_BYTES = 256 * 1024;
/** LLM으로 보내도 되는 컨텍스트 항목 — 이 셋뿐 */
export const CHAT_CONTEXT_FIELDS = ["week", "delivery", "breastfeeding"] as const;
/** 산후 주차 상한(10년) — 그 밖은 잘못된 값 */
export const CHAT_MAX_WEEK = 520;

export type DeliveryKind = "vaginal" | "cesarean";

export interface ChatContext {
  week?: number;
  delivery?: DeliveryKind;
  breastfeeding?: boolean;
}

export interface ChatMessageInput {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  preset: ChatPreset;
  messages: ChatMessageInput[];
  context: ChatContext | null;
}

export type ChatValidation = { ok: true; request: ChatRequest } | { ok: false; reason: string };

const TOP_LEVEL_FIELDS = ["preset", "messages", "context"];
const MESSAGE_FIELDS = ["role", "content"];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 글자 수 — 한글·이모지 한 글자를 1로 센다(UTF-16 길이가 아니라 코드 포인트) */
export function charCount(s: string): number {
  return Array.from(s).length;
}

const onlyKeys = (o: Record<string, unknown>, allowed: readonly string[]) => Object.keys(o).every((k) => allowed.includes(k));

/** 컨텍스트 허용 목록 검사. 없으면 null, 틀리면 undefined. */
export function parseChatContext(v: unknown): ChatContext | null | undefined {
  if (v === undefined || v === null) return null;
  if (!isPlainObject(v) || !onlyKeys(v, CHAT_CONTEXT_FIELDS)) return undefined;
  const out: ChatContext = {};
  if (v.week !== undefined) {
    if (typeof v.week !== "number" || !Number.isInteger(v.week) || v.week < 0 || v.week > CHAT_MAX_WEEK) return undefined;
    out.week = v.week;
  }
  if (v.delivery !== undefined) {
    if (v.delivery !== "vaginal" && v.delivery !== "cesarean") return undefined;
    out.delivery = v.delivery;
  }
  if (v.breastfeeding !== undefined) {
    if (typeof v.breastfeeding !== "boolean") return undefined;
    out.breastfeeding = v.breastfeeding;
  }
  return out;
}

export function validateChatRequest(body: unknown): ChatValidation {
  if (!isPlainObject(body)) return { ok: false, reason: "body" };
  if (!onlyKeys(body, TOP_LEVEL_FIELDS)) return { ok: false, reason: "unknown_field" };
  const { preset, messages, context } = body;
  if (typeof preset !== "string" || !(CHAT_PRESETS as readonly string[]).includes(preset)) {
    return { ok: false, reason: "preset" };
  }
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > CHAT_MAX_MESSAGES) {
    return { ok: false, reason: "messages" };
  }
  const parsed: ChatMessageInput[] = [];
  for (const m of messages) {
    if (!isPlainObject(m) || !onlyKeys(m, MESSAGE_FIELDS)) return { ok: false, reason: "message" };
    if (m.role !== "user" && m.role !== "assistant") return { ok: false, reason: "role" };
    if (typeof m.content !== "string" || m.content.trim() === "") return { ok: false, reason: "content" };
    if (charCount(m.content) > CHAT_MAX_MESSAGE_CHARS) return { ok: false, reason: "too_long" };
    parsed.push({ role: m.role, content: m.content });
  }
  // 대화는 사용자로 시작하고 사용자로 끝난다(마지막 사용자 메시지에 답한다 — 어시스턴트 선채움 없음)
  if (parsed[0].role !== "user" || parsed[parsed.length - 1].role !== "user") return { ok: false, reason: "order" };
  // 약물 조회는 항목 이름 한 개만
  if (preset === "substance" && parsed.length !== 1) return { ok: false, reason: "substance_messages" };
  const ctx = parseChatContext(context);
  if (ctx === undefined) return { ok: false, reason: "context" };
  return { ok: true, request: { preset: preset as ChatPreset, messages: parsed, context: ctx } };
}

/** 마지막 사용자 메시지 — 안전 선필터가 본다 */
export function latestUserMessage(messages: readonly ChatMessageInput[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i].content;
  }
  return "";
}

// MARK: 요청 한도(0003_llm_usage.sql llm_consume_quota)

/** 사용자 한 명이 1시간에 보낼 수 있는 LLM 요청 수(환경 변수 CHAT_HOURLY_LIMIT로 바꿀 수 있음) */
export const CHAT_HOURLY_LIMIT_DEFAULT = 30;
/**
 * 서비스 전체가 24시간에 보낼 수 있는 LLM 요청 수 — 익명 계정을 여럿 만들어 비용을 키우는 것을 막는 상한(CHAT_GLOBAL_DAILY_LIMIT).
 * 넘으면 모두 앱 규칙 안내로 답한다. 이용자가 늘면 함수 비밀값으로 올린다(docs/SUPABASE_FUNCTIONS.md).
 */
export const CHAT_GLOBAL_DAILY_LIMIT_DEFAULT = 500;
/** 사용자 한도의 창(초) */
export const CHAT_LIMIT_WINDOW_SECONDS = 3600;

/** 환경 변수의 양의 정수. 비었거나 틀리면 기본값, 너무 크면 max로 자른다. */
export function parsePositiveInt(env: string | null | undefined, fallback: number, max = 1_000_000): number {
  if (env == null || !/^\s*[1-9][0-9]*\s*$/.test(env)) return fallback;
  return Math.min(Number(env.trim()), max);
}

export type QuotaResult = "ok" | "user_limit" | "global_limit";

/** llm_consume_quota()의 반환값 — 모르는 값이면 null(→ 함수는 LLM을 부르지 않는다) */
export function parseQuotaResult(value: unknown): QuotaResult | null {
  return value === "ok" || value === "user_limit" || value === "global_limit" ? value : null;
}

/** Authorization: Bearer <토큰> → 토큰. 없거나 형식이 틀리면 null. */
export function bearerToken(header: string | null): string | null {
  if (header === null) return null;
  const m = /^Bearer\s+([A-Za-z0-9._~+/=-]+)\s*$/i.exec(header.trim());
  return m ? m[1] : null;
}
