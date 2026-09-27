// 로그인 콜백 주소 읽기 — 순수 함수.
// Supabase(PKCE)는 성공하면 `?code=…`, 실패·취소면 `?error=…&error_description=…`(가끔 `#error=…`)로 돌려보낸다.
// 카카오 동의 화면에서 [취소]하면 error=access_denied.
// Supabase Auth 자체의 거절은 error_code가 붙는다(오류는 쿼리와 해시 양쪽에 온다) — 익명(게스트) 계정에 카카오를 연결하려는데
// 그 카카오 계정이 이미 다른 온맘 계정이면 error=server_error&error_code=identity_already_exists(422).
// 가입 막힘(signup_disabled)·정지(user_banned)는 error=access_denied지만 다른 error_code가 붙으므로 취소로 보지 않는다.

/** 연결하려는 카카오 계정이 이미 다른 사용자의 것 */
export const IDENTITY_ALREADY_EXISTS = "identity_already_exists";

export type CallbackParams =
  | { kind: "code"; code: string }
  /** errorCode = Supabase Auth의 error_code(없으면 null) */
  | { kind: "error"; cancelled: boolean; errorCode: string | null }
  /** code도 error도 없다(새로고침으로 이미 지운 뒤 등) — 저장된 세션이 있는지 본다 */
  | { kind: "none" };

export function parseCallbackUrl(href: string): CallbackParams {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return { kind: "none" };
  }
  const query = url.searchParams;
  const hash = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
  const errorCode = query.get("error_code") ?? hash.get("error_code");
  const error = query.get("error") ?? hash.get("error") ?? errorCode;
  if (error !== null) {
    const code = errorCode !== null && errorCode.trim().length > 0 ? errorCode.trim() : null;
    const cancelled = error === "access_denied" && (code === null || code === "access_denied");
    return { kind: "error", cancelled, errorCode: code };
  }
  const code = query.get("code");
  if (code !== null && code.trim().length > 0) return { kind: "code", code: code.trim() };
  return { kind: "none" };
}

/** 주소에서 로그인 매개변수를 지운 새 주소(쓴 code가 방문 기록·새로고침에 남지 않게). 바꿀 것이 없으면 null. */
export function stripCallbackParams(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const keys = ["code", "error", "error_code", "error_description", "sb_flow_id", "state"];
  let changed = false;
  for (const k of keys) {
    if (url.searchParams.has(k)) {
      url.searchParams.delete(k);
      changed = true;
    }
  }
  if (url.hash.length > 0 && /(^#|&)(error|error_code|access_token|error_description)=/.test(url.hash)) {
    url.hash = "";
    changed = true;
  }
  return changed ? url.toString() : null;
}
