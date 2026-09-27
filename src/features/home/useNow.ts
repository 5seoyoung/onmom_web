"use client";

// 지금 시각(ms) — 브라우저에서만 읽는다. 서버 렌더링(정적 HTML)과 하이드레이션 첫 렌더는 0이다
// (빌드 시각이 "n일차"·"3시간 전"에 박히지 않게, DEV_NOTES §4).
// 1분마다, 탭이 다시 보일 때, 그리고 다른 창이 저장소를 바꿨을 때(window "storage" — 스토어도 이 이벤트로
// 새 기록을 곧바로 받는다) 갱신해 상대 시간·산후 일차·자정 경계를 따라간다. 새 기록과 낡은 시계가 함께
// 그려지지 않게 하려는 것이며, 그래도 기록이 시계보다 늦으면 homeViewModel이 기록 시각을 기준으로 잰다.
// 구독이 모두 끊기면 값을 비워, 오래 뒤에 다시 들어와도 낡은 시각으로 그리지 않는다.

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
    window.addEventListener("storage", tick);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    if (timer !== null) clearInterval(timer);
    timer = null;
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("storage", tick);
    current = 0;
  };
}

function getSnapshot(): number {
  if (current === 0) current = Date.now();
  return current;
}

function getServerSnapshot(): number {
  return 0;
}

/** 지금 시각(ms). 0이면 아직 브라우저 시각을 읽지 않은 것 — 시각에 따라 달라지는 값을 그리지 않는다. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
