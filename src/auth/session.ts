// 로그인 세션(Supabase Auth) ↔ 앱 계정 ↔ 서버 동기화를 잇는 곳.
//
// 계정 두 가지 — 둘 다 Supabase 사용자다(설정이 있는 빌드).
// - 게스트 = Supabase 익명 사용자(signInAnonymously) → 앱 계정 "guest-<Supabase 사용자 id>".
//   기록은 이 브라우저에 먼저 저장되고, 지금 판의 동의(domain/consent.ts) 뒤에만 서버 행으로 올라간다(store/sync/engine).
//   게스트는 로그아웃이 없다 — 익명 계정은 로그아웃하면 다시 찾을 수 없으므로, 카카오 연결 또는 삭제만 한다(설정 화면).
// - 카카오 → 앱 계정 "kakao-<회원번호>"(iOS와 같은 id).
//
// 흐름
// - [게스트로 시작] → signInGuest(): (Turnstile 토큰) → signInAnonymously → 게스트 계정 → 동기화 시작 → 관문이 온보딩으로.
//   익명 로그인을 못 하면(끄여 있음·요청 제한·오프라인·확인 실패) 지금처럼 이 브라우저 전용 게스트로 시작하고,
//   다음에 페이지를 열 때 익명 계정으로 옮긴다(restore → upgradeGuest).
// - 예전 브라우저 전용 게스트(서버 저장이 없던 빌드, "guest-<무작위>"): 설정이 있는 빌드에 처음 오면 익명 계정을 만들어
//   기록을 그 계정으로 옮긴다(state.ts bindToAccount — 게스트끼리는 보존). 예전 동의에는 판이 없어 다시 동의할 때까지 올리지 않는다.
// - [카카오로 시작하기]·[카카오 계정 연결] → signInWithKakao():
//   · 지금 사용자가 이 브라우저 게스트의 익명 사용자면 linkIdentity — 같은 사용자 id에 카카오가 붙는다(기록·서버 행 그대로).
//   · 아니면 signInWithOAuth.
//   콜백(completeCallback):
//   · code → 세션으로 바꾸고(PKCE) → 카카오 계정으로 로그인 → 동기화 → 첫 읽기(서버 기록 합치기) 뒤 화면을 고른다.
//   · 연결이 거절됨(identity_already_exists = 그 카카오 계정이 이미 다른 온맘 계정, 또는 카카오 이메일이 없거나 확인되지 않음 —
//     linkFallsBackToSignIn) → 그 카카오 계정으로 로그인하러 카카오에 다시 간다
//     (표시 "switch"). 돌아오면 익명 사용자를 아직 유효한 그 세션으로 먼저 지우고(delete_my_account — 실패하면 아무것도 바꾸지
//     않는다), code를 카카오 세션으로 바꾼 뒤 게스트 기록을 그 계정의 서버 기록과 합쳐(mergeStates) 동의가 있으면 올린다.
// - 다시 방문 → ensureRestored() → restore(): 저장된 세션이 이 계정이면 동기화. 카카오 세션이 끝났으면 기록은 두고 로그아웃.
//   게스트인데 익명 세션이 없으면 익명 계정으로 옮긴다 — 앱 화면에서만(공개 화면 — 소개·개인정보처리방침·관리자 — 을 연 것만으로는
//   익명 계정을 만들거나 사람 확인 스크립트를 부르지 않는다: allowGuestUpgrade). 확인하지 못했으면(오프라인·번들 못 받음) 온라인이
//   되거나 잠시 뒤 다시.
// - 이 브라우저에 남아 있던 다른 사람일 수 있는 기록(로그아웃한 게스트·주인 없는 기록)을 카카오 로그인·[게스트로 시작]이 가져오면
//   가져온 시각을 남긴다(marks.ts) — 이 브라우저에서 다시 동의하기 전에는 서버로 보내지 않는다(관문이 다시 동의 화면으로 보낸다).
//   게스트 본인이 연결·전환한 경우, 로그인 중인 게스트를 익명 계정으로 옮기는 경우는 남기지 않는다(signInAs).
// - watch(): 스토어의 계정이 바뀌면 동기화를 멈추거나 시작한다. 카카오에서 벗어나면 Supabase 세션도 끝낸다.
// - 로그아웃·계정 삭제(설정 화면): signOut·deleteAccount.
//
// 설정이 없으면 모든 함수가 네트워크 없이 지금까지와 같게 끝난다(게스트 = 이 브라우저 전용).

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/config";
import type { PersistedState } from "@/domain/types";
import { isGuestID, makeGuestID, type Account } from "@/store/account";
import type { AppStore } from "@/store/appStore";
import { browserLocalStorage } from "@/store/persistence";
import { shouldEraseOnBind } from "@/store/state";
import { createSyncEngine, type FirstFetchResult, type SyncEngine, type SyncEngineOptions, type SyncStatus } from "@/store/sync/engine";
import { createStorageSyncMarks, type SyncMarks } from "@/store/sync/marks";
import type { RemoteStateStore } from "@/store/sync/remote";
import { createAuthFlowStore, type AuthFlowStore, type PendingAuthFlow } from "./authFlow";
import { parseCallbackUrl, stripCallbackParams } from "./callbackUrl";
import { authCallbackUrl, forgetStoredAuthSession, getSupabaseClient, hasStoredAuthSession } from "./client";
import { accountFromSessionUser, accountFromUser, guestAccountFromUser, guestUserId, isAnonymousUser } from "./kakaoAccount";
import { createSupabaseRemote } from "./remote";
import { browserCaptcha, type CaptchaResult } from "./turnstile";

// MARK: 결과 타입

/** anonymous = Supabase 익명 계정으로 시작, local = 이 브라우저 전용 게스트(설정 없음·익명 로그인 실패 — 다음 방문 때 옮긴다) */
export type GuestSignInResult = { ok: true; mode: "anonymous" | "local" };

