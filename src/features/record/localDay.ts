// 브라우저의 "오늘" — 날짜가 바뀔 때만 새 값을 내는 외부 저장소(useSyncExternalStore).
// 기록 탭에서 시각에 따라 달라지는 것(산후 일차, 오늘의 문항, 오늘 답했는지)은 모두 날짜 단위라
// 분·초가 바뀔 때마다 화면을 다시 그리지 않는다. 서버 렌더링·하이드레이션 첫 렌더는 null — 빌드 시각이 박히지 않게(DEV_NOTES §4).
// 공용 모듈이 아니라 이 기능 폴더의 로컬 도우미다(다른 화면도 쓰면 공용으로 옮길 후보).

import { useSyncExternalStore } from "react";
import { isSameLocalDay } from "@/domain/date";

const CHECK_INTERVAL_MS = 60_000;

/** 날짜가 같으면 이전 값을 그대로(같은 참조) 돌려준다 — useSyncExternalStore 스냅샷은 바뀔 때만 새 객체여야 한다. */
export function nextLocalDay(current: Date | null, now: Date): Date {
  return current !== null && isSameLocalDay(current, now) ? current : now;
}

let current: Date | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function refresh() {
  const next = nextLocalDay(current, new Date());
  if (next === current) return;
  current = next;
  for (const l of [...listeners]) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    // 구독이 없던 동안 날짜가 바뀌었을 수 있다 — 조용히 맞춘다(React가 구독 직후 스냅샷을 다시 확인한다).
    current = nextLocalDay(current, new Date());
    timer = setInterval(refresh, CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    if (timer !== null) clearInterval(timer);
    timer = null;
    document.removeEventListener("visibilitychange", refresh);
    window.removeEventListener("focus", refresh);
  };
}

/**
 * 렌더할 때마다 날짜를 확인한다 — 구독이 없던 동안(다른 탭에 있는 사이) 자정이 지났으면
 * 구독(패시브 이펙트) 전 첫 페인트부터 오늘 값을 낸다(어제 일차·어제 문항이 잠깐 보이지 않게).
 * 같은 날이면 같은 참조라 스냅샷이 안정적이고 추가 렌더도 없다. Swift도 렌더마다 Date()로 다시 계산한다(RecordFlowView.swift:62, :153).
 */
export function getLocalDaySnapshot(): Date {
  current = nextLocalDay(current, new Date());
  return current;
}

const getServerSnapshot = (): Date | null => null;

/** 오늘(로컬 달력) — 서버·하이드레이션 중에는 null. 값의 시각 부분은 그날 처음 본 시각이라 날짜 계산에만 쓴다. */
export function useLocalDay(): Date | null {
  return useSyncExternalStore<Date | null>(subscribe, getLocalDaySnapshot, getServerSnapshot);
}
