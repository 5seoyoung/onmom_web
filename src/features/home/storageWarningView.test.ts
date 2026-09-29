import { beforeEach, describe, expect, it } from "vitest";
import {
  STORAGE_WARNING_DISMISSED_KEY,
  STORAGE_WARNING_TEXT,
  readStorageWarningDismissed,
  resetStorageWarningDismissedMemory,
  storageWarningVisible,
  writeStorageWarningDismissed,
  type StorageLike,
} from "./storageWarningView";

beforeEach(() => resetStorageWarningDismissedMemory());

function memory(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
}

/** 사생활 보호 모드처럼 접근만 해도 던지는 저장소 */
const throwing: StorageLike = {
  getItem: () => {
    throw new DOMException("blocked", "SecurityError");
  },
  setItem: () => {
    throw new DOMException("QuotaExceededError", "QuotaExceededError");
  },
};

describe("저장 실패 안내 — 보일 조건", () => {
  it("저장소를 읽은 뒤, 마지막 저장이 실패했고, 이 세션에서 닫지 않았을 때만", () => {
    expect(storageWarningVisible({ hydrated: true, storageAvailable: false, dismissed: false })).toBe(true);
    expect(storageWarningVisible({ hydrated: true, storageAvailable: true, dismissed: false })).toBe(false);
    expect(storageWarningVisible({ hydrated: true, storageAvailable: false, dismissed: true })).toBe(false);
  });

  it("읽기 전(정적 HTML·첫 렌더)과 세션 저장소를 아직 읽지 않았을 때(null)는 번쩍이지 않게 보이지 않는다", () => {
    expect(storageWarningVisible({ hydrated: false, storageAvailable: false, dismissed: false })).toBe(false);
    expect(storageWarningVisible({ hydrated: true, storageAvailable: false, dismissed: null })).toBe(false);
  });
});

describe("이 세션에서 닫음 — sessionStorage(onmom.web. 접두)", () => {
  it("닫기 전 false, 닫으면 true", () => {
    const s = memory();
    expect(readStorageWarningDismissed(s)).toBe(false);
    expect(writeStorageWarningDismissed(s)).toBe(true);
    expect(s.map.get(STORAGE_WARNING_DISMISSED_KEY)).toBe("1");
    expect(readStorageWarningDismissed(s)).toBe(true);
    expect(STORAGE_WARNING_DISMISSED_KEY.startsWith("onmom.web.")).toBe(true);
  });

  it("저장소가 없거나(null) 접근이 막혀 던져도 예외 없이 — 닫기 전 읽기는 false, 쓰기는 false", () => {
    expect(readStorageWarningDismissed(null)).toBe(false);
    expect(readStorageWarningDismissed(undefined)).toBe(false);
    expect(readStorageWarningDismissed(throwing)).toBe(false);
    expect(writeStorageWarningDismissed(null)).toBe(false);
    resetStorageWarningDismissedMemory();
    expect(writeStorageWarningDismissed(throwing)).toBe(false);
  });

  it("sessionStorage가 막혀 있어도(던짐·없음) 닫으면 이 페이지 수명 동안 기억한다 — 다른 화면으로 옮겨도 다시 뜨지 않게", () => {
    // 사생활 보호 모드: 쓰기가 던진다 → 반환은 false지만 모듈이 기억한다
    expect(writeStorageWarningDismissed(throwing)).toBe(false);
    expect(readStorageWarningDismissed(throwing)).toBe(true);
    expect(readStorageWarningDismissed(null)).toBe(true); // 다음 화면의 StorageWarning이 읽는다
    expect(storageWarningVisible({ hydrated: true, storageAvailable: false, dismissed: readStorageWarningDismissed(null) })).toBe(false);

    // 저장소가 아예 없어도 같다
    resetStorageWarningDismissedMemory();
    expect(readStorageWarningDismissed(null)).toBe(false);
    expect(writeStorageWarningDismissed(null)).toBe(false);
    expect(readStorageWarningDismissed(null)).toBe(true);
  });

  it("sessionStorage가 되면 둘 다에 남는다 — 새로 고쳐 모듈 변수가 사라져도 이 탭에서는 다시 뜨지 않는다", () => {
    const s = memory();
    expect(writeStorageWarningDismissed(s)).toBe(true);
    resetStorageWarningDismissedMemory(); // 새로 고침 흉내 — 모듈 변수는 사라지고 sessionStorage만 남는다
    expect(readStorageWarningDismissed(s)).toBe(true);
  });
});

describe("문구", () => {
  it("웹 신규 안내(CPO 확인) + 닫기 이름은 iOS 원문", () => {
    expect(STORAGE_WARNING_TEXT.message).toBe("이 브라우저에 기록을 저장할 수 없어요. 화면을 떠나면 오늘 입력한 기록이 사라질 수 있어요.");
    expect(STORAGE_WARNING_TEXT.dismiss).toBe("닫기");
  });
});