export type KakaoSignInResult = { ok: true } | { ok: false; reason: "notConfigured" | "failed" };

export type CallbackOutcome =
  /**
   * 로그인했다. sync = 서버 기록 첫 읽기 결과(timeout = 기다리다 넘어감 — 뒤에서 계속 시도한다).
   * linked = 게스트가 카카오 계정을 연결했다(같은 계정에 붙임 또는 이미 있던 카카오 계정으로 옮김) — 화면은 설정으로 돌아간다.
   */
  | { kind: "signedIn"; sync: FirstFetchResult | "timeout"; linked: boolean }
  /** 연결하려던 카카오 계정이 이미 다른 온맘 계정 — 그 계정으로 로그인하러 카카오로 다시 이동하는 중(화면은 그대로 기다린다) */
  | { kind: "redirecting" }
  /** cancelled = 카카오 동의 화면에서 취소, failed = 교환 실패·카카오 계정이 아님·게스트 정리 실패, notConfigured = 설정 없음 */
  | { kind: "error"; reason: "cancelled" | "failed" | "notConfigured" };

export type SignOutResult =
  /** 로그아웃했다. localDataErased = 이 브라우저의 건강 기록 사본까지 지웠다(서버에 다 올라간 카카오 계정) */
  | { ok: true; localDataErased: boolean }
  /**
   * 서버에 아직 올리지 못한 변경이 있어 아무것도 하지 않았다 — 화면이 알려 주고,
   * 그래도 로그아웃하면 signOut(store, { force: true }) — 이때 이 브라우저의 기록은 지우지 않는다(다음 로그인 때 올린다).
   */
  | { ok: false; reason: "unsynced" }
  /** 서버 저장이 켜진 빌드의 게스트 — 로그아웃하면 기록을 다시 찾을 수 없다. 로그아웃 대신 카카오 연결·삭제(아무것도 하지 않았다). */
  | { ok: false; reason: "guest" };

export type DeleteAccountResult =
  | { ok: true }
  /** failed = 서버 삭제 실패(네트워크 등), noSession = 로그인이 끝나 서버에 삭제를 요청할 수 없음(다시 로그인 필요). 둘 다 아무것도 지우지 않았다. */
  | { ok: false; reason: "failed" | "noSession" };

/** 화면용 동기화 상태 — "off" = 동기화하지 않음(설정 없음·로그아웃·브라우저 전용 게스트). 가짜 표시는 두지 않는다. */
export type AccountSyncStatus = Exclude<SyncStatus, "stopped"> | "off";

/** done = 끝(복원했거나 할 것이 없음), retry = 세션을 확인하지 못했다(오프라인·번들 못 받음) — 나중에 다시 */
export type RestoreResult = "done" | "retry";

export interface RestoreOptions {
  /**
   * 게스트를 익명 계정으로 옮겨도 되는가(기본 true) — 앱 화면에서만 true. 공개 화면(소개·개인정보처리방침·관리자)을 열었다고
   * 익명 계정(계정 ID·접속 기록·IP)을 만들거나 사람 확인(Turnstile) 스크립트를 부르지 않는다 — 필요할 때만, 알린 뒤에 모은다.
   * 이미 있는 세션을 이어받는 것(동기화 시작)은 어느 화면에서나 한다.
   */
  allowGuestUpgrade?: boolean;
}

/** 세션 확인을 다시 하는 간격(온라인이 되면 바로) */
export const RESTORE_RETRY_DELAYS_MS: readonly number[] = [5_000, 15_000, 30_000, 60_000];

/** 익명 로그인을 쉬는 시간 — Supabase에서 꺼져 있음 / 요청 제한 / 사람 확인 실패 */
export const ANON_PAUSE_DISABLED_MS = 24 * 60 * 60 * 1000;
export const ANON_PAUSE_RATE_LIMIT_MS = 60 * 60 * 1000;
export const ANON_PAUSE_CAPTCHA_MS = 10 * 60 * 1000;

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
  /**
   * 이 브라우저에 저장된 세션을 네트워크 없이 지운다(client.forgetStoredAuthSession) — 서버에서 사용자를 지운 뒤
   * signOut 전에 부른다(지워진 사용자의 토큰으로 /logout을 보내 403이 나지 않게). 없으면 아무것도 하지 않는다.
   */
  forgetStoredSession?: () => void;
  createRemote: (client: SupabaseClient, userId: string) => RemoteStateStore;
  /** 합치기 기준·가져온 기록 표시(store/sync/marks.ts) */
  marks: SyncMarks;
  /** 카카오를 다녀오는 동안의 표시·익명 로그인 쉬기(authFlow.ts) */
  flow: AuthFlowStore;
  /** 익명 로그인용 CAPTCHA 토큰(turnstile.ts) — 사이트 키가 없으면 { kind: "none" } */
  captcha: () => Promise<CaptchaResult>;
  now?: () => Date;
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
  /**
   * 카카오 로그아웃이 세션을 끝내기 직전(다 올렸거나 [그래도 로그아웃])에 한 번 — 세션이 있어야 지울 수 있는 이 브라우저의 서버 행 정리.
   * 기본 인스턴스: 매일 리마인더 구독 행 삭제 + 브라우저 구독 해지(features/pwa/reminderActions disableReminderNow).
   * 실패·예외는 무시하고, beforeSignOutTimeoutMs가 지나면 기다리지 않고 로그아웃한다(행은 다음 발송 때 410으로 지워진다).
   */
  beforeSignOut?: () => Promise<unknown>;
  beforeSignOutTimeoutMs?: number;
}

