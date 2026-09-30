// 서버 동기화 엔진 — 로그인한 계정 하나(카카오, 또는 Supabase 익명 계정인 게스트)의 앱 상태를 서버의 한 행과 맞춘다.
// 어느 계정을 동기화할지는 만드는 쪽(src/auth/session.ts)이 정한다.
//
// 지키는 것
// - 첫 읽기가 성공하기 전에는 절대 쓰지 않는다(감사 #13) — 서버에 있는 기록을 빈 상태로 덮지 않게.
// - 지금 판의 동의(domain/consent.ts hasCurrentConsent — profile.consentVersion) 전에는 건강 정보를 서버로 보내지 않는다
//   (감사 #15·#20, 판단은 mayUpload). 서버에 행이 있어도 마찬가지다 — 동의는 행이 아니라 상태의 프로필에 있다.
//   · 다른 사람일 수 있는 기록을 이 계정으로 가져왔으면(marks.ts adoptedAt — 공용 PC에서 로그아웃한 게스트의 기록 등)
//     가져온 뒤 이 브라우저에서 받은 동의가 있어야 보낸다(판단은 합치기 전 이 브라우저의 상태로만 — 서버 행의 동의 시각은 보지 않는다).
//     그 전에는 합친 상태의 동의 도장을 이 브라우저에서 지워 앱 관문이 다시 동의 화면으로 보내게 한다(서버 행의 동의가 가져온 기록까지 덮지 않게).
// - 행이 있으면: 서버 + 이 브라우저를 합쳐(merge.ts) 이 브라우저에 적용하고, 서버와 다르면 올린다.
//   합치기 기준(마지막으로 서버와 맞춘 프로필·산모수첩)은 이 브라우저에 저장해 두고 다음에 페이지를 열 때 쓴다 —
//   올리기 전에 탭이 닫혀도 이 브라우저에서 고친 칸을 서버 값으로 되돌리지 않게.
// - 그 뒤 변경은 1.5초 모아 올린다. 페이지가 가려지면(앱 전환·탭 닫기) 기다리지 않고 바로 올려 본다.
//   쓰기는 "서버의 updated_at이 내가 마지막으로 본 값일 때만"(낙관적 동시성).
//   0행이면 다른 기기가 먼저 쓴 것 → 다시 읽고 합친 뒤 재시도(최대 3번).
// - 실패하면 이 브라우저의 데이터는 그대로 두고 잠시 뒤 다시 시도한다(3초 → 10초 → 30초 → 60초).
// - 서버 행의 형식 번호가 이 웹보다 높으면 읽기만 한다(옛 웹이 새 형식의 칸을 지우지 않게) — 그 뒤로는 어떤 쓰기도 하지 않는다.
// - 스토어의 계정이 바뀌면(로그아웃·다른 계정) 스스로 멈춘다 — 다른 사람의 데이터를 이 계정 행에 쓰지 않게.
//
// 한 번에 하나의 작업만 돈다(읽기·쓰기를 줄 세운다).

import { hasCurrentConsent } from "@/domain/consent";
import type { PersistedState } from "@/domain/types";
import type { AppStore } from "../appStore";
import { decodePersisted, type DecodeDeps } from "../decode";
import { randomId } from "../ids";
import { withoutConsentStamp } from "../state";
import { canonicalJSON } from "./canonical";
import type { SyncMarks } from "./marks";
import { mergeStates } from "./merge";
import { STATE_SCHEMA_VERSION, type RemoteStateStore } from "./remote";

export type SyncStatus =
  /** 첫 읽기 중 — 아직 아무것도 쓰지 않았다 */
  | "loading"
  /** 동의 전 — 서버로 보내지 않는다(지금 판의 동의 전: 온보딩 전·예전 판·다시 동의받기 전의 가져온 기록) */
  | "waitingConsent"
  /** 바뀐 것이 있어 곧 올린다(모아 보내기 대기·전송 중) */
  | "pending"
  /** 서버와 이 브라우저가 같다 */
  | "synced"
  /** 마지막 시도가 실패했다 — 데이터는 이 브라우저에 있고, 잠시 뒤 다시 시도한다 */
  | "error"
  /** 서버 형식이 이 웹보다 새롭다 — 읽기만 한다 */
  | "outdated"
  /** 멈춤(로그아웃·계정 바뀜) */
  | "stopped";

