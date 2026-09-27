// 카카오 로그인 세션 ↔ 앱 계정 ↔ 서버 동기화를 잇는 곳.
//
// 흐름
// - [카카오로 시작하기] → signInWithKakao(): Supabase Auth가 카카오 동의 화면으로 보내고, 끝나면 /auth/callback/?code=…
// - 콜백 화면 → completeCallback(): code를 세션으로 바꾸고(PKCE) → 앱 계정(kakao-<회원번호>)으로 로그인 →
//   동기화 시작 → 첫 읽기(서버 기록 합치기)를 기다린 뒤 화면을 고른다(새 사용자는 온보딩, 아니면 홈).
// - 다시 방문 → ensureRestored() → restore(): 저장된 세션이 있으면 같은 방법으로 로그인·동기화. 세션이 끝났으면(만료·다른 탭에서
//   로그아웃) 기록은 이 브라우저에 두고 계정만 로그아웃한다. 확인하지 못했으면(오프라인·번들 못 받음) 온라인이 되거나 잠시 뒤
//   다시 하고, 그 전에 토큰 갱신·로그인 이벤트가 오면 거기서 동기화를 시작한다 — 한 번의 실패로 페이지 내내 꺼져 있지 않게.
// - 게스트·주인 없는 기록을 카카오 계정으로 가져오면(state.ts bindToAccount) 서버 저장 동의 전까지 서버로 보내지 않게
//   가져오기 전에 표시한다(marks.ts). 서버 저장 동의는 온보딩이 acceptServerStorageConsent()로 남긴다.
// - watch(): 스토어의 계정이 카카오에서 다른 것으로 바뀌면(로그아웃·계정 삭제) 동기화를 멈추고 Supabase 세션도 끝낸다.
//   다른 탭에서 로그인하면 이 탭도 동기화를 시작한다.
// - 로그아웃·계정 삭제(설정 화면이 부른다): signOutEverywhere·deleteAccountEverywhere.
//
// 게스트는 Supabase를 전혀 쓰지 않는다. 설정이 없으면 모든 함수가 네트워크 없이 끝난다.

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/config";
import type { PersistedState } from "@/domain/types";
import type { Account } from "@/store/account";
import type { AppStore } from "@/store/appStore";
import { browserLocalStorage } from "@/store/persistence";
import { shouldEraseOnBind } from "@/store/state";
import { createSyncEngine, type FirstFetchResult, type SyncEngine, type SyncEngineOptions, type SyncStatus } from "@/store/sync/engine";
import { createStorageSyncMarks, type SyncMarks } from "@/store/sync/marks";
import type { RemoteStateStore } from "@/store/sync/remote";
import { parseCallbackUrl, stripCallbackParams } from "./callbackUrl";
import { authCallbackUrl, getSupabaseClient, hasStoredAuthSession } from "./client";
import { accountFromUser } from "./kakaoAccount";
import { createSupabaseRemote } from "./remote";

// MARK: 결과 타입

export type KakaoSignInResult = { ok: true } | { ok: false; reason: "notConfigured" | "failed" };

export type CallbackOutcome =
  /** 로그인했다. sync = 서버 기록 첫 읽기 결과(timeout = 기다리다 넘어감 — 뒤에서 계속 시도한다) */
  | { kind: "signedIn"; sync: FirstFetchResult | "timeout" }
  /** cancelled = 카카오 동의 화면에서 취소, failed = 교환 실패·카카오 계정이 아님, notConfigured = 설정 없음 */
  | { kind: "error"; reason: "cancelled" | "failed" | "notConfigured" };

export type SignOutResult =
  /** 로그아웃했다. localDataErased = 이 브라우저의 건강 기록 사본까지 지웠다(서버에 다 올라간 카카오 계정) */
  | { ok: true; localDataErased: boolean }
  /**
   * 서버에 아직 올리지 못한 변경이 있어 아무것도 하지 않았다 — 화면이 알려 주고,
   * 그래도 로그아웃하면 signOutEverywhere(store, { force: true }) — 이때 이 브라우저의 기록은 지우지 않는다(다음 로그인 때 올린다).
   */
  | { ok: false; reason: "unsynced" };

