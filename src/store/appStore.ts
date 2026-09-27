// 앱 전역 상태 저장소 — iOS AppStore + AccountStore를 합친 외부 스토어(useSyncExternalStore용).
// React를 모른다: 스냅샷·구독·action만 제공하고, 규칙은 state.ts(순수 전이), 저장은 PersistenceAdapter에 맡긴다.
//
// 읽기 시점: 서버 렌더링·하이드레이션 동안에는 저장소를 읽지 않은 스냅샷(hydrated=false)을 쓴다.
// 첫 구독(마운트 후 effect) 때 저장소를 읽어 hydrated=true로 바꾼다 — 하이드레이션 불일치 없이,
// 화면은 hydrated 전에는 아무것도(또는 뼈대만) 그리지 않아 잘못된 데이터가 번쩍이지 않는다.

import type {
  IsoDateTimeString,
  MaternityRecord,
  MoodCheckRecord,
  PersistedState,
  SymptomRecord,
  UserProfile,
} from "@/domain/types";
import { decodeAccount, displayName, isGuestID, makeGuestID, type Account } from "./account";
import { decodePersisted } from "./decode";
import { initialState } from "./defaults";
import type { PersistenceAdapter } from "./persistence";
import * as S from "./state";

export interface AppSnapshot {
  /** 브라우저 저장소를 읽었는가. false인 동안(서버 렌더링·첫 페인트) state는 초기값이다. */
  readonly hydrated: boolean;
  /**
   * 건강 데이터(상태)가 브라우저에 저장됐는가 — 마지막 상태 저장의 결과(저장 전에는 쓰기 가능 여부).
   * false면 사생활 보호 모드·용량 초과 등으로 이 탭의 메모리에만 남는다.
   */
  readonly storageAvailable: boolean;
  readonly state: PersistedState;
  /** 로그인한 계정 — null이면 로그인 화면 */
  readonly account: Account | null;
}

/** 새 증상 기록 — id는 스토어가 붙이고, date를 비우면 지금 시각. */
export type NewSymptomRecord = Omit<SymptomRecord, "id" | "date"> & { date?: IsoDateTimeString };
/** 새 기분 답 — id는 스토어가 붙이고, date를 비우면 지금 시각. */
export type NewMoodCheck = Omit<MoodCheckRecord, "id" | "date"> & { date?: IsoDateTimeString };

export interface AppActions {
  /** [게스트로 시작] — 브라우저당 한 번 발급한 guest id로 로그인하고 데이터를 묶는다. */
  signInGuest(): void;
  /** 실제 계정 로그인(카카오: id = kakaoAccountID(회원번호)). id가 비면 무시. */
  signIn(account: Account): void;
  /** 로그아웃 — 계정만 지운다. 데이터는 남고, 다음에 다른 실제 계정·게스트가 들어오면 그때 지운다(iOS와 같음). */
  signOut(): void;
  /** 계정 삭제(브라우저 쪽) — 건강 데이터·기분·메모·계정·게스트 id 등 "onmom.web." 키 전부 삭제. 서버 탈퇴는 미구현. */
  deleteAccount(): void;
  completeOnboarding(): void;
  updateProfile(patch: Partial<UserProfile>): void;
  updateMaternity(patch: Partial<MaternityRecord>): void;
  addSymptomRecord(input: NewSymptomRecord): SymptomRecord;
  addMoodCheck(input: NewMoodCheck): MoodCheckRecord;
  /** 마음 연계 카드 [나중에 볼게요] — 기본 7일 */
  snoozeMoodCard(days?: number): void;
  /** 기록장 글 등록 — 새 글 id, 제목이 비면 null(저장 안 함) */
  addPost(input: { title: string; body: string }): string | null;
  /** 댓글 등록 — 빈 댓글·없는 글이면 false */
  addComment(postId: string, text: string): boolean;
}

export interface AppStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): AppSnapshot;
  getServerSnapshot(): AppSnapshot;
  /** 저장소를 (다시) 읽는다 — 첫 구독 때 자동으로 부른다. */
  load(): void;
  readonly actions: AppActions;
}

