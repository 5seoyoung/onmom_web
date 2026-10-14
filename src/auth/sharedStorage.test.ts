// 한 브라우저 저장소를 함께 쓰는 통합 시험 — 스토어(persistence)·동기화 표시(marks)·로그인 흐름 표시(flow)·Supabase 세션(진짜 supabase-js)이
// 같은 메모리 저장소(createMemoryStorage)를 쓴다. session.test.ts의 가짜 클라이언트는 세션을 메모리에 들고 있어서, 스토어가 저장소를 비울 때
// 방금 쓴 세션("onmom.web.auth")까지 지우는 일을 보지 못했다. 여기서는 supabase-js가 실제로 그 키에 쓰고 읽는다(서버만 가짜 fetch).
//
// 가짜 서버: Auth(PKCE 교환·익명 가입·로그아웃) + PostgREST user_states(RLS — 사용자 토큰이 없으면 anon: 표 권한이 없어 401/42501).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CURRENT_CONSENT_VERSION } from "@/domain/consent";
import type { PersistedState } from "@/domain/types";
import { createAppStore, rootScreenFor, type AppStore } from "@/store/appStore";
import { initialState } from "@/store/defaults";
import { createMemoryStorage, createStoragePersistence, type StorageLike } from "@/store/persistence";
import { createStorageSyncMarks } from "@/store/sync/marks";
import { createAuthFlowStore } from "./authFlow";
import { AUTH_STORAGE_KEY, createSupabaseClientIfConfigured } from "./client";
import { createSupabaseRemote } from "./remote";
import { createAuthSessionManager, type AuthSessionManager } from "./session";

const SUPABASE_URL = "https://test-ref.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_test-key-not-a-secret";
const ORIGIN = "https://5seoyoung.github.io";
const CALLBACK = `${ORIGIN}/auth/callback/`;

const PREVIOUS_ACCOUNT = "kakao-1111111111";
const NEW_MEMBER = "2222222222";
const NEW_KAKAO_USER_ID = "3f0f9b2e-0000-4000-8000-0000000000b2";

interface ServerUser {
  id: string;
  aud: string;
  role: string;
  is_anonymous: boolean;
  created_at: string;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
  identities: { provider: string; id: string; identity_data: Record<string, unknown> }[];
}
interface ServerRow {
  state: unknown;
  schema_version: number;
  updated_at: string;
}

function kakaoUser(memberId: string, userId: string): ServerUser {
  const data = { provider_id: memberId, sub: memberId, name: "새 사람" };
  return {
    id: userId,
    aud: "authenticated",
    role: "authenticated",
    is_anonymous: false,
    created_at: "2026-01-01T00:00:00.000Z",
    app_metadata: { provider: "kakao", providers: ["kakao"] },
    user_metadata: data,
    identities: [{ provider: "kakao", id: memberId, identity_data: data }],
  };
}

/** 가짜 Supabase 서버 — supabase-js가 보내는 요청에 답한다. 사용자 토큰 없이(anon) user_states에 오면 표 권한 없음(401). */
function fakeSupabaseServer() {
  const tokens = new Map<string, ServerUser>();
  const rows = new Map<string, ServerRow>();
  const codes = new Map<string, ServerUser>();
  /** user_states 요청 — 누구의 토큰으로 왔는지(anon이면 null) */
  const restCalls: { method: string; userId: string | null }[] = [];
  let anonCount = 0;
  let tick = 0;

  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const sessionFor = (user: ServerUser) => {
    const access = `at-${user.id}-${++tick}`;
    tokens.set(access, user);
    return { access_token: access, token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: `rt-${tick}`, user };
  };
  const stamp = () => `2026-10-01T00:00:${String(++tick).padStart(2, "0")}.000000+00:00`;

  async function fetchImpl(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers);
    const bearer = headers.get("Authorization")?.replace(/^Bearer /, "") ?? null;
    const body = typeof init?.body === "string" && init.body.length > 0 ? (JSON.parse(init.body) as Record<string, unknown>) : {};

    if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "pkce") {
      const user = codes.get(String(body.auth_code));
      if (!user || typeof body.code_verifier !== "string" || body.code_verifier.length === 0) {
        return json(400, { code: "bad_code_verifier", error_code: "bad_code_verifier", msg: "invalid" });
      }
      codes.delete(String(body.auth_code));
      return json(200, sessionFor(user));
    }
    if (url.pathname === "/auth/v1/signup") {
      anonCount += 1;
      const user: ServerUser = {
        id: `a0000000-0000-4000-8000-00000000000${anonCount}`,
        aud: "authenticated",
        role: "authenticated",
        is_anonymous: true,
        created_at: "2026-01-01T00:00:00.000Z",
        app_metadata: { provider: "anonymous", providers: [] },
        user_metadata: {},
        identities: [],
      };
      return json(200, sessionFor(user));
    }
    if (url.pathname === "/auth/v1/logout") return new Response(null, { status: 204 });
    if (url.pathname === "/rest/v1/user_states") {
      const user = bearer === null ? undefined : tokens.get(bearer);
      restCalls.push({ method, userId: user?.id ?? null });
      // anon 역할에는 user_states 권한이 없다(0001_user_states.sql revoke … from anon)
      if (!user) return json(401, { code: "42501", details: null, hint: null, message: "permission denied for table user_states" });
      if (method === "GET") {
        const row = rows.get(user.id);
        return json(200, row ? [row] : []);
      }
      if (method === "POST") {
        if (rows.has(user.id)) return json(409, { code: "23505", details: null, hint: null, message: "duplicate key" });
        const row: ServerRow = { state: body.state, schema_version: Number(body.schema_version), updated_at: stamp() };
        rows.set(user.id, row);
        return json(201, { updated_at: row.updated_at });
      }
      if (method === "PATCH") {
        const row = rows.get(user.id);
        if (!row || url.searchParams.get("updated_at") !== `eq.${row.updated_at}`) return json(200, []);
        const next: ServerRow = { state: body.state, schema_version: Number(body.schema_version), updated_at: stamp() };
        rows.set(user.id, next);
        return json(200, [{ updated_at: next.updated_at }]);
      }
    }
    return json(404, { message: `unexpected ${method} ${url.pathname}` });
  }

  return { fetch: fetchImpl, rows, codes, restCalls };
}

