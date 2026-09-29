import { describe, expect, it } from "vitest";
import { ADMIN_LIST_MAX, ADMIN_PAGE_SIZE } from "./adminModel";
import {
  checkAdminAccess,
  deleteFailureOf,
  deleteUser,
  failureOf,
  fetchAdmins,
  fetchAllUsers,
  fetchOverview,
  fetchUsersPage,
  findUser,
  type AdminClient,
  type AdminRpcError,
  type AdminSessionUser,
} from "./adminApi";

const USER_ID = "3f0f9b2e-0000-4000-8000-000000000001";

type RpcReply = { data: unknown; error: AdminRpcError | null } | Error;

function fakeClient(init: { user?: AdminSessionUser | null; sessionFailed?: boolean; replies?: Record<string, RpcReply> }) {
  const calls: { fn: string; args?: Record<string, unknown> }[] = [];
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
  };
  return { client, calls };
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

  it("카카오 계정 — is_admin() 참이면 관리자, 거짓이면 ID를 보여 줄 수 있게 notAdmin", async () => {
    const admin = fakeClient({ user: { id: USER_ID }, replies: { is_admin: { data: true, error: null } } });
    expect(await checkAdminAccess(admin.client)).toEqual({ kind: "admin", userId: USER_ID });
    expect(admin.calls).toEqual([{ fn: "is_admin", args: undefined }]);

    const notAdmin = fakeClient({ user: { id: USER_ID }, replies: { is_admin: { data: false, error: null } } });
    expect(await checkAdminAccess(notAdmin.client)).toEqual({ kind: "notAdmin", userId: USER_ID });

    // 참 비슷한 값("true" 문자열 등)은 관리자로 보지 않는다
    const truthy = fakeClient({ user: { id: USER_ID }, replies: { is_admin: { data: "true", error: null } } });
    expect(await checkAdminAccess(truthy.client)).toEqual({ kind: "notAdmin", userId: USER_ID });
  });

  it("관리자 SQL이 없으면 설치 안내, 그 밖의 오류·예외는 실패", async () => {
    const missing = fakeClient({ user: { id: USER_ID }, replies: { is_admin: { data: null, error: { code: "PGRST202" } } } });
    expect(await checkAdminAccess(missing.client)).toEqual({ kind: "error", failure: "setupMissing" });
    const broken = fakeClient({ user: { id: USER_ID }, replies: { is_admin: { data: null, error: { code: "500" } } } });
    expect(await checkAdminAccess(broken.client)).toEqual({ kind: "error", failure: "failed" });
    const thrown = fakeClient({ user: { id: USER_ID }, replies: { is_admin: new Error("offline") } });
    expect(await checkAdminAccess(thrown.client)).toEqual({ kind: "error", failure: "failed" });
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
