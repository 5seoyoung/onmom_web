import { describe, expect, it } from "vitest";
import { ADMIN_LIST_MAX, ADMIN_PAGE_SIZE } from "./adminModel";
import {
  checkAdminAccess,
  deleteFailureOf,
  deleteUser,
  exportUsersCsv,
  failureOf,
  fetchAdmins,
  fetchAllUsers,
  fetchOverview,
  fetchUsageStats,
  fetchUsersPage,
  findUser,
  logUsersExport,
  startTotpEnroll,
  TOTP_FRIENDLY_NAME,
  verifyTotp,
  type AdminClient,
  type AdminMfaClient,
  type AdminRpcError,
  type AdminSessionUser,
  type MfaFactor,
} from "./adminApi";

const USER_ID = "3f0f9b2e-0000-4000-8000-000000000001";

type RpcReply = { data: unknown; error: AdminRpcError | null } | Error;

/** 2단계 인증 가짜의 답 — 없으면 aal1·인증 앱 없음·등록 성공·확인 성공 */
interface MfaInit {
  level?: { current: string | null; next: string | null } | AdminRpcError;
  factors?: MfaFactor[] | AdminRpcError;
  enroll?: { id: string; qrCode: string; secret: string } | AdminRpcError;
  unenroll?: AdminRpcError | null;
  verify?: AdminRpcError | null | Error;
}

const isError = (v: unknown): v is AdminRpcError => typeof v === "object" && v !== null && "code" in v;

/** 2단계 인증 가짜 — 부른 순서를 mfaCalls에 남긴다 */
function fakeMfa(init: MfaInit = {}, mfaCalls: string[] = []): AdminMfaClient {
  return {
    async assurance() {
      mfaCalls.push("assurance");
      const v = init.level ?? { current: "aal1", next: "aal1" };
      return isError(v) ? { data: null, error: v } : { data: v, error: null };
    },
    async factors() {
      mfaCalls.push("factors");
      const v = init.factors ?? [];
      return isError(v) ? { data: null, error: v } : { data: v, error: null };
    },
    async enrollTotp(name) {
      mfaCalls.push(`enroll:${name}`);
      const v = init.enroll ?? { id: "f-new", qrCode: "data:image/svg+xml;utf-8,<svg></svg>", secret: "ABCDEFGHIJKLMNOP" };
      return isError(v) ? { data: null, error: v } : { data: v, error: null };
    },
    async unenroll(id) {
      mfaCalls.push(`unenroll:${id}`);
      return { data: null, error: init.unenroll ?? null };
    },
    async verify(id, code) {
      mfaCalls.push(`verify:${id}:${code}`);
      if (init.verify instanceof Error) throw init.verify;
      return { data: null, error: init.verify ?? null };
    },
  };
}

function fakeClient(init: { user?: AdminSessionUser | null; sessionFailed?: boolean; replies?: Record<string, RpcReply>; mfa?: MfaInit }) {
  const calls: { fn: string; args?: Record<string, unknown> }[] = [];
  const mfaCalls: string[] = [];
  const client: AdminClient = {
    async getSessionUser() {
      return { user: init.user ?? null, failed: init.sessionFailed === true };
    },
    async rpc(fn, args) {
      calls.push({ fn, args });
      const reply = init.replies?.[fn];
      if (reply instanceof Error) throw reply;
      return reply ?? { data: null, error: { code: "PGRST202", message: "not found" } };
    },
    onSignedOut() {
      return () => {};
    },
    async signOut() {},
    mfa: fakeMfa(init.mfa, mfaCalls),
  };
  return { client, calls, mfaCalls };
}