/** 지금 판에 동의하고 온보딩을 마친 상태 */
function onboarded(owner: string, over: Partial<PersistedState> = {}): PersistedState {
  const s = initialState();
  return {
    ...s,
    hasOnboarded: true,
    ownerAccountID: owner,
    profile: {
      ...s.profile,
      consentAccepted: true,
      consentVersion: CURRENT_CONSENT_VERSION,
      consentAcceptedAt: "2026-09-01T00:00:00.000Z",
      deliveryDate: "2026-08-01",
      deliveryMethod: "vaginal",
    },
    ...over,
  };
}

let storage: StorageLike;
let manager: AuthSessionManager | null = null;

/** 이 "브라우저" — 스토어·표시·Supabase 세션이 모두 같은 저장소를 쓴다 */
function browser(server: ReturnType<typeof fakeSupabaseServer>) {
  const client = createSupabaseClientIfConfigured({ url: SUPABASE_URL, anonKey: PUBLISHABLE_KEY }, (url, key, options) =>
    createClient(url, key, {
      ...options,
      // 저장 키·PKCE는 앱 설정(SUPABASE_CLIENT_OPTIONS) 그대로, 저장소만 이 시험의 공유 저장소로. 자동 갱신 타이머는 끈다.
      auth: { ...options.auth, storage, autoRefreshToken: false },
      global: { fetch: server.fetch },
    }),
  ) as SupabaseClient;
  let n = 0;
  const store = createAppStore({ persistence: createStoragePersistence(() => storage), now: () => new Date(), newId: () => `id-${++n}` });
  store.load();
  manager = createAuthSessionManager({
    isConfigured: () => true,
    getClient: async () => client,
    hasStoredSession: () => storage.getItem(AUTH_STORAGE_KEY) !== null,
    createRemote: createSupabaseRemote,
    marks: createStorageSyncMarks(() => storage),
    flow: createAuthFlowStore(() => storage),
    captcha: async () => ({ kind: "none" }),
    origin: () => ORIGIN,
    replaceUrl: () => {},
    firstFetchTimeoutMs: 3_000,
    engineOptions: { onPageHide: () => () => {}, debounceMs: 10, retryDelaysMs: [60_000] },
  });
  return { client, store, manager };
}

/** 앞사람(다른 카카오 계정)이 이 브라우저에 기록을 남기고 로그아웃했다(세션 만료 등 — 기록은 남는다) */
function previousPersonLeftRecords(store: AppStore) {
  store.actions.signIn({ id: PREVIOUS_ACCOUNT, name: "앞사람", provider: "kakao" });
  store.actions.updateProfile({ deliveryDate: "2026-07-01", consentAccepted: true, consentVersion: CURRENT_CONSENT_VERSION, consentAcceptedAt: new Date().toISOString() });
  store.actions.completeOnboarding();
  store.actions.addSymptomRecord({ lochiaIncreased: false, lochiaRed: false, feverEvent: false, painNrs: 6, redFlagCode: null, postpartumDays: 70 });
  store.actions.signOut();
  expect(store.getSnapshot().state.symptomHistory).toHaveLength(1);
}

