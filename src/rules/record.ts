// 증상 기록 만들기·쌓기, 홈 회복 상태 — iOS `RecordFlowView.swift`(runCheck) · `AppStore.swift`(latestRecord ·
// recoveryStateLabel · addSymptomRecord) · `HomeView.swift`(상태 카드 제목 · 지표 시각 · activeRedFlag)를 옮긴 것.
// 순수 함수만 둔다 — 시각은 `now`로 받는다.

import content from "@/content";
import { isSameLocalDay, postpartumDayCount } from "@/domain/date";
import { SYMPTOM_HISTORY_LIMIT, type LocalDateString, type SymptomRecord } from "@/domain/types";
import { checkRedFlags, metrics, type RedFlagResult, type SymptomInput } from "./redflag";

// MARK: 기록 만들기

/** 기록 폼 값 — 산후 경과일은 폼이 아니라 출산일에서 계산한다. */
export type SymptomForm = Omit<SymptomInput, "postpartumDays">;

/** 오로 질문은 산후 10일부터 묻는다(RecordFlowView.swift:167). 그 전에는 붉은 오로가 정상이라 묻지 않는다. */
export function showsLochiaInputs(postpartumDays: number): boolean {
  return postpartumDays >= 10;
}

/**
 * 폼 → 판정 + 저장할 기록 1건(RecordFlowView.swift:304-327).
 * - 산후 경과일은 기록 시점 값을 기록에 함께 남긴다(나중에 출산일을 고쳐도 판정을 되짚을 수 있게).
 * - 위험 증상 토글 4개는 판정에만 쓰고 저장하지 않는다(iOS SymptomRecord에 필드가 없다 — 감사 #46).
 * - id는 호출하는 쪽이 만든다(여기엔 무작위가 없다).
 */
export function buildSymptomRecord(
  form: SymptomForm,
  deliveryDate: LocalDateString | null,
  now: Date,
  id: string,
): { record: SymptomRecord; result: RedFlagResult } {
  const postpartumDays = postpartumDayCount(deliveryDate, now);
  // 10일 전에는 오로 질문이 화면에 없다 — 묻지 않은 값이 기록에 남지 않게 한다
  const asksLochia = showsLochiaInputs(postpartumDays);
  const input: SymptomInput = {
    ...form,
    postpartumDays,
    lochiaIncreased: asksLochia && form.lochiaIncreased,
    lochiaRed: asksLochia && form.lochiaRed,
    painNrs: clampNrs(form.painNrs),
  };
  const result = checkRedFlags(input);
  const record: SymptomRecord = {
    id,
    date: now.toISOString(),
    lochiaIncreased: input.lochiaIncreased,
    lochiaRed: input.lochiaRed,
    feverEvent: input.feverEvent,
    painNrs: input.painNrs,
    redFlagCode: result.hospitalSignal?.code ?? null,
    postpartumDays,
  };
  return { record, result };
}

/** 슬라이더 0~10(정수). iOS는 `Int(pain)`으로 소수를 버렸다. 화면 슬라이더(components/ui/numbers.ts)도 이 함수를 쓴다. */
export function clampNrs(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(10, Math.max(0, Math.trunc(n)));
}

/** 최신순 맨 앞에 넣고 최대 50건만 남긴다(AppStore.swift:134-137). 원본 배열은 건드리지 않는다. */
export function addSymptomRecord(history: readonly SymptomRecord[], record: SymptomRecord): SymptomRecord[] {
  return [record, ...history].slice(0, SYMPTOM_HISTORY_LIMIT);
}

/** 판정 결과가 "신호 없음"일 때의 안내 — 제목·본문 두 줄(RecordFlowView.swift:290, :295, 감사 #53). */
export const RECORD_NORMAL_RESULT: { title: string; body: string } = (() => {
  const [title, body = ""] = content.disclaimers.record_normal.split(" / ");
  return { title, body };
})();

// MARK: 홈 회복 상태 — 전부 가장 최근 기록 하나에서 파생한다(기록이 없으면 지어내지 않는다)

/** 가장 최근 증상 기록 — 홈 회복 상태의 유일한 근거(기록은 최신순). */
export function latestRecord(history: readonly SymptomRecord[]): SymptomRecord | null {
  return history[0] ?? null;
}

