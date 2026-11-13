// 계정 삭제 직전의 카카오 연결 끊기 요청 — Edge Function "account"(supabase/functions/account/handler.ts)를 부른다.
//
// - 설정 [계정 삭제]·온보딩 [동의하지 않고 나가기](auth/session.ts deleteAccount — 카카오 계정만)와 관리자 [계정 삭제](features/admin/adminApi.ts)가
//   지우기 바로 전에 부른다. 끊지 못해도 삭제는 그대로 이어 간다(법률 자체 검토 2026-11 F4 — 삭제가 먼저다).
// - 함수 비밀값 KAKAO_ADMIN_KEY가 없으면 함수가 "skipped"로 답한다 → 화면은 지금과 똑같다(안내 없음).
// - 안내("카카오 연결은 끊지 못했어요…")는 함수가 끊기를 시도했다가 실패했다고 답했을 때("failed")만 보인다.
//   함수가 없거나(옛 배포 404)·연결이 끊기거나·시간이 지나면 "unknown" — 끊기를 시도했는지 알 수 없으므로 안내하지 않는다.
// 응답·오류를 콘솔에 남기지 않는다.

export const ACCOUNT_FUNCTION = "account";
/** 삭제 흐름을 오래 붙잡지 않는다 — 함수는 카카오를 3초까지 기다린다 */
export const KAKAO_UNLINK_REQUEST_TIMEOUT_MS = 8_000;

export type KakaoUnlinkResult = "unlinked" | "failed" | "skipped" | "not_kakao" | "unknown";

export type KakaoUnlinkBody = { action: "kakao-unlink-self" } | { action: "kakao-unlink-admin"; target: string };

/** supabase-js `client.functions` 중 쓰는 것만 — 로그인 토큰·공개 키 머리글은 supabase-js가 붙인다 */
export interface FunctionsInvoker {
  invoke(name: string, options: { body: Record<string, unknown> }): Promise<{ data: unknown; error: unknown }>;
}

const KNOWN: ReadonlySet<string> = new Set(["unlinked", "failed", "skipped", "not_kakao"]);

/** 함수 응답 본문 → 결과. 모르는 모양은 unknown */
export function kakaoUnlinkResultOf(data: unknown): KakaoUnlinkResult {
  if (typeof data !== "object" || data === null) return "unknown";
  const k = (data as { kakao?: unknown }).kakao;
  return typeof k === "string" && KNOWN.has(k) ? (k as KakaoUnlinkResult) : "unknown";
}

export async function requestKakaoUnlink(
  functions: FunctionsInvoker | null | undefined,
  body: KakaoUnlinkBody,
  timeoutMs: number = KAKAO_UNLINK_REQUEST_TIMEOUT_MS,
): Promise<KakaoUnlinkResult> {
  if (!functions || typeof functions.invoke !== "function") return "unknown";
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), timeoutMs);
    });
    const res = await Promise.race([functions.invoke(ACCOUNT_FUNCTION, { body }), timeout]);
    if (res === "timeout" || res.error) return "unknown";
    return kakaoUnlinkResultOf(res.data);
  } catch {
    return "unknown";
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