export interface AppStoreDeps {
  persistence: PersistenceAdapter;
  now: () => Date;
  newId: () => string;
  /** 다른 탭의 저장 변경 구독(브라우저: watchBrowserStorage). 반환값은 해제 함수. */
  watchExternalChanges?: (onChange: () => void) => () => void;
}

/** 저장소를 읽기 전 스냅샷 — 서버와 하이드레이션 첫 렌더가 같은 값을 보도록 모듈 상수로 둔다. */
const UNLOADED: AppSnapshot = Object.freeze({
  hydrated: false,
  storageAvailable: true,
  state: initialState(),
  account: null,
});

export function createAppStore(deps: AppStoreDeps): AppStore {
  const { persistence, now, newId } = deps;
  const listeners = new Set<() => void>();
  let snapshot: AppSnapshot = UNLOADED;
  let loaded = false;
  /** 저장소가 이 탭의 최신 상태를 담고 있는가 — 상태 저장 결과로만 정한다(계정·게스트 id 저장 성공이 덮지 않게). */
  let storageOk = true;
  let guestIDCache: string | null = null;
  let stopWatching: (() => void) | null = null;

  function emit() {
    for (const l of [...listeners]) l();
  }

  function publish(next: Partial<AppSnapshot>) {
    snapshot = { ...snapshot, ...next, hydrated: true, storageAvailable: storageOk };
    emit();
  }

  function saveState(next: PersistedState) {
    storageOk = persistence.saveState(next);
  }

  /** 이전 사람의 흔적을 저장소에서 지운다 — 게스트 id도 지워 다음 게스트는 새 id를 받는다(AppStore.swift:128-131). */
  function eraseStorage() {
    persistence.eraseAll();
    guestIDCache = null;
  }

  /**
   * 계정에 데이터를 묶고 저장한다(RootView.swift:22-24 → AppStore.bind).
   * 지워야 하면 저장소를 먼저 비운 뒤 계정 → 상태 순으로 쓴다 — 중간에 탭이 닫혀도 다음 load의 bind가 다시 지운다.
   */
  function bindAndSave(state: PersistedState, account: Account, accountNeedsSave: boolean): PersistedState {
    const erase = S.shouldEraseOnBind(state.ownerAccountID, account.id);
    if (erase) eraseStorage();
    if (accountNeedsSave || erase) persistence.saveAccount(account);
    const next = S.bindToAccount(state, account.id);
    if (next !== state) saveState(next);
    return next;
  }

  function load() {
    loaded = true;
    guestIDCache = null;
    storageOk = persistence.isAvailable();
    let state = decodePersisted(persistence.loadState(), { now: now(), newId });
    const account = decodeAccount(persistence.loadAccount());
    // 앱을 열 때마다 로그인 계정에 데이터를 묶는다 — 주인 없는 구버전 데이터는 귀속, 어긋난 주인은 삭제.
    if (account) state = bindAndSave(state, account, false);
    publish({ state, account });
  }

  function ensureLoaded() {
    if (!loaded) load();
  }

  function commit(next: PersistedState) {
    if (next === snapshot.state) return;
    saveState(next);
    publish({ state: next });
  }

  /** 브라우저당 하나인 게스트 id — 매번 새로 만들면 다시 게스트로 들어온 같은 사람의 데이터가 초기화된다(AccountStore.swift:42-59). */
  function deviceGuestID(): string {
    if (guestIDCache !== null) return guestIDCache;
    const stored = persistence.loadGuestID();
    if (stored !== null && isGuestID(stored)) {
      guestIDCache = stored;
      return stored;
    }
    const id = makeGuestID(newId());
    persistence.saveGuestID(id);
    guestIDCache = id; // 저장이 막혀도 이 탭에서는 같은 id를 쓴다
    return id;
  }

  function writeMeta(): S.WriteMeta {
    return { id: newId(), authorName: displayName(snapshot.account), now: now() };
  }

  const actions: AppActions = {
    signInGuest() {
      ensureLoaded();
      actions.signIn({ id: deviceGuestID(), name: null, provider: "guest" });
    },
    signIn(input) {
      ensureLoaded();
      const account = decodeAccount(input);
      if (!account) return;
      const state = bindAndSave(snapshot.state, account, true);
      publish({ state, account });
    },
    signOut() {
      ensureLoaded();
      if (snapshot.account === null) return;
      persistence.saveAccount(null);
      publish({ account: null });
    },
    deleteAccount() {
      ensureLoaded();
      eraseStorage();
      // 키를 전부 지웠으니 저장소 = 초기 상태 — 쓸 수 있으면 저장된 것으로 본다.
      storageOk = persistence.isAvailable();
      publish({ state: S.eraseAll(), account: null });
    },
    completeOnboarding() {
      ensureLoaded();
      commit(S.completeOnboarding(snapshot.state));
    },
    updateProfile(patch) {
      ensureLoaded();
      commit(S.updateProfile(snapshot.state, patch));
    },
    updateMaternity(patch) {
      ensureLoaded();
      commit(S.updateMaternity(snapshot.state, patch));
    },
    addSymptomRecord(input) {
      ensureLoaded();
      const record: SymptomRecord = {
        id: newId(),
        date: input.date ?? now().toISOString(),
        lochiaIncreased: input.lochiaIncreased,
        lochiaRed: input.lochiaRed,
        feverEvent: input.feverEvent,
        painNrs: input.painNrs,
        redFlagCode: input.redFlagCode,
        postpartumDays: input.postpartumDays,
      };
      commit(S.addSymptomRecord(snapshot.state, record));
      return record;
    },
    addMoodCheck(input) {
      ensureLoaded();
      const record: MoodCheckRecord = {
        id: newId(),
        date: input.date ?? now().toISOString(),
        questionID: input.questionID,
        answer: input.answer,
      };
      commit(S.addMoodCheck(snapshot.state, record));
      return record;
    },
    snoozeMoodCard(days) {
      ensureLoaded();
      commit(S.snoozeMoodCard(snapshot.state, now(), days));
    },
    addPost(input) {
      ensureLoaded();
      const meta = writeMeta();
      const next = S.addPost(snapshot.state, input, meta);
      if (next === snapshot.state) return null;
      commit(next);
      return meta.id;
    },
    addComment(postId, text) {
      ensureLoaded();
      const next = S.addComment(snapshot.state, postId, text, writeMeta());
      if (next === snapshot.state) return false;
      commit(next);
      return true;
    },
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      ensureLoaded();
      if (stopWatching === null && deps.watchExternalChanges) {
        // 다른 탭에서 로그인·로그아웃·기록을 하면 이 탭도 같은 데이터를 보게 다시 읽는다.
        stopWatching = deps.watchExternalChanges(load);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        if (stopWatching !== null) {
          stopWatching();
          stopWatching = null;
        }
        // 구독이 없는 동안(스토어를 안 쓰는 화면)은 다른 탭의 변경 알림을 못 받는다. 다음 구독·action 때
        // 다시 읽어서, 낡은 상태 전체를 저장해 다른 탭이 남긴 기록(레드플래그 등)을 지우지 않게 한다.
        // 단, 마지막 저장이 실패했으면 메모리가 원본이다 — 다시 읽으면 저장하지 못한 기록을 잃는다.
        if (storageOk) loaded = false;
      };
    },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => UNLOADED,
    load,
    actions,
  };
}

/** 첫 화면 분기(RootView.swift:10-17) — 로그인 안 함 → 로그인, 온보딩 전 → 온보딩, 그 외 → 메인 탭. */
export type RootScreen = "loading" | "login" | "onboarding" | "main";

export function rootScreenFor(s: AppSnapshot): RootScreen {
  if (!s.hydrated) return "loading";
  if (s.account === null) return "login";
  return s.state.hasOnboarded ? "main" : "onboarding";
}
