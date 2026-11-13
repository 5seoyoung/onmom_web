// Edge Function "account"(supabase/functions/account) — 카카오 연결 끊기와 카카오 연결 해제 웹훅을 가짜 의존성으로 확인한다.
// 비밀값 KAKAO_ADMIN_KEY가 없으면 아무것도 바뀌지 않아야 한다(끊기 skipped, 웹훅 401). Deno 연결(index.ts)은 deno check가 본다.

import { describe, expect, it } from "vitest";
import {
  constantTimeEqual,
  kakaoUserIdOf,
  kakaoWebhookAuthorized,
  parseKakaoUnlinkNotice,
  KAKAO_UNLINK_URL,
} from "../../supabase/functions/_shared/kakao";
import { pickPublishableKey } from "../../supabase/functions/_shared/auth";
import {
  createDeleteByKakaoUserId,
  createIsAdmin,
  createKakaoUnlink,
  createKakaoUserIdLookup,
  createVerifyAccountUser,
  type FetchLike,
} from "../../supabase/functions/account/adapters";
import { createAccountHandler, type AccountLogEntry, type AccountUser } from "../../supabase/functions/account/handler";

const SITE = "https://onmomcare.app";
const FN = "https://ref.supabase.co/functions/v1/account";
const KEY = "0123456789abcdef0123456789abcdef";
const KAKAO_ID = "4012345678";
const TARGET = "3f0f9b2e-0000-4000-8000-000000000001";

interface Opts {
  adminKey?: string | null;
  appId?: string | null;
  user?: AccountUser | null | "throw";
  admin?: boolean | "throw";
  lookup?: string | null | "throw";
  unlinkOk?: boolean;
  deleted?: number | "throw";
}

