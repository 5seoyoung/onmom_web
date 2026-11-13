/* eslint-disable @typescript-eslint/ban-ts-comment -- Deno는 ".ts" 확장자가 있어야 가져온다. Next tsc(TS5097)만 그 줄을 넘기게 한다. */
// Edge Function "account"의 바깥 연결 — 로그인 확인·관리자 확인·카카오 회원번호 찾기·카카오 연결 끊기·웹훅 삭제를 클라이언트를 받아 만든다.
// index.ts(Deno)는 진짜 클라이언트를, vitest(src/api/accountHandler.test.ts)는 가짜를 넣는다. SDK는 가져오지 않는다(모양만 적는다).

// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { isTokenRejection } from "../_shared/auth.ts";
import type { AuthErrorLike } from "../_shared/auth.ts";
// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { isKakaoUserId, KAKAO_UNLINK_TIMEOUT_MS, KAKAO_UNLINK_URL, kakaoUserIdOf } from "../_shared/kakao.ts";
import type { IdentityLike } from "../_shared/kakao.ts";
import type { AccountUser } from "./handler.ts";

interface UserLike {
  id: string;
  identities?: readonly IdentityLike[] | null;
}

/** supabase-js `auth`의 getUser(token) — Auth 서버에 토큰·세션·계정이 아직 유효한지 묻는다 */
export interface GetUserLike {
  getUser(token: string): Promise<{ data: { user: UserLike | null }; error: AuthErrorLike | null }>;
}

/** 로그인 확인 — 틀린 토큰이면 null, 확인하지 못하면 throw(chat/adapters.ts createVerifyUser와 같은 기준) */
export function createVerifyAccountUser(auth: GetUserLike | null): (token: string) => Promise<AccountUser | null> {
  return async (token) => {
    if (!auth) throw new Error("auth_not_configured");
    const { data, error } = await auth.getUser(token);
    if (error) {
      if (isTokenRejection(error)) return null;
      throw new Error("auth_check_failed");
    }
    return data.user ? { id: data.user.id, kakaoUserId: kakaoUserIdOf(data.user.identities) } : null;
  };
}

/** supabase-js `auth.admin`의 getUserById(서버 키) */
export interface GetUserByIdLike {
  getUserById(id: string): Promise<{ data: { user: UserLike | null }; error: { status?: number } | null }>;
}

/** 대상 계정의 카카오 회원번호 — 계정이 없으면(404) null, 그 밖의 오류는 throw */
export function createKakaoUserIdLookup(admin: GetUserByIdLike | null): (userId: string) => Promise<string | null> {
  return async (userId) => {
    if (!admin) throw new Error("lookup_not_configured");
    const { data, error } = await admin.getUserById(userId);
    if (error) {
      if (error.status === 404) return null;
      throw new Error("lookup_failed");
    }
    return data.user ? kakaoUserIdOf(data.user.identities) : null;
  };
}

/** 사용자 토큰으로 부르는 RPC — index.ts가 공개 키 + Authorization: Bearer <토큰> 클라이언트로 만든다 */
export type RpcAsUser = (token: string, fn: string) => PromiseLike<{ data: unknown; error: unknown }>;

/** 이 토큰의 세션이 관리자인가 — public.is_admin()(0014: 관리자 목록 + aal2)을 그 사용자 권한으로. 오류면 throw. */
export function createIsAdmin(rpcAsUser: RpcAsUser | null): (token: string) => Promise<boolean> {
  return async (token) => {
    if (!rpcAsUser) throw new Error("admin_check_not_configured");
    const { data, error } = await rpcAsUser(token, "is_admin");
    if (error) throw new Error("admin_check_failed");
    return data === true;
  };
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{
  ok: boolean;
  json(): Promise<unknown>;
}>;

/**
 * 카카오 연결 끊기(어드민 키) — 응답의 id가 요청한 회원번호와 같을 때만 true. 시간 초과·연결 오류·4xx/5xx·모르는 응답은 false.
 * 키는 여기서만 쓰고 기록하지 않는다. 카카오 오류 본문도 기록하지 않는다.
 */
export function createKakaoUnlink(
  fetchFn: FetchLike,
  adminKey: string | null,
  timeoutMs: number = KAKAO_UNLINK_TIMEOUT_MS,
): (kakaoUserId: string) => Promise<boolean> {
  return async (kakaoUserId) => {
    if (adminKey === null || !isKakaoUserId(kakaoUserId)) return false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchFn(KAKAO_UNLINK_URL, {
        method: "POST",
        headers: {
          Authorization: `KakaoAK ${adminKey}`,
          "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
        },
        body: new URLSearchParams({ target_id_type: "user_id", target_id: kakaoUserId }).toString(),
        signal: controller.signal,
      });
      if (!res.ok) return false;
      const body = (await res.json()) as { id?: unknown } | null;
      return body !== null && typeof body === "object" && String(body.id) === kakaoUserId;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  };
}

/** 서버 키로 부르는 RPC(0017 delete_user_by_kakao_id) */
export type ServerRpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;

/** 웹훅 삭제 — 지운 계정 수. 오류면 throw */
export function createDeleteByKakaoUserId(rpc: ServerRpc | null): (kakaoUserId: string) => Promise<number> {
  return async (kakaoUserId) => {
    if (!rpc) throw new Error("delete_not_configured");
    if (!isKakaoUserId(kakaoUserId)) return 0;
    const { data, error } = await rpc("delete_user_by_kakao_id", { p_kakao_id: kakaoUserId });
    if (error) throw new Error("delete_failed");
    return typeof data === "number" && Number.isFinite(data) ? data : 0;
  };
}
