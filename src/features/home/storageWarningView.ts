// 저장 실패 안내(appStore.storageAvailable=false)의 표시 규칙 — 순수 함수 + 닫음 기억. 화면은 StorageWarning.tsx.
//
// 사생활 보호 모드·용량 초과 등으로 브라우저에 상태를 쓰지 못하면 기록은 이 탭의 메모리에만 남는다(DEV_NOTES §2 앱 상태).
// iOS처럼 입력은 그대로 받되(막지 않는다), 화면을 떠나면 사라질 수 있다는 것을 알린다.
// 닫으면 이 세션(탭)에서는 다시 띄우지 않는다 — sessionStorage에 적고, sessionStorage도 막혀 있으면(저장이 안 되는 바로 그 환경일 수 있다)
// 이 모듈의 변수가 이 탭의 페이지 수명 동안 대신 기억한다. 화면마다 StorageWarning을 따로 마운트하므로 React state만으로는
// 홈 → 기록 → 운동으로 옮길 때마다 다시 뜬다. 읽기·쓰기는 모두 try/catch로 감싼다.

/** 웹 신규 문구 — CPO 확인 필요 (DEV_NOTES §3 CPO 9: 저장 실패 안내 문구 없음) */
export const STORAGE_WARNING_TEXT = {
  message: "이 브라우저에 기록을 저장할 수 없어요. 화면을 떠나면 오늘 입력한 기록이 사라질 수 있어요.", // 웹 신규 문구 — CPO 확인 필요
  dismiss: "닫기", // 원문: RecordFlowView.swift:142 (닫기 버튼 접근성 이름)
} as const;

/** 이 세션에서 닫았는지 — 건강 데이터가 아닌 화면 상태지만 키 접두는 앱 규칙(onmom.web.)을 따른다 */
export const STORAGE_WARNING_DISMISSED_KEY = "onmom.web.ui.storageWarningDismissed";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** sessionStorage가 막혀 있을 때의 대비 — 이 탭의 페이지 수명(새로 고침 전) 동안 닫음을 기억한다 */
let dismissedInMemory = false;

/** 테스트 전용 — 모듈 변수를 처음으로 되돌린다 */
export function resetStorageWarningDismissedMemory(): void {
  dismissedInMemory = false;
}

export function readStorageWarningDismissed(storage: StorageLike | null | undefined): boolean {
  if (dismissedInMemory) return true;
  try {
    return storage?.getItem(STORAGE_WARNING_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * 닫음을 기억한다 — 이 모듈 변수(페이지 수명)에 먼저, 그다음 sessionStorage(탭 수명)에.
 * 저장소가 없거나 막혀 있으면 조용히 실패하고 false — 그래도 모듈 변수가 남아 다른 화면으로 옮겨도 다시 뜨지 않는다.
 */
export function writeStorageWarningDismissed(storage: StorageLike | null | undefined): boolean {
  dismissedInMemory = true;
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_WARNING_DISMISSED_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

/**
 * 안내를 보일지 — 저장소를 읽은 뒤(hydrated) 마지막 저장이 실패했고, 이 세션에서 닫지 않았을 때만.
 * dismissed가 null이면 아직 세션 저장소를 읽지 않은 것(첫 렌더) — 잠깐 번쩍이지 않게 보이지 않는다.
 */
export function storageWarningVisible(input: { hydrated: boolean; storageAvailable: boolean; dismissed: boolean | null }): boolean {
  return input.hydrated && !input.storageAvailable && input.dismissed === false;
}

/** 브라우저 sessionStorage — 없거나 접근이 막힌 환경(사생활 보호 모드 등)에서는 null */
export function browserSessionStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
