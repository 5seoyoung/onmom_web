import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PersistedState } from "@/domain/types";
import { createAppStore, rootScreenFor, type AppStore } from "@/store/appStore";
import { initialState } from "@/store/defaults";
import { createMemoryStorage, createStoragePersistence, STORAGE_PREFIX, type StorageLike } from "@/store/persistence";
import { createStorageSyncMarks, SYNC_CONSENT_KEY } from "@/store/sync/marks";
import { FakeRemote } from "@/store/sync/testUtils";
import { adoptsLocalRecords, createAuthSessionManager, type AuthSessionManager } from "./session";

const NOW = new Date("2026-09-27T12:00:00+09:00");
const USER_ID = "3f0f9b2e-0000-4000-8000-000000000001";
const CALLBACK = "https://5seoyoung.github.io/onmom_web/auth/callback/";

// Supabase Auth kakao 공급자가 돌려주는 사용자 모양 — 테스트 입력용
function kakaoSession(memberId = "4012345678", nickname = "해님") {
  const data = { provider_id: memberId, sub: memberId, name: nickname };
  return {
    access_token: "t",
    refresh_token: "r",
    expires_in: 3600,
    token_type: "bearer",
    user: { id: USER_ID, app_metadata: { provider: "kakao" }, user_metadata: data, identities: [{ provider: "kakao", id: memberId, identity_data: data }] },
  };
}
type FakeSession = ReturnType<typeof kakaoSession>;