function setup(o: Opts = {}) {
  const calls: string[] = [];
  const logs: AccountLogEntry[] = [];
  const handler = createAccountHandler({
    allowedOrigins: [SITE],
    adminKey: o.adminKey === undefined ? KEY : o.adminKey,
    appId: o.appId ?? null,
    verifyUser: async (token) => {
      calls.push(`verify:${token}`);
      if (o.user === "throw") throw new Error("down");
      return o.user === undefined ? { id: TARGET, kakaoUserId: KAKAO_ID } : o.user;
    },
    isAdmin: async (token) => {
      calls.push(`isAdmin:${token}`);
      if (o.admin === "throw") throw new Error("down");
      return o.admin ?? true;
    },
    kakaoUserIdOf: async (id) => {
      calls.push(`lookup:${id}`);
      if (o.lookup === "throw") throw new Error("down");
      return o.lookup === undefined ? KAKAO_ID : o.lookup;
    },
    unlink: async (id) => {
      calls.push(`unlink:${id}`);
      return o.unlinkOk ?? true;
    },
    deleteByKakaoUserId: async (id) => {
      calls.push(`delete:${id}`);
      if (o.deleted === "throw") throw new Error("db");
      return o.deleted ?? 1;
    },
    log: (e) => logs.push(e),
    now: () => 0,
  });
  return { handler, calls, logs };
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(FN, {
    method: "POST",
    headers: { origin: SITE, "content-type": "application/json", authorization: "Bearer tok", ...headers },
    body: JSON.stringify(body),
  });

const hook = (method: "GET" | "POST", params: Record<string, string>, auth: string | null = `KakaoAK ${KEY}`) => {
  const qs = new URLSearchParams(params).toString();
  const headers: Record<string, string> = auth === null ? {} : { authorization: auth };
  return method === "GET"
    ? new Request(`${FN}/kakao-unlinked?${qs}`, { method, headers })
    : new Request(`${FN}/kakao-unlinked`, { method, headers: { ...headers, "content-type": "application/x-www-form-urlencoded" }, body: qs });
};

const NOTICE = { app_id: "123456", user_id: KAKAO_ID, referrer_type: "UNLINK_FROM_APPS" };

describe("account — 계정 삭제 전 카카오 연결 끊기(본인)", () => {
  it("키가 있으면 로그인 확인 → 카카오 회원번호로 끊고 unlinked", async () => {
    const { handler, calls, logs } = setup();
    const res = await handler(post({ action: "kakao-unlink-self" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, kakao: "unlinked" });
    expect(res.headers.get("access-control-allow-origin")).toBe(SITE);
    expect(calls).toEqual(["verify:tok", `unlink:${KAKAO_ID}`]);
    expect(logs).toEqual([{ fn: "account", status: 200, ms: 0, action: "kakao-unlink-self", code: "unlinked" }]);
  });

  it("키가 없으면(기능 꺼짐) 로그인만 확인하고 skipped — 카카오를 부르지 않는다", async () => {
    const { handler, calls } = setup({ adminKey: null });
    const res = await handler(post({ action: "kakao-unlink-self" }));
    expect(await res.json()).toEqual({ ok: true, kakao: "skipped" });
    expect(calls).toEqual(["verify:tok"]);
  });

  it("카카오가 끊기를 거절하면 failed, 카카오 로그인이 없으면 not_kakao", async () => {
    expect(await (await setup({ unlinkOk: false }).handler(post({ action: "kakao-unlink-self" }))).json()).toEqual({ ok: true, kakao: "failed" });
    const guest = setup({ user: { id: TARGET, kakaoUserId: null } });
    expect(await (await guest.handler(post({ action: "kakao-unlink-self" }))).json()).toEqual({ ok: true, kakao: "not_kakao" });
    expect(guest.calls).toEqual(["verify:tok"]);
  });

  it("토큰이 없거나 틀리면 401, 확인하지 못하면 503 — 카카오를 부르지 않는다", async () => {
    const none = setup();
    const res = await none.handler(new Request(FN, { method: "POST", headers: { origin: SITE }, body: '{"action":"kakao-unlink-self"}' }));
    expect(res.status).toBe(401);
    expect(none.calls).toEqual([]);
    const bad = setup({ user: null });
    expect((await bad.handler(post({ action: "kakao-unlink-self" }))).status).toBe(401);
    expect(bad.calls).toEqual(["verify:tok"]);
    expect((await setup({ user: "throw" }).handler(post({ action: "kakao-unlink-self" }))).status).toBe(503);
  });

  it("허용 밖 origin 403, preflight 204, GET 405, 모르는 action 400", async () => {
    const { handler, calls } = setup();
    expect((await handler(post({ action: "kakao-unlink-self" }, { origin: "https://evil.example" }))).status).toBe(403);
    const pre = await handler(new Request(FN, { method: "OPTIONS", headers: { origin: SITE } }));
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
    expect((await handler(new Request(FN, { method: "GET", headers: { origin: SITE } }))).status).toBe(405);
    expect((await handler(post({ action: "delete-everything" }))).status).toBe(400);
    expect((await handler(post("nope"))).status).toBe(400);
    expect(calls).toEqual([]);
  });
});

describe("account — 관리자 삭제 전 카카오 연결 끊기", () => {
  it("관리자(aal2)면 대상의 카카오 회원번호를 찾아 끊는다", async () => {
    const { handler, calls } = setup();
    const res = await handler(post({ action: "kakao-unlink-admin", target: TARGET.toUpperCase() }));
    expect(await res.json()).toEqual({ ok: true, kakao: "unlinked" });
    expect(calls).toEqual(["isAdmin:tok", `lookup:${TARGET}`, `unlink:${KAKAO_ID}`]);
  });

  it("관리자가 아니면 403 — 대상도 찾지 않는다. 확인 못 하면 503", async () => {
    const no = setup({ admin: false });
    expect((await no.handler(post({ action: "kakao-unlink-admin", target: TARGET }))).status).toBe(403);
    expect(no.calls).toEqual(["isAdmin:tok"]);
    expect((await setup({ admin: "throw" }).handler(post({ action: "kakao-unlink-admin", target: TARGET }))).status).toBe(503);
  });

  it("대상이 UUID가 아니면 400, 키가 없으면 skipped(대상을 찾지 않음), 카카오가 아니면 not_kakao, 찾기 실패 503", async () => {
    const bad = setup();
    expect((await bad.handler(post({ action: "kakao-unlink-admin", target: "x" }))).status).toBe(400);
    expect(bad.calls).toEqual([]);
    const off = setup({ adminKey: null });
    expect(await (await off.handler(post({ action: "kakao-unlink-admin", target: TARGET }))).json()).toEqual({ ok: true, kakao: "skipped" });
    expect(off.calls).toEqual(["isAdmin:tok"]);
    expect(await (await setup({ lookup: null }).handler(post({ action: "kakao-unlink-admin", target: TARGET }))).json()).toEqual({
      ok: true,
      kakao: "not_kakao",
    });
    expect((await setup({ lookup: "throw" }).handler(post({ action: "kakao-unlink-admin", target: TARGET }))).status).toBe(503);
  });
});

describe("account — 카카오 연결 해제 웹훅", () => {
  it("헤더가 KakaoAK <키>이면 그 회원번호의 계정을 지우고 200(GET·POST 모두)", async () => {
    for (const method of ["GET", "POST"] as const) {
      const { handler, calls, logs } = setup();
      const res = await handler(hook(method, NOTICE));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, deleted: 1 });
      expect(calls).toEqual([`delete:${KAKAO_ID}`]);
      expect(logs[0]).toEqual({ fn: "account", status: 200, ms: 0, action: "kakao-unlinked", code: "deleted" });
      expect(JSON.stringify(logs)).not.toContain(KAKAO_ID);
    }
  });

  it("키가 없거나(기능 꺼짐) 헤더가 다르면 401 — 아무것도 지우지 않는다", async () => {
    for (const [opts, auth] of [
      [{ adminKey: null }, `KakaoAK ${KEY}`],
      [{}, `KakaoAK ${KEY}x`],
      [{}, `Bearer ${KEY}`],
      [{}, null],
    ] as const) {
      const { handler, calls } = setup(opts);
      expect((await handler(hook("POST", NOTICE, auth))).status).toBe(401);
      expect(calls).toEqual([]);
    }
  });

  it("인증된 알림은 늘 200 — 파라미터가 틀리거나 다른 앱이거나 계정이 없거나 삭제가 실패해도(카카오 요구)", async () => {
    const bad = setup();
    expect((await bad.handler(hook("POST", { ...NOTICE, user_id: "abc" }))).status).toBe(200);
    expect(bad.calls).toEqual([]);
    const other = setup({ appId: "999" });
    const res = await other.handler(hook("GET", NOTICE));
    expect([res.status, await res.json()]).toEqual([200, { ok: true, code: "ignored" }]);
    expect(other.calls).toEqual([]);
    const sameApp = setup({ appId: "123456" });
    expect((await sameApp.handler(hook("GET", NOTICE))).status).toBe(200);
    expect(sameApp.calls).toEqual([`delete:${KAKAO_ID}`]);
    const none = setup({ deleted: 0 });
    expect(await (await none.handler(hook("GET", NOTICE))).json()).toEqual({ ok: true, deleted: 0 });
    const failed = setup({ deleted: "throw" });
    const f = await failed.handler(hook("GET", NOTICE));
    expect([f.status, await f.json()]).toEqual([200, { ok: false, code: "delete_failed" }]);
  });

  it("다른 메서드는 405", async () => {
    const { handler } = setup();
    expect((await handler(new Request(`${FN}/kakao-unlinked`, { method: "PUT", headers: { authorization: `KakaoAK ${KEY}` } }))).status).toBe(405);
  });
});

