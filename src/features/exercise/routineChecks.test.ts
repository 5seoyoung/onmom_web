// 오늘의 체조 [오늘 했어요] — 이 브라우저에만 두는 체크한 날(routineChecks.ts).
// 읽기·쓰기·취소, 손상된 값, 저장소 없음·막힘·용량 초과, 계정 삭제·전환(eraseAll)이 키를 지우는지, 앱 상태·내려받기에 실리지 않는지.
import { describe, expect, it } from "vitest";
import type { LocalDateString } from "@/domain/types";
import { buildDataExport } from "@/features/settings/dataExport";
import { initialState } from "@/store/defaults";
import { STATE_KEY, STORAGE_PREFIX, createMemoryStorage, createStoragePersistence, type StorageLike } from "@/store/persistence";
import {
  ROUTINE_CHECKS_KEY,
  ROUTINE_CHECKS_LIMIT,
  parseRoutineChecks,
  readRoutineChecks,
  thisWeekCount,
  weekStart,
  withRoutineCheck,
  writeRoutineCheck,
} from "./routineChecks";

/** n일 전의 로컬 날짜(2026-11-08 기준) */
function daysBefore(n: number): LocalDateString {
  const d = new Date(2026, 10, 8 - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** getItem·setItem이 던지는 저장소(사이트 데이터 차단) */
function throwingStorage(): StorageLike {
  return {
    length: 0,
    key: () => null,
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      throw new Error("SecurityError");
    },
    removeItem: () => {
      throw new Error("SecurityError");
    },
  };
}

/** 읽기는 되고 쓰기만 용량 초과 */
function fullStorage(seed: string | null): StorageLike {
  const s = createMemoryStorage();
  if (seed !== null) s.setItem(ROUTINE_CHECKS_KEY, seed);
  return {
    get length() {
      return s.length;
    },
    key: (i) => s.key(i),
    getItem: (k) => s.getItem(k),
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
    removeItem: (k) => s.removeItem(k),
  };
}

describe("키와 형식", () => {
  it("키는 onmom.web. 접두 + 판 — 앱 상태 키와 다르다", () => {
    expect(ROUTINE_CHECKS_KEY).toBe("onmom.web.exercise.routineChecks.v1");
    expect(ROUTINE_CHECKS_KEY.startsWith(STORAGE_PREFIX)).toBe(true);
    expect(ROUTINE_CHECKS_KEY).not.toBe(STATE_KEY);
  });

  it("값은 로컬 날짜의 JSON 배열(최신순)", () => {
    const s = createMemoryStorage();
    expect(writeRoutineCheck(s, "2026-11-06", true)).toBe(true);
    expect(writeRoutineCheck(s, "2026-11-08", true)).toBe(true);
    expect(writeRoutineCheck(s, "2026-11-07", true)).toBe(true);
    expect(s.getItem(ROUTINE_CHECKS_KEY)).toBe('["2026-11-08","2026-11-07","2026-11-06"]');
    expect(readRoutineChecks(s)).toEqual(["2026-11-08", "2026-11-07", "2026-11-06"]);
  });
});

describe("쓰기·취소", () => {
  it("오늘 체크 → 취소하면 빠진다. 마지막 날짜를 빼면 키를 지운다", () => {
    const s = createMemoryStorage();
    writeRoutineCheck(s, "2026-11-07", true);
    writeRoutineCheck(s, "2026-11-08", true);
    expect(writeRoutineCheck(s, "2026-11-08", false)).toBe(true);
    expect(readRoutineChecks(s)).toEqual(["2026-11-07"]);
    writeRoutineCheck(s, "2026-11-07", false);
    expect(s.getItem(ROUTINE_CHECKS_KEY)).toBeNull();
    expect(readRoutineChecks(s)).toEqual([]);
  });

  it("같은 날을 두 번 체크해도 한 번, 없는 날을 취소해도 그대로", () => {
    const s = createMemoryStorage();
    writeRoutineCheck(s, "2026-11-08", true);
    writeRoutineCheck(s, "2026-11-08", true);
    writeRoutineCheck(s, "2026-11-01", false);
    expect(readRoutineChecks(s)).toEqual(["2026-11-08"]);
  });

  it("쓰기는 저장된 값을 다시 읽어 그 날짜만 바꾼다 — 다른 탭이 그 사이에 넣은 날짜를 덮지 않는다", () => {
    const s = createMemoryStorage();
    writeRoutineCheck(s, "2026-11-07", true);
    // 다른 탭이 11-06을 넣었다
    s.setItem(ROUTINE_CHECKS_KEY, '["2026-11-07","2026-11-06"]');
    writeRoutineCheck(s, "2026-11-08", true);
    expect(readRoutineChecks(s)).toEqual(["2026-11-08", "2026-11-07", "2026-11-06"]);
  });

  it(`최근 ${ROUTINE_CHECKS_LIMIT}개만 남긴다(오래된 날부터 버림)`, () => {
    const s = createMemoryStorage();
    for (let n = ROUTINE_CHECKS_LIMIT + 9; n >= 0; n--) writeRoutineCheck(s, daysBefore(n), true);
    const dates = readRoutineChecks(s);
    expect(dates).toHaveLength(ROUTINE_CHECKS_LIMIT);
    expect(dates[0]).toBe(daysBefore(0));
    expect(dates.at(-1)).toBe(daysBefore(ROUTINE_CHECKS_LIMIT - 1));
  });

  it("날짜 형식이 틀리면 쓰지 않는다", () => {
    const s = createMemoryStorage();
    expect(writeRoutineCheck(s, "2026-02-31", true)).toBe(false);
    expect(writeRoutineCheck(s, "today", true)).toBe(false);
    expect(s.getItem(ROUTINE_CHECKS_KEY)).toBeNull();
  });

  it("withRoutineCheck는 순수 — 입력을 바꾸지 않는다", () => {
    const before = ["2026-11-07"];
    expect(withRoutineCheck(before, "2026-11-08", true)).toEqual(["2026-11-08", "2026-11-07"]);
    expect(withRoutineCheck(before, "2026-11-07", false)).toEqual([]);
    expect(before).toEqual(["2026-11-07"]);
  });
});

describe("손상된 값 — 예외 없이 읽을 수 있는 것만", () => {
  it.each([
    ["JSON이 아님", "not json"],
    ["객체", '{"dates":["2026-11-08"]}'],
    ["숫자", "3"],
    ["null", "null"],
    ["빈 글자", ""],
  ])("%s → 빈 목록", (_, raw) => {
    expect(parseRoutineChecks(raw)).toEqual([]);
    const s = createMemoryStorage();
    s.setItem(ROUTINE_CHECKS_KEY, raw);
    expect(readRoutineChecks(s)).toEqual([]);
  });

  it("배열 안의 못 읽는 원소(숫자·없는 날짜·시각·중복)는 버리고 나머지는 날짜순으로", () => {
    expect(parseRoutineChecks('["2026-11-01", 20261102, "2026-02-30", "2026-11-03T10:00:00Z", null, "2026-11-08", "2026-11-01"]')).toEqual([
      "2026-11-08",
      "2026-11-01",
    ]);
  });

  it("손상된 값 위에 쓰면 읽을 수 있는 형식으로 바로잡힌다", () => {
    const s = createMemoryStorage();
    s.setItem(ROUTINE_CHECKS_KEY, "{oops");
    expect(writeRoutineCheck(s, "2026-11-08", true)).toBe(true);
    expect(s.getItem(ROUTINE_CHECKS_KEY)).toBe('["2026-11-08"]');
  });
});

describe("저장소를 쓸 수 없을 때 — 오류 없이", () => {
  it("저장소 없음(서버 렌더링·접근 막힘): 읽기는 빈 목록, 쓰기는 false", () => {
    expect(readRoutineChecks(null)).toEqual([]);
    expect(writeRoutineCheck(null, "2026-11-08", true)).toBe(false);
  });

  it("getItem·setItem이 던짐(사이트 데이터 차단): 빈 목록·false", () => {
    expect(() => readRoutineChecks(throwingStorage())).not.toThrow();
    expect(readRoutineChecks(throwingStorage())).toEqual([]);
    expect(writeRoutineCheck(throwingStorage(), "2026-11-08", true)).toBe(false);
  });

  it("용량 초과: false — 저장된 값은 그대로", () => {
    const s = fullStorage('["2026-11-07"]');
    expect(writeRoutineCheck(s, "2026-11-08", true)).toBe(false);
    expect(readRoutineChecks(s)).toEqual(["2026-11-07"]);
  });
});

describe("계정 삭제·전환 — eraseAll이 함께 지운다", () => {
  function seeded() {
    const s = createMemoryStorage();
    s.setItem(STATE_KEY, "{}");
    writeRoutineCheck(s, "2026-11-08", true);
    s.setItem("other.app", "keep");
    return s;
  }

  it("계정 삭제(기본 eraseAll)", () => {
    const s = seeded();
    createStoragePersistence(() => s).eraseAll();
    expect(s.getItem(ROUTINE_CHECKS_KEY)).toBeNull();
    expect(readRoutineChecks(s)).toEqual([]);
    expect(s.getItem("other.app")).toBe("keep");
  });

  it("다른 사람으로 계정 전환(keepAuthSession — 로그인 세션 키만 남김)", () => {
    const s = seeded();
    createStoragePersistence(() => s).eraseAll({ keepAuthSession: true });
    expect(s.getItem(ROUTINE_CHECKS_KEY)).toBeNull();
  });
});

describe("서버·내려받기에 실리지 않는다", () => {
  it("앱 상태(PersistedState)에 칸이 없다 — 서버 동기화·여러 탭 합치기는 앱 상태만 다룬다", () => {
    expect(Object.keys(initialState()).some((k) => /routine|exercise/i.test(k))).toBe(false);
  });

  it("내 데이터 내려받기(JSON)는 앱 상태만 담는다 — 이 브라우저의 체크는 없다", () => {
    const s = createMemoryStorage();
    writeRoutineCheck(s, "2026-11-08", true);
    const exported = JSON.stringify(buildDataExport({ state: initialState(), account: null }, new Date(2026, 10, 8, 12)));
    expect(exported).not.toContain("routineChecks");
    expect(exported).not.toContain('"2026-11-08"');
  });
});

describe("이번 주 — 월요일부터 오늘까지", () => {
  it("월요일 시작(일요일은 그 주의 마지막 날)", () => {
    expect(weekStart(new Date(2026, 10, 8))).toBe("2026-11-02"); // 일
    expect(weekStart(new Date(2026, 10, 2))).toBe("2026-11-02"); // 월
    expect(weekStart(new Date(2026, 10, 4, 23, 59))).toBe("2026-11-02"); // 수
    expect(weekStart(new Date(2026, 10, 9, 0, 0))).toBe("2026-11-09"); // 다음 월
    expect(weekStart(new Date(2027, 0, 1))).toBe("2026-12-28"); // 해가 바뀌는 주
  });

  it("이번 주에 체크한 날만 센다 — 지난주·오늘 뒤의 날(기기 시계 변경)은 빼고", () => {
    const today = new Date(2026, 10, 5, 9); // 목
    expect(thisWeekCount(["2026-11-08", "2026-11-05", "2026-11-03", "2026-11-02", "2026-11-01"], today)).toBe(3);
    expect(thisWeekCount([], today)).toBe(0);
  });
});
