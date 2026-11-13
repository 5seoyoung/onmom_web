// 관리자 화면의 서버 호출 — Supabase RPC만 부른다(supabase/migrations/0002_admin.sql · 0005_admin_tools.sql · 0009_admin_access_log.sql ·
// 0011_admin_usage_stats.sql · 0013_admin_user_email.sql).
//
//   is_admin()                          — 지금 로그인한 카카오 계정이 관리자 목록(public.admins)에 있는가
//   admin_overview(p_consent_version)   — 집계(전체·게스트·카카오·서버 기록·현재 판 동의·최근 7일·30일 가입 — 0005 뒤에는 동의 판 분포·게스트/카카오 나누기)
//   admin_usage_stats(p_days)           — 이용 통계(0011) — 통계 목적에 동의한 사용자의 건강 기록을 서버가 익명 집계로 바꾼 수만(5명 미만 칸은 null)
//   admin_list_users(p_limit, p_offset) — 계정 메타데이터 목록(로그인 이메일 포함 — 0013, 건강 기록 없음)
//   admin_find_user(p_id)               — 계정 ID 하나의 메타데이터(0005, 이메일은 0013)
//   admin_delete_user(p_target, p_reason) — 이용자의 삭제 요청 처리(0005) — 서버가 admin_audit에 기록
//   (Edge Function account kakao-unlink-admin) — 카카오 계정이면 위 삭제 직전에 카카오 연결 끊기(auth/kakaoUnlink.ts, 비밀값 없으면 건너뜀)
//   admin_list_admins()                 — 관리자 목록(0005)
//   admin_log_users_export(p_rows, p_reason) — CSV 내려받기를 사유와 함께 admin_audit에 남긴다(0009 → 0014 사유 필수). 파일을 만들기 전에 부르고,
//                                         실패하면 파일을 만들지 않는다
//   admin_membership()                  — 내 계정이 관리자 목록에 있는가(0014 — 2단계 인증 전, 화면이 등록·코드 입력을 보일지 정한다)
//
// 2단계 인증(0014): is_admin()은 aal2 세션(인증 앱 숫자까지 확인한 세션)만 참이다. 화면은 관리자 목록에 있으면 Supabase Auth MFA로
//   등록(QR) 또는 6자리 숫자 확인을 거친 뒤 대시보드를 연다 — checkAdminAccess·startTotpEnroll·verifyTotp. 0014가 아직 없는 서버
//   (admin_membership이 없음)에서는 예전처럼 is_admin만 본다.
//
// 접근 기록(0009·0011): 위 읽기 함수도 서버가 부를 때마다 admin_audit에 한 줄씩 남긴다(누가·언제·무엇을·몇 명) — 화면은 따로 할 일이 없다.
// CSV는 브라우저가 만들어 서버가 모르므로 화면이 admin_log_users_export를 부른다(exportUsersCsv).
// 권한은 서버가 지킨다: 모든 함수가 is_admin()이 아니면 오류(42501)를 낸다. 여기서 세션을 보는 것은 화면 안내용일 뿐이다.
// 응답·오류를 콘솔에 남기지 않는다(계정 메타데이터도 개인정보).

import type { SupabaseClient } from "@supabase/supabase-js";
import { requestKakaoUnlink, type FunctionsInvoker } from "@/auth/kakaoUnlink";
import {
  ADMIN_LIST_MAX,
  ADMIN_PAGE_SIZE,
  CSV_MAX_ROWS,
  clampUsageDays,
  parseAdminRows,
  parseOverview,
  parseUsageStats,
  parseUserRows,
  splitPage,
  usersPageArgs,
  type AdminListRow,
  type AdminOverview,
  type AdminUserRow,
  type DeleteFailure,
  type UsageStats,
} from "./adminModel";

export interface AdminRpcError {
  code?: string;
  message?: string;
}

export interface AdminSessionUser {
  id: string;
  is_anonymous?: boolean;
}

/** Supabase Auth MFA 응답 — rpc와 같은 모양(data 또는 error) */
export interface MfaReply<T> {
  data: T | null;
  error: AdminRpcError | null;
}

export interface MfaFactor {
  id: string;
  /** "totp" · "phone" · "webauthn" … */
  type: string;
  /** "verified" | "unverified" */
  status: string;
}

