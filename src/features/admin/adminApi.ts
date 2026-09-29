// 관리자 화면의 서버 호출 — Supabase RPC만 부른다(supabase/migrations/0002_admin.sql · 0005_admin_tools.sql).
//
//   is_admin()                          — 지금 로그인한 카카오 계정이 관리자 목록(public.admins)에 있는가
//   admin_overview(p_consent_version)   — 집계(전체·게스트·카카오·서버 기록·현재 판 동의·최근 7일·30일 가입 — 0005 뒤에는 동의 판 분포·게스트/카카오 나누기)
//   admin_list_users(p_limit, p_offset) — 계정 메타데이터 목록(건강 기록·이메일 없음)
//   admin_find_user(p_id)               — 계정 ID 하나의 메타데이터(0005)
//   admin_delete_user(p_target, p_reason) — 이용자의 삭제 요청 처리(0005) — 서버가 admin_audit에 기록
//   admin_list_admins()                 — 관리자 목록(0005)
//
// 권한은 서버가 지킨다: 모든 함수가 is_admin()이 아니면 오류(42501)를 낸다. 여기서 세션을 보는 것은 화면 안내용일 뿐이다.
// 응답·오류를 콘솔에 남기지 않는다(계정 메타데이터도 개인정보).

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ADMIN_LIST_MAX,
  ADMIN_PAGE_SIZE,
  CSV_MAX_ROWS,
  parseAdminRows,
  parseOverview,
  parseUserRows,
  splitPage,
  usersPageArgs,
  type AdminListRow,
  type AdminOverview,
  type AdminUserRow,
  type DeleteFailure,
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

/**
 * CSV용 — 사용자 메타데이터 전체를 서버 최대(100명)씩 여러 번 불러 모은다. 최대 max명(기본 5,000).
 * 한 번이라도 실패하면 부분 파일을 만들지 않고 실패로 돌려준다(빠진 사람이 있는 목록을 내보내지 않는다).
 */
export async function fetchAllUsers(client: AdminClient, max: number = CSV_MAX_ROWS): Promise<AdminResult<AdminUserRow[]>> {
  const all: AdminUserRow[] = [];
  const limit = Math.max(1, Math.min(max, Number.MAX_SAFE_INTEGER));
  try {
    for (let offset = 0; all.length < limit; offset += ADMIN_LIST_MAX) {
      const { data, error } = await client.rpc("admin_list_users", { p_limit: ADMIN_LIST_MAX, p_offset: offset });
      if (error !== null) return { ok: false, failure: failureOf(error) };
      const rows = parseUserRows(data);
      if (rows === null) return { ok: false, failure: "failed" };
      all.push(...rows);
      if (rows.length < ADMIN_LIST_MAX) break;
    }
    return { ok: true, value: all.slice(0, limit) };
  } catch {
    return { ok: false, failure: "failed" };
  }
}

// ── 0005_admin_tools.sql ─────────────────────────────────────────────────────

export async function fetchAdmins(client: AdminClient): Promise<AdminResult<AdminListRow[]>> {
  try {
    const { data, error } = await client.rpc("admin_list_admins");
    if (error !== null) return { ok: false, failure: failureOf(error) };
    const rows = parseAdminRows(data);
    return rows === null ? { ok: false, failure: "failed" } : { ok: true, value: rows };
  } catch {
    return { ok: false, failure: "failed" };
  }
}

/** 계정 ID 하나 — 없으면 value null(오류가 아니다). id는 normalizeUuid를 거친 값이어야 한다. */
export async function findUser(client: AdminClient, id: string): Promise<AdminResult<AdminUserRow | null>> {
  try {
    const { data, error } = await client.rpc("admin_find_user", { p_id: id });
    if (error !== null) return { ok: false, failure: failureOf(error) };
    const rows = parseUserRows(data);
    if (rows === null) return { ok: false, failure: "failed" };
    return { ok: true, value: rows.find((r) => r.id === id) ?? null };
  } catch {
    return { ok: false, failure: "failed" };
  }
}

/** admin_delete_user의 오류 → 화면 갈래. P0001은 메시지로 나눈다(SQL의 raise exception 문구 — 0005_admin_tools.sql 2)). */
export function deleteFailureOf(error: AdminRpcError | null | undefined): DeleteFailure {
  const code = error?.code ?? "";
  const message = (error?.message ?? "").toLowerCase();
  if (code === "P0002") return "notFound";
  if (code === "P0001") {
    if (message.includes("own account")) return "self";
    if (message.includes("is admin")) return "isAdmin";
    return "failed";
  }
  return failureOf(error);
}

export type DeleteResult = { ok: true } | { ok: false; failure: DeleteFailure };

/** 이용자의 삭제 요청 처리 — 서버가 user_states + auth.users를 지우고 admin_audit에 남긴다. 사유는 선택(500자). */
export async function deleteUser(client: AdminClient, targetId: string, reason: string | null): Promise<DeleteResult> {
  try {
    const { error } = await client.rpc("admin_delete_user", { p_target: targetId, p_reason: reason });
    if (error !== null) return { ok: false, failure: deleteFailureOf(error) };
    return { ok: true };
  } catch {
    return { ok: false, failure: "failed" };
  }
}