/**
 * 레드플래그 활성 = 가장 최근 기록에 즉시 병원 신호가 있음(HomeView.swift:123, ExerciseView.swift:25).
 * 홈 운동 안내·체중 카드, 운동 탭이 이 값으로 멈춘다.
 */
export function isRedFlagActive(history: readonly SymptomRecord[]): boolean {
  return history[0]?.redFlagCode != null;
}

export type RecoveryStateLabel = "양호" | "관찰" | "확인 필요";

/** 홈 "회복 상태" 라벨. 기록이 없으면 null(기록 유도 카드). 원문: AppStore.swift:69-73 */
export function recoveryStateLabel(latest: SymptomRecord | null | undefined): RecoveryStateLabel | null {
  if (!latest) return null;
  if (latest.redFlagCode != null) return "확인 필요";
  return metrics(latest).some((m) => m.status !== "normal") ? "관찰" : "양호";
}

/**
 * 상태 카드 제목. 최근 기록이 오늘 것이 아니면 기록 날짜를 붙여 오래된 상태를 오늘 것처럼 보이지 않게 한다
 * (HomeView.swift:213-218, 감사 #10). 기록이 없을 때의 기록 유도 카드 제목도 "오늘의 회복 상태"다.
 */
export function recoveryStateTitle(latest: SymptomRecord | null | undefined, now: Date): string {
  const d = latest ? new Date(latest.date) : null;
  if (!d || Number.isNaN(d.getTime()) || isSameLocalDay(d, now)) {
    return "오늘의 회복 상태"; // 원문: HomeView.swift:215
  }
  // iOS `.dateTime.month().day()` (ko_KR) = "9월 23일" — 연도는 붙이지 않는다
  return `최근 회복 상태 · ${d.getMonth() + 1}월 ${d.getDate()}일 기록`; // 원문: HomeView.swift:217
}

// MARK: 지표 카드의 기록 시각 — "3시간 전", "어제", "지난주"
//
// iOS는 `date.formatted(.relative(presentation: .named))`(HomeView.swift:364)다. 같은 결과를 내도록
// Foundation `Date.RelativeFormatStyle`의 단위 고르기를 옮기고, 문구는 같은 ICU 데이터(Intl, ko)로 만든다.
//   1) 두 시각 차이를 초 단위로 반올림
//   2) 달력 차이(년·월·주·일·시·분·초) 중 0이 아닌 가장 큰 단위
//   3) 시·분·초면 바로 아래 단위로 반올림(1시간 40분 → 2시간, 23시간 30분 → 어제)
//      일·주·월·년이면 지금 시각을 그 단위의 끝으로 옮겨 달력 경계로 센다(어제 23시 기록은 오늘 01시에 "어제")
// 주의 시작은 일요일(ko_KR).

type RelUnit = "year" | "month" | "week" | "day" | "hour" | "minute" | "second";
const REL_UNITS: readonly RelUnit[] = ["year", "month", "week", "day", "hour", "minute", "second"];
const KO_RELATIVE = new Intl.RelativeTimeFormat("ko", { numeric: "auto", style: "long" });

/** 기록 시각을 지금 기준 상대 표현으로. */
export function relativeRecordTime(date: Date | string, now: Date): string {
  const dest = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(dest.getTime()) || Number.isNaN(now.getTime())) return "";

  const deltaMs = now.getTime() - dest.getTime();
  const ref = new Date(dest.getTime() + Math.sign(deltaMs) * Math.round(Math.abs(deltaMs) / 1000) * 1000);

  const largest = firstNonZero(calendarDiff(ref, dest, REL_UNITS)) ?? { unit: "second", value: 0 };
  const picked =
    largest.unit === "hour" || largest.unit === "minute" || largest.unit === "second"
      ? roundedLargest(dest, ref, largest.unit)
      : (alignedLargest(largest.unit, dest, ref) ?? largest);
  return KO_RELATIVE.format(picked.value, picked.unit);
}

interface UnitValue {
  unit: RelUnit;
  value: number;
}

