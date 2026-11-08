// 오늘의 체조 [오늘 했어요] — 체크한 날을 이 브라우저에만 둔다. 서버로 보내지 않는다.
//
// - 앱 상태(PersistedState)에 넣지 않는다 → 서버 동기화(store/sync)·여러 탭 합치기(tabRebase)·내 데이터 내려받기(settings/dataExport)·
//   PDF 리포트·관리자 통계 어디에도 실리지 않는다. 처리방침·동의의 수집 항목(privacy/dataItems.ts)에 운동 체크가 없어서다 —
//   서버로 보내려면 항목과 동의 판을 먼저 바꾼다.
// - 키는 "onmom.web." 접두(store/persistence STORAGE_PREFIX)라 계정 삭제·다른 사람으로 계정 전환(eraseAll)이 함께 지운다.
// - 형식(ROUTINE_CHECKS_KEY의 값): 로컬 날짜 "YYYY-MM-DD"의 JSON 배열 — 최신순, 중복 없음, 최대 ROUTINE_CHECKS_LIMIT개.
//   형식을 바꾸면 키 끝의 판(.v1)을 올린다. 못 읽는 원소는 버리고, 전체를 못 읽으면 빈 목록 — 예외를 던지지 않는다.
// - [오늘 했어요] 취소는 그 날짜를 목록에서 뺀다(이 브라우저에만 있으니 합치기용 삭제 표시가 필요 없다).
// - 쓰기는 그때 저장된 값을 다시 읽고 그 날짜 하나만 넣거나 빼서 쓴다 — 탭 두 개에서 눌러도 다른 날짜를 덮지 않는다.
// - 모든 접근은 try/catch(사생활 보호 모드·사이트 데이터 차단·용량 초과). 쓰지 못하면 false — 화면은 체크가 바뀌지 않은 채로 둔다.

import { parseLocalDate, toLocalDateString } from "@/domain/date";
import type { LocalDateString } from "@/domain/types";
import { STORAGE_PREFIX, type StorageLike } from "@/store/persistence";

export const ROUTINE_CHECKS_KEY = `${STORAGE_PREFIX}exercise.routineChecks.v1`;

/** 남겨 두는 날짜 수 상한 — 최근 것부터. "이번 주 n일"에는 7일이면 되지만 기기를 며칠 쉬어도 남게 넉넉히 둔다. */
export const ROUTINE_CHECKS_LIMIT = 60;

const isLocalDate = (v: unknown): v is LocalDateString => typeof v === "string" && parseLocalDate(v) !== null;

/** 최신순·중복 없음·상한 — "YYYY-MM-DD"는 글자 순서가 날짜 순서다 */
function normalize(dates: readonly LocalDateString[]): LocalDateString[] {
  return [...new Set(dates)].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)).slice(0, ROUTINE_CHECKS_LIMIT);
}

/** 저장된 글자 → 체크한 날(최신순). 없거나 못 읽으면 빈 목록. */
export function parseRoutineChecks(raw: string | null | undefined): LocalDateString[] {
  if (typeof raw !== "string") return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  return Array.isArray(value) ? normalize(value.filter(isLocalDate)) : [];
}

/** 그 날짜를 넣거나(done) 뺀 목록 */
export function withRoutineCheck(dates: readonly LocalDateString[], date: LocalDateString, done: boolean): LocalDateString[] {
  const rest = dates.filter((d) => d !== date);
  return normalize(done ? [date, ...rest] : rest);
}

/** 저장소에서 읽기 — 저장소가 없거나 막혀 있으면 빈 목록 */
export function readRoutineChecks(storage: StorageLike | null): LocalDateString[] {
  try {
    return parseRoutineChecks(storage?.getItem(ROUTINE_CHECKS_KEY));
  } catch {
    return [];
  }
}

/**
 * 그 날짜의 체크를 켜거나 끈다. 저장된 값을 다시 읽어 그 날짜만 바꾼다. 빈 목록이면 키를 지운다.
 * 저장하지 못하면(저장소 없음·차단·용량 초과) false. 날짜 형식이 틀리면 아무것도 하지 않고 false.
 */
export function writeRoutineCheck(storage: StorageLike | null, date: LocalDateString, done: boolean): boolean {
  if (storage === null || !isLocalDate(date)) return false;
  try {
    const next = withRoutineCheck(parseRoutineChecks(storage.getItem(ROUTINE_CHECKS_KEY)), date, done);
    if (next.length === 0) storage.removeItem(ROUTINE_CHECKS_KEY);
    else storage.setItem(ROUTINE_CHECKS_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

/** 이번 주의 시작(월요일) — 로컬 달력 */
export function weekStart(today: Date): LocalDateString {
  const back = (today.getDay() + 6) % 7; // 월 0 · 화 1 · … · 일 6
  return toLocalDateString(new Date(today.getFullYear(), today.getMonth(), today.getDate() - back));
}

/** 이번 주(월요일 ~ 오늘)에 체크한 날 수 — 오늘 뒤의 날짜(기기 시계를 바꾼 경우)는 세지 않는다 */
export function thisWeekCount(dates: readonly LocalDateString[], today: Date): number {
  const from = weekStart(today);
  const to = toLocalDateString(today);
  return dates.filter((d) => d >= from && d <= to).length;
}