describe("checkAdminAccess", () => {
  it("로그인하지 않았으면 서버 함수를 부르지 않는다", async () => {
    const { client, calls } = fakeClient({ user: null });
    expect(await checkAdminAccess(client)).toEqual({ kind: "signedOut" });
    expect(calls).toEqual([]);
  });

  it("세션 확인이 실패했으면(네트워크) 오류 — 로그인 안 함으로 오인하지 않는다", async () => {
    const { client } = fakeClient({ user: null, sessionFailed: true });
    expect(await checkAdminAccess(client)).toEqual({ kind: "error", failure: "failed" });
  });

  it("게스트(익명)는 관리자가 아니다 — 서버 함수도 부르지 않는다", async () => {
    const { client, calls } = fakeClient({ user: { id: USER_ID, is_anonymous: true } });
    expect(await checkAdminAccess(client)).toEqual({ kind: "anonymous" });
    expect(calls).toEqual([]);
  });

  const MEMBER = { admin_membership: { data: true, error: null } } as const;

  it("관리자 목록에 없으면 ID를 보여 줄 수 있게 notAdmin — 2단계 인증으로 가지 않는다", async () => {
    const notAdmin = fakeClient({ user: { id: USER_ID }, replies: { admin_membership: { data: false, error: null } } });
    expect(await checkAdminAccess(notAdmin.client)).toEqual({ kind: "notAdmin", userId: USER_ID });
    expect(notAdmin.calls).toEqual([{ fn: "admin_membership", args: undefined }]);
    expect(notAdmin.mfaCalls).toEqual([]);

    // 참 비슷한 값("true" 문자열 등)은 관리자로 보지 않는다
    const truthy = fakeClient({ user: { id: USER_ID }, replies: { admin_membership: { data: "true", error: null } } });
    expect(await checkAdminAccess(truthy.client)).toEqual({ kind: "notAdmin", userId: USER_ID });
  });

  it("관리자 목록 + aal2 세션 — is_admin()으로 한 번 더 확인하고 대시보드", async () => {
    const admin = fakeClient({ user: { id: USER_ID }, replies: { ...MEMBER, is_admin: { data: true, error: null } }, mfa: { level: { current: "aal2", next: "aal2" } } });
    expect(await checkAdminAccess(admin.client)).toEqual({ kind: "admin", userId: USER_ID });
    expect(admin.calls.map((c) => c.fn)).toEqual(["admin_membership", "is_admin"]);
    expect(admin.mfaCalls).toEqual(["assurance"]);

    // aal2인데 서버가 관리자가 아니라고 하면 들여보내지 않는다(어긋남 — 실패)
    const odd = fakeClient({ user: { id: USER_ID }, replies: { ...MEMBER, is_admin: { data: false, error: null } }, mfa: { level: { current: "aal2", next: "aal2" } } });
    expect(await checkAdminAccess(odd.client)).toEqual({ kind: "error", failure: "failed" });
  });

  it("관리자 목록 + aal1 — 확인된 인증 앱이 있으면 숫자 확인, 없으면(확인 전 등록만 있어도) 등록", async () => {
    const challenge = fakeClient({
      user: { id: USER_ID },
      replies: MEMBER,
      mfa: { level: { current: "aal1", next: "aal2" }, factors: [{ id: "f-1", type: "totp", status: "verified" }] },
    });
    expect(await checkAdminAccess(challenge.client)).toEqual({ kind: "mfaChallenge", userId: USER_ID, factorId: "f-1" });
    expect(challenge.calls.map((c) => c.fn)).toEqual(["admin_membership"]);

    const enroll = fakeClient({ user: { id: USER_ID }, replies: MEMBER, mfa: { factors: [{ id: "f-old", type: "totp", status: "unverified" }] } });
    expect(await checkAdminAccess(enroll.client)).toEqual({ kind: "mfaEnroll", userId: USER_ID });
    const none = fakeClient({ user: { id: USER_ID }, replies: MEMBER });
    expect(await checkAdminAccess(none.client)).toEqual({ kind: "mfaEnroll", userId: USER_ID });
    // 인증 앱(totp)이 아닌 수단은 숫자 확인에 쓰지 않는다
    const phone = fakeClient({ user: { id: USER_ID }, replies: MEMBER, mfa: { factors: [{ id: "f-p", type: "phone", status: "verified" }] } });
    expect(await checkAdminAccess(phone.client)).toEqual({ kind: "mfaEnroll", userId: USER_ID });
  });

  it("0014가 아직 없는 서버(admin_membership 없음) — 예전처럼 is_admin()만 본다", async () => {
    const legacy = fakeClient({ user: { id: USER_ID }, replies: { is_admin: { data: true, error: null } } });
    expect(await checkAdminAccess(legacy.client)).toEqual({ kind: "admin", userId: USER_ID });
    expect(legacy.calls.map((c) => c.fn)).toEqual(["admin_membership", "is_admin"]);
    expect(legacy.mfaCalls).toEqual([]);
    const legacyNot = fakeClient({ user: { id: USER_ID }, replies: { is_admin: { data: false, error: null } } });
    expect(await checkAdminAccess(legacyNot.client)).toEqual({ kind: "notAdmin", userId: USER_ID });
    // 관리자 SQL(0002)도 없으면 설치 안내
    const missing = fakeClient({ user: { id: USER_ID } });
    expect(await checkAdminAccess(missing.client)).toEqual({ kind: "error", failure: "setupMissing" });
  });

  it("그 밖의 오류·예외, 인증 단계·인증 수단을 읽지 못하면 실패", async () => {
    const broken = fakeClient({ user: { id: USER_ID }, replies: { admin_membership: { data: null, error: { code: "500" } } } });
    expect(await checkAdminAccess(broken.client)).toEqual({ kind: "error", failure: "failed" });
    const thrown = fakeClient({ user: { id: USER_ID }, replies: { admin_membership: new Error("offline") } });
    expect(await checkAdminAccess(thrown.client)).toEqual({ kind: "error", failure: "failed" });
    const level = fakeClient({ user: { id: USER_ID }, replies: MEMBER, mfa: { level: { code: "session_not_found" } } });
    expect(await checkAdminAccess(level.client)).toEqual({ kind: "error", failure: "failed" });
    const factors = fakeClient({ user: { id: USER_ID }, replies: MEMBER, mfa: { factors: { code: "500" } } });
    expect(await checkAdminAccess(factors.client)).toEqual({ kind: "error", failure: "failed" });
  });
});