/** supabase-js 클라이언트 흉내 — 쓰는 메서드만 */
function fakeClient(init: { session?: FakeSession | null; codeSession?: FakeSession | null; rpcFails?: boolean; getSessionFails?: number } = {}) {
  let session: FakeSession | null = init.session ?? null;
  let getSessionFails = init.getSessionFails ?? 0;
  const calls: string[] = [];
  const listeners: ((event: string, session: FakeSession | null) => void)[] = [];
  const client = {
    auth: {
      async exchangeCodeForSession(code: string) {
        calls.push(`exchange:${code}`);
        if (!init.codeSession) return { data: { session: null, user: null }, error: { message: "invalid" } };
        session = init.codeSession;
        return { data: { session, user: session.user }, error: null };
      },
      async getSession() {
        if (getSessionFails > 0) {
          getSessionFails -= 1; // 만료된 토큰 갱신이 네트워크 문제로 실패한 경우
          return { data: { session: null }, error: { message: "network" } };
        }
        return { data: { session }, error: null };
      },
      async signOut(opts?: { scope?: string }) {
        calls.push(`signOut:${opts?.scope}`);
        session = null;
        for (const l of listeners) l("SIGNED_OUT", null);
        return { error: null };
      },
      async signInWithOAuth(c: { provider: string; options: { redirectTo: string } }) {
        calls.push(`oauth:${c.provider}:${c.options.redirectTo}`);
        return { data: { provider: c.provider, url: "https://x" }, error: null };
      },
      onAuthStateChange(cb: (event: string, session: FakeSession | null) => void) {
        listeners.push(cb);
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
    async rpc(name: string) {
      calls.push(`rpc:${name}`);
      return init.rpcFails ? { data: null, error: { message: "network" } } : { data: null, error: null };
    },
  };
  /** 인증 이벤트를 흉내 낸다(토큰 갱신 등) */
  const emit = (event: string) => {
    for (const l of listeners) l(event, session);
  };
  return { client: client as unknown as SupabaseClient, calls, hasSession: () => session !== null, emit };
}

/** 이 테스트의 브라우저 저장소 — 스토어와 동기화 표시(marks)가 같이 쓴다 */
let storage: StorageLike = createMemoryStorage();

function setupStore(): AppStore {
  let n = 0;
  const store = createAppStore({ persistence: createStoragePersistence(() => storage), now: () => NOW, newId: () => `id-${++n}` });
  store.load();
  return store;
}

function onboardedState(over: Partial<PersistedState> = {}): PersistedState {
  const s = initialState();
  return { ...s, hasOnboarded: true, profile: { ...s.profile, consentAccepted: true, deliveryDate: "2026-08-01", deliveryMethod: "vaginal" }, ...over };
}

let manager: AuthSessionManager | null = null;
function setup(
  opts: { configured?: boolean; client?: ReturnType<typeof fakeClient>; remote?: FakeRemote; storedSession?: boolean; clientUnavailable?: number } = {},
) {
  const remote = opts.remote ?? new FakeRemote();
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
  const online = new Set<() => void>();
  manager = createAuthSessionManager({
    isConfigured: () => opts.configured ?? true,
    getClient,
    hasStoredSession: () => opts.storedSession ?? false,
    createRemote: () => remote,
    marks: createStorageSyncMarks(() => storage),
    onOnline: (l) => {
      online.add(l);
      return () => online.delete(l);
    },
    origin: () => "https://5seoyoung.github.io",
    replaceUrl,
    firstFetchTimeoutMs: 5_000,
    flushTimeoutMs: 5_000,
  });
  const goOnline = () => {
    for (const l of [...online]) l();
  };
  return { manager, remote, fc, getClient, replaceUrl, goOnline, onlineListeners: () => online.size };
}

beforeEach(() => {
  storage = createMemoryStorage();
  vi.useFakeTimers();
});
afterEach(() => {
  manager?.stopSync();
  manager = null;
  vi.useRealTimers();
});

describe("설정이 없으면 — 네트워크 없음", () => {
  it("카카오 로그인·콜백·로그아웃이 Supabase를 부르지 않는다", async () => {
    const { manager, getClient } = setup({ configured: false });
    const store = setupStore();
    expect(await manager.signInWithKakao()).toEqual({ ok: false, reason: "notConfigured" });
    expect(await manager.completeCallback(store, `${CALLBACK}?code=abc`)).toEqual({ kind: "error", reason: "notConfigured" });
    await manager.restore(store);
    store.actions.signInGuest();
    expect(await manager.signOut(store)).toEqual({ ok: true, localDataErased: false });
    expect(getClient).not.toHaveBeenCalled();
    expect(store.getSnapshot().account).toBeNull();
  });
});

describe("카카오 로그인 시작", () => {
  it("돌아올 주소는 basePath가 붙은 콜백", async () => {
    const { manager, fc } = setup();
    expect(await manager.signInWithKakao()).toEqual({ ok: true });
    // 테스트는 basePath 없이 돈다(NEXT_PUBLIC_BASE_PATH 미설정)
    expect(fc.calls).toEqual(["oauth:kakao:https://5seoyoung.github.io/auth/callback/"]);
  });
});

describe("콜백 — 세션 만들기 → 계정 → 서버 기록 합치기 → 첫 화면", () => {
  it("이미 가입한 사람(서버에 온보딩 기록) → 새 브라우저에서도 홈으로", async () => {
    const remote = new FakeRemote();
    remote.setServer(onboardedState({ ownerAccountID: "kakao-4012345678" }));
    const { manager, fc, replaceUrl } = setup({ remote, client: fakeClient({ codeSession: kakaoSession() }) });
    const store = setupStore();

    const outcome = await manager.completeCallback(store, `${CALLBACK}?code=abc`);
    expect(outcome).toEqual({ kind: "signedIn", sync: "ok" });
    expect(fc.calls).toEqual(["exchange:abc"]);
    expect(replaceUrl).toHaveBeenCalledWith(CALLBACK); // 쓴 code는 주소에서 지운다
    const snap = store.getSnapshot();
    expect(snap.account).toEqual({ id: "kakao-4012345678", name: "해님", provider: "kakao" });
    expect(rootScreenFor(snap)).toBe("main");
    expect(manager.syncStatus()).toBe("synced");
  });

  it("처음 가입(서버에 행 없음) → 온보딩, 동의 전이라 아무것도 올리지 않는다", async () => {
    const { manager, remote } = setup({ client: fakeClient({ codeSession: kakaoSession() }) });
    const store = setupStore();
    expect(await manager.completeCallback(store, `${CALLBACK}?code=abc`)).toEqual({ kind: "signedIn", sync: "ok" });
    expect(rootScreenFor(store.getSnapshot())).toBe("onboarding");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(remote.writes()).toEqual([]);
    expect(manager.syncStatus()).toBe("waitingConsent");

    // 지금 온보딩("내 기기에만 저장" 동의)만으로는 올리지 않는다(감사 #15)
    store.actions.completeOnboarding();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(remote.writes()).toEqual([]);
    expect(manager.syncStatus()).toBe("waitingConsent");

    // 서버 저장 동의 → 그때 처음 만든다
    expect(manager.acceptServerStorageConsent(store)).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(remote.writes()).toEqual(["insert"]);
    expect(manager.syncStatus()).toBe("synced");
  });

  it("같은 페이지에서 두 번 불러도(개발 모드 효과 두 번) code는 한 번만 쓴다", async () => {
    const { manager, fc } = setup({ client: fakeClient({ codeSession: kakaoSession() }) });
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
    const { manager } = setup({ client: fakeClient({ codeSession: null }) });
    const store = setupStore();
    expect(await manager.completeCallback(store, `${CALLBACK}?code=used`)).toEqual({ kind: "error", reason: "failed" });
    expect(store.getSnapshot().account).toBeNull();
  });

  it("서버 기록을 못 읽으면 sync=error — 화면이 온보딩을 보여 주지 않고 다시 시도하게 한다", async () => {
    const remote = new FakeRemote();
    remote.failFetch = 1;
    const { manager } = setup({ remote, client: fakeClient({ codeSession: kakaoSession() }) });
    const store = setupStore();
    expect(await manager.completeCallback(store, `${CALLBACK}?code=abc`)).toEqual({ kind: "signedIn", sync: "error" });
    expect(await manager.retryFirstFetch(store)).toBe("ok");
  });
});

describe("다시 방문 — 저장된 세션 이어받기", () => {
  it("세션이 있고 계정 기록이 없으면 같은 사람으로 로그인하고 동기화한다", async () => {
    const remote = new FakeRemote();
    remote.setServer(onboardedState({ ownerAccountID: "kakao-4012345678" }));
    const { manager } = setup({ remote, storedSession: true, client: fakeClient({ session: kakaoSession() }) });
    const store = setupStore();
    await manager.restore(store);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getSnapshot().account?.id).toBe("kakao-4012345678");
    expect(store.getSnapshot().state.hasOnboarded).toBe(true);
    expect(manager.syncStatus()).toBe("synced");
  });

  it("세션이 끝났으면(만료·다른 곳에서 로그아웃) 카카오 계정만 로그아웃 — 기록은 남는다", async () => {
    const { manager } = setup({ client: fakeClient({ session: null }) });
    const store = setupStore();
    store.actions.signIn({ id: "kakao-4012345678", name: null, provider: "kakao" });
    store.actions.completeOnboarding();
    await manager.restore(store);
    expect(store.getSnapshot().account).toBeNull();
    expect(store.getSnapshot().state.hasOnboarded).toBe(true);
  });

  it("게스트·처음 방문(저장된 세션 없음)은 Supabase를 부르지 않는다", async () => {
    const { manager, getClient } = setup({ storedSession: false });
    const store = setupStore();
    store.actions.signInGuest();
    await manager.restore(store);
    expect(getClient).not.toHaveBeenCalled();
  });
});

describe("게스트로 쓰던 기록을 가져온 카카오 로그인 — 서버 저장 동의 전에는 올리지 않는다(감사 #15, 공용 PC)", () => {
  function guestWithRecords(): AppStore {
    const store = setupStore();
    store.actions.signInGuest();
    store.actions.completeOnboarding();
    store.actions.addSymptomRecord({ lochiaIncreased: false, lochiaRed: false, feverEvent: false, painNrs: 4, redFlagCode: null, postpartumDays: 30 });
    store.actions.signOut();
    return store;
  }

  it("서버에 행이 없으면 만들지 않는다 — 다시 동의하면 그때 만든다", async () => {
    const { manager, remote } = setup({ client: fakeClient({ codeSession: kakaoSession() }) });
    const store = guestWithRecords();
    expect(await manager.completeCallback(store, `${CALLBACK}?code=abc`)).toEqual({ kind: "signedIn", sync: "ok" });
    expect(rootScreenFor(store.getSnapshot())).toBe("main"); // 게스트 기록은 이 계정으로(state.ts) — 이 브라우저에서는 그대로
    await vi.advanceTimersByTimeAsync(60_000);
    expect(remote.calls).toEqual(["fetch"]);
    expect(manager.syncStatus()).toBe("waitingConsent");
    // 로그아웃해도 이 브라우저에만 있는 기록을 지우지 않는다
    expect(await manager.signOut(store)).toEqual({ ok: false, reason: "unsynced" });

    expect(manager.acceptServerStorageConsent(store)).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(remote.calls).toEqual(["fetch", "insert"]);
    expect(remote.serverState().symptomHistory).toHaveLength(1);
  });

  it("서버에 행이 있어도 게스트 기록을 섞어 올리지 않는다 — 다시 동의하면 합쳐 올린다", async () => {
    const remote = new FakeRemote();
    remote.setServer(onboardedState({ ownerAccountID: "kakao-4012345678" }));
    const { manager } = setup({ remote, client: fakeClient({ codeSession: kakaoSession() }) });
    const store = guestWithRecords();
    await manager.completeCallback(store, `${CALLBACK}?code=abc`);
    store.actions.addMoodCheck({ questionID: 1, answer: "no" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(remote.writes()).toEqual([]);
    expect(remote.serverState().symptomHistory).toHaveLength(0);

    manager.acceptServerStorageConsent(store);
    await vi.advanceTimersByTimeAsync(0);
    expect(remote.writes()).toEqual(["update"]);
    expect(remote.serverState().symptomHistory).toHaveLength(1);
    expect(remote.serverState().moodChecks).toHaveLength(1);
  });

  it("다시 열어도(새로고침) 가져온 기록 표시가 남아 동의 전에는 올리지 않는다", async () => {
    const remote = new FakeRemote();
    remote.setServer(onboardedState({ ownerAccountID: "kakao-4012345678" }));
    const first = setup({ remote, client: fakeClient({ codeSession: kakaoSession() }) });
    const store = guestWithRecords();
    await first.manager.completeCallback(store, `${CALLBACK}?code=abc`);
    first.manager.stopSync();

    const again = setup({ remote, storedSession: true, client: fakeClient({ session: kakaoSession() }) });
    const reopened = setupStore(); // 같은 저장소 — 주인은 이제 카카오 계정
    expect(await again.manager.restore(reopened)).toBe("done");
    reopened.actions.addMoodCheck({ questionID: 2, answer: "yes" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(remote.writes()).toEqual([]);
    expect(again.manager.syncStatus()).toBe("waitingConsent");
  });

  it("같은 카카오 계정의 기록(다시 로그인)이나 빈 게스트는 가져오는 것이 아니다", () => {
    const own = { ...onboardedState(), ownerAccountID: "kakao-4012345678" };
    expect(adoptsLocalRecords(own, "kakao-4012345678")).toBe(false);
    expect(adoptsLocalRecords({ ...initialState(), ownerAccountID: "guest-x" }, "kakao-4012345678")).toBe(false);
    expect(adoptsLocalRecords({ ...onboardedState(), ownerAccountID: "guest-x" }, "kakao-4012345678")).toBe(true);
    expect(adoptsLocalRecords({ ...onboardedState(), ownerAccountID: null }, "kakao-4012345678")).toBe(true);
    // 다른 실제 계정의 기록은 로그인 때 지워진다 — 가져오지 않는다
    expect(adoptsLocalRecords({ ...onboardedState(), ownerAccountID: "kakao-999" }, "kakao-4012345678")).toBe(false);
  });

  it("카카오가 아닌 계정·설정 없음에서는 서버 저장 동의를 남기지 않는다", () => {
    const { manager } = setup();
    const store = setupStore();
    store.actions.signInGuest();
    expect(manager.acceptServerStorageConsent(store)).toBe(false);
    expect(storage.getItem(SYNC_CONSENT_KEY)).toBeNull();
  });
});

describe("페이지를 열 때 세션을 확인하지 못해도 동기화가 꺼진 채 남지 않는다", () => {
  function signedInKakaoStore(): AppStore {
    const store = setupStore();
    store.actions.signIn({ id: "kakao-4012345678", name: "해님", provider: "kakao" });
    return store;
  }

  it("세션 확인 실패(오프라인) → retry, 뒤에 토큰 갱신 이벤트가 오면 동기화를 시작한다", async () => {
    const remote = new FakeRemote();
    remote.setServer(onboardedState({ ownerAccountID: "kakao-4012345678" }));
    const fc = fakeClient({ session: kakaoSession(), getSessionFails: 1 });
    const { manager } = setup({ remote, client: fc });
    const store = signedInKakaoStore();

    expect(await manager.restore(store)).toBe("retry");
    expect(manager.syncStatus()).toBe("off");
    expect(remote.calls).toEqual([]);
    expect(store.getSnapshot().account?.id).toBe("kakao-4012345678"); // 아무것도 바꾸지 않았다

    fc.emit("TOKEN_REFRESHED");
    await vi.advanceTimersByTimeAsync(0);
    expect(remote.calls).toEqual(["fetch"]);
    expect(manager.syncStatus()).toBe("synced");
  });

  it("ensureRestored — 온라인이 되면 바로 다시 확인한다", async () => {
    const remote = new FakeRemote();
    remote.setServer(onboardedState({ ownerAccountID: "kakao-4012345678" }));
    const { manager, goOnline, onlineListeners } = setup({ remote, client: fakeClient({ session: kakaoSession(), getSessionFails: 1 }) });
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
    const remote = new FakeRemote();
    remote.setServer(onboardedState({ ownerAccountID: "kakao-4012345678" }));
    const { manager } = setup({ remote, clientUnavailable: 2, client: fakeClient({ session: kakaoSession() }) });
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
    const remote = new FakeRemote();
    const fc = fakeClient({ session: kakaoSession("555"), getSessionFails: 1 });
    const { manager } = setup({ remote, client: fc });
    const store = signedInKakaoStore();
    expect(await manager.restore(store)).toBe("retry");
    fc.emit("SIGNED_IN");
    await vi.advanceTimersByTimeAsync(0);
    expect(remote.calls).toEqual([]);
    expect(manager.syncStatus()).toBe("off");
  });
});

describe("로그아웃", () => {
  async function signedIn(opts: { failWrite?: number } = {}) {
    const remote = new FakeRemote();
    remote.setServer(onboardedState({ ownerAccountID: "kakao-4012345678" }));
    remote.failWrite = opts.failWrite ?? 0;
    const ctx = setup({ remote, client: fakeClient({ codeSession: kakaoSession() }) });
    const store = setupStore();
    await ctx.manager.completeCallback(store, `${CALLBACK}?code=abc`);
    return { ...ctx, store };
  }
  const keys = (s: StorageLike) => Array.from({ length: s.length }, (_, i) => s.key(i)!).filter((k) => k.startsWith(STORAGE_PREFIX));

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

  it("게스트는 지금까지와 같다 — 계정만 로그아웃, Supabase 호출 없음", async () => {
    const { manager, getClient } = setup();
    const store = setupStore();
    store.actions.signInGuest();
    store.actions.completeOnboarding();
    expect(await manager.signOut(store)).toEqual({ ok: true, localDataErased: false });
    expect(store.getSnapshot().state.hasOnboarded).toBe(true);
    expect(getClient).not.toHaveBeenCalled();
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
    const remote = new FakeRemote();
    remote.setServer(onboardedState({ ownerAccountID: "kakao-4012345678" }));
    const ctx = setup({ remote, client: fakeClient({ codeSession: kakaoSession(), rpcFails }) });
    const store = setupStore();
    await ctx.manager.completeCallback(store, `${CALLBACK}?code=abc`);
    return { ...ctx, store };
  }

  it("서버 삭제가 실패하면 아무것도 지우지 않고 오류(감사 #18)", async () => {
    const { manager, store, fc } = await signedIn(true);
    expect(await manager.deleteAccount(store)).toEqual({ ok: false, reason: "failed" });
    expect(fc.calls).toContain("rpc:delete_my_account");
    expect(fc.calls).not.toContain("signOut:local");
    expect(store.getSnapshot().account?.id).toBe("kakao-4012345678");
    expect(store.getSnapshot().state.hasOnboarded).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(manager.syncStatus()).toBe("synced"); // 동기화를 다시 켰다
  });

  it("서버 삭제가 성공했을 때만 로그아웃하고 이 브라우저를 비운다", async () => {
    const { manager, store, fc } = await signedIn(false);
    expect(await manager.deleteAccount(store)).toEqual({ ok: true });
    expect(fc.calls.slice(-2)).toEqual(["rpc:delete_my_account", "signOut:local"]);
    expect(store.getSnapshot().account).toBeNull();
    expect(store.getSnapshot().state.hasOnboarded).toBe(false);
  });

  it("세션이 끝났으면 서버에 요청할 수 없다 — noSession, 아무것도 지우지 않는다", async () => {
    const { manager } = setup({ client: fakeClient({ session: null }) });
    const store = setupStore();
    store.actions.signIn({ id: "kakao-4012345678", name: null, provider: "kakao" });
    expect(await manager.deleteAccount(store)).toEqual({ ok: false, reason: "noSession" });
    expect(store.getSnapshot().account?.id).toBe("kakao-4012345678");
  });
});
