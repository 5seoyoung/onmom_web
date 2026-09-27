// 날짜는 전부 사용자 로컬 달력 기준이다(02 §0, 08 §3-2 — UTC로 계산하면 한국 09:00에 "오늘"이 바뀐다).
//
// iOS와 다른 점(의도적): iOS `UserProfile.dayCount`는 출산일에 남은 시각 기준으로 일수를 셌다
// (Models.swift:85-88 — 경계일에 최대 하루 적게 셈). 웹은 문서(02 §0)대로 달력 날짜 차이를 쓴다.

import type { LocalDateString } from "./types";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "YYYY-MM-DD" → 그 날의 로컬 자정 Date. 형식이 틀리면 null. */
export function parseLocalDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = DATE_RE.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // 2026-02-31 같은 값은 거부
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null;
  return d;
}

/** Date → 로컬 달력 날짜 "YYYY-MM-DD" */
export function toLocalDateString(d: Date): LocalDateString {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** 두 시점의 로컬 달력 날짜 차이(b − a, 일). 서머타임과 무관하게 달력 기준으로 센다. */
export function calendarDaysBetween(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86_400_000);
}

/** 산후 경과일(D+). 출산일이 없거나 미래면 0. */
export function postpartumDayCount(deliveryDate: LocalDateString | null, now: Date): number {
  const d = parseLocalDate(deliveryDate);
  if (!d) return 0;
  return Math.max(0, calendarDaysBetween(d, now));
}

/** 산후 주차 — 0~6일 = 0주차, 7~13일 = 1주차 */
export function weekFromDayCount(dayCount: number): number {
  return Math.floor(Math.max(0, dayCount) / 7);
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return calendarDaysBetween(a, b) === 0;
}
