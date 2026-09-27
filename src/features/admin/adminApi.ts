// 관리자 화면의 서버 호출 — Supabase RPC 세 개(supabase/migrations/0002_admin.sql)만 부른다.
//
//   is_admin()                          — 지금 로그인한 카카오 계정이 관리자 목록(public.admins)에 있는가
//   admin_overview(p_consent_version)   — 집계(전체·게스트·카카오·서버 기록·현재 판 동의·최근 7일·30일 가입)
//   admin_list_users(p_limit, p_offset) — 계정 메타데이터 목록(건강 기록·이메일 없음)
//
// 권한은 서버가 지킨다: 세 함수 모두 is_admin()이 아니면 오류(42501)를 낸다. 여기서 세션을 보는 것은 화면 안내용일 뿐이다.
// 응답·오류를 콘솔에 남기지 않는다(계정 메타데이터도 개인정보).

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ADMIN_PAGE_SIZE,
  parseOverview,
  parseUserRows,
  splitPage,
  usersPageArgs,
  type AdminOverview,
  type AdminUserRow,
} from "./adminModel";

export interface AdminRpcError {
  code?: string;
  message?: string;
}

export interface AdminSessionUser {
  id: string;
  is_anonymous?: boolean;
}

/** 관리자 화면이 쓰는 Supabase 클라이언트의 부분 — 테스트는 이 모양의 가짜를 넘긴다. */
export interface AdminClient {
  getSessionUser(): Promise<{ user: AdminSessionUser | null; failed: boolean }>;
  rpc(fn: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: AdminRpcError | null }>;
  /** 로그아웃(다른 탭 포함)을 알린다. 돌려준 함수로 그만 듣는다. */
  onSignedOut(cb: () => void): () => void;
}

/** supabase-js 클라이언트 → AdminClient */
export function adminClientFrom(client: SupabaseClient): AdminClient {
  return {
    async getSessionUser() {
      const { data, error } = await client.auth.getSession();
      const user = data.session?.user ?? null;
      return {
        user: user === null ? null : { id: user.id, is_anonymous: user.is_anonymous === true },
        failed: user === null && error !== null,
      };
    },
    async rpc(fn, args) {
      const { data, error } = await client.rpc(fn, args);
      return { data: data as unknown, error: error === null ? null : { code: error.code, message: error.message } };
    },
    onSignedOut(cb) {
      const { data } = client.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") cb();
      });
      return () => data.subscription.unsubscribe();
    },
  };
}

/** 서버에 관리자 SQL이 없거나(함수 없음) 앞 단계 SQL의 칸이 없다 — 소유자에게 설치 안내를 보인다. */
const SETUP_MISSING_CODES: ReadonlySet<string> = new Set([
  "PGRST202", // PostgREST: 함수를 찾지 못함(0002_admin.sql 미실행)
  "42883", // undefined_function
  "42703", // undefined_column(user_states의 동의 칸 없음)
  "42P01", // undefined_table
]);
/** insufficient_privilege — 관리자가 아님(함수가 낸 오류) */
const FORBIDDEN_CODE = "42501";

export type AdminFailure = "forbidden" | "setupMissing" | "failed";

export function failureOf(error: AdminRpcError | null | undefined): AdminFailure {
  const code = error?.code ?? "";
  if (code === FORBIDDEN_CODE) return "forbidden";
  if (SETUP_MISSING_CODES.has(code)) return "setupMissing";
  return "failed";
}

export type AdminAccess =
  /** 로그인하지 않음 */
  | { kind: "signedOut" }
  /** 게스트(익명 로그인) — 관리자가 될 수 없다 */
  | { kind: "anonymous" }
  /** 카카오로 로그인했지만 관리자 목록에 없음 — 소유자가 자기 ID를 목록에 넣을 수 있게 ID를 보인다 */
  | { kind: "notAdmin"; userId: string }
  | { kind: "admin"; userId: string }
  | { kind: "error"; failure: Exclude<AdminFailure, "forbidden"> };

export async function checkAdminAccess(client: AdminClient): Promise<AdminAccess> {
  try {
    const { user, failed } = await client.getSessionUser();
    if (user === null) return failed ? { kind: "error", failure: "failed" } : { kind: "signedOut" };
    if (user.is_anonymous === true) return { kind: "anonymous" };
    const { data, error } = await client.rpc("is_admin");
    if (error !== null) {
      const failure = failureOf(error);
      return failure === "forbidden" ? { kind: "notAdmin", userId: user.id } : { kind: "error", failure };
    }
    return data === true ? { kind: "admin", userId: user.id } : { kind: "notAdmin", userId: user.id };
  } catch {
    return { kind: "error", failure: "failed" };
  }
}

export type AdminResult<T> = { ok: true; value: T } | { ok: false; failure: AdminFailure };

export async function fetchOverview(client: AdminClient, consentVersion: string): Promise<AdminResult<AdminOverview>> {
  try {
    const { data, error } = await client.rpc("admin_overview", { p_consent_version: consentVersion });
    if (error !== null) return { ok: false, failure: failureOf(error) };
    const overview = parseOverview(data);
    return overview === null ? { ok: false, failure: "failed" } : { ok: true, value: overview };
  } catch {
    return { ok: false, failure: "failed" };
  }
}

export interface UsersPage {
  page: number;
  rows: AdminUserRow[];
  hasNext: boolean;
}

export async function fetchUsersPage(
  client: AdminClient,
  page: number,
  pageSize: number = ADMIN_PAGE_SIZE,
): Promise<AdminResult<UsersPage>> {
  try {
    const args = usersPageArgs(page, pageSize);
    const { data, error } = await client.rpc("admin_list_users", args);
    if (error !== null) return { ok: false, failure: failureOf(error) };
    const rows = parseUserRows(data);
    if (rows === null) return { ok: false, failure: "failed" };
    const split = splitPage(rows, args.p_limit - 1);
    return { ok: true, value: { page, rows: split.rows, hasNext: split.hasNext } };
  } catch {
    return { ok: false, failure: "failed" };
  }
}
