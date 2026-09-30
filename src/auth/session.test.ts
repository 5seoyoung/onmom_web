import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CURRENT_CONSENT_VERSION } from "@/domain/consent";
import type { PersistedState } from "@/domain/types";
import { createAppStore, rootScreenFor, type AppStore } from "@/store/appStore";
import { initialState } from "@/store/defaults";
import { createMemoryStorage, createStoragePersistence, STORAGE_PREFIX, type StorageLike } from "@/store/persistence";
import { createStorageSyncMarks, type SyncMarks } from "@/store/sync/marks";
import { FakeRemote } from "@/store/sync/testUtils";
import { AUTH_FLOW_KEY, createAuthFlowStore, type AuthFlowStore } from "./authFlow";
import { adoptsLocalRecords, createAuthSessionManager, type AuthSessionManager } from "./session";
import type { CaptchaResult } from "./turnstile";

const START = new Date("2026-09-28T12:00:00+09:00");
/** 스토어·세션이 함께 보는 시계 — 동의 시각과 가져온 시각의 앞뒤를 나누려고 움직인다 */
let clock = START;
function tick(minutes: number) {
  clock = new Date(clock.getTime() + minutes * 60_000);
}

const KAKAO_USER_ID = "3f0f9b2e-0000-4000-8000-000000000001";
const MEMBER = "4012345678";
const KAKAO_ACCOUNT = `kakao-${MEMBER}`;
const CALLBACK = "https://5seoyoung.github.io/onmom_web/auth/callback/";
const REDIRECT = "https://5seoyoung.github.io/auth/callback/"; // 테스트는 basePath 없이 돈다(NEXT_PUBLIC_BASE_PATH 미설정)

// Supabase Auth가 돌려주는 사용자 모양 — 테스트 입력용
interface FakeUser {
  id: string;
  is_anonymous: boolean;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
  identities: { provider: string; id: string; identity_data: Record<string, unknown> }[];
}
interface FakeSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: FakeUser;
}

function session(user: FakeUser): FakeSession {
  return { access_token: `t-${user.id}`, refresh_token: "r", expires_in: 3600, token_type: "bearer", user };
}
/** 카카오 사용자 — userId는 Supabase 사용자 id(연결된 게스트면 게스트의 id 그대로) */
function kakaoSession(memberId = MEMBER, nickname = "해님", userId = KAKAO_USER_ID): FakeSession {
  const data = { provider_id: memberId, sub: memberId, name: nickname };
  return session({
    id: userId,
    is_anonymous: false,
    app_metadata: { provider: "kakao" },
    user_metadata: data,
    identities: [{ provider: "kakao", id: memberId, identity_data: data }],
  });
}
function anonSession(userId: string): FakeSession {
  return session({ id: userId, is_anonymous: true, app_metadata: { provider: "anonymous" }, user_metadata: {}, identities: [] });
}

type AnonError = { code?: string; status?: number; message: string };