describe("startTotpEnroll — 인증 앱 등록 시작", () => {
  it("확인 전에 남은 등록을 지우고 새로 만든다 — 인증 앱에 보일 이름은 하나", async () => {
    const { client, mfaCalls } = fakeClient({ mfa: { factors: [{ id: "f-old", type: "totp", status: "unverified" }, { id: "f-ph", type: "phone", status: "unverified" }] } });
    expect(await startTotpEnroll(client)).toEqual({ ok: true, factorId: "f-new", qrCode: "data:image/svg+xml;utf-8,<svg></svg>", secret: "ABCDEFGHIJKLMNOP" });
    expect(mfaCalls).toEqual(["factors", "unenroll:f-old", `enroll:${TOTP_FRIENDLY_NAME}`]);
  });

  it("이미 확인된 인증 앱이 있으면 등록하지 않는다(숫자 확인으로 가야 한다)", async () => {
    const { client, mfaCalls } = fakeClient({ mfa: { factors: [{ id: "f-1", type: "totp", status: "verified" }] } });
    expect(await startTotpEnroll(client)).toEqual({ ok: false, failure: "failed" });
    expect(mfaCalls).toEqual(["factors"]);
  });

  it("앱 인증이 꺼진 프로젝트는 disabled, 목록·지우기·등록 실패는 failed", async () => {
    expect(await startTotpEnroll(fakeClient({ mfa: { enroll: { code: "mfa_totp_enroll_not_enabled" } } }).client)).toEqual({ ok: false, failure: "disabled" });
    expect(await startTotpEnroll(fakeClient({ mfa: { enroll: { code: "mfa_factor_name_conflict" } } }).client)).toEqual({ ok: false, failure: "failed" });
    expect(await startTotpEnroll(fakeClient({ mfa: { factors: { code: "500" } } }).client)).toEqual({ ok: false, failure: "failed" });
    const stuck = fakeClient({ mfa: { factors: [{ id: "f-old", type: "totp", status: "unverified" }], unenroll: { code: "500" } } });
    expect(await startTotpEnroll(stuck.client)).toEqual({ ok: false, failure: "failed" });
    expect(stuck.mfaCalls).toEqual(["factors", "unenroll:f-old"]);
  });
});

