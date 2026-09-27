// 로그인 콜백 주소 읽기 — 순수 함수.
// Supabase(PKCE)는 성공하면 `?code=…`, 실패·취소면 `?error=…&error_description=…`(가끔 `#error=…`)로 돌려보낸다.
// 카카오 동의 화면에서 [취소]하면 error=access_denied.

export type CallbackParams =
  | { kind: "code"; code: string }
  | { kind: "error"; cancelled: boolean }
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
  const error = query.get("error") ?? hash.get("error") ?? query.get("error_code") ?? hash.get("error_code");
  if (error !== null) return { kind: "error", cancelled: error === "access_denied" };
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
  if (url.hash.length > 0 && /(^#|&)(error|access_token|error_description)=/.test(url.hash)) {
    url.hash = "";
    changed = true;
  }
  return changed ? url.toString() : null;
}