export type DeleteAccountResult =
  | { ok: true }
  /** failed = 서버 삭제 실패(네트워크 등), noSession = 로그인이 끝나 서버에 삭제를 요청할 수 없음(다시 로그인 필요). 둘 다 아무것도 지우지 않았다. */
  | { ok: false; reason: "failed" | "noSession" };

/** 화면용 동기화 상태 — "off" = 동기화하지 않음(게스트·설정 없음·로그아웃). 가짜 표시는 두지 않는다. */
export type AccountSyncStatus = Exclude<SyncStatus, "stopped"> | "off";

/** done = 끝(복원했거나 할 것이 없음), retry = 세션을 확인하지 못했다(오프라인·번들 못 받음) — 나중에 다시 */
export type RestoreResult = "done" | "retry";

/** 세션 확인을 다시 하는 간격(온라인이 되면 바로) */
export const RESTORE_RETRY_DELAYS_MS: readonly number[] = [5_000, 15_000, 30_000, 60_000];

/**
 * 카카오 로그인이 이 브라우저의 게스트·주인 없는 기록을 가져오는가(state.ts bindToAccount의 "귀속") — 가져올 기록이 있을 때만.
 * 같은 계정의 기록(다시 로그인)이나 지워질 다른 실제 계정의 기록은 가져오는 것이 아니다.
 */
export function adoptsLocalRecords(state: PersistedState, accountId: string): boolean {
  if (state.ownerAccountID === accountId || shouldEraseOnBind(state.ownerAccountID, accountId)) return false;
  return (
    state.hasOnboarded ||
    state.profile.consentAccepted ||
    state.symptomHistory.length > 0 ||
    state.moodChecks.length > 0 ||
    state.communityPosts.length > 0
  );
}

// MARK: 의존성

export interface AuthSessionDeps {
  isConfigured: () => boolean;
  getClient: () => Promise<SupabaseClient | null>;
  hasStoredSession: () => boolean;
  createRemote: (client: SupabaseClient, userId: string) => RemoteStateStore;
  /** 합치기 기준·서버 저장 동의 표시(store/sync/marks.ts) */
  marks: SyncMarks;
  /** 브라우저가 다시 온라인이 되면 부른다. 반환값은 해제 함수. 기본: window "online" */
  onOnline?: (listener: () => void) => () => void;
  restoreRetryDelaysMs?: readonly number[];
  /** 지금 주소의 origin(https://5seoyoung.github.io) */
  origin: () => string;
  /** 주소 표시줄만 바꾼다(쓴 code를 지울 때) */
  replaceUrl: (href: string) => void;
  engineOptions?: Partial<Omit<SyncEngineOptions, "store" | "remote" | "accountId" | "marks">>;
  /** 콜백에서 서버 기록 첫 읽기를 기다리는 최대 시간 */
  firstFetchTimeoutMs?: number;
  /** 로그아웃 전 올리기를 기다리는 최대 시간 */
  flushTimeoutMs?: number;
}

export interface AuthSessionManager {
  signInWithKakao(): Promise<KakaoSignInResult>;
  completeCallback(store: AppStore, href: string): Promise<CallbackOutcome>;
  /** 콜백에서 첫 읽기가 실패했을 때 [다시 시도] */
  retryFirstFetch(store: AppStore): Promise<FirstFetchResult | "timeout">;
  restore(store: AppStore): Promise<RestoreResult>;
  /** 페이지를 열 때 한 번(스토어마다) — restore가 retry면 온라인이 되거나 잠시 뒤 다시 한다. */
  ensureRestored(store: AppStore): void;
  /**
   * 서버 저장 동의를 받았다(온보딩의 서버 저장 동의 문구·다시 동의 화면이 부른다) — 이 카카오 계정의 기록을 서버로 올리기 시작한다.
   * 카카오 계정이 아니거나 설정이 없으면 false(아무것도 하지 않음).
   */
  acceptServerStorageConsent(store: AppStore): boolean;
  watch(store: AppStore): () => void;
  signOut(store: AppStore, opts?: { force?: boolean }): Promise<SignOutResult>;
  deleteAccount(store: AppStore): Promise<DeleteAccountResult>;
  syncStatus(): AccountSyncStatus;
  subscribeSyncStatus(listener: () => void): () => void;
  stopSync(): void;
}

const KAKAO = "kakao";