/** 첫 읽기 결과 — 로그인 콜백이 화면을 고르기 전에 기다린다. */
export type FirstFetchResult = "ok" | "error" | "outdated" | "stopped";

export const SYNC_DEBOUNCE_MS = 1_500;
export const SYNC_RETRY_DELAYS_MS: readonly number[] = [3_000, 10_000, 30_000, 60_000];
export const SYNC_MAX_CONFLICT_RETRIES = 3;

export interface SyncEngineOptions {
  store: AppStore;
  remote: RemoteStateStore;
  /** 이 엔진이 맡은 계정 id("kakao-…" 또는 익명 게스트 "guest-<Supabase 사용자 id>") — 스토어의 계정이 이것과 다르면 멈춘다. */
  accountId: string;
  /** 합치기 기준·가져온 기록 표시(marks.ts) — 브라우저에서는 localStorage, 테스트는 메모리 */
  marks: SyncMarks;
  /**
   * 페이지가 가려질 때(visibilitychange → hidden, pagehide) 부를 함수를 등록한다. 반환값은 해제 함수.
   * 기본: 브라우저 이벤트(브라우저 밖이면 아무것도 안 함).
   */
  onPageHide?: (listener: () => void) => () => void;
  debounceMs?: number;
  retryDelaysMs?: readonly number[];
  maxConflictRetries?: number;
  /** 서버 JSON을 읽을 때 빠진 id·날짜를 채울 값(기본: 지금 시각·UUID) */
  decodeDeps?: () => DecodeDeps;
}

export interface SyncEngine {
  readonly accountId: string;
  /** 스토어 구독을 시작하고 첫 읽기를 한다. 두 번 불러도 한 번만. */
  start(): void;
  /** 멈춘다 — 예약된 쓰기를 버리고, 진행 중인 요청의 결과는 무시한다. 다시 시작할 수 없다. */
  stop(): void;
  status(): SyncStatus;
  onStatus(listener: (status: SyncStatus) => void): () => void;
  /** 첫 읽기가 끝났으면 바로, 아니면 다음 읽기 시도의 결과. 실패해도 엔진은 뒤에서 다시 시도한다. */
  firstFetch(): Promise<FirstFetchResult>;
  /** 재시도 대기를 건너뛰고 지금 다시 시도한다. */
  retryNow(): void;
  /**
   * 기다리는 변경을 지금 올린다(로그아웃 전). timeoutMs 안에 서버가 이 브라우저와 같아지면 true.
   * 온보딩 동의 전이라 저장된 기록이 없으면 true. 첫 읽기를 못 했거나, 올리지 못했거나, 지금 판의 동의 전이라
   * 기록이 이 브라우저에만 있거나, 서버 형식이 더 새로워 읽기만 하는 중이면 false.
   */
  flush(timeoutMs: number): Promise<boolean>;
}

/** 브라우저의 "페이지가 가려짐" 이벤트 — 휴대폰은 앱을 바꾸면 탭을 그대로 끝내기도 해서 hidden을 마지막 기회로 본다. */
export function browserPageHide(listener: () => void): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  const onVisibility = () => {
    if (document.visibilityState === "hidden") listener();
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", listener);
  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", listener);
  };
}