async function waitFor(check: () => boolean, ms = 2_000) {
  const until = Date.now() + ms;
  while (!check()) {
    if (Date.now() > until) throw new Error("기다리던 상태가 오지 않았다");
    await new Promise((r) => setTimeout(r, 5));
  }
}

beforeEach(() => {
  storage = createMemoryStorage();
});
afterEach(() => {
  manager?.stopSync();
  manager = null;
});

describe("다른 사람의 기록이 남은 브라우저에서 로그인 — 앞사람의 기록만 지우고 방금 만든 로그인 세션은 남긴다", () => {
  it("카카오 로그인 콜백: 세션이 남아 서버 기록을 사용자 토큰으로 읽는다(anon으로 401이 나지 않는다)", async () => {
    const server = fakeSupabaseServer();
    const newUser = kakaoUser(NEW_MEMBER, NEW_KAKAO_USER_ID);
    server.codes.set("abc", newUser);
    // 이미 가입해 온보딩까지 마친 사람이 이 공용 브라우저에서 로그인한다
    server.rows.set(NEW_KAKAO_USER_ID, { state: onboarded(`kakao-${NEW_MEMBER}`), schema_version: 1, updated_at: "2026-09-30T00:00:00.000000+00:00" });
    const { client, store, manager } = browser(server);
    previousPersonLeftRecords(store);

    // [카카오로 시작하기] — supabase-js가 PKCE code_verifier를 이 저장소에 쓴다(Node라 주소 이동은 없다)
    expect(await manager.signInWithKakao(store)).toEqual({ ok: true });
    expect(storage.getItem(`${AUTH_STORAGE_KEY}-code-verifier`)).not.toBeNull();

    const outcome = await manager.completeCallback(store, `${CALLBACK}?code=abc`);
    expect(outcome).toEqual({ kind: "signedIn", sync: "ok", linked: false });

    // 앞사람의 기록은 지웠다
    const snap = store.getSnapshot();
    expect(snap.account?.id).toBe(`kakao-${NEW_MEMBER}`);
    expect(snap.state.symptomHistory).toHaveLength(0);
    expect(snap.state.ownerAccountID).toBe(`kakao-${NEW_MEMBER}`);
    // 방금 만든 세션은 남았다 — 저장소에도, supabase-js에도
    expect(storage.getItem(AUTH_STORAGE_KEY)).not.toBeNull();
    expect((await client.auth.getSession()).data.session?.user.id).toBe(NEW_KAKAO_USER_ID);
    // 서버 기록을 이 사람의 토큰으로 읽었다 → 홈으로(온보딩·"서버 기록을 읽지 못함"이 아니다)
    expect(server.restCalls[0]).toEqual({ method: "GET", userId: NEW_KAKAO_USER_ID });
    expect(server.restCalls.some((c) => c.userId === null)).toBe(false);
    expect(rootScreenFor(snap, true)).toBe("main");
  });

  it("[게스트로 시작]: 익명 세션이 남아 그 게스트의 행을 그 토큰으로 만든다(익명 계정이 버려지지 않는다)", async () => {
    const server = fakeSupabaseServer();
    const { client, store, manager } = browser(server);
    previousPersonLeftRecords(store);

    expect(await manager.signInGuest(store)).toEqual({ ok: true, mode: "anonymous" });
    const anonUser = (await client.auth.getSession()).data.session?.user;
    expect(anonUser?.is_anonymous).toBe(true);
    expect(storage.getItem(AUTH_STORAGE_KEY)).not.toBeNull();
    const snap = store.getSnapshot();
    expect(snap.account?.id).toBe(`guest-${anonUser?.id}`);
    expect(snap.state.symptomHistory).toHaveLength(0); // 앞사람의 기록은 지웠다
    expect(rootScreenFor(snap, true)).toBe("onboarding");

    // 온보딩 동의 → 그 게스트의 서버 행을 익명 사용자 토큰으로 만든다
    store.actions.updateProfile({ deliveryDate: "2026-08-10", consentAccepted: true, consentVersion: CURRENT_CONSENT_VERSION, consentAcceptedAt: new Date().toISOString() });
    store.actions.completeOnboarding();
    await waitFor(() => server.rows.has(anonUser!.id));
    expect(server.restCalls.every((c) => c.userId === anonUser?.id)).toBe(true);
    expect(manager.syncStatus()).toBe("synced");
  });

  it("계정 삭제는 지금처럼 로그인 세션까지 이 브라우저에서 전부 지운다", async () => {
    const server = fakeSupabaseServer();
    const { store } = browser(server);
    previousPersonLeftRecords(store);
    storage.setItem(AUTH_STORAGE_KEY, "{}");
    storage.setItem(`${AUTH_STORAGE_KEY}-user`, "{}");
    store.actions.deleteAccount();
    const left = Array.from({ length: storage.length }, (_, i) => storage.key(i));
    expect(left).toEqual([]);
  });
});