function browserOnOnline(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("online", listener);
  return () => window.removeEventListener("online", listener);
}

function withTimeout<T, F>(p: Promise<T>, ms: number, fallback: F): Promise<T | F> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(fallback);
      },
    );
  });
}

/** 스토어를 읽을 때까지 기다린다(구독이 첫 읽기를 부른다). */
function whenHydrated(store: AppStore): Promise<void> {
  if (store.getSnapshot().hydrated) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    let off: (() => void) | null = null;
    const check = () => {
      if (done || !store.getSnapshot().hydrated) return;
      done = true;
      off?.();
      resolve();
    };
    off = store.subscribe(check);
    if (done) off();
    else check();
  });
}

async function currentSession(client: SupabaseClient): Promise<{ session: Session | null; error: boolean }> {
  try {
    const { data, error } = await client.auth.getSession();
    return { session: data.session, error: error !== null };
  } catch {
    return { session: null, error: true };
  }
}

async function signOutLocal(client: SupabaseClient): Promise<void> {
  try {
    // scope "local" = 이 브라우저의 세션만 끝낸다(기본값 "global"은 휴대폰 등 모든 기기에서 로그아웃시킨다).
    await client.auth.signOut({ scope: "local" });
  } catch {
    // signOut은 실패해도 이 브라우저의 세션은 지운다(auth-js) — 더 할 일이 없다
  }
}

