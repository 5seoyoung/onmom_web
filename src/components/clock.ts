"use client";

// 브라우저 시계 — 화면이 쓰는 "지금 시각"(useNow)과 "오늘(로컬 달력)"(useLocalDay·useLocalToday)을 한 곳에 둔다.
// 홈·프로필·설정·프로필 편집은 useNow, 기록 탭은 useLocalDay, 온보딩은 useLocalToday를 쓴다.
// 브라우저에서만 읽는다. 서버 렌더링(정적 HTML)과 하이드레이션 첫 렌더는 값이 없다(null·"") —
// 빌드 시각이 "n일차"·"3시간 전"에 박히지 않게(DEV_NOTES §4). 화면은 값이 없으면 시각에 따라 달라지는 것을 그리지 않는다.
// 구독이 모두 끊기면 타이머·이벤트를 걷는다.

import { useSyncExternalStore } from "react";
import { isSameLocalDay, toLocalDateString } from "@/domain/date";

const TICK_MS = 60_000;

// MARK: - 지금 시각

// 1분마다, 탭이 다시 보일 때, 그리고 다른 창이 저장소를 바꿨을 때(window "storage" — 스토어도 이 이벤트로
// 새 기록을 곧바로 받는다) 갱신해 상대 시간·산후 일차·자정 경계를 따라간다. 새 기록과 낡은 시계가 함께
// 그려지지 않게 하려는 것이며, 그래도 기록이 시계보다 늦으면 homeViewModel이 기록 시각을 기준으로 잰다.
// 구독이 모두 끊기면 값을 비워, 오래 뒤에 다시 들어와도 낡은 시각으로 그리지 않는다.

let nowMs = 0;
const nowListeners = new Set<() => void>();
let nowTimer: ReturnType<typeof setInterval> | null = null;

function tickNow() {
  nowMs = Date.now();
  for (const l of [...nowListeners]) l();
}

function tickNowIfVisible() {
  if (document.visibilityState === "visible") tickNow();
}

function subscribeNow(listener: () => void): () => void {
  nowListeners.add(listener);
  if (nowTimer === null) {
    nowTimer = setInterval(tickNow, TICK_MS);
    document.addEventListener("visibilitychange", tickNowIfVisible);
    window.addEventListener("storage", tickNow);
  }
  return () => {
    nowListeners.delete(listener);
    if (nowListeners.size > 0) return;
    if (nowTimer !== null) clearInterval(nowTimer);
    nowTimer = null;
    document.removeEventListener("visibilitychange", tickNowIfVisible);
    window.removeEventListener("storage", tickNow);
    nowMs = 0;
  };
}

function getNowSnapshot(): number {
  if (nowMs === 0) nowMs = Date.now();
  return nowMs;
}

const getNowServerSnapshot = (): number => 0;

/** 지금 시각(ms). null이면 아직 브라우저 시각을 읽지 않은 것 — 시각에 따라 달라지는 값을 그리지 않는다. */
export function useNow(): number | null {
  const ms = useSyncExternalStore(subscribeNow, getNowSnapshot, getNowServerSnapshot);
  return ms === 0 ? null : ms;
}

// MARK: - 오늘(로컬 달력)

// 날짜가 바뀔 때만 새 값을 낸다. 기록 탭에서 시각에 따라 달라지는 것(산후 일차, 오늘의 문항, 오늘 답했는지)과
// 온보딩의 출산일 입력(max·"고름" 판정)은 모두 날짜 단위라 분·초가 바뀔 때마다 화면을 다시 그리지 않는다.

/** 날짜가 같으면 이전 값을 그대로(같은 참조) 돌려준다 — useSyncExternalStore 스냅샷은 바뀔 때만 새 객체여야 한다. */
export function nextLocalDay(current: Date | null, now: Date): Date {
  return current !== null && isSameLocalDay(current, now) ? current : now;
}

let localDay: Date | null = null;
const dayListeners = new Set<() => void>();
let dayTimer: ReturnType<typeof setInterval> | null = null;

function refreshLocalDay() {
  const next = nextLocalDay(localDay, new Date());
  if (next === localDay) return;
  localDay = next;
  for (const l of [...dayListeners]) l();
}

function subscribeLocalDay(listener: () => void): () => void {
  dayListeners.add(listener);
  if (dayListeners.size === 1) {
    // 구독이 없던 동안 날짜가 바뀌었을 수 있다 — 조용히 맞춘다(React가 구독 직후 스냅샷을 다시 확인한다).
    localDay = nextLocalDay(localDay, new Date());
    dayTimer = setInterval(refreshLocalDay, TICK_MS);
    document.addEventListener("visibilitychange", refreshLocalDay);
    window.addEventListener("focus", refreshLocalDay);
  }
  return () => {
    dayListeners.delete(listener);
    if (dayListeners.size > 0) return;
    if (dayTimer !== null) clearInterval(dayTimer);
    dayTimer = null;
    document.removeEventListener("visibilitychange", refreshLocalDay);
    window.removeEventListener("focus", refreshLocalDay);
  };
}

/**
 * 렌더할 때마다 날짜를 확인한다 — 구독이 없던 동안(다른 탭에 있는 사이) 자정이 지났으면
 * 구독(패시브 이펙트) 전 첫 페인트부터 오늘 값을 낸다(어제 일차·어제 문항이 잠깐 보이지 않게).
 * 같은 날이면 같은 참조라 스냅샷이 안정적이고 추가 렌더도 없다. Swift도 렌더마다 Date()로 다시 계산한다(RecordFlowView.swift:62, :153).
 */
export function getLocalDaySnapshot(): Date {
  localDay = nextLocalDay(localDay, new Date());
  return localDay;
}

const getLocalDayServerSnapshot = (): Date | null => null;

/** 오늘(로컬 달력) — 서버·하이드레이션 중에는 null. 값의 시각 부분은 그날 처음 본 시각이라 날짜 계산에만 쓴다. */
export function useLocalDay(): Date | null {
  return useSyncExternalStore<Date | null>(subscribeLocalDay, getLocalDaySnapshot, getLocalDayServerSnapshot);
}

/** 오늘 "YYYY-MM-DD". 빈 문자열이면 아직 브라우저 시각을 읽지 않은 것. */
export function useLocalToday(): string {
  const day = useLocalDay();
  return day === null ? "" : toLocalDateString(day);
}
