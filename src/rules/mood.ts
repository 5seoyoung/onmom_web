// 기분 살피기 — iOS `MoodCheckRules.swift` + `AppStore.swift`(todayMoodCheck·moodSignal·snooze)를 옮긴 것.
//
// 우울을 직접 묻지 않는 중립 문항을 하루 1개씩 누적해 "힘든 날이 이어지는" 신호만 본다
// (강동경희대병원 산부인과 자문 2026-07-19). 문항·기준은 임상 확정 전 초안이다(MOOD_VERSION).
// 진단이 아니다 — 점수·등급·"우울"이라는 단어는 사용자에게 보이지 않고, 신호는 연계 안내를 띄울지만 정한다.
// 문항·수치는 content.json `mood_check`에 있다. 임상 회신은 그 JSON을 교체하는 것으로 반영한다.

import content from "@/content";
import { calendarDaysBetween, isSameLocalDay, startOfLocalDay, toLocalDateString } from "@/domain/date";
import type { IsoDateTimeString, MoodAnswer, MoodCheckRecord } from "@/domain/types";

export interface MoodQuestion {
  id: number;
  text: string;
  /** 문항이 간접적으로 건드리는 영역 — 임상 검토용. 사용자에게 보이지 않는다. */
  domain: string;
}

export interface MoodSignal {
  /** 어느 기준에 걸렸는가 — 개발 로그용. 사용자에게 보이지 않는다. */
  reason: string;
}

export const MOOD_QUESTIONS: readonly MoodQuestion[] = content.mood_check.questions;
/** 최근 며칠을 보는가 */
export const MOOD_WINDOW_DAYS = content.mood_check.window_days;
/** 그 안에 「아니요」가 몇 개면 신호인가 */
export const MOOD_SIGNAL_THRESHOLD = content.mood_check.signal_threshold;
/** 또는 며칠 연속 「아니요」면 신호인가 */
export const MOOD_CONSECUTIVE_THRESHOLD = content.mood_check.consecutive_threshold;
/** 연계 카드 "나중에 볼게요" 기간 — AppStore.snoozeMoodCard(days: 7) */
export const MOOD_CARD_SNOOZE_DAYS = 7;

/** 답 버튼 순서 — iOS `MoodAnswer.allCases` */
export const MOOD_ANSWERS: readonly MoodAnswer[] = ["yes", "unsure", "no"];

export function moodAnswerLabel(answer: MoodAnswer): string {
  return content.mood_check.answers[answer];
}

/** 모르는 답 값(다음 버전이 추가한 값 등)은 "글쎄요"로 본다 — 신호로 세지 않는다(AppStore.swift:313-315). */
export function normalizeMoodAnswer(raw: unknown): MoodAnswer {
  return raw === "yes" || raw === "unsure" || raw === "no" ? raw : "unsure";
}

/**
 * 오늘의 문항 — 1970-01-01(로컬)부터 며칠째인지로 돌아가며 고른다. 같은 날엔 항상 같은 문항.
 * UTC로 세면 한국 09:00에 문항이 바뀌므로 로컬 달력 날짜로 센다(MoodCheckRules.swift:36-45).
 */
export function questionForDay(now: Date): MoodQuestion {
  const days = calendarDaysBetween(new Date(0), now);
  const n = MOOD_QUESTIONS.length;
  return MOOD_QUESTIONS[((days % n) + n) % n];
}

/**
 * 기록이 신호 기준에 걸리면 MoodSignal, 아니면 null (MoodCheckRules.swift:61-100).
 * - 오늘 포함 최근 14일(로컬 달력)만 본다. 미래 날짜 기록은 무시한다.
 * - 하루에 여러 답이 있으면 그날의 마지막 답만 센다.
 * - 「아니요」가 5일 이상이거나, 달력상 3일 연속이면 신호(빈 날은 끊긴 것으로 본다).
 */
export function moodSignal(checks: readonly MoodCheckRecord[], now: Date): MoodSignal | null {
  const today = startOfLocalDay(now);
  const windowStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (MOOD_WINDOW_DAYS - 1));

  const dated = checks
    .map((r) => ({ at: new Date(r.date), answer: normalizeMoodAnswer(r.answer) }))
    .filter((r) => !Number.isNaN(r.at.getTime()))
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  // 날짜별 마지막 답
  const byDay = new Map<string, { day: Date; answer: MoodAnswer }>();
  for (const r of dated) {
    const day = startOfLocalDay(r.at);
    if (day < windowStart || day > today) continue;
    byDay.set(toLocalDateString(day), { day, answer: r.answer });
  }

  const noDays = [...byDay.values()]
    .filter((v) => v.answer === "no")
    .map((v) => v.day)
    .sort((a, b) => a.getTime() - b.getTime());
  if (noDays.length >= MOOD_SIGNAL_THRESHOLD) {
    return { reason: `${MOOD_WINDOW_DAYS}일 중 ${noDays.length}일` };
  }

  let run = 0;
  let previous: Date | null = null;
  for (const day of noDays) {
    run = previous !== null && calendarDaysBetween(previous, day) === 1 ? run + 1 : 1;
    if (run >= MOOD_CONSECUTIVE_THRESHOLD) {
      return { reason: `${run}일 연속` };
    }
    previous = day;
  }
  return null;
}

/** 오늘 이미 답했으면 그 기록(최신순 목록의 첫 일치). 하루 1문항이라 답한 뒤에는 다시 묻지 않는다. */
export function todayMoodCheck(checks: readonly MoodCheckRecord[], now: Date): MoodCheckRecord | null {
  return checks.find((r) => isSameLocalDay(new Date(r.date), now)) ?? null;
}

/** 연계 카드를 접어둔 기한이 아직 남았는가. 형식이 틀린 값은 접지 않은 것으로 본다. */
export function isMoodCardSnoozed(until: IsoDateTimeString | null, now: Date): boolean {
  if (!until) return false;
  const t = new Date(until).getTime();
  return !Number.isNaN(t) && t > now.getTime();
}

/** 홈 연계 카드에 쓸 신호 — 접어둔 기간에는 null (AppStore.moodSignal). */
export function moodCardSignal(
  checks: readonly MoodCheckRecord[],
  snoozedUntil: IsoDateTimeString | null,
  now: Date,
): MoodSignal | null {
  if (isMoodCardSnoozed(snoozedUntil, now)) return null;
  return moodSignal(checks, now);
}

/** "나중에 볼게요" — 7일 뒤 같은 시각까지 접는다. 기록은 그대로라 기간이 지나면 다시 판정한다. */
export function moodCardSnoozeUntil(now: Date, days: number = MOOD_CARD_SNOOZE_DAYS): IsoDateTimeString {
  const until = new Date(now.getTime());
  until.setDate(until.getDate() + days);
  return until.toISOString();
}