export interface AuthSessionManager {
  /** [게스트로 시작] — 설정이 있으면 익명 계정, 없거나 실패하면 이 브라우저 전용 게스트 */
  signInGuest(store: AppStore): Promise<GuestSignInResult>;
  /** [카카오로 시작하기]·[카카오 계정 연결] — 이 브라우저 게스트의 익명 사용자면 연결(linkIdentity), 아니면 로그인 */
  signInWithKakao(store: AppStore): Promise<KakaoSignInResult>;
  completeCallback(store: AppStore, href: string): Promise<CallbackOutcome>;
  /** 콜백에서 첫 읽기가 실패했을 때 [다시 시도] */
  retryFirstFetch(store: AppStore): Promise<FirstFetchResult | "timeout">;
  restore(store: AppStore, opts?: RestoreOptions): Promise<RestoreResult>;
  /**
   * 페이지를 열 때 한 번(스토어마다) — restore가 retry면 온라인이 되거나 잠시 뒤 다시 한다.
   * 공개 화면(소개·개인정보처리방침·관리자)에서 먼저 불렸다가(allowGuestUpgrade: false) 앱 화면으로 오면(true) 한 번 더 한다.
   */
  ensureRestored(store: AppStore, opts?: RestoreOptions): void;
  watch(store: AppStore): () => void;
  signOut(store: AppStore, opts?: { force?: boolean }): Promise<SignOutResult>;
  deleteAccount(store: AppStore): Promise<DeleteAccountResult>;
  syncStatus(): AccountSyncStatus;
  subscribeSyncStatus(listener: () => void): () => void;
  stopSync(): void;
}

const KAKAO = "kakao";
const GUEST = "guest";

/** 서버와 동기화하는 계정인가 — 카카오, 게스트(익명 세션이 있을 때) */
function isServerProvider(account: Account | null | undefined): account is Account {
  return account?.provider === KAKAO || account?.provider === GUEST;
}

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

/**
 * 서버에서 방금 지운 사용자의 세션을 이 브라우저에서 끝낸다 — 저장된 세션을 먼저 지우고(forget) signOut을 부르면 auth-js는
 * 보낼 토큰이 없어 /auth/v1/logout을 부르지 않고(부르면 403 user_not_found) 세션 정리·SIGNED_OUT 알림만 한다.
 */
async function signOutDeletedUser(client: SupabaseClient, forget: (() => void) | undefined): Promise<void> {
  try {
    forget?.();
  } catch {
    // 지우지 못해도 signOut이 세션을 지운다(요청이 403으로 끝날 뿐)
  }
  await signOutLocal(client);
}

/** 서버 함수 delete_my_account — 지금 세션의 사용자(행 + 로그인 계정)를 지운다. 성공하면 true. */
async function deleteCurrentUser(client: SupabaseClient): Promise<boolean> {
  try {
    const { error } = await client.rpc("delete_my_account");
    return !error;
  } catch {
    return false;
  }
}

/**
 * 연결(linkIdentity)이 콜백에서 거절되면(카카오 화면의 [취소]가 아니면 어떤 오류든) "카카오로 로그인 → 게스트 기록 합치기 →
 * 게스트 계정 지우기"로 넘어간다(아래 전환). 오류 코드 목록으로 고르지 않는다 — 거절 까닭이 여럿이고 설정에 따라 코드가 달라진다.
 * - identity_already_exists: 그 카카오 계정이 이미 다른 온맘 계정이다(또는 이미 이 게스트에 붙어 있다 — 지우기 전에 서버로 확인한다).
 * - 이메일: Supabase Auth는 이메일 없는 사용자(익명)에 공급자를 붙일 때 그 공급자의 확인된 이메일을 요구한다(auth
 *   identity.go linkIdentityToUser). 확인되지 않았거나 없으면 확인 메일을 보내려 하고, 그 결과에 따라 email_not_confirmed·
 *   email_exists·over_email_send_rate_limit·email_address_invalid·email_address_not_authorized·unexpected_failure 등으로 거절한다.
 *   카카오 이메일은 선택 동의라 흔한 경우다 — 이때 게스트는 새 사용자 id의 카카오 계정이 된다(기록은 합쳐 가져간다).
 * 전환은 안전하다: 게스트 익명 사용자는 카카오 로그인 code가 돌아오고, 서버(getUser)로 그 사용자에게 카카오가 붙어 있지
 * 않음을 확인한 뒤에만 지운다. 카카오 로그인까지 실패하면 표시가 "switch"라 여기로 다시 오지 않는다(되풀이 없음).
 */
function linkFallsBackToSignIn(
  params: { cancelled: boolean },
  pending: PendingAuthFlow | null,
  guestSession: Session | null,
): pending is Extract<PendingAuthFlow, { kind: "link" }> {
  return pending?.kind === "link" && guestSession !== null && !params.cancelled;
}

/**
 * 서버 기준으로 지금 세션 사용자에게 카카오 identity가 붙어 있는가(getUser — 저장된 세션의 사용자 정보는 낡았을 수 있다).
 * null = 확인하지 못했다(네트워크 등).
 */
async function serverUserHasKakao(client: SupabaseClient): Promise<boolean | null> {
  try {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return null;
    return accountFromUser(data.user) !== null;
  } catch {
    return null;
  }
}

/** 세션의 사용자가 이 계정인가 */
function sessionIs(session: Session, accountId: string): boolean {
  return accountFromSessionUser(session.user)?.id === accountId;
}

type AnonResult = { ok: true; session: Session } | { ok: false; retryable: boolean };

/** ensureRestored의 반복 하나(스토어마다) */
interface RestoreRun {
  /** 게스트를 익명 계정으로 옮겨도 되는가 — 한 번 true(앱 화면)면 계속 true */
  allowGuestUpgrade: boolean;
  /** restore가 도는 중 */
  busy: boolean;
  /** 도는 중에 허용이 새로 생겼다 — 끝나면 바로 다시 */
  again: boolean;
  /** 다시 하기를 기다리는 중이면 지금 다시 하는 함수 */
  retry: (() => void) | null;
  attempt: number;
}