export function createSyncEngine(opts: SyncEngineOptions): SyncEngine {
  const { store, remote, accountId, marks } = opts;
  const onPageHide = opts.onPageHide ?? browserPageHide;
  const debounceMs = opts.debounceMs ?? SYNC_DEBOUNCE_MS;
  const retryDelays = opts.retryDelaysMs ?? SYNC_RETRY_DELAYS_MS;
  const maxConflicts = opts.maxConflictRetries ?? SYNC_MAX_CONFLICT_RETRIES;
  const decodeDeps = opts.decodeDeps ?? (() => ({ now: new Date(), newId: randomId }));

  let started = false;
  let stopped = false;
  /** 첫 읽기가 성공했는가 — 이 전에는 쓰지 않는다 */
  let fetched = false;
  let needFetch = true;
  let readOnly = false;
  /** 서버가 가진 상태(알 때) — 같은지 비교·충돌 뒤 합치기의 기준 */
  let server: { state: PersistedState; key: string } | null = null;
  /** 내 행의 updated_at — null이면 행이 없다(fetched일 때) */
  let serverUpdatedAt: string | null = null;
  let status: SyncStatus = "loading";
  let timer: ReturnType<typeof setTimeout> | null = null;
  let failures = 0;
  let chain: Promise<void> = Promise.resolve();
  let unsubscribeStore: (() => void) | null = null;
  let offPageHide: (() => void) | null = null;
  /** 마지막으로 본 스토어 상태(참조) — 같은 상태로 다시 알림이 와도 무시 */
  let lastSeenLocal: PersistedState | null = null;
  const statusListeners = new Set<(s: SyncStatus) => void>();
  const fetchWaiters = new Set<(r: FirstFetchResult) => void>();

  function setStatus(next: SyncStatus) {
    if (next === status) return;
    status = next;
    for (const l of [...statusListeners]) l(next);
  }

  function notifyFetch(result: FirstFetchResult) {
    const waiters = [...fetchWaiters];
    fetchWaiters.clear();
    for (const w of waiters) w(result);
  }

  /** 스토어 상태 — 이 계정으로 로그인한 동안만. 아니면 null(쓰면 안 된다). */
  function ownLocal(): PersistedState | null {
    const snap = store.getSnapshot();
    if (!snap.hydrated || snap.account?.id !== accountId) return null;
    return snap.state;
  }

  function payloadOf(local: PersistedState): PersistedState {
    return local.ownerAccountID === accountId ? local : { ...local, ownerAccountID: accountId };
  }

  /**
   * 가져온 기록이 아직 다시 동의받지 않았는가 — 가져온 시각(marks.ts) 뒤에 받은 동의가 없으면 true.
   * 가져온 뒤 동의를 받았으면 표시를 지운다(다음부터는 보통 계정과 같다).
   */
  function adoptedPending(profile: PersistedState["profile"]): boolean {
    const adoptedAt = marks.adoptedAt(accountId);
    if (adoptedAt === null) return false;
    const acceptedAt = profile.consentAcceptedAt === null ? Number.NaN : Date.parse(profile.consentAcceptedAt);
    if (hasCurrentConsent(profile) && !Number.isNaN(acceptedAt) && acceptedAt >= Date.parse(adoptedAt)) {
      marks.clearAdopted(accountId);
      return false;
    }
    return true;
  }

  /**
   * 서버로 보내도 되는가(감사 #15·#20) — 지금 판의 동의(domain/consent.ts). 가져온 기록은 가져온 뒤의 동의까지.
   * 서버에 행이 있다는 것만으로는 보내지 않는다.
   */
  function mayUpload(payload: PersistedState): boolean {
    return hasCurrentConsent(payload.profile) && !adoptedPending(payload.profile);
  }

  /**
   * 가져온 기록이 다시 동의받기 전이면 합친(또는 이 브라우저의) 상태의 동의 도장을 지운다 — 앱 관문이 다시 동의 화면으로 보낸다.
   * 다시 동의받았는지는 이 브라우저의 상태(local)로만 판단한다 — 합친 상태의 동의는 서버 행(다른 기기)에서 왔을 수 있고,
   * 그 시각이 가져온 시각보다 뒤여도(다른 기기의 시계가 빠름·가져온 뒤 다른 기기에서 동의) 이 브라우저에서 받은 동의가 아니다.
   * 도장을 지운 뒤로는 이 브라우저에서 다시 동의하기 전까지 local에도 도장이 없어 mayUpload가 그대로 막는다.
   */
  function guardAdopted(local: PersistedState, next: PersistedState): PersistedState {
    return adoptedPending(local.profile) ? withoutConsentStamp(next) : next;
  }

  /** 서버가 가진 상태를 기억한다 — 다음 합치기의 기준(이 페이지 안에서는 server, 다음 페이지에서는 저장된 두 칸). */
  function rememberServer(state: PersistedState | null, key?: string) {
    server = state === null ? null : { state, key: key ?? canonicalJSON(state) };
    marks.saveBase(accountId, state === null ? null : { profile: state.profile, maternity: state.maternity });
  }

  /** 첫 합치기의 기준 — 이 브라우저가 이 계정으로 서버와 맞춘 적이 있으면 그때의 프로필·산모수첩 */
  function savedBase(local: PersistedState) {
    // 이 브라우저의 상태가 온보딩 전(= 저장 데이터를 잃었거나 깨져 기본값으로 읽힌 경우 포함)이면 기준을 쓰지 않는다.
    // 기준과 비교하면 비어 있는 프로필 칸이 전부 "이 브라우저가 지운 것"으로 보여 서버의 출산일·분만 방식을 빈 값으로 덮는다.
    // 온보딩 전에는 프로필을 편집할 수 없으므로 여기서 기준을 버려도 사용자의 변경은 잃지 않는다(첫 합치기 규칙 = 서버 우선).
    if (!local.hasOnboarded) return null;
    return local.ownerAccountID === accountId ? marks.loadBase(accountId) : null;
  }

  /** 페이지가 가려진다 — 모아 두던 변경(또는 재시도 대기)을 기다리지 않고 지금 올려 본다(되는 만큼). */
  function flushOnHide() {
    if (stopped || !fetched || readOnly || timer === null) return;
    clearTimer();
    void enqueue();
  }

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function schedule(delayMs: number) {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      void enqueue();
    }, delayMs);
  }

  /** 작업을 줄 세운다 — 반환값은 이 작업이 끝날 때 풀린다. */
  function enqueue(): Promise<void> {
    const job = chain.then(() =>
      run().catch(() => {
        if (!stopped) fail();
      }),
    );
    chain = job;
    return job;
  }

  function fail() {
    setStatus("error");
    const delay = retryDelays[Math.min(failures, retryDelays.length - 1)];
    failures += 1;
    schedule(delay);
  }

  function onStoreChange() {
    if (stopped) return;
    const snap = store.getSnapshot();
    if (!snap.hydrated) return;
    if (snap.account?.id !== accountId) {
      stop();
      return;
    }
    if (snap.state === lastSeenLocal) return;
    lastSeenLocal = snap.state;
    // 첫 읽기 전에는 모아 두기만 한다 — 첫 읽기가 끝나면 그 자리에서 올릴지 정한다.
    if (!fetched || readOnly) return;
    const payload = payloadOf(snap.state);
    if (server !== null && canonicalJSON(payload) === server.key) {
      if (timer === null && status !== "error") setStatus("synced");
      return;
    }
    if (!mayUpload(payload)) {
      setStatus("waitingConsent");
      return;
    }
    setStatus("pending");
    schedule(debounceMs);
  }

  async function run(): Promise<void> {
    for (let conflicts = 0; !stopped; conflicts++) {
      if (needFetch) {
        if (!fetched) setStatus("loading");
        const res = await remote.fetch();
        if (stopped) return;
        if (!res.ok) {
          notifyFetch("error");
          fail();
          return;
        }
        const local = ownLocal();
        if (local === null) {
          stop();
          return;
        }
        needFetch = false;
        if (res.row !== null && res.row.schemaVersion > STATE_SCHEMA_VERSION) {
          readOnly = true;
          fetched = true;
          clearTimer();
          setStatus("outdated");
          notifyFetch("outdated");
          return;
        }
        if (res.row === null) {
          rememberServer(null);
          serverUpdatedAt = null;
          const guarded = guardAdopted(local, local);
          if (guarded !== local) {
            lastSeenLocal = guarded;
            store.replaceState(guarded);
          }
        } else {
          const serverState: PersistedState = { ...decodePersisted(res.row.state, decodeDeps()), ownerAccountID: accountId };
          // 기준 = 이 브라우저가 마지막으로 서버와 맞춘 상태 — 이 브라우저가 그 뒤 바꾼 칸을 지킨다.
          // 이 페이지에서 이미 맞췄으면(충돌 뒤 다시 읽기) 그때의 서버 상태, 처음이면 지난번 페이지가 저장해 둔 것.
          // 둘 다 없으면(새 브라우저·가져온 게스트 기록) 첫 합치기 규칙(서버가 온보딩을 마쳤으면 서버 프로필).
          const base = fetched ? (server?.state ?? null) : savedBase(local);
          const merged = guardAdopted(local, mergeStates(serverState, local, { accountId, base }));
          rememberServer(serverState);
          serverUpdatedAt = res.row.updatedAt;
          if (canonicalJSON(merged) !== canonicalJSON(local)) {
            lastSeenLocal = merged; // 적용하며 오는 스토어 알림은 내 것 — 다시 올리기를 예약하지 않게
            store.replaceState(merged);
          }
        }
        fetched = true;
        notifyFetch("ok");
      }
      // 서버 형식이 더 새롭다 — 이후의 flush·재시도도 쓰지 않는다(행이 없어져도 옛 형식으로 새로 만들지 않는다).
      if (readOnly) return;

      const local = ownLocal();
      if (local === null) {
        stop();
        return;
      }
      const payload = payloadOf(local);
      const key = canonicalJSON(payload);
      if (server !== null && server.key === key) {
        failures = 0;
        setStatus("synced");
        return;
      }
      if (!mayUpload(payload)) {
        failures = 0;
        setStatus("waitingConsent");
        return;
      }

      setStatus("pending");
      const res = serverUpdatedAt === null ? await remote.insert(payload) : await remote.update(payload, serverUpdatedAt);
      if (stopped) return;
      if (res.ok) {
        rememberServer(payload, key);
        serverUpdatedAt = res.updatedAt;
        failures = 0;
        // 보내는 동안 또 바뀌었으면 다시 모아 올린다.
        const now = ownLocal();
        if (now !== null && canonicalJSON(payloadOf(now)) !== key) {
          if (timer === null) schedule(debounceMs);
        } else {
          setStatus("synced");
        }
        return;
      }
      if (res.conflict && conflicts < maxConflicts) {
        needFetch = true; // 다른 기기가 먼저 썼다 — 다시 읽고 합쳐서 다시 쓴다
        continue;
      }
      fail();
      return;
    }
  }

  function isFlushed(): boolean {
    const local = ownLocal();
    if (local === null || readOnly) return false;
    const payload = payloadOf(local);
    // 온보딩 동의 전에는 저장된 건강 기록이 없다(온보딩 입력은 [온맘 시작하기] 때 저장) — 올릴 것이 없다.
    if (!payload.profile.consentAccepted) return true;
    // 지금 판의 동의 전이면 기록이 이 브라우저에만 있다 → server와 달라 false(로그아웃이 지우지 않게).
    // 첫 읽기 전이면 server가 없어 false.
    return server !== null && server.key === canonicalJSON(payload);
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    clearTimer();
    unsubscribeStore?.();
    unsubscribeStore = null;
    offPageHide?.();
    offPageHide = null;
    setStatus("stopped");
    notifyFetch("stopped");
  }

  return {
    accountId,
    start() {
      if (started || stopped) return;
      started = true;
      const off = store.subscribe(onStoreChange);
      const snap = store.getSnapshot();
      if (!stopped && snap.hydrated && snap.account?.id !== accountId) stop();
      if (stopped) {
        off(); // 구독하며 읽은 스토어의 계정이 달랐다
        return;
      }
      unsubscribeStore = off;
      offPageHide = onPageHide(flushOnHide);
      lastSeenLocal = snap.state;
      void enqueue();
    },
    stop,
    status: () => status,
    onStatus(listener) {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    firstFetch() {
      if (stopped) return Promise.resolve("stopped");
      if (fetched) return Promise.resolve(readOnly ? "outdated" : "ok");
      return new Promise((resolve) => fetchWaiters.add(resolve));
    },
    retryNow() {
      if (stopped || !started) return;
      clearTimer();
      void enqueue();
    },
    async flush(timeoutMs) {
      if (stopped || !started || readOnly) return isFlushed();
      clearTimer();
      let t: ReturnType<typeof setTimeout> | null = null;
      const timeout = new Promise<void>((resolve) => {
        t = setTimeout(resolve, timeoutMs);
      });
      await Promise.race([enqueue(), timeout]);
      if (t !== null) clearTimeout(t);
      return isFlushed();
    },
  };
}
