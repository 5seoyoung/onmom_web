// 브라우저 저장 — iOS UserDefaults 자리. 저장 형식은 04 PersistedState JSON 그대로.
//
// 모든 접근은 try/catch — 사생활 보호 모드·저장소 차단·용량 초과여도 앱은 메모리에서 계속 동작한다
// (appStore가 상태를 메모리에 들고 있고, 저장 실패는 storageAvailable=false로만 알린다).
//
// 서버 동기화(카카오·익명 게스트 계정, Supabase)는 이 어댑터를 바꾸지 않고 위에 얹는다 — store/sync(엔진·합치기)와 src/auth.
// 브라우저 저장은 늘 먼저 되고, 동기화 엔진이 스토어 변경을 받아 서버에 올린다(첫 읽기 전 쓰기 금지 #13,
// 지금 판의 동의 전 전송 금지 #15·#20 — domain/consent.ts, 삭제 실패 시 로컬 유지 #18, 로그아웃 시 브라우저 사본 삭제 #19).
// 합치기 기준·가져온 기록 표시는 store/sync/marks.ts가, 로그인 흐름 표시는 src/auth/authFlow.ts가, Supabase 세션은
// "onmom.web.auth" 키에 둔다 — 모두 "onmom.web." 접두라 eraseAll이 함께 지운다.

import type { PersistedState } from "@/domain/types";
import type { Account } from "./account";

/** 이 접두의 키는 eraseAll이 전부 지운다 — 개인 데이터를 브라우저에 두는 모듈은 반드시 이 접두를 쓸 것. */
export const STORAGE_PREFIX = "onmom.web.";
export const STATE_KEY = "onmom.web.state.v1";
export const GUEST_ID_KEY = "onmom.web.account.guestID";
export const ACCOUNT_KEY = "onmom.web.account.current";
/** 쓰기 가능 여부 확인용 — 다른 탭 변경 알림에서는 무시한다(무시하지 않으면 탭끼리 서로 다시 읽기를 반복한다). */
const PROBE_KEY = "onmom.web.probe";

/** window.localStorage와 같은 모양(테스트에서는 메모리 구현을 넣는다) */
export interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** 저장소 경계 — appStore는 이 인터페이스만 안다. 읽기는 파싱된 JSON(unknown)을 돌려주고 해석은 decode가 한다. */
export interface PersistenceAdapter {
  /** 지금 쓰기가 되는가(사생활 보호 모드·차단이면 false) */
  isAvailable(): boolean;
  loadState(): unknown;
  /** false = 저장 실패(메모리에서만 유지됨) */
  saveState(state: PersistedState): boolean;
  loadAccount(): unknown;
  /** null이면 키를 지운다(로그아웃) */
  saveAccount(account: Account | null): boolean;
  loadGuestID(): string | null;
  saveGuestID(id: string): boolean;
  /** STORAGE_PREFIX 키 전부 삭제 — 상태·계정·게스트 id·다른 모듈의 설정값까지(AppStore.swift:128-131) */
  eraseAll(): void;
  /**
   * 저장된 상태·계정의 지금 내용을 가리키는 값(불투명) — 이 탭이 마지막으로 읽거나 쓴 뒤 다른 탭이 바꿨는지 비교하는 데만 쓴다
   * (appStore의 여러 탭 보호). 저장소를 읽을 수 없으면 null(비교하지 않는다). 없으면(테스트용 어댑터) 보호 없이 지금까지처럼 쓴다.
   */
  stateToken?(): string | null;
}

/** 브라우저 localStorage — 서버 렌더링 중이거나 접근이 막혀 있으면 null */
export function browserLocalStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null; // SecurityError(쿠키·사이트 데이터 차단)
  }
}

