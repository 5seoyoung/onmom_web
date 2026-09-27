"use client";

// 지금 시각 — 브라우저에서만 읽는다(DEV_NOTES §4: 빌드 시각이 "n일차"에 박히지 않게).
// 서버 렌더링과 하이드레이션 첫 렌더는 null. 1분마다, 그리고 탭이 다시 보일 때 갱신해 자정 경계를 따라간다.
// 프로필·설정 화면이 같이 쓴다. (features/home/useNow.ts와 같은 방식 — 공용 훅으로 합칠 후보)

import { useSyncExternalStore } from "react";

const TICK_MS = 60_000;

let current = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function tick() {
  current = Date.now();
  for (const l of [...listeners]) l();
}

function onVisibility() {
  if (document.visibilityState === "visible") tick();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === null) {
    timer = setInterval(tick, TICK_MS);
    document.addEventListener("visibilitychange", onVisibility);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    if (timer !== null) clearInterval(timer);
    timer = null;
    document.removeEventListener("visibilitychange", onVisibility);
    current = 0; // 다시 들어왔을 때 낡은 시각으로 그리지 않게
  };
}

function getSnapshot(): number {
  if (current === 0) current = Date.now();
  return current;
}

function getServerSnapshot(): number {
  return 0;
}

/** 지금 시각. null이면 아직 브라우저 시각을 읽지 않은 것 — 시각에 따라 달라지는 값을 그리지 않는다. */
export function useNowMs(): number | null {
  const ms = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return ms === 0 ? null : ms;
}
