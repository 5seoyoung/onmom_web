import { describe, expect, it } from "vitest";
import { ADMIN_PAGE_SIZE } from "./adminModel";
import { checkAdminAccess, failureOf, fetchOverview, fetchUsersPage, type AdminClient, type AdminRpcError, type AdminSessionUser } from "./adminApi";

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