export function createAuthSessionManager(deps: AuthSessionDeps): AuthSessionManager {
  const firstFetchTimeoutMs = deps.firstFetchTimeoutMs ?? 10_000;
  const flushTimeoutMs = deps.flushTimeoutMs ?? 8_000;
  const onOnline = deps.onOnline ?? browserOnOnline;
  const restoreRetryDelays = deps.restoreRetryDelaysMs ?? RESTORE_RETRY_DELAYS_MS;
  /** ensureRestored를 이미 시작한 스토어 */
  const restoring = new WeakSet<AppStore>();

  let active: { engine: SyncEngine; store: AppStore; userId: string; offStatus: () => void } | null = null;
  const statusListeners = new Set<() => void>();
  /** 로그아웃·계정 삭제가 진행 중이면 >0 — 그동안 watch·인증 이벤트가 끼어들지 않는다 */
  let managed = 0;
  let callback: { store: AppStore; outcome: Promise<CallbackOutcome> } | null = null;
  const listenedClients = new WeakMap<SupabaseClient, WeakSet<AppStore>>();

  function emitStatus() {
    for (const l of [...statusListeners]) l();
  }

  function stopSync() {
    if (active === null) return;
    const a = active;
    active = null;
    a.offStatus();
    a.engine.stop();
    emitStatus();
  }

  function startSync(store: AppStore, client: SupabaseClient, userId: string, accountId: string): SyncEngine {
    if (active && active.store === store && active.userId === userId && active.engine.accountId === accountId && active.engine.status() !== "stopped") {
      return active.engine;
    }
    stopSync();
    const engine = createSyncEngine({ ...deps.engineOptions, store, remote: deps.createRemote(client, userId), accountId, marks: deps.marks });
    active = { engine, store, userId, offStatus: engine.onStatus(emitStatus) };
    engine.start();
    emitStatus();
    return engine;
  }

  function engineFor(store: AppStore, accountId: string): SyncEngine | null {
    if (active && active.store === store && active.engine.accountId === accountId && active.engine.status() !== "stopped") return active.engine;
    return null;
  }

  /**
   * 이 브라우저의 기록을 카카오 계정에 묶는다(state.ts bindToAccount). 게스트·주인 없는 기록을 가져오면 먼저 표시해 둔다 —
   * 공용 PC에서는 다른 사람의 기록일 수 있어, 서버 저장 동의 전에는 서버 행에 섞지 않는다(engine.ts mayUpload).
   * 표시를 먼저 쓰는 까닭: 다른 탭이 계정 변경을 보고 동기화를 시작할 때 이미 표시가 있게.
   */
  function signInKakao(store: AppStore, account: Account) {
    if (adoptsLocalRecords(store.getSnapshot().state, account.id)) deps.marks.markAdopted(account.id);
    store.actions.signIn(account);
  }

  /** 세션이 되살아났다(토큰 갱신·다른 탭 로그인) — 이 카카오 계정으로 로그인 중인데 동기화가 없으면 시작한다. */
  function resumeFromSession(store: AppStore, client: SupabaseClient, session: Session) {
    if (managed > 0) return;
    const acct = store.getSnapshot().account;
    if (acct?.provider !== KAKAO || engineFor(store, acct.id) !== null) return;
    if (accountFromUser(session.user)?.id !== acct.id) return;
    startSync(store, client, session.user.id, acct.id);
  }

  /**
   * 인증 이벤트
   * - SIGNED_OUT(다른 탭의 로그아웃·세션 만료) → 이 탭도 동기화를 멈추고 카카오 계정을 로그아웃(기록은 남김).
   * - SIGNED_IN·TOKEN_REFRESHED → 동기화가 꺼져 있으면 다시 켠다(페이지를 열 때 세션 확인이 실패했던 경우).
   */
  function listenAuth(client: SupabaseClient, store: AppStore) {
    let stores = listenedClients.get(client);
    if (!stores) {
      stores = new WeakSet();
      listenedClients.set(client, stores);
    }
    if (stores.has(store)) return;
    stores.add(store);
    client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        // 이벤트 처리 안에서 Supabase를 다시 부르면 인증 잠금이 겹칠 수 있다(supabase-js 안내) — 다음 차례로 미룬다.
        if (session) setTimeout(() => resumeFromSession(store, client, session), 0);
        return;
      }
      if (event !== "SIGNED_OUT") return;
      if (active?.store === store) stopSync();
      if (managed > 0) return;
      if (store.getSnapshot().account?.provider === KAKAO) store.actions.signOut();
    });
  }

  /** 스토어 계정이 이 카카오 계정에서 벗어났다 — 동기화를 멈추고, 남은 Supabase 세션을 끝낸다. */
  async function leftKakao(accountId: string) {
    if (active?.engine.accountId === accountId) stopSync();
    if (managed > 0) return;
    const client = await deps.getClient();
    if (!client) return;
    const { session } = await currentSession(client);
    if (session && accountFromUser(session.user)?.id === accountId) await signOutLocal(client);
  }

  /** 스토어 계정이 카카오가 됐다(다른 탭의 로그인 등) — 같은 사람의 세션이 있으면 동기화를 시작한다. */
  async function enteredKakao(store: AppStore, accountId: string) {
    const client = await deps.getClient();
    if (!client) return;
    listenAuth(client, store);
    const { session, error } = await currentSession(client);
    if (error || !session) return;
    if (store.getSnapshot().account?.id !== accountId) return;
    if (accountFromUser(session.user)?.id === accountId) startSync(store, client, session.user.id, accountId);
  }

  async function doCompleteCallback(store: AppStore, href: string): Promise<CallbackOutcome> {
    if (!deps.isConfigured()) return { kind: "error", reason: "notConfigured" };
    const client = await deps.getClient();
    if (!client) return { kind: "error", reason: "failed" };
    listenAuth(client, store);

    const params = parseCallbackUrl(href);
    const cleaned = stripCallbackParams(href);
    if (cleaned !== null) deps.replaceUrl(cleaned);
    if (params.kind === "error") return { kind: "error", reason: params.cancelled ? "cancelled" : "failed" };

    let session: Session | null = null;
    if (params.kind === "code") {
      try {
        const { data, error } = await client.auth.exchangeCodeForSession(params.code);
        if (!error) session = data.session;
      } catch {
        session = null;
      }
    }
    // 새로고침으로 code를 이미 썼다면 저장된 세션을 쓴다.
    if (session === null) session = (await currentSession(client)).session;
    if (session === null) return { kind: "error", reason: "failed" };

    const account = accountFromUser(session.user);
    if (account === null) {
      await signOutLocal(client);
      return { kind: "error", reason: "failed" };
    }
    await whenHydrated(store);
    // 이 브라우저의 기록 귀속은 기존 규칙 그대로(게스트로 쓰던 기록은 이 계정으로, 다른 실제 계정의 기록은 지움 — state.ts).
    // 가져온 게스트 기록은 서버 저장 동의 전까지 올리지 않는다(signInKakao).
    signInKakao(store, account);
    if (store.getSnapshot().account?.id !== account.id) return { kind: "error", reason: "failed" };
    const engine = startSync(store, client, session.user.id, account.id);
    const sync = await withTimeout(engine.firstFetch(), firstFetchTimeoutMs, "timeout" as const);
    return { kind: "signedIn", sync };
  }

  const manager: AuthSessionManager = {
    async signInWithKakao() {
      if (!deps.isConfigured()) return { ok: false, reason: "notConfigured" };
      const client = await deps.getClient();
      if (!client) return { ok: false, reason: "failed" };
      try {
        // 동의항목(scopes)은 Supabase가 정한다(account_email·profile_nickname·profile_image) — docs/SUPABASE_SETUP.md
        const { error } = await client.auth.signInWithOAuth({ provider: KAKAO, options: { redirectTo: authCallbackUrl(deps.origin()) } });
        return error ? { ok: false, reason: "failed" } : { ok: true };
      } catch {
        return { ok: false, reason: "failed" };
      }
    },

    completeCallback(store, href) {
      // 콜백은 페이지를 한 번 열 때 한 번만 처리한다 — code는 한 번만 쓸 수 있고, 처리하며 주소의 code를 지우므로
      // 개발 모드(StrictMode)의 두 번째 효과가 다시 부르면 같은 약속을 돌려준다(카카오에서 돌아올 때는 늘 새로 페이지를 연다).
      if (callback === null || callback.store !== store) callback = { store, outcome: doCompleteCallback(store, href) };
      return callback.outcome;
    },

    async retryFirstFetch(store) {
      const accountId = store.getSnapshot().account?.id;
      const engine = accountId ? engineFor(store, accountId) : null;
      if (!engine) return "error";
      engine.retryNow();
      return withTimeout(engine.firstFetch(), firstFetchTimeoutMs, "timeout" as const);
    },

    async restore(store) {
      if (!deps.isConfigured()) return "done";
      await whenHydrated(store);
      const before = store.getSnapshot().account;
      // 카카오 계정도 저장된 세션도 없으면(게스트·처음 방문) Supabase를 부르지 않는다.
      if (before?.provider !== KAKAO && !deps.hasStoredSession()) return "done";
      const client = await deps.getClient();
      if (!client) return "retry"; // 번들을 받지 못했다(오프라인 등)
      listenAuth(client, store);
      const { session, error } = await currentSession(client);
      if (error) return "retry"; // 확인하지 못했다(오프라인 등) — 아무것도 바꾸지 않고 나중에 다시
      if (managed > 0) return "done"; // 로그아웃·계정 삭제 중 — 끼어들지 않는다
      const now = store.getSnapshot().account;
      if (session === null) {
        // 세션이 끝났다(만료·다른 곳에서 로그아웃) — 기록은 이 브라우저에 두고 계정만 로그아웃(다시 로그인하면 이어서 올린다).
        if (now?.provider === KAKAO) {
          stopSync();
          store.actions.signOut();
        }
        return "done";
      }
      const mapped = accountFromUser(session.user);
      if (mapped === null) {
        await signOutLocal(client);
        return "done";
      }
      if (now === null) {
        signInKakao(store, mapped); // 다시 방문 — 계정 기록이 없어도 세션이 있으면 같은 사람
      } else if (now.id !== mapped.id) {
        await signOutLocal(client); // 이 브라우저는 다른 계정(게스트 등)으로 쓰는 중 — 남은 세션은 끝낸다
        return "done";
      }
      startSync(store, client, session.user.id, mapped.id);
      return "done";
    },

    ensureRestored(store) {
      if (!deps.isConfigured() || restoring.has(store)) return;
      restoring.add(store);
      let attempt = 0;
      const tryOnce = async () => {
        let result: RestoreResult;
        try {
          result = await manager.restore(store);
        } catch {
          result = "retry";
        }
        if (result === "done") return;
        const delay = restoreRetryDelays[Math.min(attempt, restoreRetryDelays.length - 1)];
        attempt += 1;
        let fired = false;
        let offOnline: (() => void) | null = null;
        const again = () => {
          if (fired) return;
          fired = true;
          clearTimeout(timer);
          offOnline?.();
          void tryOnce();
        };
        const timer = setTimeout(again, delay);
        offOnline = onOnline(again);
      };
      void tryOnce();
    },

    acceptServerStorageConsent(store) {
      if (!deps.isConfigured()) return false;
      const acct = store.getSnapshot().account;
      if (acct?.provider !== KAKAO) return false;
      deps.marks.acceptConsent(acct.id);
      engineFor(store, acct.id)?.retryNow(); // 기다리던 기록을 지금 올린다(엔진이 아직 없으면 시작할 때 표시를 읽는다)
      return true;
    },

    watch(store) {
      if (!deps.isConfigured()) return () => {};
      let prev: Account | null = null;
      let primed = false;
      const onStore = () => {
        const snap = store.getSnapshot();
        if (!snap.hydrated) return;
        const acct = snap.account;
        if (!primed) {
          primed = true;
          prev = acct;
          return;
        }
        if ((acct?.id ?? null) === (prev?.id ?? null)) return;
        const before = prev;
        prev = acct;
        if (before?.provider === KAKAO) void leftKakao(before.id);
        if (acct?.provider === KAKAO) void enteredKakao(store, acct.id);
      };
      const off = store.subscribe(onStore);
      onStore();
      return off;
    },

    async signOut(store, opts = {}) {
      const acct = store.getSnapshot().account;
      if (acct === null) return { ok: true, localDataErased: false };
      if (acct.provider !== KAKAO || !deps.isConfigured()) {
        store.actions.signOut(); // 게스트 — 지금까지와 같다(기록은 남는다)
        return { ok: true, localDataErased: false };
      }
      managed += 1;
      try {
        const engine = engineFor(store, acct.id);
        const flushed = engine ? await engine.flush(flushTimeoutMs) : false;
        if (!flushed && !opts.force) return { ok: false, reason: "unsynced" };
        stopSync();
        const client = await deps.getClient();
        if (client) await signOutLocal(client);
        if (flushed) {
          // 서버에 다 있다 — 공용 PC에 건강 기록 사본을 남기지 않는다(감사 #19). 스토어의 "이 브라우저 데이터 전부 지우기"를 쓴다.
          store.actions.deleteAccount();
          return { ok: true, localDataErased: true };
        }
        store.actions.signOut(); // 올리지 못한 기록은 지우지 않는다 — 같은 계정으로 다시 로그인하면 올린다
        return { ok: true, localDataErased: false };
      } finally {
        managed -= 1;
      }
    },

    async deleteAccount(store) {
      const acct = store.getSnapshot().account;
      if (acct?.provider !== KAKAO || !deps.isConfigured()) {
        store.actions.deleteAccount(); // 게스트 — 이 브라우저에만 있으므로 지우면 끝(지금까지와 같다)
        return { ok: true };
      }
      managed += 1;
      try {
        const client = await deps.getClient();
        if (!client) return { ok: false, reason: "failed" };
        const { session } = await currentSession(client);
        if (!session || accountFromUser(session.user)?.id !== acct.id) return { ok: false, reason: "noSession" };
        stopSync(); // 지우는 동안 올리지 않는다
        let ok = false;
        try {
          const { error } = await client.rpc("delete_my_account");
          ok = !error;
        } catch {
          ok = false;
        }
        if (!ok) {
          // 서버 삭제 실패 — 아무것도 지우지 않고 동기화를 다시 켠다(감사 #18)
          if (store.getSnapshot().account?.id === acct.id) startSync(store, client, session.user.id, acct.id);
          return { ok: false, reason: "failed" };
        }
        await signOutLocal(client);
        store.actions.deleteAccount();
        return { ok: true };
      } finally {
        managed -= 1;
      }
    },

    syncStatus() {
      if (active === null) return "off";
      const s = active.engine.status();
      return s === "stopped" ? "off" : s;
    },

    subscribeSyncStatus(listener) {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },

    stopSync,
  };
  return manager;
}

/** 브라우저 기본 인스턴스 */
export const authSession: AuthSessionManager = createAuthSessionManager({
  isConfigured: isSupabaseConfigured,
  getClient: getSupabaseClient,
  hasStoredSession: hasStoredAuthSession,
  createRemote: createSupabaseRemote,
  marks: createStorageSyncMarks(browserLocalStorage),
  origin: () => window.location.origin,
  replaceUrl: (href) => window.history.replaceState(window.history.state, "", href),
});