describe("verifyTotp — 6자리 숫자 확인", () => {
  it("맞으면 ok — 받은 숫자 그대로 보낸다", async () => {
    const { client, mfaCalls } = fakeClient({});
    expect(await verifyTotp(client, "f-1", "123456")).toEqual({ ok: true });
    expect(mfaCalls).toEqual(["verify:f-1:123456"]);
  });

  it("틀림·시간 지남은 invalid, 꺼짐은 disabled, 그 밖·예외는 failed", async () => {
    for (const code of ["mfa_verification_failed", "mfa_challenge_expired", "mfa_verification_rejected"]) {
      expect(await verifyTotp(fakeClient({ mfa: { verify: { code } } }).client, "f", "000000")).toEqual({ ok: false, failure: "invalid" });
    }
    expect(await verifyTotp(fakeClient({ mfa: { verify: { code: "mfa_totp_verify_not_enabled" } } }).client, "f", "000000")).toEqual({ ok: false, failure: "disabled" });
    expect(await verifyTotp(fakeClient({ mfa: { verify: { code: "over_request_rate_limit" } } }).client, "f", "000000")).toEqual({ ok: false, failure: "failed" });
    expect(await verifyTotp(fakeClient({ mfa: { verify: new Error("offline") } }).client, "f", "000000")).toEqual({ ok: false, failure: "failed" });
  });
});

describe("failureOf", () => {
  it("권한 없음·설치 안 됨·그 밖", () => {
    expect(failureOf({ code: "42501" })).toBe("forbidden");
    expect(failureOf({ code: "PGRST202" })).toBe("setupMissing");
    expect(failureOf({ code: "42883" })).toBe("setupMissing");
    expect(failureOf({ code: "42703" })).toBe("setupMissing");
    expect(failureOf({ code: "08006" })).toBe("failed");
    expect(failureOf(null)).toBe("failed");
  });
});

describe("fetchOverview", () => {
  it("지금 동의 판을 인자로 보낸다", async () => {
    const data = {
      totals: { users: 2, anonymous_users: 1, kakao_users: 1, users_with_state: 1, users_with_current_consent: 1 },
      active_users_7d: 1,
      states_updated_7d: 1,
      new_users_by_day: [],
    };
    const { client, calls } = fakeClient({ replies: { admin_overview: { data, error: null } } });
    const r = await fetchOverview(client, "web-2026-09-28");
    expect(r.ok).toBe(true);
    expect(calls).toEqual([{ fn: "admin_overview", args: { p_consent_version: "web-2026-09-28" } }]);
  });

  it("관리자가 아니게 됐으면 forbidden, 모양이 다르면 failed", async () => {
    const forbidden = fakeClient({ replies: { admin_overview: { data: null, error: { code: "42501" } } } });
    expect(await fetchOverview(forbidden.client, "v")).toEqual({ ok: false, failure: "forbidden" });
    const odd = fakeClient({ replies: { admin_overview: { data: { totals: {} }, error: null } } });
    expect(await fetchOverview(odd.client, "v")).toEqual({ ok: false, failure: "failed" });
  });
});

describe("fetchUsageStats — 0011 이용 통계", () => {
  const data = {
    days: 30,
    period: { from: "2026-10-06", to: "2026-11-04" },
    k: 5,
    suppressed: true,
    totals: { consented_users: 1, active_users: 1 },
    daily: null,
    adoption: null,
    return_rate: null,
    distributions: null,
  };

  it("기간을 서버와 같은 규칙으로 맞춰 보내고 읽는다 — 보내는 것은 기간뿐이다", async () => {
    const { client, calls } = fakeClient({ replies: { admin_usage_stats: { data, error: null } } });
    const r = await fetchUsageStats(client, 30);
    expect(r.ok && r.value).toMatchObject({ days: 30, suppressed: true, totals: { consentedUsers: 1, activeUsers: 1 } });
    await fetchUsageStats(client, 3);
    await fetchUsageStats(client, 1000);
    await fetchUsageStats(client, Number.NaN);
    expect(calls).toEqual([
      { fn: "admin_usage_stats", args: { p_days: 30 } },
      { fn: "admin_usage_stats", args: { p_days: 7 } },
      { fn: "admin_usage_stats", args: { p_days: 90 } },
      { fn: "admin_usage_stats", args: { p_days: 30 } },
    ]);
  });

  it("0011이 아직 없는 서버는 설치 안내 갈래 — 함수를 못 찾은 코드(PGRST202·42883)", async () => {
    for (const code of ["PGRST202", "42883"]) {
      const missing = fakeClient({ replies: { admin_usage_stats: { data: null, error: { code } } } });
      expect(await fetchUsageStats(missing.client, 30)).toEqual({ ok: false, failure: "setupMissing" });
    }
  });

  it("관리자가 아니게 됐으면 forbidden, 모양이 다르거나 숨김 기준이 다르면 failed, 그 밖의 오류·예외도 failed", async () => {
    const forbidden = fakeClient({ replies: { admin_usage_stats: { data: null, error: { code: "42501" } } } });
    expect(await fetchUsageStats(forbidden.client, 30)).toEqual({ ok: false, failure: "forbidden" });
    const odd = fakeClient({ replies: { admin_usage_stats: { data: { totals: {} }, error: null } } });
    expect(await fetchUsageStats(odd.client, 30)).toEqual({ ok: false, failure: "failed" });
    const weakerK = fakeClient({ replies: { admin_usage_stats: { data: { ...data, k: 2 }, error: null } } });
    expect(await fetchUsageStats(weakerK.client, 30)).toEqual({ ok: false, failure: "failed" });
    const timeout = fakeClient({ replies: { admin_usage_stats: { data: null, error: { code: "57014" } } } });
    expect(await fetchUsageStats(timeout.client, 30)).toEqual({ ok: false, failure: "failed" });
    const thrown = fakeClient({ replies: { admin_usage_stats: new Error("offline") } });
    expect(await fetchUsageStats(thrown.client, 30)).toEqual({ ok: false, failure: "failed" });
  });
});