export function createAuthSessionManager(deps: AuthSessionDeps): AuthSessionManager {
  const firstFetchTimeoutMs = deps.firstFetchTimeoutMs ?? 10_000;
  const flushTimeoutMs = deps.flushTimeoutMs ?? 8_000;
  const beforeSignOutTimeoutMs = deps.beforeSignOutTimeoutMs ?? 3_000;
  const onOnline = deps.onOnline ?? browserOnOnline;
  const restoreRetryDelays = deps.restoreRetryDelaysMs ?? RESTORE_RETRY_DELAYS_MS;
  const now = deps.now ?? (() => new Date());
  /** ensureRestored를 시작한 스토어 — 스토어마다 하나의 반복만 돈다(두 반복이 같은 세션으로 겹쳐 로그인하지 않게). */
  const restoring = new WeakMap<AppStore, RestoreRun>();
  /** 이 페이지에서 게스트를 익명 계정으로 옮기려 이미 해 본 스토어(실패해도 페이지마다 한 번 — 요청 제한 30회/시간) */
  const upgradeTried = new WeakSet<AppStore>();

  let active: { engine: SyncEngine; store: AppStore; userId: string; offStatus: () => void } | null = null;
  const statusListeners = new Set<() => void>();
  /** 로그아웃·계정 삭제·계정 전환이 진행 중이면 >0 — 그동안 watch·인증 이벤트가 끼어들지 않는다 */
  let managed = 0;
  let callback: { store: AppStore; outcome: Promise<CallbackOutcome> } | null = null;
  const listenedClients = new WeakMap<SupabaseClient, WeakSet<AppStore>>();

  function emitStatus() {
    for (const l of [...statusListeners]) l();
  }

  /** beforeSignOut을 부르고 끝나거나 beforeSignOutTimeoutMs가 지날 때까지만 기다린다. 던지지 않는다. */
  async function runBeforeSignOut(): Promise<void> {
    const hook = deps.beforeSignOut;
    if (!hook) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.resolve()
          .then(hook)
          .catch(() => undefined),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, beforeSignOutTimeoutMs);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
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
   * 계정으로 로그인하고 이 브라우저의 기록을 묶는다(state.ts bindToAccount — 게스트·주인 없는 기록은 가져오고, 다른 실제 계정의 기록은 지운다).
   * relation — 이 브라우저에 있는 기록과 새 계정의 관계
   * - "sameRow":    같은 Supabase 사용자(게스트에 카카오를 연결) — 서버 행도 같다. 합치기 기준을 새 계정 id로 옮긴다.
   * - "samePerson": 게스트 본인이 고른 다른 계정(이미 있던 카카오 계정으로 전환·익명 계정으로 옮김·브라우저 전용 게스트의 연결).
   * - "unknown":    기록의 주인을 모른다(로그아웃한 게스트·주인 없는 기록) — 가져오면 가져온 시각을 남긴다. 공용 PC에서는 다른 사람의
   *                 기록일 수 있어, 이 브라우저에서 다시 동의받기 전에는 서버로 보내지 않는다(engine.ts).
   * 표시를 먼저 쓰는 까닭: 다른 탭이 계정 변경을 보고 동기화를 시작할 때 이미 표시가 있게.
   * 다른 계정의 기록을 묶으면 이 계정의 예전 합치기 기준은 버린다 — 가져온 프로필과 맞지 않아, 첫 합치기 규칙(서버가 온보딩을 마쳤으면
   * 서버 프로필)을 쓰게.
   */
  function signInAs(store: AppStore, account: Account, relation: "sameRow" | "samePerson" | "unknown") {
    const state = store.getSnapshot().state;
    const owner = state.ownerAccountID;
    if (owner !== account.id) {
      if (relation === "sameRow" && owner !== null) deps.marks.moveBase(owner, account.id);
      else deps.marks.saveBase(account.id, null);
    }
    if (relation === "unknown" && adoptsLocalRecords(state, account.id)) deps.marks.markAdopted(account.id, now().toISOString());
    store.actions.signIn(account);
  }

  /** 익명 로그인 — 쉬는 중이면 하지 않는다. retryable = 네트워크 문제(나중에 다시). */
  async function anonymousSignIn(client: SupabaseClient): Promise<AnonResult> {
    if (deps.flow.anonPaused()) return { ok: false, retryable: false };
    const captcha = await deps.captcha();
    if (captcha.kind === "failed") {
      deps.flow.pauseAnon(ANON_PAUSE_CAPTCHA_MS);
      return { ok: false, retryable: false };
    }
    try {
      const { data, error } = await client.auth.signInAnonymously(captcha.kind === "token" ? { options: { captchaToken: captcha.token } } : undefined);
      if (!error && data.session) return { ok: true, session: data.session };
      const code = (error as { code?: unknown } | null)?.code;
      const status = (error as { status?: unknown } | null)?.status;
      if (code === "anonymous_provider_disabled") deps.flow.pauseAnon(ANON_PAUSE_DISABLED_MS);
      else if (code === "over_request_rate_limit" || status === 429) deps.flow.pauseAnon(ANON_PAUSE_RATE_LIMIT_MS);
      else if (code === "captcha_failed") deps.flow.pauseAnon(ANON_PAUSE_CAPTCHA_MS);
      // status 0 = 네트워크(AuthRetryableFetchError)
      return { ok: false, retryable: error !== null && (status === 0 || status === undefined) && code === undefined };
    } catch {
      return { ok: false, retryable: true };
    }
  }

  /**
   * 게스트를 익명 계정으로 옮긴다 — 예전 브라우저 전용 게스트, 익명 로그인에 실패했던 게스트, 익명 세션이 끝난 게스트.
   * 기록은 새 익명 계정으로 옮긴다(게스트끼리는 보존 — state.ts). 동의에 지금 판이 없으면 다시 동의할 때까지 올리지 않는다.
   */
  async function upgradeGuest(store: AppStore, client: SupabaseClient, guest: Account): Promise<RestoreResult> {
    if (upgradeTried.has(store)) return "done";
    const r = await anonymousSignIn(client);
    if (!r.ok) {
      if (!r.retryable) upgradeTried.add(store);
      return r.retryable ? "retry" : "done";
    }
    upgradeTried.add(store);
    const account = guestAccountFromUser(r.session.user);
    if (account === null || store.getSnapshot().account?.id !== guest.id) return "done"; // 그사이 계정이 바뀌었다
    signInAs(store, account, "samePerson");
    startSync(store, client, r.session.user.id, account.id);
    return "done";
  }

  /** 세션이 되살아났다(토큰 갱신·다른 탭 로그인) — 이 계정으로 로그인 중인데 동기화가 없으면 시작한다. */
  function resumeFromSession(store: AppStore, client: SupabaseClient, session: Session) {
    if (managed > 0) return;
    const acct = store.getSnapshot().account;
    if (!isServerProvider(acct) || engineFor(store, acct.id) !== null) return;
    if (!sessionIs(session, acct.id)) return;
    startSync(store, client, session.user.id, acct.id);
  }

  /**
   * 인증 이벤트
   * - SIGNED_OUT(다른 탭의 로그아웃·세션 만료) → 이 탭도 동기화를 멈추고, 카카오 계정이면 로그아웃(기록은 남김).
   *   게스트는 로그아웃하지 않는다 — 기록은 이 브라우저에 있고, 다음에 페이지를 열 때 새 익명 계정으로 옮긴다.
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

  /** 스토어 계정이 이 계정에서 벗어났다 — 동기화를 멈추고, 카카오였으면 남은 Supabase 세션을 끝낸다(게스트 세션은 둔다). */
  async function leftAccount(account: Account) {
    if (active?.engine.accountId === account.id) stopSync();
    if (managed > 0 || account.provider !== KAKAO) return;
    const client = await deps.getClient();
    if (!client) return;
    const { session } = await currentSession(client);
    if (session && sessionIs(session, account.id)) await signOutLocal(client);
  }

  /** 스토어 계정이 바뀌었다(다른 탭의 로그인 등) — 같은 사람의 세션이 있으면 동기화를 시작한다. */
  async function enteredAccount(store: AppStore, accountId: string) {
    const client = await deps.getClient();
    if (!client) return;
    listenAuth(client, store);
    const { session, error } = await currentSession(client);
    if (error || !session) return;
    if (store.getSnapshot().account?.id !== accountId) return;
    if (sessionIs(session, accountId)) startSync(store, client, session.user.id, accountId);
  }

  async function redirectToKakao(client: SupabaseClient): Promise<boolean> {
    try {
      // 동의항목(scopes)은 Supabase가 정한다(account_email·profile_nickname·profile_image) — docs/SUPABASE_SETUP.md
      const { error } = await client.auth.signInWithOAuth({ provider: KAKAO, options: { redirectTo: authCallbackUrl(deps.origin()) } });
      return !error;
    } catch {
      return false;
    }
  }

  async function doCompleteCallback(store: AppStore, href: string): Promise<CallbackOutcome> {
    if (!deps.isConfigured()) return { kind: "error", reason: "notConfigured" };
    const client = await deps.getClient();
    if (!client) return { kind: "error", reason: "failed" };
    listenAuth(client, store);

    const params = parseCallbackUrl(href);
    const cleaned = stripCallbackParams(href);
    if (cleaned !== null) deps.replaceUrl(cleaned);
    await whenHydrated(store);
    const pending = deps.flow.load();
    /** code를 바꾸기 전의 세션 — 연결·전환이면 게스트의 익명 세션 */
    const before = (await currentSession(client)).session;
    /** 연결·전환을 시작한 그 게스트의 세션이 아직 이 브라우저에 있는가 */
    const guestSession = before !== null && pending !== null && pending.anonUserId === before.user.id ? before : null;

    if (params.kind === "error") {
      // 연결이 거절됐다(그 카카오 계정이 이미 다른 온맘 계정·카카오 이메일 없음 등 — linkFallsBackToSignIn) — 그 카카오 계정으로
      // 로그인해 게스트 기록을 가져간다(이 사람이 고른 카카오 계정이다). 돌아오면 게스트 익명 사용자를 지운다(아래 전환).
      if (linkFallsBackToSignIn(params, pending, guestSession) && guestSession !== null) {
        deps.flow.save({ kind: "switch", guestAccountId: pending.guestAccountId, anonUserId: guestSession.user.id, at: now().toISOString() });
        if (await redirectToKakao(client)) return { kind: "redirecting" };
      }
      deps.flow.clear();
      return { kind: "error", reason: params.cancelled ? "cancelled" : "failed" };
    }

    managed += 1;
    try {
      /** 전환: 지운 익명(게스트) 사용자의 게스트 계정 id */
      let switchedFrom: string | null = null;
      if (params.kind === "code" && pending?.kind === "switch" && guestSession !== null) {
        // 익명 사용자(서버 행·로그인 계정)를 아직 유효한 그 세션으로 먼저 지운다 — 세션을 바꾸면 더는 지울 수 없어 기록이 서버에 남는다.
        // 단, 서버에서 이 사용자에게 이미 카카오가 붙어 있으면(연결은 됐는데 거절 응답이 온 경우) 지우지 않는다 — 방금 로그인한
        // 카카오 계정이 바로 이 사용자다. 확인하지 못했거나 지우지 못하면 아무것도 바꾸지 않는다(게스트 그대로, 나중에 다시).
        if (active?.userId === guestSession.user.id) stopSync();
        const hasKakao = await serverUserHasKakao(client);
        if (hasKakao === null || (!hasKakao && !(await deleteCurrentUser(client)))) {
          deps.flow.clear();
          const acct = store.getSnapshot().account;
          if (acct !== null && sessionIs(guestSession, acct.id)) startSync(store, client, guestSession.user.id, acct.id);
          return { kind: "error", reason: "failed" };
        }
        if (!hasKakao) switchedFrom = pending.guestAccountId;
      }

      let session: Session | null = null;
      if (params.kind === "code") {
        try {
          const { data, error } = await client.auth.exchangeCodeForSession(params.code);
          if (!error) session = data.session;
        } catch {
          session = null;
        }
      }
      // 새로고침으로 code를 이미 썼다면 저장된 세션을 쓴다 — 카카오 세션일 때만(게스트의 익명 세션은 로그인 결과가 아니다).
      if (session === null && switchedFrom === null) {
        const stored = (await currentSession(client)).session;
        if (stored !== null && accountFromUser(stored.user) !== null) session = stored;
      }
      if (session === null) {
        deps.flow.clear();
        // 전환 중 익명 사용자는 이미 지웠다 — 남은 (지워진 사용자의) 세션을 이 브라우저에서 끝낸다. 게스트 기록은 이 브라우저에
        // 그대로 있고, 다음에 페이지를 열 때 새 익명 계정으로 옮긴다(restore → upgradeGuest).
        if (switchedFrom !== null) await signOutDeletedUser(client, deps.forgetStoredSession);
        return { kind: "error", reason: "failed" };
      }

      // 카카오 identity가 있어야 한다(연결은 됐지만 이메일이 확인되지 않아 is_anonymous가 남은 사용자도 카카오 계정이다 — kakaoAccount.ts)
      const account = accountFromUser(session.user);
      if (account === null) {
        deps.flow.clear();
        if (!isAnonymousUser(session.user)) await signOutLocal(client);
        return { kind: "error", reason: "failed" };
      }

      // 이 브라우저의 기록과 새 계정의 관계(signInAs)
      // - 연결 성공: 같은 Supabase 사용자(게스트의 익명 사용자에 카카오가 붙었다) — 서버 행도 같다
      // - 전환: 게스트 본인이 고른 이미 있던 카카오 계정(익명 사용자는 위에서 지웠다)
      // - 브라우저 전용 게스트(익명 계정 없음)가 설정에서 연결: 이 브라우저의 기록 주인이 그 게스트
      const state = store.getSnapshot().state;
      const sameRow = before !== null && before.user.id === session.user.id && state.ownerAccountID === makeGuestID(before.user.id);
      const guestChose =
        switchedFrom !== null || (pending !== null && state.ownerAccountID === pending.guestAccountId && isGuestID(pending.guestAccountId));
      // 이 브라우저의 기록 귀속은 기존 규칙 그대로(게스트로 쓰던 기록은 이 계정으로, 다른 실제 계정의 기록은 지움 — state.ts).
      signInAs(store, account, sameRow ? "sameRow" : guestChose ? "samePerson" : "unknown");
      deps.flow.clear();
      if (store.getSnapshot().account?.id !== account.id) return { kind: "error", reason: "failed" };
      const linked = sameRow || guestChose;
      const engine = startSync(store, client, session.user.id, account.id);
      managed -= 1;
      try {
        const sync = await withTimeout(engine.firstFetch(), firstFetchTimeoutMs, "timeout" as const);
        return { kind: "signedIn", sync, linked };
      } finally {
        managed += 1;
      }
    } finally {
      managed -= 1;
    }
  }

  const manager: AuthSessionManager = {
    async signInGuest(store) {
      const local = (): GuestSignInResult => {
        if (store.getSnapshot().account === null) store.actions.signInGuest();
        return { ok: true, mode: "local" };
      };
      if (!deps.isConfigured()) return local();
      await whenHydrated(store);
      // 이미 로그인했다(두 번 누름·다른 탭) — 익명 계정을 하나 더 만들지 않는다
      if (store.getSnapshot().account !== null) return { ok: true, mode: "local" };
      const client = await deps.getClient();
      if (!client) return local();
      listenAuth(client, store);
      managed += 1;
      try {
        const { session } = await currentSession(client);
        let anon: Session | null = null;
        if (session !== null) {
          const leftover = guestAccountFromUser(session.user);
          // 이 브라우저 기록의 주인인 익명 세션이면 이어 쓴다. 다른 세션(남은 카카오·다른 게스트)은 이 브라우저에서만 끝낸다 —
          // 남의 서버 기록을 새 게스트에게 보이지 않게.
          if (leftover !== null && store.getSnapshot().state.ownerAccountID === leftover.id) anon = session;
          else await signOutLocal(client);
        }
        if (anon === null) {
          const r = await anonymousSignIn(client);
          if (!r.ok) return local();
          anon = r.session;
        }
        const account = guestAccountFromUser(anon.user);
        if (account === null) return local();
        if (store.getSnapshot().account !== null) return { ok: true, mode: "local" }; // 그사이 다른 탭에서 로그인했다
        // 이 브라우저에 남아 있던 기록(예전 빌드에서 로그아웃한 게스트 등)은 주인을 모른다 — 가져오면 다시 동의받기 전에는 올리지 않는다.
        signInAs(store, account, "unknown");
        startSync(store, client, anon.user.id, account.id);
        return { ok: true, mode: "anonymous" };
      } finally {
        managed -= 1;
      }
    },

    async signInWithKakao(store) {
      if (!deps.isConfigured()) return { ok: false, reason: "notConfigured" };
      const client = await deps.getClient();
      if (!client) return { ok: false, reason: "failed" };
      await whenHydrated(store);
      const snap = store.getSnapshot();
      const acct = snap.account;
      const { session } = await currentSession(client);
      const anonAccount = session !== null ? guestAccountFromUser(session.user) : null;
      // 이 브라우저 게스트의 익명 사용자면 연결한다 — 같은 사용자 id에 카카오가 붙어 기록·서버 행이 그대로 이어진다.
      const linkable = anonAccount !== null && (acct === null ? snap.state.ownerAccountID === anonAccount.id : acct.id === anonAccount.id);
      const guestId = acct?.provider === GUEST ? acct.id : linkable ? anonAccount.id : null;
      if (guestId !== null) {
        deps.flow.save({ kind: "link", guestAccountId: guestId, anonUserId: linkable && session ? session.user.id : null, at: now().toISOString() });
      } else {
        deps.flow.clear();
      }
      if (!linkable) {
        if (await redirectToKakao(client)) return { ok: true };
        deps.flow.clear();
        return { ok: false, reason: "failed" };
      }
      try {
        // Supabase 대시보드의 "Allow manual linking"이 켜져 있어야 한다(꺼져 있으면 manual_linking_disabled).
        const { error } = await client.auth.linkIdentity({ provider: KAKAO, options: { redirectTo: authCallbackUrl(deps.origin()) } });
        if (!error) return { ok: true };
      } catch {
        // 아래에서 실패로 알린다
      }
      deps.flow.clear();
      return { ok: false, reason: "failed" };
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

    async restore(store, opts = {}) {
      if (!deps.isConfigured()) return "done";
      const allowUpgrade = opts.allowGuestUpgrade ?? true;
      await whenHydrated(store);
      const before = store.getSnapshot().account;
      // 서버 계정도 저장된 세션도 없으면(로그인 전·처음 방문) Supabase를 부르지 않는다.
      // 게스트는 익명 세션을 확인하고, 없으면 익명 계정으로 옮긴다(쉬는 중·공개 화면이면 하지 않는다).
      if (!deps.hasStoredSession()) {
        if (!isServerProvider(before)) return "done";
        if (before.provider === GUEST && (!allowUpgrade || deps.flow.anonPaused() || upgradeTried.has(store))) return "done";
      }
      const client = await deps.getClient();
      if (!client) return "retry"; // 번들을 받지 못했다(오프라인 등)
      listenAuth(client, store);
      const { session, error } = await currentSession(client);
      if (error) return "retry"; // 확인하지 못했다(오프라인 등) — 아무것도 바꾸지 않고 나중에 다시
      if (managed > 0) return "done"; // 로그아웃·계정 삭제·전환 중 — 끼어들지 않는다
      const now = store.getSnapshot().account;
      /** 게스트를 익명 계정으로 옮긴다 — 앱 화면에서만(공개 화면이면 아무것도 하지 않고, 앱 화면에서 다시 불린다) */
      const upgrade = (guest: Account): Promise<RestoreResult> => (allowUpgrade ? upgradeGuest(store, client, guest) : Promise.resolve("done"));

      if (session === null) {
        // 카카오: 세션이 끝났다(만료·다른 곳에서 로그아웃) — 기록은 이 브라우저에 두고 계정만 로그아웃(다시 로그인하면 이어서 올린다).
        if (now?.provider === KAKAO) {
          stopSync();
          store.actions.signOut();
        }
        // 게스트: 익명 계정이 없다(예전 게스트·익명 로그인에 실패했던 게스트) — 옮긴다.
        if (now?.provider === GUEST) return upgrade(now);
        return "done";
      }

      const mapped = accountFromSessionUser(session.user);
      if (mapped === null) {
        await signOutLocal(client); // 다른 공급자·회원번호 없음
        if (now?.provider === GUEST) return upgrade(now);
        return "done";
      }
      if (now === null) {
        // 다시 방문 — 계정 기록이 없어도 카카오 세션이 있으면 같은 사람. 남은 익명 세션은 [게스트로 시작]이 판단한다.
        if (mapped.provider === KAKAO) {
          signInAs(store, mapped, "unknown");
          startSync(store, client, session.user.id, mapped.id);
        }
        return "done";
      }
      if (now.id === mapped.id) {
        startSync(store, client, session.user.id, mapped.id);
        return "done";
      }
      if (now.provider === GUEST) {
        // 이 게스트의 익명 사용자가 (다른 탭에서) 카카오와 연결됐다 — 같은 사람, 같은 서버 행
        if (guestUserId(now.id) === session.user.id) {
          signInAs(store, mapped, "sameRow");
          startSync(store, client, session.user.id, mapped.id);
          return "done";
        }
        // 다른 익명 세션 — 이 브라우저에서만 끝내고 이 게스트를 새 익명 계정으로 옮긴다(앱 화면에서만)
        if (mapped.provider === GUEST) {
          if (!allowUpgrade) return "done";
          await signOutLocal(client);
          return upgrade(now);
        }
        // 다른 카카오 세션 — 다른 탭에서 로그인이 진행 중일 수 있다. 건드리지 않는다.
        return "done";
      }
      await signOutLocal(client); // 이 브라우저는 다른 계정으로 쓰는 중 — 남은 세션은 끝낸다
      return "done";
    },

    ensureRestored(store, opts = {}) {
      if (!deps.isConfigured()) return;
      const allow = opts.allowGuestUpgrade ?? true;
      const run = restoring.get(store);
      if (run === undefined) {
        const fresh: RestoreRun = { allowGuestUpgrade: allow, busy: false, again: false, retry: null, attempt: 0 };
        restoring.set(store, fresh);
        void runRestore(store, fresh);
        return;
      }
      // 이미 시작했다 — 공개 화면에서 시작한 확인에 앱 화면의 허용(게스트 옮기기)이 새로 생겼을 때만 한 번 더 한다.
      if (!allow || run.allowGuestUpgrade) return;
      run.allowGuestUpgrade = true;
      if (run.busy) run.again = true;
      else if (run.retry !== null) run.retry();
      else void runRestore(store, run);
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
        if (isServerProvider(before)) void leftAccount(before);
        if (isServerProvider(acct)) void enteredAccount(store, acct.id);
      };
      const off = store.subscribe(onStore);
      onStore();
      return off;
    },

    async signOut(store, opts = {}) {
      const acct = store.getSnapshot().account;
      if (acct === null) return { ok: true, localDataErased: false };
      if (!deps.isConfigured()) {
        store.actions.signOut(); // 지금까지와 같다(기록은 남는다)
        return { ok: true, localDataErased: false };
      }
      // 게스트는 로그아웃하면 기록을 다시 찾을 수 없다 — 카카오 연결 또는 삭제로(설정 화면)
      if (acct.provider === GUEST) return { ok: false, reason: "guest" };
      if (acct.provider !== KAKAO) {
        store.actions.signOut();
        return { ok: true, localDataErased: false };
      }
      managed += 1;
      try {
        const engine = engineFor(store, acct.id);
        const flushed = engine ? await engine.flush(flushTimeoutMs) : false;
        if (!flushed && !opts.force) return { ok: false, reason: "unsynced" };
        stopSync();
        const client = await deps.getClient();
        if (client) {
          await runBeforeSignOut(); // 세션이 살아 있을 때 — 이 브라우저의 리마인더 구독 행(DEV_NOTES §10)
          await signOutLocal(client);
        }
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
      if (!deps.isConfigured() || !isServerProvider(acct)) {
        store.actions.deleteAccount(); // 이 브라우저에만 있으므로 지우면 끝(지금까지와 같다)
        return { ok: true };
      }
      managed += 1;
      try {
        const client = await deps.getClient();
        if (acct.provider === GUEST) {
          // 게스트: 익명 계정이 있으면 서버(행 + 익명 로그인 계정)를 먼저 지운다. 없으면(브라우저 전용 게스트) 이 브라우저만.
          if (!client) {
            if (deps.hasStoredSession()) return { ok: false, reason: "failed" };
            store.actions.deleteAccount();
            return { ok: true };
          }
          const { session, error } = await currentSession(client);
          if (error) return { ok: false, reason: "failed" };
          if (session !== null && sessionIs(session, acct.id)) {
            stopSync();
            if (!(await deleteCurrentUser(client))) {
              if (store.getSnapshot().account?.id === acct.id) startSync(store, client, session.user.id, acct.id);
              return { ok: false, reason: "failed" };
            }
            await signOutDeletedUser(client, deps.forgetStoredSession);
          }
          store.actions.deleteAccount();
          return { ok: true };
        }

        if (!client) return { ok: false, reason: "failed" };
        const { session } = await currentSession(client);
        if (!session || !sessionIs(session, acct.id)) return { ok: false, reason: "noSession" };
        stopSync(); // 지우는 동안 올리지 않는다
        if (!(await deleteCurrentUser(client))) {
          // 서버 삭제 실패 — 아무것도 지우지 않고 동기화를 다시 켠다(감사 #18)
          if (store.getSnapshot().account?.id === acct.id) startSync(store, client, session.user.id, acct.id);
          return { ok: false, reason: "failed" };
        }
        await signOutDeletedUser(client, deps.forgetStoredSession);
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

  /** restore 한 번 — retry면 온라인이 되거나 잠시 뒤 다시(ensureRestored). 도는 중에 허용이 생겼으면 끝나자마자 다시. */
  async function runRestore(store: AppStore, run: RestoreRun): Promise<void> {
    run.busy = true;
    run.retry = null;
    let result: RestoreResult;
    try {
      result = await manager.restore(store, { allowGuestUpgrade: run.allowGuestUpgrade });
    } catch {
      result = "retry";
    }
    run.busy = false;
    if (run.again) {
      run.again = false;
      void runRestore(store, run);
      return;
    }
    if (result === "done") return;
    const delay = restoreRetryDelays[Math.min(run.attempt, restoreRetryDelays.length - 1)];
    run.attempt += 1;
    let fired = false;
    let offOnline: (() => void) | null = null;
    const again = () => {
      if (fired) return;
      fired = true;
      clearTimeout(timer);
      offOnline?.();
      void runRestore(store, run);
    };
    const timer = setTimeout(again, delay);
    offOnline = onOnline(again);
    run.retry = again;
  }

  return manager;
}

/** 브라우저 기본 인스턴스 */
export const authSession: AuthSessionManager = createAuthSessionManager({
  isConfigured: isSupabaseConfigured,
  getClient: getSupabaseClient,
  hasStoredSession: hasStoredAuthSession,
  forgetStoredSession: forgetStoredAuthSession,
  createRemote: createSupabaseRemote,
  marks: createStorageSyncMarks(browserLocalStorage),
  flow: createAuthFlowStore(browserLocalStorage),
  captcha: browserCaptcha,
  origin: () => window.location.origin,
  replaceUrl: (href) => window.history.replaceState(window.history.state, "", href),
  // 카카오 로그아웃 직전 — 이 브라우저의 매일 리마인더 구독 행을 세션이 있을 때 지운다(없으면 다음 발송의 410에서 지워짐).
  // 구독이 없으면 서버 요청 없이 끝난다. 동적 import — 리마인더 코드를 로그아웃 때만 받는다.
  beforeSignOut: async () => (await import("@/features/pwa/reminderActions")).disableReminderNow(),
});
