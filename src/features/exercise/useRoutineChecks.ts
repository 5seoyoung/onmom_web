"use client";

// 오늘의 체조 체크한 날(routineChecks.ts — 이 브라우저에만)을 화면에서 읽고 바꾸는 훅.
// 같은 탭의 쓰기는 모듈 안 구독자에게, 다른 탭의 쓰기는 window "storage" 이벤트로 받는다.
// 스냅샷은 저장된 글자 그대로라(문자열 비교) 바뀌지 않으면 다시 그리지 않는다. 서버 렌더링은 빈 값(체크 없음).
// 저장소를 쓸 수 있는지는 앱 스토어(storageAvailable)가 판단한다 — 화면이 쓸 수 없으면 버튼을 그리지 않는다.

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { LocalDateString } from "@/domain/types";
import { browserLocalStorage } from "@/store/persistence";
import { ROUTINE_CHECKS_KEY, parseRoutineChecks, writeRoutineCheck } from "./routineChecks";

const listeners = new Set<() => void>();

function notify() {
  for (const l of [...listeners]) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // key === null은 localStorage.clear()
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === ROUTINE_CHECKS_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): string {
  try {
    return browserLocalStorage()?.getItem(ROUTINE_CHECKS_KEY) ?? "";
  } catch {
    return "";
  }
}

const getServerSnapshot = (): string => "";

export interface RoutineChecks {
  /** 체크한 날(최신순) */
  dates: LocalDateString[];
  /** 그 날짜의 체크를 켜거나 끈다 — 저장하지 못하면 바뀌지 않는다(오류를 내지 않는다) */
  setDone(date: LocalDateString, done: boolean): void;
}

export function useRoutineChecks(): RoutineChecks {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const dates = useMemo(() => parseRoutineChecks(raw), [raw]);
  const setDone = useCallback((date: LocalDateString, done: boolean) => {
    if (writeRoutineCheck(browserLocalStorage(), date, done)) notify();
  }, []);
  return { dates, setDone };
}