describe("fetchUsersPage", () => {
  const row = (i: number) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    created_at: "2026-09-28T00:00:00Z",
    last_sign_in_at: null,
    is_anonymous: true,
    provider: "anonymous",
    has_state: false,
    consent_version: null,
    state_updated_at: null,
  });

  it("한 쪽 + 1개를 달라고 하고, 넘치면 다음 쪽이 있다", async () => {
    const { client, calls } = fakeClient({
      replies: { admin_list_users: { data: Array.from({ length: ADMIN_PAGE_SIZE + 1 }, (_, i) => row(i)), error: null } },
    });
    const r = await fetchUsersPage(client, 1);
    expect(calls).toEqual([{ fn: "admin_list_users", args: { p_limit: ADMIN_PAGE_SIZE + 1, p_offset: ADMIN_PAGE_SIZE } }]);
    expect(r.ok && r.value.rows.length).toBe(ADMIN_PAGE_SIZE);
    expect(r.ok && r.value.hasNext).toBe(true);
    expect(r.ok && r.value.page).toBe(1);
  });

  it("마지막 쪽", async () => {
    const { client } = fakeClient({ replies: { admin_list_users: { data: [row(1), row(2)], error: null } } });
    const r = await fetchUsersPage(client, 0);
    expect(r.ok && r.value.hasNext).toBe(false);
    expect(r.ok && r.value.rows.length).toBe(2);
  });

  it("오류·예외", async () => {
    const forbidden = fakeClient({ replies: { admin_list_users: { data: null, error: { code: "42501" } } } });
    expect(await fetchUsersPage(forbidden.client, 0)).toEqual({ ok: false, failure: "forbidden" });
    const thrown = fakeClient({ replies: { admin_list_users: new Error("offline") } });
    expect(await fetchUsersPage(thrown.client, 0)).toEqual({ ok: false, failure: "failed" });
  });
});

// ── 0005_admin_tools.sql ─────────────────────────────────────────────────────

const userRow = (i: number) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  created_at: "2026-09-28T00:00:00Z",
  last_sign_in_at: null,
  is_anonymous: true,
  provider: "anonymous",
  has_state: false,
  consent_version: null,
  state_updated_at: null,
});

/** admin_list_users를 offset·limit대로 돌려주는 가짜 — total명. failAt 번째 호출(0부터)은 오류. */
function pagedClient(total: number, failAt: number | null = null) {
  const calls: Record<string, unknown>[] = [];
  const client: AdminClient = {
    async getSessionUser() {
      return { user: { id: USER_ID }, failed: false };
    },
    async rpc(fn, args) {
      if (fn !== "admin_list_users") return { data: null, error: { code: "PGRST202" } };
      const a = args ?? {};
      calls.push(a);
      if (failAt !== null && calls.length - 1 === failAt) return { data: null, error: { code: "08006", message: "boom" } };
      const offset = Number(a.p_offset ?? 0);
      const limit = Number(a.p_limit ?? 0);
      return { data: Array.from({ length: Math.max(0, Math.min(total, offset + limit) - offset) }, (_, k) => userRow(offset + k)), error: null };
    },
    onSignedOut() {
      return () => {};
    },
    async signOut() {},
    mfa: fakeMfa(),
  };
  return { client, calls };
}

