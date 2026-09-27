"use client";

// 오늘(로컬 달력) "YYYY-MM-DD" — 브라우저에서만 읽는다. 서버 렌더링·하이드레이션 첫 렌더는 ""(빌드 날짜가 박히지 않게, DEV_NOTES §4).
// 출산일 입력의 max와 "고름" 판정에 쓴다. 자정을 넘겨도 맞도록 1분마다, 그리고 탭이 다시 보일 때 다시 읽는다.
// 값이 문자열이라 날짜가 바뀔 때만 다시 그린다.

import { useSyncExternalStore } from "react";
import { toLocalDateString } from "@/domain/date";

const TICK_MS = 60_000;

function subscribe(onChange: () => void): () => void {
  const timer = setInterval(onChange, TICK_MS);
  const onVisibility = () => {
    if (document.visibilityState === "visible") onChange();
  };
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

const getSnapshot = () => toLocalDateString(new Date());
const getServerSnapshot = () => "";

/** 오늘 "YYYY-MM-DD". 빈 문자열이면 아직 브라우저 시각을 읽지 않은 것. */
export function useLocalToday(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