/** supabase-js 클라이언트 흉내 — 쓰는 메서드만. 세션은 이 "브라우저"의 저장된 세션이다(페이지를 다시 열어도 같은 객체를 넘긴다). */
function fakeClient(
  init: {
    session?: FakeSession | null;
    /** code → 교환 결과 세션 */
    codes?: Record<string, FakeSession>;
    rpcFails?: boolean;
    getSessionFails?: number;
    anonError?: AnonError;
    linkError?: boolean;
    /** delete_my_account 성공 — 그 사용자 id */
    onDeleteUser?: (userId: string) => void;
    /** 서버(getUser)에서 본 지금 사용자 — 없으면 저장된 세션의 사용자 그대로. null이면 getUser 실패 */
    serverUser?: (current: FakeUser) => FakeUser | null;
  } = {},
) {
  let current: FakeSession | null = init.session ?? null;
  let getSessionFails = init.getSessionFails ?? 0;
  let anonCount = 0;
  const calls: string[] = [];
  const listeners: ((event: string, session: FakeSession | null) => void)[] = [];
  const emit = (event: string) => {
    for (const l of [...listeners]) l(event, current);
  };
  const client = {
    auth: {
      async exchangeCodeForSession(code: string) {
        calls.push(`exchange:${code}`);
        const next = init.codes?.[code];
        if (!next) return { data: { session: null, user: null }, error: { message: "invalid" } };
        current = next;
        emit("SIGNED_IN");
        return { data: { session: current, user: current.user }, error: null };
      },
      async getSession() {
        if (getSessionFails > 0) {
          getSessionFails -= 1; // 만료된 토큰 갱신이 네트워크 문제로 실패한 경우
          return { data: { session: null }, error: { message: "network" } };
        }
        return { data: { session: current }, error: null };
      },
      async signOut(opts?: { scope?: string }) {
        calls.push(`signOut:${opts?.scope}`);
        current = null;
        emit("SIGNED_OUT");
        return { error: null };
      },
      async signInWithOAuth(c: { provider: string; options: { redirectTo: string } }) {
        calls.push(`oauth:${c.provider}:${c.options.redirectTo}`);
        return { data: { provider: c.provider, url: "https://kauth.kakao.com/x" }, error: null };
      },
      async linkIdentity(c: { provider: string; options: { redirectTo: string } }) {
        calls.push(`link:${c.provider}:${c.options.redirectTo}:${current?.user.id ?? "-"}`);
        if (init.linkError || current === null) return { data: { provider: c.provider, url: null }, error: { code: "manual_linking_disabled", message: "x" } };
        return { data: { provider: c.provider, url: "https://kauth.kakao.com/x" }, error: null };
      },
      async signInAnonymously(creds?: { options?: { captchaToken?: string } }) {
        calls.push(`anon:${creds?.options?.captchaToken ?? "-"}`);
        if (init.anonError) return { data: { session: null, user: null }, error: init.anonError };
        anonCount += 1;
        current = anonSession(`a0000000-0000-4000-8000-00000000000${anonCount}`);
        emit("SIGNED_IN");
        return { data: { session: current, user: current.user }, error: null };
      },
      async getUser() {
        calls.push("getUser");
        const user = current === null ? null : init.serverUser ? init.serverUser(current.user) : current.user;
        return user === null ? { data: { user: null }, error: { message: "network" } } : { data: { user }, error: null };
      },
      onAuthStateChange(cb: (event: string, session: FakeSession | null) => void) {
        listeners.push(cb);
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
    async rpc(name: string) {
      const who = current?.user.id ?? "-";
      calls.push(`rpc:${name}:${who}`);
      if (init.rpcFails) return { data: null, error: { message: "network" } };
      if (name === "delete_my_account" && current) init.onDeleteUser?.(current.user.id);
      return { data: null, error: null };
    },
  };
  return {
    client: client as unknown as SupabaseClient,
    calls,
    hasSession: () => current !== null,
    currentUserId: () => current?.user.id ?? null,
    emit,
  };
}
type FakeClient = ReturnType<typeof fakeClient>;

/** 이 테스트의 브라우저 저장소 — 스토어·동기화 표시·로그인 흐름 표시가 같이 쓴다 */
let storage: StorageLike = createMemoryStorage();

function setupStore(): AppStore {
  let n = 0;
  const store = createAppStore({ persistence: createStoragePersistence(() => storage), now: () => clock, newId: () => `id-${++n}` });
  store.load();
  return store;
}

const CONSENT_NOW = () => ({ consentAccepted: true, consentVersion: CURRENT_CONSENT_VERSION, consentAcceptedAt: clock.toISOString() });

/** 서버 행 — 지금 판에 동의하고 온보딩을 마친 카카오 계정 */
function onboardedState(over: Partial<PersistedState> = {}): PersistedState {
  const s = initialState();
  return {
    ...s,
    hasOnboarded: true,
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

/** 온보딩 동의 단계(서버 저장 동의 문구) — 동의 칸을 지금 판으로 저장한 뒤 완료 */
function onboardWithConsent(store: AppStore) {
  store.actions.updateProfile({ deliveryDate: "2026-08-10", deliveryMethod: "cesarean", ...CONSENT_NOW() });
  store.actions.completeOnboarding();
}

function symptomInput(painNrs = 4) {
  return { lochiaIncreased: false, lochiaRed: false, feverEvent: false, painNrs, redFlagCode: null, postpartumDays: 30 };
}

let manager: AuthSessionManager | null = null;
interface Ctx {
  manager: AuthSessionManager;
  fc: FakeClient;
  /** Supabase 사용자 id → 그 사람의 서버 행 */
  remoteOf: (userId: string) => FakeRemote;
  getClient: ReturnType<typeof vi.fn>;
  replaceUrl: ReturnType<typeof vi.fn>;
  captcha: ReturnType<typeof vi.fn>;
  marks: SyncMarks;
  flow: AuthFlowStore;
  goOnline: () => void;
  onlineListeners: () => number;
}

function setup(
  opts: {
    configured?: boolean;
    client?: FakeClient;
    remotes?: Map<string, FakeRemote>;
    /** 저장된 세션이 있다고 볼지 — 없으면 가짜 클라이언트의 세션을 따른다 */
    storedSession?: boolean;
    clientUnavailable?: number;
    captcha?: CaptchaResult;
    beforeSignOut?: () => Promise<unknown>;
    /** 저장된 세션 지우기(forgetStoredSession)를 호출 기록에 "forget"으로 남긴다 — 없으면 의존성을 넘기지 않는다 */
    trackForget?: boolean;
  } = {},
): Ctx {
  const remotes = opts.remotes ?? new Map<string, FakeRemote>();
  const remoteOf = (userId: string) => {
    let r = remotes.get(userId);
    if (!r) {
      r = new FakeRemote();
      remotes.set(userId, r);
    }
    return r;
  };
  const fc = opts.client ?? fakeClient();
  let clientUnavailable = opts.clientUnavailable ?? 0;
  const getClient = vi.fn(async () => {
    if (clientUnavailable > 0) {
      clientUnavailable -= 1; // supabase-js 번들을 받지 못했다(오프라인)
      return null;
    }
    return fc.client;
  });
  const replaceUrl = vi.fn();
  const captcha = vi.fn(async (): Promise<CaptchaResult> => opts.captcha ?? { kind: "none" });
  const online = new Set<() => void>();
  const marks = createStorageSyncMarks(() => storage);
  const flow = createAuthFlowStore(() => storage, () => clock);
  manager = createAuthSessionManager({
    isConfigured: () => opts.configured ?? true,
    getClient,
    hasStoredSession: () => opts.storedSession ?? fc.hasSession(),
    createRemote: (_client, userId) => remoteOf(userId),
    marks,
    flow,
    captcha,
    now: () => clock,
    onOnline: (l) => {
      online.add(l);
      return () => online.delete(l);
    },
    origin: () => "https://5seoyoung.github.io",
    replaceUrl,
    firstFetchTimeoutMs: 5_000,
    flushTimeoutMs: 5_000,
    beforeSignOut: opts.beforeSignOut,
    forgetStoredSession: opts.trackForget ? () => void fc.calls.push("forget") : undefined,
  });
  const goOnline = () => {
    for (const l of [...online]) l();
  };
  return { manager, fc, remoteOf, getClient, replaceUrl, captcha, marks, flow, goOnline, onlineListeners: () => online.size };
}

const keys = (s: StorageLike) => Array.from({ length: s.length }, (_, i) => s.key(i)!).filter((k) => k.startsWith(STORAGE_PREFIX));

beforeEach(() => {
  storage = createMemoryStorage();
  clock = START;
  vi.useFakeTimers();
});
afterEach(() => {
  manager?.stopSync();
  manager = null;
  vi.useRealTimers();
});

describe("설정이 없으면 — 지금까지와 같다(네트워크 없음)", () => {
  it("게스트는 이 브라우저 전용, 카카오 로그인·콜백·로그아웃·삭제가 Supabase를 부르지 않는다", async () => {
    const { manager, getClient, captcha } = setup({ configured: false });
    const store = setupStore();
    expect(await manager.signInWithKakao(store)).toEqual({ ok: false, reason: "notConfigured" });
    expect(await manager.completeCallback(store, `${CALLBACK}?code=abc`)).toEqual({ kind: "error", reason: "notConfigured" });
    expect(await manager.restore(store)).toBe("done");

    expect(await manager.signInGuest(store)).toEqual({ ok: true, mode: "local" });
    const guest = store.getSnapshot().account;
    expect(guest?.provider).toBe("guest");
    store.actions.completeOnboarding();
    expect(rootScreenFor(store.getSnapshot(), false)).toBe("main"); // 판 없는 동의로도 메인(설정 없음)
    expect(await manager.signOut(store)).toEqual({ ok: true, localDataErased: false });
    expect(store.getSnapshot().account).toBeNull();
    expect(store.getSnapshot().state.hasOnboarded).toBe(true); // 기록은 남는다

    await manager.signInGuest(store);
    expect(store.getSnapshot().account?.id).toBe(guest?.id); // 같은 브라우저 게스트 id
    expect(await manager.deleteAccount(store)).toEqual({ ok: true });
    expect(store.getSnapshot().state.hasOnboarded).toBe(false);
    expect(getClient).not.toHaveBeenCalled();
    expect(captcha).not.toHaveBeenCalled();
  });
});

describe("게스트로 시작 = Supabase 익명 계정", () => {
  it("익명 계정으로 시작 → 온보딩. 지금 판에 동의하기 전에는 아무것도 올리지 않고, 동의 뒤 그 게스트의 행을 만든다", async () => {
    const { manager, fc, remoteOf } = setup();
    const store = setupStore();
    expect(await manager.signInGuest(store)).toEqual({ ok: true, mode: "anonymous" });
    expect(fc.calls).toEqual(["anon:-"]); // 사이트 키가 없으면 토큰 없이
    const anonId = fc.currentUserId()!;
    expect(store.getSnapshot().account).toEqual({ id: `guest-${anonId}`, name: null, provider: "guest" });
    expect(rootScreenFor(store.getSnapshot(), true)).toBe("onboarding");

    await vi.advanceTimersByTimeAsync(10_000);
    const remote = remoteOf(anonId);
    expect(remote.calls).toEqual(["fetch"]); // 읽기만
    expect(manager.syncStatus()).toBe("waitingConsent");

    onboardWithConsent(store);
    expect(rootScreenFor(store.getSnapshot(), true)).toBe("main");
    await vi.advanceTimersByTimeAsync(1_500);
    expect(remote.writes()).toEqual(["insert"]);
    expect(remote.serverState().profile.consentVersion).toBe(CURRENT_CONSENT_VERSION);
    expect(manager.syncStatus()).toBe("synced");
  });

  it("Turnstile 사이트 키가 있으면 받은 토큰을 captchaToken으로 넘긴다", async () => {
    const { manager, fc } = setup({ captcha: { kind: "token", token: "tok-1" } });
    const store = setupStore();
    await manager.signInGuest(store);
    expect(fc.calls).toEqual(["anon:tok-1"]);
  });

  it("사람 확인에 실패하면 익명 로그인을 부르지 않고 이 브라우저 전용 게스트로 시작한다(잠시 쉬었다 다음 방문에 옮긴다)", async () => {
    const { manager, fc, flow } = setup({ captcha: { kind: "failed" } });
    const store = setupStore();
    expect(await manager.signInGuest(store)).toEqual({ ok: true, mode: "local" });
    expect(fc.calls).toEqual([]);
    expect(store.getSnapshot().account?.provider).toBe("guest");
    expect(flow.anonPaused()).toBe(true);
  });

  it("익명 로그인이 꺼져 있으면(anonymous_provider_disabled) 이 브라우저 전용 게스트 — 하루 동안 다시 요청하지 않는다", async () => {
    const { manager, fc, getClient } = setup({ client: fakeClient({ anonError: { code: "anonymous_provider_disabled", status: 422, message: "x" } }) });
    const store = setupStore();
    expect(await manager.signInGuest(store)).toEqual({ ok: true, mode: "local" });
    expect(store.getSnapshot().account?.provider).toBe("guest");
    getClient.mockClear();
    expect(await manager.restore(store)).toBe("done"); // 쉬는 중 — Supabase를 부르지 않는다
    expect(getClient).not.toHaveBeenCalled();
    expect(fc.calls).toEqual(["anon:-"]);
  });
});

describe("예전 브라우저 전용 게스트 — 설정이 켜진 뒤 처음 방문", () => {
  /** 설정이 없던 빌드에서 쓰던 게스트("내 기기에만 저장" 동의 — 판 없음) */
  function legacyGuest(): AppStore {
    const store = setupStore();
    store.actions.signInGuest();
    store.actions.completeOnboarding();
    store.actions.addSymptomRecord(symptomInput(3));
    return store;
  }

  it("익명 계정을 만들어 기록을 옮기고, 다시 동의받기 전에는 올리지 않는다", async () => {
    const old = legacyGuest();
    const oldId = old.getSnapshot().account!.id;
    const { manager, fc, remoteOf } = setup();
    const store = setupStore(); // 설정이 켜진 빌드로 다시 연 페이지
    expect(rootScreenFor(store.getSnapshot(), true)).toBe("consent"); // 관문은 바로 다시 동의 화면으로

    expect(await manager.restore(store)).toBe("done");
    const anonId = fc.currentUserId()!;
    expect(fc.calls).toEqual(["anon:-"]);
    const snap = store.getSnapshot();
    expect(snap.account).toEqual({ id: `guest-${anonId}`, name: null, provider: "guest" });
    expect(snap.account!.id).not.toBe(oldId);
    expect(snap.state.symptomHistory).toHaveLength(1); // 기록은 그대로
    expect(snap.state.hasOnboarded).toBe(true);

    await vi.advanceTimersByTimeAsync(60_000);
    const remote = remoteOf(anonId);
    expect(remote.writes()).toEqual([]);
    expect(manager.syncStatus()).toBe("waitingConsent");

    store.actions.acceptConsent(); // /onboarding/?consent=1
    expect(rootScreenFor(store.getSnapshot(), true)).toBe("main");
    await vi.advanceTimersByTimeAsync(1_500);
    expect(remote.writes()).toEqual(["insert"]);
    expect(remote.serverState().symptomHistory).toHaveLength(1);
  });

  it("공개 화면(소개·개인정보처리방침·관리자)을 연 것만으로는 익명 계정을 만들지 않는다 — 앱 화면으로 오면 그때 옮긴다", async () => {
    legacyGuest();
    const { manager, fc, getClient, captcha } = setup({ captcha: { kind: "token", token: "tok" } });
    const store = setupStore();
    const oldId = store.getSnapshot().account!.id;

    expect(await manager.restore(store, { allowGuestUpgrade: false })).toBe("done");
    manager.ensureRestored(store, { allowGuestUpgrade: false });
    manager.ensureRestored(store, { allowGuestUpgrade: false });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fc.calls).toEqual([]); // Supabase 요청 없음
    expect(getClient).not.toHaveBeenCalled(); // 번들도 받지 않는다
    expect(captcha).not.toHaveBeenCalled(); // 사람 확인 스크립트도 부르지 않는다
    expect(store.getSnapshot().account!.id).toBe(oldId);

    manager.ensureRestored(store, { allowGuestUpgrade: true }); // 앱 화면(/onboarding/?consent=1 등)
    await vi.advanceTimersByTimeAsync(0);
    expect(fc.calls).toEqual(["anon:tok"]);
    expect(store.getSnapshot().account!.id).toBe(`guest-${fc.currentUserId()}`);
    manager.ensureRestored(store, { allowGuestUpgrade: true }); // 다시 불러도 한 번
    await vi.advanceTimersByTimeAsync(0);
    expect(fc.calls).toEqual(["anon:tok"]);
  });

  it("공개 화면에서도 이미 있는 세션은 이어받는다(카카오) — 게스트 옮기기만 하지 않는다", async () => {
    const remotes = new Map([[KAKAO_USER_ID, new FakeRemote()]]);
    remotes.get(KAKAO_USER_ID)!.setServer(onboardedState({ ownerAccountID: KAKAO_ACCOUNT }));
    const { manager } = setup({ remotes, client: fakeClient({ session: kakaoSession() }) });
    const store = setupStore();
    store.actions.signIn({ id: KAKAO_ACCOUNT, name: "해님", provider: "kakao" });
    manager.ensureRestored(store, { allowGuestUpgrade: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(manager.syncStatus()).toBe("synced");
  });

  it("공개 화면에서 시작한 확인이 도는 중에 앱 화면으로 오면 끝난 뒤 바로 한 번 더 한다", async () => {
    legacyGuest();
    const { manager, fc } = setup({ clientUnavailable: 1 });
    const store = setupStore();
    // 저장된 세션이 있는 것처럼(다른 사람의 남은 익명 세션) — 공개 화면에서도 번들을 받으려 한다
    fc.client.auth.signInAnonymously(); // 남은 익명 세션
    fc.calls.length = 0;
    manager.ensureRestored(store, { allowGuestUpgrade: false });
    manager.ensureRestored(store, { allowGuestUpgrade: true });
    await vi.advanceTimersByTimeAsync(0);
    // 첫 확인은 번들을 받지 못해 retry — 허용이 생겼으니 기다리지 않고 바로 다시 → 남은 세션을 끝내고 새 익명 계정으로 옮긴다
    expect(fc.calls).toEqual(["signOut:local", "anon:-"]);
    expect(store.getSnapshot().account!.id).toBe(`guest-${fc.currentUserId()}`);
  });

  it("익명 로그인을 못 하면(오프라인) 아무것도 바꾸지 않고 나중에 다시 — 게스트는 이 브라우저에서 계속 쓴다", async () => {
    legacyGuest();
    const { manager } = setup({ clientUnavailable: 1 });
    const store = setupStore();
    const before = store.getSnapshot().account;
    expect(await manager.restore(store)).toBe("retry");
    expect(store.getSnapshot().account).toEqual(before);
    expect(await manager.restore(store)).toBe("done");
    expect(store.getSnapshot().account?.id).not.toBe(before?.id);
  });
});

describe("게스트 → 카카오 계정 연결(linkIdentity)", () => {
  /** 익명 게스트 — 지금 판에 동의하고 기록 하나, 서버 행까지 올라감 */
  async function anonymousGuest(ctx: Ctx): Promise<{ store: AppStore; anonId: string }> {
    const store = setupStore();
    await ctx.manager.signInGuest(store);
    const anonId = ctx.fc.currentUserId()!;
    onboardWithConsent(store);
    store.actions.addSymptomRecord(symptomInput(5));
    await vi.advanceTimersByTimeAsync(1_500);
    expect(ctx.remoteOf(anonId).writes()).toEqual(["insert"]);
    return { store, anonId };
  }

  it("같은 계정에 카카오가 붙는다 — 사용자 id·서버 행·기록 그대로, 계정은 kakao-<회원번호>, 설정으로 돌아간다", async () => {
    const remotes = new Map<string, FakeRemote>();
    const first = fakeClient();
    const ctx = setup({ client: first, remotes });
    const { store, anonId } = await anonymousGuest(ctx);

    expect(await ctx.manager.signInWithKakao(store)).toEqual({ ok: true });
    expect(first.calls.at(-1)).toBe(`link:kakao:${REDIRECT}:${anonId}`);
    expect(first.calls.some((c) => c.startsWith("oauth:"))).toBe(false);
    expect(JSON.parse(storage.getItem(AUTH_FLOW_KEY)!)).toMatchObject({ kind: "link", guestAccountId: `guest-${anonId}`, anonUserId: anonId });

    // 카카오에서 돌아온다 — 같은 브라우저(저장된 게스트 세션), 새 페이지
    ctx.manager.stopSync();
    const linked = kakaoSession(MEMBER, "해님", anonId);
    const back = fakeClient({ session: anonSession(anonId), codes: { c1: linked } });
    const again = setup({ client: back, remotes });
    const reopened = setupStore();
    const outcome = await again.manager.completeCallback(reopened, `${CALLBACK}?code=c1`);
    expect(outcome).toEqual({ kind: "signedIn", sync: "ok", linked: true });
    expect(back.calls).toEqual(["exchange:c1"]);
    const snap = reopened.getSnapshot();
    expect(snap.account).toEqual({ id: KAKAO_ACCOUNT, name: "해님", provider: "kakao" });
    expect(snap.state.ownerAccountID).toBe(KAKAO_ACCOUNT);
    expect(snap.state.symptomHistory).toHaveLength(1);
    expect(rootScreenFor(snap, true)).toBe("main");
    expect(again.marks.adoptedAt(KAKAO_ACCOUNT)).toBeNull(); // 같은 사람 — 다시 동의받지 않는다
    expect(storage.getItem(AUTH_FLOW_KEY)).toBeNull();

    // 같은 행을 이어 쓴다(새 행을 만들지 않는다)
    await vi.advanceTimersByTimeAsync(1_500);
    expect([...remotes.keys()]).toEqual([anonId]);
    reopened.actions.addMoodCheck({ questionID: 1, answer: "no" });
    await vi.advanceTimersByTimeAsync(1_500);
    const row = remotes.get(anonId)!;
    expect(row.writes()).toEqual(["insert", "update"]);
    expect(row.serverState().ownerAccountID).toBe(KAKAO_ACCOUNT);
    expect(row.serverState().moodChecks).toHaveLength(1);
  });

  it("그 카카오 계정이 이미 다른 온맘 계정이면: 그 계정으로 로그인 → 게스트 익명 사용자를 게스트 세션으로 먼저 지우고 → 게스트 기록을 그 계정 기록과 합쳐 올린다", async () => {
    const remotes = new Map<string, FakeRemote>();
    // 이미 있던 카카오 계정의 서버 행(다른 기기에서 쓴 기록 하나)
    const kakaoRow = new FakeRemote();
    kakaoRow.setServer(
      onboardedState({
        ownerAccountID: KAKAO_ACCOUNT,
        symptomHistory: [{ id: "phone-rec", date: "2026-09-20T01:00:00.000Z", ...symptomInput(2) }],
      }),
    );
    remotes.set(KAKAO_USER_ID, kakaoRow);
    const deleted: string[] = [];
    const browser = fakeClient({
      codes: { c2: kakaoSession() },
      onDeleteUser: (id) => {
        deleted.push(id);
        remotes.get(id)!.row = null; // 서버 행도 함께 지워진다(on delete cascade)
      },
    });
    const ctx = setup({ client: browser, remotes });
    const { store, anonId } = await anonymousGuest(ctx);
    await ctx.manager.signInWithKakao(store);

    // 1) 연결 시도가 identity_already_exists로 돌아온다 → 그 계정으로 로그인하러 카카오로 다시
    ctx.manager.stopSync();
    const page1 = setup({ client: browser, remotes });
    const store1 = setupStore();
    const outcome1 = await page1.manager.completeCallback(
      store1,
      `${CALLBACK}?error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked+to+another+user`,
    );
    expect(outcome1).toEqual({ kind: "redirecting" });
    expect(browser.calls.at(-1)).toBe(`oauth:kakao:${REDIRECT}`);
    expect(page1.replaceUrl).toHaveBeenCalledWith(CALLBACK); // 오류 매개변수는 주소에서 지운다
    expect(JSON.parse(storage.getItem(AUTH_FLOW_KEY)!)).toMatchObject({ kind: "switch", anonUserId: anonId });
    expect(store1.getSnapshot().account?.id).toBe(`guest-${anonId}`); // 아직 아무것도 바꾸지 않았다

    // 2) 카카오 로그인에서 돌아온다
    page1.manager.stopSync();
    const page2 = setup({ client: browser, remotes });
    const store2 = setupStore();
    const outcome2 = await page2.manager.completeCallback(store2, `${CALLBACK}?code=c2`);
    expect(outcome2).toEqual({ kind: "signedIn", sync: "ok", linked: true });
    // 게스트 세션으로 먼저 지우고, 그다음 세션을 바꾼다
    const order = browser.calls.filter((c) => c === "getUser" || c.startsWith("rpc:") || c.startsWith("exchange:"));
    expect(order).toEqual(["getUser", `rpc:delete_my_account:${anonId}`, "exchange:c2"]); // 서버로 확인 → 게스트 세션으로 지움 → 세션 바꿈
    expect(deleted).toEqual([anonId]);

    const snap = store2.getSnapshot();
    expect(snap.account).toEqual({ id: KAKAO_ACCOUNT, name: "해님", provider: "kakao" });
    expect(snap.state.symptomHistory.map((r) => r.id).sort()).toEqual(["id-1", "phone-rec"].sort()); // 게스트 기록 + 그 계정 기록
    expect(snap.state.profile.deliveryMethod).toBe("vaginal"); // 프로필은 온보딩을 마친 서버 계정 것(첫 합치기 규칙)
    expect(rootScreenFor(snap, true)).toBe("main"); // 그 계정의 지금 판 동의
    expect(page2.marks.adoptedAt(KAKAO_ACCOUNT)).toBeNull(); // 게스트 본인이 고른 계정 — 다시 동의받지 않는다

    await vi.advanceTimersByTimeAsync(0);
    expect(kakaoRow.writes()).toEqual(["update"]);
    expect(kakaoRow.serverState().symptomHistory.map((r) => r.id).sort()).toEqual(["id-1", "phone-rec"].sort());
    expect(remotes.get(anonId)!.row).toBeNull();
    expect(storage.getItem(AUTH_FLOW_KEY)).toBeNull();
  });

  it("전환 중 게스트 계정을 지우지 못하면 아무것도 바꾸지 않는다 — 게스트 그대로, 동기화도 다시 켠다", async () => {
    const remotes = new Map<string, FakeRemote>();
    const browser = fakeClient({ codes: { c3: kakaoSession() }, rpcFails: true });
    const ctx = setup({ client: browser, remotes });
    const { store, anonId } = await anonymousGuest(ctx);
    await ctx.manager.signInWithKakao(store);
    ctx.flow.save({ kind: "switch", guestAccountId: `guest-${anonId}`, anonUserId: anonId, at: clock.toISOString() });

    const outcome = await ctx.manager.completeCallback(store, `${CALLBACK}?code=c3`);
    expect(outcome).toEqual({ kind: "error", reason: "failed" });
    expect(browser.calls.some((c) => c.startsWith("exchange:"))).toBe(false);
    expect(store.getSnapshot().account?.id).toBe(`guest-${anonId}`);
    expect(browser.currentUserId()).toBe(anonId);
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.manager.syncStatus()).toBe("synced");
  });

  it("게스트 계정을 지운 뒤 카카오 세션 교환이 실패하면 — 지워진 세션을 끝내고, 다음 방문에 새 익명 계정으로 기록을 옮긴다", async () => {
    const remotes = new Map<string, FakeRemote>();
    const browser = fakeClient({ onDeleteUser: (id) => (remotes.get(id)!.row = null) });
    const ctx = setup({ client: browser, remotes });
    const { store, anonId } = await anonymousGuest(ctx);
    ctx.flow.save({ kind: "switch", guestAccountId: `guest-${anonId}`, anonUserId: anonId, at: clock.toISOString() });

    expect(await ctx.manager.completeCallback(store, `${CALLBACK}?code=expired`)).toEqual({ kind: "error", reason: "failed" });
    expect(browser.calls.slice(-4)).toEqual(["getUser", `rpc:delete_my_account:${anonId}`, "exchange:expired", "signOut:local"]);
    expect(store.getSnapshot().account?.id).toBe(`guest-${anonId}`); // 기록은 이 브라우저에 그대로
    expect(store.getSnapshot().state.symptomHistory).toHaveLength(1);

    ctx.manager.stopSync();
    const next = setup({ client: browser, remotes });
    const reopened = setupStore();
    expect(await next.manager.restore(reopened)).toBe("done");
    const newAnon = browser.currentUserId()!;
    expect(newAnon).not.toBe(anonId);
    expect(reopened.getSnapshot().account?.id).toBe(`guest-${newAnon}`);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(remotes.get(newAnon)!.serverState().symptomHistory).toHaveLength(1); // 같은 사람 — 지금 판의 동의로 다시 올린다
  });

  // Supabase Auth는 이메일 없는 익명 사용자에 공급자를 붙일 때 확인된 이메일을 요구하고, 없으면 확인 메일을 보내려다 실패한 까닭으로
  // 거절한다(auth identity.go linkIdentityToUser → sendConfirmation). 카카오 이메일은 선택 동의라 흔하다 — 코드는 SMTP 설정에 따라 다르다.
  it.each([
    ["email_not_confirmed", "카카오 이메일이 확인되지 않음(확인 메일을 보냄)"],
    ["over_email_send_rate_limit", "카카오 이메일이 없거나 확인되지 않음 — 기본 메일 발송 한도"],
    ["unexpected_failure", "카카오 이메일이 없음 — 확인 메일을 보내지 못함"],
    ["email_address_invalid", "카카오 이메일이 없음 — 빈 주소"],
    ["email_address_not_authorized", "기본 메일 서버가 보내지 않는 주소"],
    ["email_exists", "카카오 이메일이 다른 사용자의 것"],
  ])("연결이 이메일 문제로 거절돼도(%s — %s) 같은 방법 — 카카오로 로그인해 합친다(새 사용자 id)", async (code) => {
    const ctx = setup();
    const { store, anonId } = await anonymousGuest(ctx);
    await ctx.manager.signInWithKakao(store);
    const outcome = await ctx.manager.completeCallback(store, `${CALLBACK}?error=server_error&error_code=${code}&error_description=x`);
    expect(outcome).toEqual({ kind: "redirecting" });
    expect(ctx.fc.calls.at(-1)).toBe(`oauth:kakao:${REDIRECT}`);
    expect(ctx.flow.load()).toMatchObject({ kind: "switch", anonUserId: anonId });
    expect(ctx.fc.calls.some((c) => c.startsWith("rpc:"))).toBe(false); // 돌아오기 전에는 아무것도 지우지 않는다
    expect(store.getSnapshot().account?.id).toBe(`guest-${anonId}`);
  });

  it("오류 코드 없이 거절돼도(server_error) 연결 중이었으면 같은 방법", async () => {
    const ctx = setup();
    const { store } = await anonymousGuest(ctx);
    await ctx.manager.signInWithKakao(store);
    expect(await ctx.manager.completeCallback(store, `${CALLBACK}?error=server_error&error_description=x`)).toEqual({ kind: "redirecting" });
    expect(ctx.flow.load()).toMatchObject({ kind: "switch" });
  });

  it("이메일 없는 카카오로 연결이 거절된 뒤 카카오 로그인에서 돌아오면 — 게스트를 지우고 새 카카오 사용자로 기록을 올린다", async () => {
    const remotes = new Map<string, FakeRemote>();
    const deleted: string[] = [];
    const browser = fakeClient({
      codes: { c7: kakaoSession() }, // 이메일 없이 새로 만든 카카오 사용자(새 사용자 id)
      onDeleteUser: (id) => {
        deleted.push(id);
        remotes.get(id)!.row = null;
      },
    });
    const ctx = setup({ client: browser, remotes });
    const { store, anonId } = await anonymousGuest(ctx);
    await ctx.manager.signInWithKakao(store);
    expect(await ctx.manager.completeCallback(store, `${CALLBACK}?error=server_error&error_code=over_email_send_rate_limit`)).toEqual({
      kind: "redirecting",
    });

    ctx.manager.stopSync();
    const page2 = setup({ client: browser, remotes });
    const store2 = setupStore();
    expect(await page2.manager.completeCallback(store2, `${CALLBACK}?code=c7`)).toEqual({ kind: "signedIn", sync: "ok", linked: true });
    expect(deleted).toEqual([anonId]);
    expect(store2.getSnapshot().account?.id).toBe(KAKAO_ACCOUNT);
    expect(page2.marks.adoptedAt(KAKAO_ACCOUNT)).toBeNull(); // 게스트 본인 — 다시 동의받지 않는다
    await vi.advanceTimersByTimeAsync(0);
    expect(remotes.get(KAKAO_USER_ID)!.serverState().symptomHistory).toHaveLength(1);
    expect(remotes.get(anonId)!.row).toBeNull();
  });

  it("카카오 로그인(전환)까지 거절되면 되풀이하지 않는다 — 게스트 그대로, 아무것도 지우지 않는다", async () => {
    const ctx = setup();
    const { store, anonId } = await anonymousGuest(ctx);
    ctx.flow.save({ kind: "switch", guestAccountId: `guest-${anonId}`, anonUserId: anonId, at: clock.toISOString() });
    const oauthBefore = ctx.fc.calls.filter((c) => c.startsWith("oauth:")).length;
    expect(await ctx.manager.completeCallback(store, `${CALLBACK}?error=server_error&error_code=unexpected_failure`)).toEqual({
      kind: "error",
      reason: "failed",
    });
    expect(ctx.fc.calls.filter((c) => c.startsWith("oauth:")).length).toBe(oauthBefore);
    expect(ctx.fc.calls.some((c) => c.startsWith("rpc:"))).toBe(false);
    expect(store.getSnapshot().account?.id).toBe(`guest-${anonId}`);
    expect(storage.getItem(AUTH_FLOW_KEY)).toBeNull();
  });

  it("서버에서 보니 이 게스트에 이미 카카오가 붙어 있으면(연결은 됐는데 거절 응답) 지우지 않는다 — 같은 사용자·같은 행으로 이어 간다", async () => {
    const remotes = new Map<string, FakeRemote>();
    const first = fakeClient();
    const ctx = setup({ client: first, remotes });
    const { anonId } = await anonymousGuest(ctx);
    ctx.manager.stopSync();

    const kakaoOnAnon = kakaoSession(MEMBER, "해님", anonId);
    // 연결은 서버에 남았지만 이메일이 확인되지 않아 익명으로 남은 사용자
    const stillAnonymous = { ...kakaoOnAnon.user, is_anonymous: true };
    const deleted: string[] = [];
    const browser = fakeClient({
      session: anonSession(anonId),
      codes: { c5: { ...kakaoOnAnon, user: stillAnonymous } },
      serverUser: () => stillAnonymous,
      onDeleteUser: (id) => deleted.push(id),
    });
    const again = setup({ client: browser, remotes });
    again.flow.save({ kind: "switch", guestAccountId: `guest-${anonId}`, anonUserId: anonId, at: clock.toISOString() });
    const reopened = setupStore();
    const outcome = await again.manager.completeCallback(reopened, `${CALLBACK}?code=c5`);
    expect(outcome).toEqual({ kind: "signedIn", sync: "ok", linked: true });
    expect(deleted).toEqual([]);
    expect(browser.calls.some((c) => c.startsWith("rpc:"))).toBe(false);
    expect(reopened.getSnapshot().account).toEqual({ id: KAKAO_ACCOUNT, name: "해님", provider: "kakao" }); // is_anonymous여도 카카오 계정
    expect(reopened.getSnapshot().state.symptomHistory).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_500);
    expect([...remotes.keys()]).toEqual([anonId]); // 같은 행
  });

  it("지우기 전에 서버 확인(getUser)을 못 하면 아무것도 지우지 않는다", async () => {
    const browser = fakeClient({ codes: { c6: kakaoSession() }, serverUser: () => null });
    const ctx = setup({ client: browser });
    const { store, anonId } = await anonymousGuest(ctx);
    ctx.flow.save({ kind: "switch", guestAccountId: `guest-${anonId}`, anonUserId: anonId, at: clock.toISOString() });
    expect(await ctx.manager.completeCallback(store, `${CALLBACK}?code=c6`)).toEqual({ kind: "error", reason: "failed" });
    expect(browser.calls.some((c) => c.startsWith("rpc:") || c.startsWith("exchange:"))).toBe(false);
    expect(store.getSnapshot().account?.id).toBe(`guest-${anonId}`);
  });

  it("카카오 화면에서 취소하면 게스트 그대로 — 표시도 지운다", async () => {
    const ctx = setup();
    const { store, anonId } = await anonymousGuest(ctx);
    await ctx.manager.signInWithKakao(store);
    const outcome = await ctx.manager.completeCallback(store, `${CALLBACK}?error=access_denied&error_description=denied`);
    expect(outcome).toEqual({ kind: "error", reason: "cancelled" });
    expect(store.getSnapshot().account?.id).toBe(`guest-${anonId}`);
    expect(storage.getItem(AUTH_FLOW_KEY)).toBeNull();
  });

  it("Supabase에서 연결(manual linking)이 꺼져 있으면 실패로 알리고 표시를 지운다", async () => {
    const ctx = setup({ client: fakeClient({ linkError: true }) });
    const { store } = await anonymousGuest(ctx);
    expect(await ctx.manager.signInWithKakao(store)).toEqual({ ok: false, reason: "failed" });
    expect(storage.getItem(AUTH_FLOW_KEY)).toBeNull();
  });

  it("익명 계정이 아직 없는 게스트(이 브라우저 전용)가 연결하면 카카오로 로그인하고 기록은 같은 사람의 것으로 가져간다", async () => {
    const ctx = setup({ client: fakeClient({ anonError: { status: 0, message: "offline" }, codes: { c4: kakaoSession() } }) });
    const store = setupStore();
    expect(await ctx.manager.signInGuest(store)).toEqual({ ok: true, mode: "local" });
    onboardWithConsent(store);
    store.actions.addMoodCheck({ questionID: 2, answer: "yes" });

    expect(await ctx.manager.signInWithKakao(store)).toEqual({ ok: true });
    expect(ctx.fc.calls.at(-1)).toBe(`oauth:kakao:${REDIRECT}`);
    const outcome = await ctx.manager.completeCallback(store, `${CALLBACK}?code=c4`);
    expect(outcome).toEqual({ kind: "signedIn", sync: "ok", linked: true });
    expect(ctx.marks.adoptedAt(KAKAO_ACCOUNT)).toBeNull();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(ctx.remoteOf(KAKAO_USER_ID).serverState().moodChecks).toHaveLength(1);
  });
});

describe("카카오 로그인(로그인 화면)", () => {
  it("돌아올 주소는 basePath가 붙은 콜백 — 게스트 세션이 없으면 보통 로그인(signInWithOAuth)", async () => {
    const { manager, fc } = setup();
    const store = setupStore();
    expect(await manager.signInWithKakao(store)).toEqual({ ok: true });
    expect(fc.calls).toEqual([`oauth:kakao:${REDIRECT}`]);
    expect(storage.getItem(AUTH_FLOW_KEY)).toBeNull();
  });

  it("이미 가입한 사람(서버에 온보딩 기록) → 새 브라우저에서도 홈으로", async () => {
    const remotes = new Map([[KAKAO_USER_ID, new FakeRemote()]]);
    remotes.get(KAKAO_USER_ID)!.setServer(onboardedState({ ownerAccountID: KAKAO_ACCOUNT }));
    const { manager, fc, replaceUrl } = setup({ remotes, client: fakeClient({ codes: { abc: kakaoSession() } }) });
    const store = setupStore();

    const outcome = await manager.completeCallback(store, `${CALLBACK}?code=abc`);
    expect(outcome).toEqual({ kind: "signedIn", sync: "ok", linked: false });
    expect(fc.calls).toEqual(["exchange:abc"]);
    expect(replaceUrl).toHaveBeenCalledWith(CALLBACK); // 쓴 code는 주소에서 지운다
    const snap = store.getSnapshot();
    expect(snap.account).toEqual({ id: KAKAO_ACCOUNT, name: "해님", provider: "kakao" });
    expect(rootScreenFor(snap, true)).toBe("main");
    expect(manager.syncStatus()).toBe("synced");
  });

  it("처음 가입(서버에 행 없음) → 온보딩. 판 없는 동의로는 올리지 않고, 지금 판의 동의 뒤에 처음 만든다", async () => {
    const { manager, remoteOf } = setup({ client: fakeClient({ codes: { abc: kakaoSession() } }) });
    const store = setupStore();
    expect(await manager.completeCallback(store, `${CALLBACK}?code=abc`)).toEqual({ kind: "signedIn", sync: "ok", linked: false });
    expect(rootScreenFor(store.getSnapshot(), true)).toBe("onboarding");
    const remote = remoteOf(KAKAO_USER_ID);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(remote.writes()).toEqual([]);
    expect(manager.syncStatus()).toBe("waitingConsent");

    store.actions.completeOnboarding(); // 판 없는 동의
    await vi.advanceTimersByTimeAsync(60_000);
    expect(remote.writes()).toEqual([]);
    expect(rootScreenFor(store.getSnapshot(), true)).toBe("consent");

    store.actions.acceptConsent();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(remote.writes()).toEqual(["insert"]);
    expect(manager.syncStatus()).toBe("synced");
  });

  it("서버 행의 동의가 예전 판이면 → 다시 동의 화면(관문), 그 전에는 올리지 않는다", async () => {
    const remotes = new Map([[KAKAO_USER_ID, new FakeRemote()]]);
    const s = onboardedState({ ownerAccountID: KAKAO_ACCOUNT });
    remotes.get(KAKAO_USER_ID)!.setServer({ ...s, profile: { ...s.profile, consentVersion: "web-2026-01-01" } });
    const { manager } = setup({ remotes, client: fakeClient({ codes: { abc: kakaoSession() } }) });
    const store = setupStore();
    await manager.completeCallback(store, `${CALLBACK}?code=abc`);
    expect(rootScreenFor(store.getSnapshot(), true)).toBe("consent");
    store.actions.addMoodCheck({ questionID: 1, answer: "no" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(remotes.get(KAKAO_USER_ID)!.writes()).toEqual([]);
  });

  it("같은 페이지에서 두 번 불러도(개발 모드 효과 두 번) code는 한 번만 쓴다", async () => {
    const { manager, fc } = setup({ client: fakeClient({ codes: { abc: kakaoSession() } }) });
    const store = setupStore();
    const [a, b] = await Promise.all([manager.completeCallback(store, `${CALLBACK}?code=abc`), manager.completeCallback(store, CALLBACK)]);
    expect(a).toEqual(b);
    expect(fc.calls.filter((c) => c.startsWith("exchange"))).toHaveLength(1);
  });

  it("카카오 동의 화면에서 취소 → cancelled, 교환하지 않고 로그인하지 않는다", async () => {
    const { manager, fc } = setup();
    const store = setupStore();
    expect(await manager.completeCallback(store, `${CALLBACK}?error=access_denied&error_description=denied`)).toEqual({ kind: "error", reason: "cancelled" });
    expect(fc.calls).toEqual([]);
    expect(store.getSnapshot().account).toBeNull();
  });

  it("교환 실패·저장된 세션도 없음 → failed, 로그인하지 않는다", async () => {
    const { manager } = setup();
    const store = setupStore();
    expect(await manager.completeCallback(store, `${CALLBACK}?code=used`)).toEqual({ kind: "error", reason: "failed" });
    expect(store.getSnapshot().account).toBeNull();
  });

  it("서버 기록을 못 읽으면 sync=error — 화면이 온보딩을 보여 주지 않고 다시 시도하게 한다", async () => {
    const remotes = new Map([[KAKAO_USER_ID, new FakeRemote()]]);
    remotes.get(KAKAO_USER_ID)!.failFetch = 1;
    const { manager } = setup({ remotes, client: fakeClient({ codes: { abc: kakaoSession() } }) });
    const store = setupStore();
    expect(await manager.completeCallback(store, `${CALLBACK}?code=abc`)).toEqual({ kind: "signedIn", sync: "error", linked: false });
    expect(await manager.retryFirstFetch(store)).toBe("ok");
  });

  it("설정의 [다시 시도](retrySync)는 재시도 대기 없이 지금 다시 읽는다 — 동기화 중인 계정이 없으면 아무 일도 하지 않는다", async () => {
    expect(() => setup().manager.retrySync()).not.toThrow();
    const remotes = new Map([[KAKAO_USER_ID, new FakeRemote()]]);
    remotes.get(KAKAO_USER_ID)!.failFetch = 1;
    const { manager } = setup({ remotes, client: fakeClient({ codes: { abc: kakaoSession() } }) });
    const store = setupStore();
    await manager.completeCallback(store, `${CALLBACK}?code=abc`);
    // 첫 재시도는 3초 뒤(SYNC_RETRY_DELAYS_MS) — 그 전에는 실패 그대로
    await vi.advanceTimersByTimeAsync(100);
    expect(manager.syncStatus()).toBe("error");
    manager.retrySync();
    await vi.advanceTimersByTimeAsync(100);
    expect(manager.syncStatus()).not.toBe("error");
  });
});

describe("이 브라우저에 남아 있던 기록을 가져온 카카오 로그인 — 다시 동의 전에는 올리지 않는다(감사 #15, 공용 PC)", () => {
  /** 예전 빌드에서 쓰다 로그아웃한 게스트 — 지금 판에 동의했어도 다른 사람일 수 있다 */
  function guestLeftRecords(): AppStore {
    const store = setupStore();
    store.actions.signInGuest();
    store.actions.acceptConsent();
    store.actions.completeOnboarding();
    store.actions.addSymptomRecord(symptomInput(4));
    store.actions.signOut();
    tick(30);
    return store;
  }

  it("서버에 행이 없으면 만들지 않는다 — 관문이 다시 동의 화면으로, 동의하면 그때 만든다", async () => {
    const { manager, remoteOf } = setup({ client: fakeClient({ codes: { abc: kakaoSession() } }) });
    const store = guestLeftRecords();
    expect(await manager.completeCallback(store, `${CALLBACK}?code=abc`)).toEqual({ kind: "signedIn", sync: "ok", linked: false });
    expect(rootScreenFor(store.getSnapshot(), true)).toBe("consent");
    const remote = remoteOf(KAKAO_USER_ID);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(remote.calls).toEqual(["fetch"]);
    expect(manager.syncStatus()).toBe("waitingConsent");
    // 로그아웃해도 이 브라우저에만 있는 기록을 지우지 않는다
    expect(await manager.signOut(store)).toEqual({ ok: false, reason: "unsynced" });

    tick(1);
    store.actions.acceptConsent();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(remote.calls).toEqual(["fetch", "insert"]);
    expect(remote.serverState().symptomHistory).toHaveLength(1);
  });

  it("서버에 행이 있어도(그 계정의 동의가 있어도) 게스트 기록을 섞어 올리지 않는다 — 다시 동의하면 합쳐 올린다", async () => {
    const remotes = new Map([[KAKAO_USER_ID, new FakeRemote()]]);
    const remote = remotes.get(KAKAO_USER_ID)!;
    remote.setServer(onboardedState({ ownerAccountID: KAKAO_ACCOUNT }));
    const { manager } = setup({ remotes, client: fakeClient({ codes: { abc: kakaoSession() } }) });
    const store = guestLeftRecords();
    await manager.completeCallback(store, `${CALLBACK}?code=abc`);
    store.actions.addMoodCheck({ questionID: 1, answer: "no" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(remote.writes()).toEqual([]);
    expect(remote.serverState().symptomHistory).toHaveLength(0);
    expect(rootScreenFor(store.getSnapshot(), true)).toBe("consent");

    tick(1);
    store.actions.acceptConsent();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(remote.writes()).toEqual(["update"]);
    expect(remote.serverState().symptomHistory).toHaveLength(1);
    expect(remote.serverState().moodChecks).toHaveLength(1);
  });

  it("다시 열어도(새로고침) 가져온 기록 표시가 남아 동의 전에는 올리지 않는다", async () => {
    const remotes = new Map([[KAKAO_USER_ID, new FakeRemote()]]);
    remotes.get(KAKAO_USER_ID)!.setServer(onboardedState({ ownerAccountID: KAKAO_ACCOUNT }));
    const browser = fakeClient({ codes: { abc: kakaoSession() } });
    const first = setup({ remotes, client: browser });
    const store = guestLeftRecords();
    await first.manager.completeCallback(store, `${CALLBACK}?code=abc`);
    first.manager.stopSync();

    const again = setup({ remotes, client: browser });
    const reopened = setupStore(); // 같은 저장소 — 주인은 이제 카카오 계정
    expect(await again.manager.restore(reopened)).toBe("done");
    reopened.actions.addMoodCheck({ questionID: 2, answer: "yes" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(remotes.get(KAKAO_USER_ID)!.writes()).toEqual([]);
    expect(again.manager.syncStatus()).toBe("waitingConsent");
    expect(rootScreenFor(reopened.getSnapshot(), true)).toBe("consent");
  });

  it("같은 카카오 계정의 기록(다시 로그인)이나 빈 게스트는 가져오는 것이 아니다", () => {
    const own = { ...onboardedState(), ownerAccountID: KAKAO_ACCOUNT };
    expect(adoptsLocalRecords(own, KAKAO_ACCOUNT)).toBe(false);
    expect(adoptsLocalRecords({ ...initialState(), ownerAccountID: "guest-x" }, KAKAO_ACCOUNT)).toBe(false);
    expect(adoptsLocalRecords({ ...onboardedState(), ownerAccountID: "guest-x" }, KAKAO_ACCOUNT)).toBe(true);
    expect(adoptsLocalRecords({ ...onboardedState(), ownerAccountID: null }, KAKAO_ACCOUNT)).toBe(true);
    // 다른 실제 계정의 기록은 로그인 때 지워진다 — 가져오지 않는다
    expect(adoptsLocalRecords({ ...onboardedState(), ownerAccountID: "kakao-999" }, KAKAO_ACCOUNT)).toBe(false);
  });
});

describe("다시 방문 — 저장된 세션 이어받기", () => {
  it("카카오 세션이 있고 계정 기록이 없으면 같은 사람으로 로그인하고 동기화한다", async () => {
    const remotes = new Map([[KAKAO_USER_ID, new FakeRemote()]]);
    remotes.get(KAKAO_USER_ID)!.setServer(onboardedState({ ownerAccountID: KAKAO_ACCOUNT }));
    const { manager } = setup({ remotes, client: fakeClient({ session: kakaoSession() }) });
    const store = setupStore();
    await manager.restore(store);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getSnapshot().account?.id).toBe(KAKAO_ACCOUNT);
    expect(store.getSnapshot().state.hasOnboarded).toBe(true);
    expect(manager.syncStatus()).toBe("synced");
  });

  it("익명 게스트는 저장된 세션으로 이어 쓴다(새 익명 계정을 만들지 않는다)", async () => {
    const browser = fakeClient();
    const first = setup({ client: browser });
    const store = setupStore();
    await first.manager.signInGuest(store);
    const anonId = browser.currentUserId()!;
    first.manager.stopSync();

    const again = setup({ client: browser });
    const reopened = setupStore();
    expect(await again.manager.restore(reopened)).toBe("done");
    expect(reopened.getSnapshot().account?.id).toBe(`guest-${anonId}`);
    expect(browser.calls.filter((c) => c.startsWith("anon:"))).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(again.manager.syncStatus()).toBe("waitingConsent"); // 동기화 중(동의 전)
  });

  it("다른 탭에서 이 게스트에 카카오를 연결했으면 같은 사람·같은 행으로 이어받는다", async () => {
    const browser = fakeClient();
    const first = setup({ client: browser });
    const store = setupStore();
    await first.manager.signInGuest(store);
    const anonId = browser.currentUserId()!;
    first.manager.stopSync();

    const again = setup({ client: fakeClient({ session: kakaoSession(MEMBER, "해님", anonId) }) });
    const reopened = setupStore();
    expect(await again.manager.restore(reopened)).toBe("done");
    expect(reopened.getSnapshot().account?.id).toBe(KAKAO_ACCOUNT);
    expect(again.marks.adoptedAt(KAKAO_ACCOUNT)).toBeNull();
  });

  it("카카오 세션이 끝났으면(만료·다른 곳에서 로그아웃) 카카오 계정만 로그아웃 — 기록은 남는다", async () => {
    const { manager } = setup({ storedSession: false });
    const store = setupStore();
    store.actions.signIn({ id: KAKAO_ACCOUNT, name: null, provider: "kakao" });
    store.actions.completeOnboarding();
    await manager.restore(store);
    expect(store.getSnapshot().account).toBeNull();
    expect(store.getSnapshot().state.hasOnboarded).toBe(true);
  });

  it("처음 방문(계정·저장된 세션 없음)은 Supabase를 부르지 않는다", async () => {
    const { manager, getClient } = setup();
    const store = setupStore();
    expect(await manager.restore(store)).toBe("done");
    expect(getClient).not.toHaveBeenCalled();
  });
});

describe("페이지를 열 때 세션을 확인하지 못해도 동기화가 꺼진 채 남지 않는다", () => {
  function signedInKakaoStore(): AppStore {
    const store = setupStore();
    store.actions.signIn({ id: KAKAO_ACCOUNT, name: "해님", provider: "kakao" });
    return store;
  }
  function withRow() {
    const remotes = new Map([[KAKAO_USER_ID, new FakeRemote()]]);
    remotes.get(KAKAO_USER_ID)!.setServer(onboardedState({ ownerAccountID: KAKAO_ACCOUNT }));
    return remotes;
  }

  it("세션 확인 실패(오프라인) → retry, 뒤에 토큰 갱신 이벤트가 오면 동기화를 시작한다", async () => {
    const remotes = withRow();
    const fc = fakeClient({ session: kakaoSession(), getSessionFails: 1 });
    const { manager } = setup({ remotes, client: fc });
    const store = signedInKakaoStore();

    expect(await manager.restore(store)).toBe("retry");
    expect(manager.syncStatus()).toBe("off");
    expect(remotes.get(KAKAO_USER_ID)!.calls).toEqual([]);
    expect(store.getSnapshot().account?.id).toBe(KAKAO_ACCOUNT); // 아무것도 바꾸지 않았다

    fc.emit("TOKEN_REFRESHED");
    await vi.advanceTimersByTimeAsync(0);
    expect(remotes.get(KAKAO_USER_ID)!.calls).toEqual(["fetch"]);
    expect(manager.syncStatus()).toBe("synced");
  });

  it("ensureRestored — 온라인이 되면 바로 다시 확인한다", async () => {
    const { manager, goOnline, onlineListeners } = setup({ remotes: withRow(), client: fakeClient({ session: kakaoSession(), getSessionFails: 1 }) });
    const store = signedInKakaoStore();

    manager.ensureRestored(store);
    manager.ensureRestored(store); // 두 번 불러도 한 번
    await vi.advanceTimersByTimeAsync(0);
    expect(manager.syncStatus()).toBe("off");
    expect(onlineListeners()).toBe(1);

    goOnline();
    await vi.advanceTimersByTimeAsync(0);
    expect(manager.syncStatus()).toBe("synced");
    expect(onlineListeners()).toBe(0);
  });

  it("ensureRestored — 번들을 받지 못했어도 잠시 뒤 다시 한다", async () => {
    const { manager } = setup({ remotes: withRow(), clientUnavailable: 2, client: fakeClient({ session: kakaoSession() }) });
    const store = signedInKakaoStore();

    manager.ensureRestored(store);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(manager.syncStatus()).toBe("off");
    await vi.advanceTimersByTimeAsync(1); // 5초 뒤 — 또 실패
    expect(manager.syncStatus()).toBe("off");
    await vi.advanceTimersByTimeAsync(15_000); // 15초 뒤 — 성공
    expect(manager.syncStatus()).toBe("synced");
  });

  it("다른 계정의 세션 이벤트로는 시작하지 않는다", async () => {
    const remotes = new Map<string, FakeRemote>();
    const fc = fakeClient({ session: kakaoSession("555"), getSessionFails: 1 });
    const { manager } = setup({ remotes, client: fc });
    const store = signedInKakaoStore();
    expect(await manager.restore(store)).toBe("retry");
    fc.emit("SIGNED_IN");
    await vi.advanceTimersByTimeAsync(0);
    expect(remotes.size).toBe(0);
    expect(manager.syncStatus()).toBe("off");
  });
});

describe("로그아웃", () => {
  async function signedIn(opts: { failWrite?: number; beforeSignOut?: () => Promise<unknown> } = {}) {
    const remotes = new Map([[KAKAO_USER_ID, new FakeRemote()]]);
    const remote = remotes.get(KAKAO_USER_ID)!;
    remote.setServer(onboardedState({ ownerAccountID: KAKAO_ACCOUNT }));
    remote.failWrite = opts.failWrite ?? 0;
    const ctx = setup({ remotes, client: fakeClient({ codes: { abc: kakaoSession() } }), beforeSignOut: opts.beforeSignOut });
    const store = setupStore();
    await ctx.manager.completeCallback(store, `${CALLBACK}?code=abc`);
    return { ...ctx, store, remote };
  }

  it("기다리던 변경을 올린 뒤 로그아웃하고, 서버에 다 있으니 이 브라우저의 기록 사본을 지운다(공용 PC — 감사 #19)", async () => {
    const { manager, store, remote, fc } = await signedIn();
    store.actions.addMoodCheck({ questionID: 1, answer: "no" });
    expect(await manager.signOut(store)).toEqual({ ok: true, localDataErased: true });
    expect(remote.serverState().moodChecks).toHaveLength(1); // 먼저 올렸다
    expect(fc.calls).toContain("signOut:local"); // 이 브라우저의 세션만(다른 기기는 그대로)
    expect(store.getSnapshot().account).toBeNull();
    expect(store.getSnapshot().state.moodChecks).toHaveLength(0);
    expect(keys(storage)).toEqual([]);
  });

  it("올리지 못했으면 아무것도 하지 않고 unsynced — force면 기록을 남긴 채 로그아웃", async () => {
    const { manager, store, fc } = await signedIn({ failWrite: 99 });
    store.actions.addMoodCheck({ questionID: 1, answer: "no" });
    const first = manager.signOut(store);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await first).toEqual({ ok: false, reason: "unsynced" });
    expect(store.getSnapshot().account?.provider).toBe("kakao");
    expect(fc.calls).not.toContain("signOut:local");

    const forced = manager.signOut(store, { force: true });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await forced).toEqual({ ok: true, localDataErased: false });
    expect(store.getSnapshot().account).toBeNull();
    expect(store.getSnapshot().state.moodChecks).toHaveLength(1); // 다음 로그인 때 올린다
    expect(fc.calls).toContain("signOut:local");
  });

  describe("beforeSignOut — 세션을 끝내기 직전 이 브라우저의 서버 행 정리(리마인더 구독)", () => {
    it("다 올린 뒤 세션이 살아 있을 때 한 번 부르고, 그다음 세션을 끝낸다", async () => {
      const calls: string[] = [];
      const ctx = await signedIn({
        beforeSignOut: async () => {
          calls.push(`hook:${ctx.fc.hasSession()}`);
        },
      });
      expect(await ctx.manager.signOut(ctx.store)).toEqual({ ok: true, localDataErased: true });
      expect(calls).toEqual(["hook:true"]);
      expect(ctx.fc.calls).toContain("signOut:local");
    });

    it("unsynced로 멈추면 부르지 않고, [그래도 로그아웃](force)이면 부른다", async () => {
      const hook = vi.fn(async () => undefined);
      const { manager, store } = await signedIn({ failWrite: 99, beforeSignOut: hook });
      store.actions.addMoodCheck({ questionID: 1, answer: "no" });
      const first = manager.signOut(store);
      await vi.advanceTimersByTimeAsync(5_000);
      expect(await first).toEqual({ ok: false, reason: "unsynced" });
      expect(hook).not.toHaveBeenCalled();

      const forced = manager.signOut(store, { force: true });
      await vi.advanceTimersByTimeAsync(5_000);
      expect(await forced).toEqual({ ok: true, localDataErased: false });
      expect(hook).toHaveBeenCalledTimes(1);
    });

    it("던지거나 끝나지 않아도 로그아웃은 끝난다(3초까지만 기다림)", async () => {
      const thrower = await signedIn({ beforeSignOut: async () => Promise.reject(new Error("offline")) });
      expect(await thrower.manager.signOut(thrower.store)).toEqual({ ok: true, localDataErased: true });

      const hanging = await signedIn({ beforeSignOut: () => new Promise(() => undefined) });
      const out = hanging.manager.signOut(hanging.store);
      await vi.advanceTimersByTimeAsync(3_000);
      expect(await out).toEqual({ ok: true, localDataErased: true });
      expect(hanging.fc.calls).toContain("signOut:local");
    });

    it("게스트(로그아웃 없음)·설정 없는 빌드에서는 부르지 않는다", async () => {
      const hook = vi.fn(async () => undefined);
      const guest = setup({ beforeSignOut: hook });
      const store = setupStore();
      await guest.manager.signInGuest(store);
      onboardWithConsent(store);
      expect(await guest.manager.signOut(store)).toEqual({ ok: false, reason: "guest" });

      const plain = setup({ configured: false, beforeSignOut: hook });
      const store2 = setupStore();
      await plain.manager.signInGuest(store2);
      expect(await plain.manager.signOut(store2)).toEqual({ ok: true, localDataErased: false });
      expect(hook).not.toHaveBeenCalled();
    });
  });

  it("설정이 있는 빌드의 게스트는 로그아웃하지 않는다 — 익명 계정은 로그아웃하면 다시 찾을 수 없다", async () => {
    const { manager, fc } = setup();
    const store = setupStore();
    await manager.signInGuest(store);
    onboardWithConsent(store);
    expect(await manager.signOut(store)).toEqual({ ok: false, reason: "guest" });
    expect(store.getSnapshot().account?.provider).toBe("guest");
    expect(fc.calls.some((c) => c.startsWith("signOut"))).toBe(false);
  });

  it("다른 화면이 스토어에서 바로 로그아웃해도(watch) Supabase 세션을 끝낸다", async () => {
    const { manager, store, fc } = await signedIn();
    const stop = manager.watch(store);
    store.actions.signOut();
    await vi.advanceTimersByTimeAsync(0);
    expect(fc.calls).toContain("signOut:local");
    expect(fc.hasSession()).toBe(false);
    stop();
  });
});

describe("계정 삭제", () => {
  async function signedIn(rpcFails: boolean) {
    const remotes = new Map([[KAKAO_USER_ID, new FakeRemote()]]);
    remotes.get(KAKAO_USER_ID)!.setServer(onboardedState({ ownerAccountID: KAKAO_ACCOUNT }));
    const ctx = setup({ remotes, client: fakeClient({ codes: { abc: kakaoSession() }, rpcFails }) });
    const store = setupStore();
    await ctx.manager.completeCallback(store, `${CALLBACK}?code=abc`);
    return { ...ctx, store };
  }

  it("서버 삭제가 실패하면 아무것도 지우지 않고 오류(감사 #18)", async () => {
    const { manager, store, fc } = await signedIn(true);
    expect(await manager.deleteAccount(store)).toEqual({ ok: false, reason: "failed" });
    expect(fc.calls).toContain(`rpc:delete_my_account:${KAKAO_USER_ID}`);
    expect(fc.calls).not.toContain("signOut:local");
    expect(store.getSnapshot().account?.id).toBe(KAKAO_ACCOUNT);
    expect(store.getSnapshot().state.hasOnboarded).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(manager.syncStatus()).toBe("synced"); // 동기화를 다시 켰다
  });

  it("서버 삭제가 성공했을 때만 로그아웃하고 이 브라우저를 비운다", async () => {
    const { manager, store, fc } = await signedIn(false);
    expect(await manager.deleteAccount(store)).toEqual({ ok: true });
    expect(fc.calls.slice(-2)).toEqual([`rpc:delete_my_account:${KAKAO_USER_ID}`, "signOut:local"]);
    expect(store.getSnapshot().account).toBeNull();
    expect(store.getSnapshot().state.hasOnboarded).toBe(false);
  });

  it("세션이 끝났으면 서버에 요청할 수 없다 — noSession, 아무것도 지우지 않는다", async () => {
    const { manager } = setup();
    const store = setupStore();
    store.actions.signIn({ id: KAKAO_ACCOUNT, name: null, provider: "kakao" });
    expect(await manager.deleteAccount(store)).toEqual({ ok: false, reason: "noSession" });
    expect(store.getSnapshot().account?.id).toBe(KAKAO_ACCOUNT);
  });

  it("익명 게스트 — 게스트 세션으로 서버(행 + 익명 계정)를 먼저 지우고 이 브라우저를 비운다", async () => {
    const { manager, fc } = setup();
    const store = setupStore();
    await manager.signInGuest(store);
    const anonId = fc.currentUserId()!;
    onboardWithConsent(store);
    expect(await manager.deleteAccount(store)).toEqual({ ok: true });
    expect(fc.calls.slice(-2)).toEqual([`rpc:delete_my_account:${anonId}`, "signOut:local"]);
    expect(store.getSnapshot().account).toBeNull();
    expect(keys(storage)).toEqual([]);
  });

  it("지운 사용자의 세션은 저장소에서 먼저 지우고 signOut — 지워진 토큰으로 /logout(403)을 보내지 않게", async () => {
    const { manager, fc } = setup({ trackForget: true });
    const store = setupStore();
    await manager.signInGuest(store);
    const anonId = fc.currentUserId()!;
    onboardWithConsent(store);
    expect(await manager.deleteAccount(store)).toEqual({ ok: true });
    expect(fc.calls.slice(-3)).toEqual([`rpc:delete_my_account:${anonId}`, "forget", "signOut:local"]);
  });

  it("서버 삭제가 실패하면 저장된 세션을 지우지 않는다", async () => {
    const { manager, fc } = setup({ client: fakeClient({ rpcFails: true }), trackForget: true });
    const store = setupStore();
    await manager.signInGuest(store);
    onboardWithConsent(store);
    expect(await manager.deleteAccount(store)).toEqual({ ok: false, reason: "failed" });
    expect(fc.calls).not.toContain("forget");
  });

  it("익명 게스트 — 서버 삭제가 실패하면 아무것도 지우지 않는다", async () => {
    const { manager } = setup({ client: fakeClient({ rpcFails: true }) });
    const store = setupStore();
    await manager.signInGuest(store);
    onboardWithConsent(store);
    expect(await manager.deleteAccount(store)).toEqual({ ok: false, reason: "failed" });
    expect(store.getSnapshot().account?.provider).toBe("guest");
    expect(store.getSnapshot().state.hasOnboarded).toBe(true);
  });

  it("익명 계정이 없는 게스트(이 브라우저 전용)는 이 브라우저만 비운다", async () => {
    const { manager, fc } = setup({ captcha: { kind: "failed" } });
    const store = setupStore();
    await manager.signInGuest(store);
    expect(await manager.deleteAccount(store)).toEqual({ ok: true });
    expect(fc.calls.some((c) => c.startsWith("rpc:"))).toBe(false);
    expect(store.getSnapshot().account).toBeNull();
  });
});