describe("fetchAllUsers — CSV용 전체 목록", () => {
  it("서버 최대(100)씩 이어서 부르고, 한 쪽이 100보다 적으면 멈춘다", async () => {
    const { client, calls } = pagedClient(250);
    const r = await fetchAllUsers(client);
    expect(r.ok && r.value.length).toBe(250);
    expect(r.ok && r.value[249].id).toBe(userRow(249).id);
    expect(calls).toEqual([
      { p_limit: ADMIN_LIST_MAX, p_offset: 0 },
      { p_limit: ADMIN_LIST_MAX, p_offset: 100 },
      { p_limit: ADMIN_LIST_MAX, p_offset: 200 },
    ]);
  });

  it("딱 100의 배수면 빈 쪽을 한 번 더 받고 멈춘다 — 0명이면 빈 목록", async () => {
    const full = pagedClient(100);
    expect((await fetchAllUsers(full.client)).ok && full.calls.length).toBe(2);
    const none = pagedClient(0);
    const r = await fetchAllUsers(none.client);
    expect(r).toEqual({ ok: true, value: [] });
  });

  it("최대 행 수를 넘기지 않는다(넘치는 쪽은 부르지 않고 잘라 낸다)", async () => {
    const { client, calls } = pagedClient(1000);
    const r = await fetchAllUsers(client, 150);
    expect(r.ok && r.value.length).toBe(150);
    expect(calls).toHaveLength(2);
  });

  it("중간에 한 번이라도 실패하면 부분 목록을 주지 않는다(빠진 사람이 있는 파일을 만들지 않게)", async () => {
    const { client } = pagedClient(250, 1);
    expect(await fetchAllUsers(client)).toEqual({ ok: false, failure: "failed" });
    const forbidden = fakeClient({ replies: { admin_list_users: { data: null, error: { code: "42501" } } } });
    expect(await fetchAllUsers(forbidden.client)).toEqual({ ok: false, failure: "forbidden" });
    const odd = fakeClient({ replies: { admin_list_users: { data: [{ id: "" }], error: null } } });
    expect(await fetchAllUsers(odd.client)).toEqual({ ok: false, failure: "failed" });
  });
});

// ── 0009_admin_access_log.sql ────────────────────────────────────────────────

/** 목록(admin_list_users)은 total명, 접근 기록(admin_log_users_export)은 logReply대로 답하는 가짜 — 부른 순서를 남긴다 */
function exportClient(total: number, logReply: RpcReply = { data: null, error: null }) {
  const paged = pagedClient(total);
  const order: { fn: string; args?: Record<string, unknown> }[] = [];
  const client: AdminClient = {
    ...paged.client,
    async rpc(fn, args) {
      order.push({ fn, args });
      if (fn !== "admin_log_users_export") return paged.client.rpc(fn, args);
      if (logReply instanceof Error) throw logReply;
      return logReply;
    },
  };
  return { client, order };
}

describe("logUsersExport — CSV 내려받기를 사유와 함께 접근 기록에(0014)", () => {
  it("파일에 담을 행 수와 사유만 보낸다(계정 ID·파일 내용 없음)", async () => {
    const { client, calls } = fakeClient({ replies: { admin_log_users_export: { data: null, error: null } } });
    expect(await logUsersExport(client, 250, "월간 가입 현황 정리")).toEqual({ ok: true, value: null });
    expect(calls).toEqual([{ fn: "admin_log_users_export", args: { p_rows: 250, p_reason: "월간 가입 현황 정리" } }]);
  });

  it("0014가 없으면 설치 안내, 권한 없음, 그 밖(22023·이메일 제약 23514 등)·예외는 실패", async () => {
    const missing = fakeClient({ replies: { admin_log_users_export: { data: null, error: { code: "PGRST202" } } } });
    expect(await logUsersExport(missing.client, 1, "r")).toEqual({ ok: false, failure: "setupMissing" });
    const forbidden = fakeClient({ replies: { admin_log_users_export: { data: null, error: { code: "42501" } } } });
    expect(await logUsersExport(forbidden.client, 1, "r")).toEqual({ ok: false, failure: "forbidden" });
    const invalid = fakeClient({ replies: { admin_log_users_export: { data: null, error: { code: "22023" } } } });
    expect(await logUsersExport(invalid.client, -1, "r")).toEqual({ ok: false, failure: "failed" });
    const email = fakeClient({ replies: { admin_log_users_export: { data: null, error: { code: "23514" } } } });
    expect(await logUsersExport(email.client, 1, "r")).toEqual({ ok: false, failure: "failed" });
    const thrown = fakeClient({ replies: { admin_log_users_export: new Error("offline") } });
    expect(await logUsersExport(thrown.client, 1, "r")).toEqual({ ok: false, failure: "failed" });
  });
});