describe("account — 공용 도우미(_shared/kakao.ts)", () => {
  it("헤더 비교는 정확히 같을 때만, 키가 없으면 늘 거짓", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
    expect(kakaoWebhookAuthorized(`KakaoAK ${KEY}`, KEY)).toBe(true);
    expect(kakaoWebhookAuthorized(`KakaoAK ${KEY}`, null)).toBe(false);
  });

  it("웹훅 파라미터 — 필수 셋과 숫자 회원번호", () => {
    expect(parseKakaoUnlinkNotice(new URLSearchParams(NOTICE))).toEqual({ appId: "123456", userId: KAKAO_ID, referrerType: "UNLINK_FROM_APPS" });
    expect(parseKakaoUnlinkNotice(new URLSearchParams({ ...NOTICE, referrer_type: "" }))).toBeNull();
    expect(parseKakaoUnlinkNotice(new URLSearchParams({ app_id: "1", user_id: "1 or 1=1", referrer_type: "X" }))).toBeNull();
  });

  it("카카오 회원번호는 카카오 identity에서만 — provider_id·id·identity_data 순", () => {
    expect(kakaoUserIdOf([{ provider: "anonymous", id: "1" }, { provider: "kakao", id: KAKAO_ID }])).toBe(KAKAO_ID);
    expect(kakaoUserIdOf([{ provider: "kakao", id: "not-number", identity_data: { sub: KAKAO_ID } }])).toBe(KAKAO_ID);
    expect(kakaoUserIdOf([{ provider: "anonymous", id: "123" }])).toBeNull();
    expect(kakaoUserIdOf(null)).toBeNull();
  });

  it("공개 키 — 새 방식 default 먼저, 없으면 예전 anon", () => {
    expect(pickPublishableKey('{"default":"sb_publishable_x"}', "anon")).toBe("sb_publishable_x");
    expect(pickPublishableKey("", "anon")).toBe("anon");
    expect(pickPublishableKey(null, null)).toBeNull();
  });
});