/** 관리자 2단계 인증에 쓰는 Supabase Auth MFA의 부분(인증 앱 — TOTP만) */
export interface AdminMfaClient {
  /** 지금 세션의 인증 단계 — aal1(카카오 로그인만)·aal2(인증 앱 숫자까지) */
  assurance(): Promise<MfaReply<{ current: string | null; next: string | null }>>;
  /** 이 계정에 등록된 인증 수단 전부(확인 전 포함) */
  factors(): Promise<MfaReply<MfaFactor[]>>;
  /** 인증 앱 등록 시작 — QR(SVG data URL)과 비밀 키. 숫자를 확인하기 전까지는 "확인 전" 상태로 남는다. */
  enrollTotp(friendlyName: string): Promise<MfaReply<{ id: string; qrCode: string; secret: string }>>;
  unenroll(factorId: string): Promise<MfaReply<null>>;
  /** 6자리 숫자 확인 — 맞으면 세션이 aal2가 된다 */
  verify(factorId: string, code: string): Promise<MfaReply<null>>;
}

/** 관리자 화면이 쓰는 Supabase 클라이언트의 부분 — 테스트는 이 모양의 가짜를 넘긴다. */
export interface AdminClient {
  getSessionUser(): Promise<{ user: AdminSessionUser | null; failed: boolean }>;
  rpc(fn: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: AdminRpcError | null }>;
  /** 로그아웃(다른 탭 포함)을 알린다. 돌려준 함수로 그만 듣는다. */
  onSignedOut(cb: () => void): () => void;
  /** 이 브라우저에서만 로그아웃(무동작 자동 로그아웃) */
  signOut(): Promise<void>;
  mfa: AdminMfaClient;
  /**
   * Edge Function 호출(supabase-js client.functions) — 계정 삭제 전 카카오 연결 끊기(account 함수, auth/kakaoUnlink.ts).
   * 없으면(시험의 가짜) 끊기를 건너뛴다 — 삭제는 그대로.
   */
  functions?: FunctionsInvoker;
}

/** 등록할 때 인증 앱에 보이는 이름 — 계정마다 같은 이름은 하나만 있을 수 있다(확인 전 등록을 지우고 다시 만든다) */
export const TOTP_FRIENDLY_NAME = "온맘 관리자";

const authErrorOf = (error: { code?: string; message?: string } | null | undefined): AdminRpcError | null =>
  error === null || error === undefined ? null : { code: error.code, message: error.message };