describe("exportUsersCsv — 목록 모으기 → 접근 기록 → 파일", () => {
  it("전체 목록을 모은 뒤 행 수를 기록하고, 그다음에 파일을 만든다", async () => {
    const { client, order } = exportClient(150);
    const saved: number[] = [];
    const r = await exportUsersCsv(client, "월간 정리", (rows) => {
      saved.push(rows.length);
      // 파일을 만들 때는 이미 기록이 남아 있다
      expect(order.at(-1)?.fn).toBe("admin_log_users_export");
      return true;
    });
    expect(r).toEqual({ ok: true, rows: 150 });
    expect(saved).toEqual([150]);
    expect(order.map((c) => c.fn)).toEqual(["admin_list_users", "admin_list_users", "admin_log_users_export"]);
    expect(order.at(-1)?.args).toEqual({ p_rows: 150, p_reason: "월간 정리" });
  });

  it("기록을 남기지 못하면 파일을 만들지 않는다 — 0014가 없는 서버·권한 없음·네트워크 예외 모두", async () => {
    for (const [reply, failure] of [
      [{ data: null, error: { code: "PGRST202" } }, "setupMissing"],
      [{ data: null, error: { code: "42501" } }, "forbidden"],
      [new Error("offline"), "failed"],
    ] as const) {
      const { client } = exportClient(30, reply);
      let saved = 0;
      const r = await exportUsersCsv(client, "월간 정리", () => {
        saved += 1;
        return true;
      });
      expect(r).toEqual({ ok: false, step: "log", failure });
      expect(saved).toBe(0);
    }
  });

  it("목록을 다 모으지 못하면 기록도 파일도 없다, 파일 만들기가 실패하면(던져도) save 단계 실패 — 기록은 시도로 남는다", async () => {
    const forbidden = fakeClient({ replies: { admin_list_users: { data: null, error: { code: "42501" } } } });
    const saveNever = () => {
      throw new Error("불리면 안 된다");
    };
    expect(await exportUsersCsv(forbidden.client, "월간 정리", saveNever)).toEqual({ ok: false, step: "list", failure: "forbidden" });
    expect(forbidden.calls.map((c) => c.fn)).toEqual(["admin_list_users"]);

    const blocked = exportClient(5);
    expect(await exportUsersCsv(blocked.client, "월간 정리", () => false)).toEqual({ ok: false, step: "save", failure: "failed" });
    const throws = exportClient(5);
    expect(await exportUsersCsv(throws.client, "월간 정리", saveNever)).toEqual({ ok: false, step: "save", failure: "failed" });
    expect(throws.order.map((c) => c.fn)).toEqual(["admin_list_users", "admin_log_users_export"]);
  });
});

describe("fetchAdmins", () => {
  const row = { user_id: USER_ID, added_at: "2026-09-28T00:00:00Z", last_sign_in_at: null, is_me: true };

  it("인자 없이 부르고 행을 읽는다", async () => {
    const { client, calls } = fakeClient({ replies: { admin_list_admins: { data: [row], error: null } } });
    expect(await fetchAdmins(client)).toEqual({ ok: true, value: [{ userId: USER_ID, addedAt: row.added_at, lastSignInAt: null, isMe: true }] });
    expect(calls).toEqual([{ fn: "admin_list_admins", args: undefined }]);
  });

  it("0005가 없으면 설치 안내, 권한 없음, 모양 오류, 예외", async () => {
    const missing = fakeClient({ replies: { admin_list_admins: { data: null, error: { code: "PGRST202" } } } });
    expect(await fetchAdmins(missing.client)).toEqual({ ok: false, failure: "setupMissing" });
    const forbidden = fakeClient({ replies: { admin_list_admins: { data: null, error: { code: "42501" } } } });
    expect(await fetchAdmins(forbidden.client)).toEqual({ ok: false, failure: "forbidden" });
    const odd = fakeClient({ replies: { admin_list_admins: { data: [{ user_id: null }], error: null } } });
    expect(await fetchAdmins(odd.client)).toEqual({ ok: false, failure: "failed" });
    const thrown = fakeClient({ replies: { admin_list_admins: new Error("offline") } });
    expect(await fetchAdmins(thrown.client)).toEqual({ ok: false, failure: "failed" });
  });
});

