// Edge Function 공용 — 서버 키 고르기·로그인 확인 오류 나누기(Deno·vitest 양쪽에서 읽는다. cors.ts 머리말 참고).
//
// 서버 키: Supabase가 함수에 자동으로 넣어 주는 값 중
//   1) SUPABASE_SECRET_KEYS — 새 방식 secret 키의 JSON 사전({"default": "sb_secret_…", …}). 그중 "default".
//   2) 없으면 예전 방식 SUPABASE_SERVICE_ROLE_KEY(JWT). 2025-11 이후 만든 프로젝트에는 없을 수 있고, 2026년 말 삭제 예정이다.
//   (Supabase 문서 "Edge Functions → Secrets"의 기본 비밀값 — 사람이 옮기지 않는다. 값은 기록하지 않는다.)
//
// 로그인 확인(auth.getUser): 토큰 자체가 틀린 경우만 "로그인 필요(401)"로 보고, 그 밖은 "확인하지 못함(503)"으로 던진다.
// 서버 키가 틀리거나 꺼졌으면 게이트웨이가 코드 없는 401("Invalid API key")로 답한다 — 이것을 401로 삼키면
// 모든 이용자가 조용히 앱 기본 안내로 빠지고 배포 확인도 통과해 버린다. 그래서 상태 코드만 보지 않고 Auth 오류 코드를 본다.

/** 서버 키가 어디서 왔는가 — 로그에는 이것만 남긴다(값은 남기지 않는다) */
export type ServerKeySource = "secret_keys" | "service_role";

export interface ServerKey {
  key: string;
  source: ServerKeySource;
}

/**
 * 함수가 쓸 서버 키. SUPABASE_SECRET_KEYS의 "default"가 먼저, 없거나 JSON이 틀리면 SUPABASE_SERVICE_ROLE_KEY, 둘 다 없으면 null.
 */
export function pickServerKey(
  secretKeysJson: string | null | undefined,
  legacyServiceRoleKey: string | null | undefined,
): ServerKey | null {
  const raw = secretKeysJson?.trim() ?? "";
  if (raw !== "") {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        const key = (parsed as Record<string, unknown>).default;
        if (typeof key === "string" && key.trim() !== "") return { key: key.trim(), source: "secret_keys" };
      }
    } catch {
      // 형식이 틀리면 예전 키로 — 원문은 기록하지 않는다
    }
  }
  const legacy = legacyServiceRoleKey?.trim() ?? "";
  return legacy !== "" ? { key: legacy, source: "service_role" } : null;
}

/**
 * 토큰 자체의 문제를 뜻하는 Supabase Auth 오류 코드(Supabase 문서 "Auth error codes").
 * bad_jwt(서명·형식·만료), session_not_found·session_expired(로그아웃·세션 만료), user_not_found(계정 삭제),
 * no_authorization(토큰 없음), invalid_jwt(supabase-js가 형식을 먼저 거른 경우).
 */
export const TOKEN_REJECTION_CODES: readonly string[] = [
  "bad_jwt",
  "invalid_jwt",
  "session_not_found",
  "session_expired",
  "user_not_found",
  "no_authorization",
];

/** supabase-js AuthError 중 여기서 보는 것 */
export interface AuthErrorLike {
  name?: string;
  status?: number;
  code?: string;
}

/** Auth가 확인해 준 사용자(getUser 응답) 중 게스트 판단에 쓰는 것만 */
export interface VerifiedUserLike {
  is_anonymous?: boolean;
  identities?: readonly { provider?: string }[] | null;
}

/**
 * 익명 게스트인가 — Auth가 확인한 사용자 객체로 본다(토큰의 is_anonymous를 따로 믿지 않는다). AI 상담의 1시간 한도가 더 낮다
 * (_shared/chat.ts CHAT_GUEST_HOURLY_LIMIT_DEFAULT).
 * 카카오를 연결했는데 카카오 이메일이 확인되지 않아 is_anonymous가 true로 남은 사용자(src/auth/kakaoAccount.ts)는 게스트가 아니다 —
 * 익명 말고 다른 로그인 수단(identity)이 있으면 카카오 계정으로 본다(0006_anon_cleanup.sql과 같은 기준).
 */
export function isGuestUser(user: VerifiedUserLike): boolean {
  if (user.is_anonymous !== true) return false;
  return !(user.identities ?? []).some((i) => typeof i.provider === "string" && i.provider !== "anonymous");
}

/**
 * getUser 오류가 "토큰이 틀림·만료·로그아웃·계정 없음"인가 → true면 401(로그인 필요).
 * false(서버 키 틀림·꺼짐의 코드 없는 401, 네트워크, 5xx, 모르는 오류) → 확인하지 못함(503 auth_unavailable).
 * - 코드가 TOKEN_REJECTION_CODES 중 하나, 또는 상태 403(Auth가 토큰을 거절할 때 쓰는 상태)
 * - supabase-js는 session_not_found를 AuthSessionMissingError(상태 400, 코드 없음)로 바꿔 돌려준다 — 이름으로 본다
 */
export function isTokenRejection(error: AuthErrorLike | null | undefined): boolean {
  if (!error) return false;
  if (typeof error.code === "string" && TOKEN_REJECTION_CODES.includes(error.code)) return true;
  if (error.name === "AuthSessionMissingError") return true;
  return error.status === 403;
}