describe("account — 바깥 연결(adapters.ts)", () => {
  it("카카오 끊기 — 어드민 키 머리글·폼 본문, 응답 id가 같을 때만 true", async () => {
    const seen: { url: string; init: Parameters<FetchLike>[1] }[] = [];
    const fetchOk: FetchLike = async (url, init) => {
      seen.push({ url, init });
      return { ok: true, json: async () => ({ id: Number(KAKAO_ID) }) };
    };
    expect(await createKakaoUnlink(fetchOk, KEY)(KAKAO_ID)).toBe(true);
    expect(seen[0].url).toBe(KAKAO_UNLINK_URL);
    expect(seen[0].init.headers).toEqual({ Authorization: `KakaoAK ${KEY}`, "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" });
    expect(seen[0].init.body).toBe(`target_id_type=user_id&target_id=${KAKAO_ID}`);

    const other: FetchLike = async () => ({ ok: true, json: async () => ({ id: 1 }) });
    expect(await createKakaoUnlink(other, KEY)(KAKAO_ID)).toBe(false);
    const http401: FetchLike = async () => ({ ok: false, json: async () => ({ code: -401 }) });
    expect(await createKakaoUnlink(http401, KEY)(KAKAO_ID)).toBe(false);
    const thrown: FetchLike = async () => {
      throw new Error("network");
    };
    expect(await createKakaoUnlink(thrown, KEY)(KAKAO_ID)).toBe(false);
    expect(await createKakaoUnlink(fetchOk, null)(KAKAO_ID)).toBe(false);
  });

  it("카카오 끊기 — 시간 제한이 지나면 끊어 false", async () => {
    const hang: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted"))));
    expect(await createKakaoUnlink(hang, KEY, 5)(KAKAO_ID)).toBe(false);
  });

  it("로그인 확인 — 토큰 거절은 null, 그 밖의 오류는 throw, 카카오 회원번호를 함께", async () => {
    const ok = createVerifyAccountUser({
      getUser: async () => ({ data: { user: { id: TARGET, identities: [{ provider: "kakao", id: KAKAO_ID }] } }, error: null }),
    });
    expect(await ok("t")).toEqual({ id: TARGET, kakaoUserId: KAKAO_ID });
    const rejected = createVerifyAccountUser({ getUser: async () => ({ data: { user: null }, error: { code: "bad_jwt", status: 403 } }) });
    expect(await rejected("t")).toBeNull();
    const down = createVerifyAccountUser({ getUser: async () => ({ data: { user: null }, error: { status: 500 } }) });
    await expect(down("t")).rejects.toThrow();
    await expect(createVerifyAccountUser(null)("t")).rejects.toThrow();
  });

  it("대상 찾기 — 404는 null, 그 밖의 오류는 throw", async () => {
    const found = createKakaoUserIdLookup({ getUserById: async () => ({ data: { user: { id: TARGET, identities: [{ provider: "kakao", id: KAKAO_ID }] } }, error: null }) });
    expect(await found(TARGET)).toBe(KAKAO_ID);
    const gone = createKakaoUserIdLookup({ getUserById: async () => ({ data: { user: null }, error: { status: 404 } }) });
    expect(await gone(TARGET)).toBeNull();
    const down = createKakaoUserIdLookup({ getUserById: async () => ({ data: { user: null }, error: { status: 500 } }) });
    await expect(down(TARGET)).rejects.toThrow();
  });

  it("관리자 확인 — 그 사용자 토큰으로 is_admin, 정확히 true일 때만", async () => {
    const asked: string[] = [];
    const yes = createIsAdmin(async (token, fn) => {
      asked.push(`${fn}:${token}`);
      return { data: true, error: null };
    });
    expect(await yes("tok")).toBe(true);
    expect(asked).toEqual(["is_admin:tok"]);
    expect(await createIsAdmin(async () => ({ data: "true", error: null }))("tok")).toBe(false);
    await expect(createIsAdmin(async () => ({ data: null, error: { code: "x" } }))("tok")).rejects.toThrow();
  });

  it("웹훅 삭제 — 0017 함수에 회원번호만, 지운 수", async () => {
    const asked: unknown[] = [];
    const del = createDeleteByKakaoUserId(async (fn, args) => {
      asked.push([fn, args]);
      return { data: 1, error: null };
    });
    expect(await del(KAKAO_ID)).toBe(1);
    expect(asked).toEqual([["delete_user_by_kakao_id", { p_kakao_id: KAKAO_ID }]]);
    expect(await del("abc")).toBe(0);
    await expect(createDeleteByKakaoUserId(async () => ({ data: null, error: { code: "42501" } }))(KAKAO_ID)).rejects.toThrow();
  });
});