export function createStoragePersistence(getStorage: () => StorageLike | null): PersistenceAdapter {
  function read(key: string): string | null {
    try {
      return getStorage()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  function write(key: string, value: string | null): boolean {
    try {
      const s = getStorage();
      if (!s) return false;
      if (value === null) s.removeItem(key);
      else s.setItem(key, value);
      return true;
    } catch {
      return false; // QuotaExceededError 등
    }
  }
  function readJSON(key: string): unknown {
    const text = read(key);
    if (text === null) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null; // 손상된 값 — decode가 기본값으로 시작한다
    }
  }

  return {
    isAvailable: () => write(PROBE_KEY, "1") && write(PROBE_KEY, null),
    loadState: () => readJSON(STATE_KEY),
    saveState: (state) => write(STATE_KEY, JSON.stringify(state)),
    loadAccount: () => readJSON(ACCOUNT_KEY),
    saveAccount: (account) => write(ACCOUNT_KEY, account === null ? null : JSON.stringify(account)),
    loadGuestID: () => read(GUEST_ID_KEY),
    saveGuestID: (id) => write(GUEST_ID_KEY, id),
    eraseAll() {
      try {
        const s = getStorage();
        if (!s) return;
        // 지우면서 돌면 인덱스가 밀리므로 키를 먼저 모은다.
        const keys: string[] = [];
        for (let i = 0; i < s.length; i++) {
          const k = s.key(i);
          if (k !== null && k.startsWith(STORAGE_PREFIX)) keys.push(k);
        }
        for (const k of keys) s.removeItem(k);
      } catch {
        // 저장소를 못 쓰면 지울 것도 없다
      }
    },
    stateToken() {
      // 저장된 글자 그대로 — 판 번호를 따로 두지 않아 저장 형식(04 PersistedState JSON)이 바뀌지 않는다. 같은 글자면 바뀐 것이 없다.
      try {
        const s = getStorage();
        if (!s) return null;
        return `${s.getItem(STATE_KEY) ?? ""}\u0000${s.getItem(ACCOUNT_KEY) ?? ""}`;
      } catch {
        return null;
      }
    },
  };
}

/** 메모리 저장소 — 테스트용, 또는 브라우저 밖에서 같은 코드를 돌릴 때 */
export function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
  };
}

/** 다른 탭이 저장소를 바꾸면 알린다(window "storage" 이벤트 — 쓴 탭 자신에게는 오지 않는다). 반환값은 해제 함수. */
export function watchBrowserStorage(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: StorageEvent) => {
    // key === null은 localStorage.clear()
    if (e.key === null || (e.key.startsWith(STORAGE_PREFIX) && e.key !== PROBE_KEY)) onChange();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

/** watchPageResume이 쓰는 최소 모양(테스트에서는 가짜를 넣는다) */
export interface PageResumeTargets {
  win: Pick<EventTarget, "addEventListener" | "removeEventListener">;
  doc: Pick<EventTarget, "addEventListener" | "removeEventListener"> & { readonly visibilityState: string };
}

/**
 * 페이지가 다시 보이면 알린다 — 뒤로 가기 캐시에서 복원(pageshow persisted), 다른 탭에서 돌아옴(visibilitychange visible).
 * 멈춰 있던 동안 다른 탭의 storage 이벤트를 놓쳤을 수 있어서다. 반환값은 해제 함수.
 */
export function watchPageResume(onResume: () => void, targets?: PageResumeTargets): () => void {
  const t = targets ?? (typeof window === "undefined" || typeof document === "undefined" ? null : { win: window, doc: document });
  if (t === null) return () => {};
  const onShow = (e: Event) => {
    if ((e as Event & { persisted?: boolean }).persisted === true) onResume();
  };
  const onVisibility = () => {
    if (t.doc.visibilityState === "visible") onResume();
  };
  t.win.addEventListener("pageshow", onShow);
  t.doc.addEventListener("visibilitychange", onVisibility);
  return () => {
    t.win.removeEventListener("pageshow", onShow);
    t.doc.removeEventListener("visibilitychange", onVisibility);
  };
}
