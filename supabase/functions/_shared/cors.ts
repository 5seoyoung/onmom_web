// Edge Function 공용 — 브라우저 origin 허용 목록(CORS)과 JSON 응답.
//
// ⚠️ 이 폴더(_shared)의 파일은 Deno(함수)와 vitest(src/api/edgeFunctions.test.ts) 양쪽에서 읽고, Next 프로젝트의 tsc도 검사한다.
//    그래서 Deno 전역(Deno.*)·npm: 가져오기를 쓰지 않고, 서로의 값도 가져오지 않는다(타입만 `import type … ".ts"`).
//    Deno는 ".ts" 확장자가 있어야 가져오고, Next의 tsc는 ".ts"로 끝나는 값 가져오기를 거부하기 때문이다(TS5097).
//    값을 가져와야 하는 handler.ts·index.ts는 그 줄에만 `@ts-ignore`를 붙인다(docs/SUPABASE_FUNCTIONS.md "타입 검사").
//
// 허용 목록 밖 origin의 브라우저 요청은 거절한다(403). origin이 없는 요청(서버·curl)은 CORS 대상이 아니라 그대로 받는다 —
// 영상은 공개 데이터이고, AI 상담은 따로 로그인 토큰을 확인한다.

/** ALLOWED_ORIGINS 환경 변수가 비었을 때의 기본값 — 배포 사이트와 로컬 개발 서버 */
export const DEFAULT_ALLOWED_ORIGINS: readonly string[] = ["https://5seoyoung.github.io", "http://localhost:3000"];

/** 브라우저가 함수에 보내는 헤더 — supabase-js·fetch가 쓰는 것만 */
export const ALLOWED_REQUEST_HEADERS = "authorization, apikey, content-type, x-client-info";

/** "https://Host:443/path" → "https://host" (scheme+host+port). http(s)가 아니거나 URL이 아니면 null. */
export function normalizeOrigin(value: string): string | null {
  const s = value.trim();
  if (s === "" || s === "null") return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

/**
 * ALLOWED_ORIGINS(쉼표로 구분) → origin 목록. 비었거나 없으면 기본값.
 * 값이 있는데 쓸 수 있는 항목이 하나도 없으면 빈 목록 — 브라우저 요청을 모두 거절한다(잘못 설정하면 닫힌 쪽으로).
 */
export function parseAllowedOrigins(env: string | null | undefined): string[] {
  if (env == null || env.trim() === "") return [...DEFAULT_ALLOWED_ORIGINS];
  const out: string[] = [];
  for (const part of env.split(",")) {
    const o = normalizeOrigin(part);
    if (o !== null && !out.includes(o)) out.push(o);
  }
  return out;
}

export type OriginCheck =
  /** Origin 헤더 없음 — 브라우저 교차 출처 요청이 아니다 */
  | { kind: "none" }
  | { kind: "allowed"; origin: string }
  | { kind: "denied" };

export function checkOrigin(originHeader: string | null, allowed: readonly string[]): OriginCheck {
  if (originHeader === null) return { kind: "none" };
  const o = normalizeOrigin(originHeader);
  return o !== null && allowed.includes(o) ? { kind: "allowed", origin: o } : { kind: "denied" };
}

/** 모든 응답에 붙이는 CORS 헤더 — 허용된 origin에만 Allow-Origin. 캐시가 origin별로 나뉘게 Vary: Origin. */
export function corsHeaders(check: OriginCheck): Record<string, string> {
  const h: Record<string, string> = { Vary: "Origin" };
  if (check.kind === "allowed") h["Access-Control-Allow-Origin"] = check.origin;
  return h;
}

/** preflight(OPTIONS) 응답 헤더 */
export function preflightHeaders(check: OriginCheck, methods: string): Record<string, string> {
  const h = corsHeaders(check);
  if (check.kind === "allowed") {
    h["Access-Control-Allow-Methods"] = methods;
    h["Access-Control-Allow-Headers"] = ALLOWED_REQUEST_HEADERS;
    h["Access-Control-Max-Age"] = "86400";
  }
  return h;
}

/** JSON 응답. 기본은 캐시 금지 — 캐시해도 되는 응답(공개 영상 목록)만 Cache-Control을 덮어쓴다. */
export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

/** 실패 응답 본문 — 코드만. 스택·내부 메시지·업스트림 응답은 절대 싣지 않는다. */
export function failure(status: number, code: string, headers: Record<string, string> = {}): Response {
  return jsonResponse(status, { ok: false, code }, headers);
}