function roundedLargest(dest: Date, ref: Date, unit: "hour" | "minute" | "second"): UnitValue {
  const units = REL_UNITS.slice(REL_UNITS.indexOf(unit));
  const c = calendarDiff(ref, dest, units);
  let value = c[unit] ?? 0;
  // 한 단계 아래 단위가 절반 이상이면 올린다(분·초는 60개). 초 아래(나노초)는 1)에서 이미 반올림했다.
  const next = units[1];
  const nextValue = next ? (c[next] ?? 0) : 0;
  if (Math.abs(nextValue) * 2 >= 60) value += nextValue > 0 ? 1 : -1;
  // 올림으로 윗 단위가 찼으면(59분 40초 → 1시간) 그 단위로 다시 센다
  const shifted = addUnit(dest, unit, -value);
  const recomputed = firstNonZero(calendarDiff(shifted, dest, REL_UNITS));
  if (recomputed && recomputed.unit !== unit) return recomputed;
  return { unit, value };
}

function alignedLargest(unit: RelUnit, dest: Date, ref: Date): UnitValue | null {
  if (unit !== "year" && unit !== "month" && unit !== "week" && unit !== "day") return null;
  const [start, nextStart] = unitInterval(unit, ref);
  // 과거 기록이면 지금 시각을 그 단위의 마지막 초로, 미래면 첫 순간으로 옮긴다
  const aligned = ref.getTime() < dest.getTime() ? start : new Date(nextStart.getTime() - 1000);
  return firstNonZero(calendarDiff(aligned, dest, REL_UNITS));
}

/** d가 속한 년·월·주(일요일 시작)·일의 [시작, 다음 시작) */
function unitInterval(unit: "year" | "month" | "week" | "day", d: Date): [Date, Date] {
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  switch (unit) {
    case "year":
      return [new Date(y, 0, 1), new Date(y + 1, 0, 1)];
    case "month":
      return [new Date(y, m, 1), new Date(y, m + 1, 1)];
    case "week": {
      const s = day - d.getDay();
      return [new Date(y, m, s), new Date(y, m, s + 7)];
    }
    case "day":
      return [new Date(y, m, day), new Date(y, m, day + 1)];
  }
}

/** 달력 차이 — 큰 단위부터 넘지 않는 한 최대로 세고 남은 만큼 다음 단위로(Foundation dateComponents(from:to:)). */
function calendarDiff(from: Date, to: Date, units: readonly RelUnit[]): Partial<Record<RelUnit, number>> {
  const out: Partial<Record<RelUnit, number>> = {};
  const target = to.getTime();
  const step = target >= from.getTime() ? 1 : -1;
  let cur = from;
  for (const unit of units) {
    let n = 0;
    for (;;) {
      const t = addUnit(cur, unit, n + step).getTime();
      if (step > 0 ? t <= target : t >= target) n += step;
      else break;
    }
    out[unit] = n;
    cur = addUnit(cur, unit, n);
  }
  return out;
}

function firstNonZero(c: Partial<Record<RelUnit, number>>): UnitValue | null {
  for (const unit of REL_UNITS) {
    const value = c[unit];
    if (value) return { unit, value };
  }
  return null;
}

/** 로컬 달력 기준 더하기 — 월·년은 말일을 넘지 않게 자른다(1/31 + 1개월 = 2/28). 시·분·초는 경과 시간. */
function addUnit(d: Date, unit: RelUnit, n: number): Date {
  switch (unit) {
    case "hour":
      return new Date(d.getTime() + n * 3_600_000);
    case "minute":
      return new Date(d.getTime() + n * 60_000);
    case "second":
      return new Date(d.getTime() + n * 1000);
    case "day":
    case "week": {
      const days = unit === "week" ? n * 7 : n;
      return new Date(
        d.getFullYear(), d.getMonth(), d.getDate() + days,
        d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds(),
      );
    }
    case "month":
    case "year": {
      const m = d.getMonth() + (unit === "year" ? n * 12 : n);
      const lastDay = new Date(d.getFullYear(), m + 1, 0).getDate();
      return new Date(
        d.getFullYear(), m, Math.min(d.getDate(), lastDay),
        d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds(),
      );
    }
  }
}