describe("findUser", () => {
  it("계정 ID를 보내고, 그 ID의 행만 돌려준다 — 없으면 null(오류가 아니다)", async () => {
    const target = userRow(7);
    const found = fakeClient({ replies: { admin_find_user: { data: [target], error: null } } });
    const r = await findUser(found.client, target.id);
    expect(r.ok && r.value?.id).toBe(target.id);
    expect(found.calls).toEqual([{ fn: "admin_find_user", args: { p_id: target.id } }]);

    const none = fakeClient({ replies: { admin_find_user: { data: [], error: null } } });
    expect(await findUser(none.client, target.id)).toEqual({ ok: true, value: null });
    // 다른 ID의 행이 오면(서버 오류) 찾은 것으로 보지 않는다
    const other = fakeClient({ replies: { admin_find_user: { data: [userRow(8)], error: null } } });
    expect(await findUser(other.client, target.id)).toEqual({ ok: true, value: null });
  });

  it("오류·예외", async () => {
    const forbidden = fakeClient({ replies: { admin_find_user: { data: null, error: { code: "42501" } } } });
    expect(await findUser(forbidden.client, USER_ID)).toEqual({ ok: false, failure: "forbidden" });
    const missing = fakeClient({ replies: { admin_find_user: { data: null, error: { code: "42883" } } } });
    expect(await findUser(missing.client, USER_ID)).toEqual({ ok: false, failure: "setupMissing" });
    const odd = fakeClient({ replies: { admin_find_user: { data: { id: USER_ID }, error: null } } });
    expect(await findUser(odd.client, USER_ID)).toEqual({ ok: false, failure: "failed" });
    const thrown = fakeClient({ replies: { admin_find_user: new Error("offline") } });
    expect(await findUser(thrown.client, USER_ID)).toEqual({ ok: false, failure: "failed" });
  });
});

describe("deleteUser — 이용자의 삭제 요청 처리", () => {
  it("대상 ID와 사유(없으면 null)를 보낸다", async () => {
    const ok = fakeClient({ replies: { admin_delete_user: { data: null, error: null } } });
    expect(await deleteUser(ok.client, USER_ID, "이용자 요청")).toEqual({ ok: true });
    expect(ok.calls).toEqual([{ fn: "admin_delete_user", args: { p_target: USER_ID, p_reason: "이용자 요청" } }]);
    await deleteUser(ok.client, USER_ID, null);
    expect(ok.calls[1].args).toEqual({ p_target: USER_ID, p_reason: null });
  });

  it("서버의 거절 이유를 갈래로 — 없는 계정(P0002)·내 계정·다른 관리자(P0001 메시지)·권한·설치·그 밖", () => {
    expect(deleteFailureOf({ code: "P0002", message: "onmom: user not found" })).toBe("notFound");
    expect(deleteFailureOf({ code: "P0001", message: "onmom: cannot delete own account" })).toBe("self");
    expect(deleteFailureOf({ code: "P0001", message: "onmom: target is admin" })).toBe("isAdmin");
    expect(deleteFailureOf({ code: "P0001", message: "something else" })).toBe("failed");
    expect(deleteFailureOf({ code: "42501" })).toBe("forbidden");
    expect(deleteFailureOf({ code: "PGRST202" })).toBe("setupMissing");
    expect(deleteFailureOf({ code: "22023" })).toBe("failed");
    expect(deleteFailureOf(null)).toBe("failed");
  });

  it("실패·예외는 ok false", async () => {
    const self = fakeClient({ replies: { admin_delete_user: { data: null, error: { code: "P0001", message: "onmom: cannot delete own account" } } } });
    expect(await deleteUser(self.client, USER_ID, null)).toEqual({ ok: false, failure: "self" });
    const thrown = fakeClient({ replies: { admin_delete_user: new Error("offline") } });
    expect(await deleteUser(thrown.client, USER_ID, null)).toEqual({ ok: false, failure: "failed" });
  });
});