/** supabase-js 클라이언트 → AdminClient */
export function adminClientFrom(client: SupabaseClient): AdminClient {
  return {
    functions: client.functions,
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
    async signOut() {
      await client.auth.signOut({ scope: "local" });
    },
    mfa: {
      async assurance() {
        const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
        return { data: data === null ? null : { current: data.currentLevel ?? null, next: data.nextLevel ?? null }, error: authErrorOf(error) };
      },
      async factors() {
        const { data, error } = await client.auth.mfa.listFactors();
        return {
          data: data === null ? null : data.all.map((f) => ({ id: f.id, type: String(f.factor_type), status: String(f.status) })),
          error: authErrorOf(error),
        };
      },
      async enrollTotp(friendlyName) {
        const { data, error } = await client.auth.mfa.enroll({ factorType: "totp", friendlyName });
        return { data: data === null ? null : { id: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret }, error: authErrorOf(error) };
      },
      async unenroll(factorId) {
        const { error } = await client.auth.mfa.unenroll({ factorId });
        return { data: null, error: authErrorOf(error) };
      },
      async verify(factorId, code) {
        const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code });
        return { data: null, error: authErrorOf(error) };
      },
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
  /** 관리자 목록에 있지만 인증 앱이 아직 없다 — 등록(QR) 화면(0014) */
  | { kind: "mfaEnroll"; userId: string }
  /** 관리자 목록에 있고 인증 앱이 있다 — 6자리 숫자 확인 화면(0014) */
  | { kind: "mfaChallenge"; userId: string; factorId: string }
  | { kind: "admin"; userId: string }
  | { kind: "error"; failure: Exclude<AdminFailure, "forbidden"> };

/** is_admin() 하나로 판단 — 0014 전 서버, 또는 aal2 세션의 마지막 확인. 거짓·권한 없음이면 otherwise. */
async function isAdminNow(client: AdminClient, userId: string, otherwise: AdminAccess): Promise<AdminAccess> {
  const { data, error } = await client.rpc("is_admin");
  if (error !== null) {
    const failure = failureOf(error);
    return failure === "forbidden" ? otherwise : { kind: "error", failure };
  }
  return data === true ? { kind: "admin", userId } : otherwise;
}

/**
 * 관리자 화면에 들어갈 수 있는가 — 세션 → 관리자 목록(admin_membership, 0014) → 2단계 인증 단계.
 *   aal2 세션이면 is_admin()으로 한 번 더 확인하고 대시보드. aal1이면 확인된 인증 앱이 있으면 숫자 확인, 없으면 등록.
 *   0014가 아직 없는 서버(admin_membership 없음 — 배포 사이 몇 분)는 예전처럼 is_admin()만 본다.
 */
export async function checkAdminAccess(client: AdminClient): Promise<AdminAccess> {
  try {
    const { user, failed } = await client.getSessionUser();
    if (user === null) return failed ? { kind: "error", failure: "failed" } : { kind: "signedOut" };
    if (user.is_anonymous === true) return { kind: "anonymous" };
    const notAdmin: AdminAccess = { kind: "notAdmin", userId: user.id };
    const member = await client.rpc("admin_membership");
    if (member.error !== null) {
      const failure = failureOf(member.error);
      if (failure === "setupMissing") return await isAdminNow(client, user.id, notAdmin);
      return failure === "forbidden" ? notAdmin : { kind: "error", failure };
    }
    if (member.data !== true) return notAdmin;

    const level = await client.mfa.assurance();
    if (level.error !== null || level.data === null) return { kind: "error", failure: "failed" };
    // 관리자 목록에 있고 aal2인데 is_admin이 거짓이면 서버와 화면이 어긋난 것 — 들여보내지 않고 실패로
    if (level.data.current === "aal2") return await isAdminNow(client, user.id, { kind: "error", failure: "failed" });
    const factors = await client.mfa.factors();
    if (factors.error !== null || factors.data === null) return { kind: "error", failure: "failed" };
    const verified = factors.data.find((f) => f.type === "totp" && f.status === "verified");
    return verified === undefined ? { kind: "mfaEnroll", userId: user.id } : { kind: "mfaChallenge", userId: user.id, factorId: verified.id };
  } catch {
    return { kind: "error", failure: "failed" };
  }
}

/** Supabase Auth에서 앱 인증(TOTP)이 꺼져 있음 — 대시보드에서 켜야 한다 */
const MFA_DISABLED_CODES: ReadonlySet<string> = new Set(["mfa_totp_enroll_not_enabled", "mfa_totp_verify_not_enabled"]);
/** 숫자가 틀렸거나 시간이 지남 — 새 숫자로 다시 */
const MFA_INVALID_CODES: ReadonlySet<string> = new Set(["mfa_verification_failed", "mfa_challenge_expired", "mfa_verification_rejected"]);

export type MfaFailure = "invalid" | "disabled" | "failed";

export type TotpEnrollResult =
  | { ok: true; factorId: string; qrCode: string; secret: string }
  | { ok: false; failure: Exclude<MfaFailure, "invalid"> };

/**
 * 인증 앱 등록 시작 — 확인 전에 남은 등록(창을 닫았거나 새로고침)은 지우고 새로 만든다(같은 이름은 하나만 있을 수 있다).
 * 이미 확인된 인증 앱이 있으면 등록하지 않는다(화면은 숫자 확인으로 가야 한다 — checkAdminAccess).
 */
export async function startTotpEnroll(client: AdminClient): Promise<TotpEnrollResult> {
  try {
    const listed = await client.mfa.factors();
    if (listed.error !== null || listed.data === null) return { ok: false, failure: "failed" };
    const totp = listed.data.filter((f) => f.type === "totp");
    if (totp.some((f) => f.status === "verified")) return { ok: false, failure: "failed" };
    for (const stale of totp) {
      const removed = await client.mfa.unenroll(stale.id);
      if (removed.error !== null) return { ok: false, failure: "failed" };
    }
    const { data, error } = await client.mfa.enrollTotp(TOTP_FRIENDLY_NAME);
    if (error !== null || data === null) return { ok: false, failure: MFA_DISABLED_CODES.has(error?.code ?? "") ? "disabled" : "failed" };
    return { ok: true, factorId: data.id, qrCode: data.qrCode, secret: data.secret };
  } catch {
    return { ok: false, failure: "failed" };
  }
}

/** 6자리 숫자 확인 — 맞으면 세션이 aal2가 된다(그다음 checkAdminAccess가 대시보드로). code는 normalizeTotpCode를 거친 값. */
export async function verifyTotp(client: AdminClient, factorId: string, code: string): Promise<{ ok: true } | { ok: false; failure: MfaFailure }> {
  try {
    const { error } = await client.mfa.verify(factorId, code);
    if (error === null) return { ok: true };
    const c = error.code ?? "";
    return { ok: false, failure: MFA_INVALID_CODES.has(c) ? "invalid" : MFA_DISABLED_CODES.has(c) ? "disabled" : "failed" };
  } catch {
    return { ok: false, failure: "failed" };
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

/**
 * 이용 통계(0011 admin_usage_stats) — 기간은 서버와 같은 규칙(7~90일)으로 맞춰 보낸다. 0011이 아직 없는 서버는 setupMissing
 * (화면이 0011 설치 안내를 보인다). 모양이 다르거나 서버의 숨김 기준이 화면과 다르면 failed(parseUsageStats).
 */
export async function fetchUsageStats(client: AdminClient, days: number): Promise<AdminResult<UsageStats>> {
  try {
    const { data, error } = await client.rpc("admin_usage_stats", { p_days: clampUsageDays(days) });
    if (error !== null) return { ok: false, failure: failureOf(error) };
    const stats = parseUsageStats(data);
    return stats === null ? { ok: false, failure: "failed" } : { ok: true, value: stats };
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

/**
 * CSV 내려받기를 접근 기록에 남긴다(0014 admin_log_users_export) — 보내는 것은 파일에 담을 행 수와 사유뿐(계정 ID·파일 내용 없음).
 * 사유는 normalizeCsvReason·csvReasonProblem을 거친 값(서버도 공백 제거·1~200자·이메일 모양 거절). 0014가 없는 서버는
 * 사유를 받는 함수가 없어 setupMissing(파일을 만들지 않는다).
 */
export async function logUsersExport(client: AdminClient, rows: number, reason: string): Promise<AdminResult<null>> {
  try {
    const { error } = await client.rpc("admin_log_users_export", { p_rows: rows, p_reason: reason });
    return error === null ? { ok: true, value: null } : { ok: false, failure: failureOf(error) };
  } catch {
    return { ok: false, failure: "failed" };
  }
}

/** CSV 내려받기가 멈춘 곳 — list: 목록 모으기, log: 접근 기록 남기기(0009), save: 파일 만들기(브라우저) */
export type CsvExportResult = { ok: true; rows: number } | { ok: false; step: "list" | "log" | "save"; failure: AdminFailure };

/**
 * CSV 내려받기 — 전체 목록을 모으고(fetchAllUsers, 서버가 쪽마다 list_users로 남긴다) → 접근 기록을 남긴 뒤(logUsersExport) →
 * 파일을 만든다(save, 브라우저 Blob). 기록을 남기지 못하면 파일을 만들지 않는다 — 접근 기록 없이 계정 목록이 기기 밖으로 나가지 않게
 * (0009가 아직 없는 서버도 마찬가지 — 화면이 설치 안내를 보인다). 파일 만들기가 실패해도 기록은 남는다(시도한 내려받기).
 */
export async function exportUsersCsv(
  client: AdminClient,
  reason: string,
  save: (rows: readonly AdminUserRow[]) => boolean,
  max: number = CSV_MAX_ROWS,
): Promise<CsvExportResult> {
  const all = await fetchAllUsers(client, max);
  if (!all.ok) return { ok: false, step: "list", failure: all.failure };
  const logged = await logUsersExport(client, all.value.length, reason);
  if (!logged.ok) return { ok: false, step: "log", failure: logged.failure };
  let saved = false;
  try {
    saved = save(all.value);
  } catch {
    saved = false;
  }
  return saved ? { ok: true, rows: all.value.length } : { ok: false, step: "save", failure: "failed" };
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

/** kakaoUnlinkFailed: 지우기 전에 카카오 연결 끊기를 시도했지만 끊지 못했다(account 함수가 "failed") — 삭제는 끝났다 */
export type DeleteResult = { ok: true; kakaoUnlinkFailed?: true } | { ok: false; failure: DeleteFailure };

/**
 * 이용자의 삭제 요청 처리 — 서버가 user_states + auth.users를 지우고 admin_audit에 남긴다. 사유는 선택(500자).
 * 카카오 계정이면(opts.kakao) 지우기 전에 카카오 연결 끊기를 요청한다(account 함수 — 관리자 aal2 세션 확인, 비밀값 KAKAO_ADMIN_KEY가 없으면
 * skipped). 끊지 못해도 삭제는 이어 간다.
 */
export async function deleteUser(
  client: AdminClient,
  targetId: string,
  reason: string | null,
  opts: { kakao?: boolean } = {},
): Promise<DeleteResult> {
  try {
    const kakao = opts.kakao ? await requestKakaoUnlink(client.functions, { action: "kakao-unlink-admin", target: targetId }) : "not_kakao";
    const { error } = await client.rpc("admin_delete_user", { p_target: targetId, p_reason: reason });
    if (error !== null) return { ok: false, failure: deleteFailureOf(error) };
    return kakao === "failed" ? { ok: true, kakaoUnlinkFailed: true } : { ok: true };
  } catch {
    return { ok: false, failure: "failed" };
  }
}
