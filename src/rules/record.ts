// 증상 기록 만들기·쌓기, 홈 회복 상태 — iOS `RecordFlowView.swift`(runCheck) · `AppStore.swift`(latestRecord ·
// recoveryStateLabel · addSymptomRecord) · `HomeView.swift`(상태 카드 제목 · 지표 시각 · activeRedFlag)를 옮긴 것.
// 순수 함수만 둔다 — 시각은 `now`로 받는다.

import content from "@/content";
import { isSameLocalDay, postpartumDayCount } from "@/domain/date";
import { RISK_SYMPTOM_KEYS, SYMPTOM_HISTORY_LIMIT, type LocalDateString, type RiskSymptomKey, type SymptomRecord } from "@/domain/types";
import {
  checkRedFlags,
  LOCHIA_GATE_DAYS,
  METRIC_STATUS_LABEL,
  metrics,
  redFlagSeverity,
  type RedFlagResult,
  type SymptomInput,
} from "./redflag";

// MARK: 기록 만들기

/** 기록 폼 값 — 산후 경과일은 폼이 아니라 출산일에서 계산한다. */
export type SymptomForm = Omit<SymptomInput, "postpartumDays">;

/**
 * 오로 질문은 산후 10일(LOCHIA_GATE_DAYS — 레드플래그 판정과 같은 값)부터 묻는다(RecordFlowView.swift:167). 그 전에는 붉은 오로가 흔해서
 * 색·증가를 묻지 않는다. 다량 출혈(위험 증상 bleedingHeavy)은 이 게이트와 상관없이 늘 묻는다(rules-1.2, 임상 사전 검토 B1).
 */
export function showsLochiaInputs(postpartumDays: number): boolean {
  return postpartumDays >= LOCHIA_GATE_DAYS;
}

/** 판정에 쓴 위험 증상 토글 값 — 기록에 그대로 남긴다(칸 이름 = domain/types RISK_SYMPTOM_KEYS) */
function riskFlagsOf(input: SymptomInput): Record<RiskSymptomKey, boolean> {
  return Object.fromEntries(RISK_SYMPTOM_KEYS.map((key) => [key, input[key] === true])) as Record<RiskSymptomKey, boolean>;
}

/**
 * 폼 → 판정 + 저장할 기록 1건(RecordFlowView.swift:304-327).
 * - 산후 경과일은 기록 시점 값을 기록에 함께 남긴다(나중에 출산일을 고쳐도 판정을 되짚을 수 있게).
 * - 위험 증상 토글은 판정에 쓰고 기록에도 남긴다(rules-1.2 — 임상 사전 검토 R-STORE·§3-3, DEV_NOTES §3 CPO 3). iOS 기록에는 이 칸이
 *   없어서(감사 #46) 어지러움만 켠 기록이 지표는 모두 "해당 없음"인데 상태는 병원 신호로 보였다 — 이제 최근 기록·PDF 리포트가 어떤
 *   신호였는지 보인다. 이 칸이 생기기 전의 기록은 칸이 없다(묻지 않은 것 — false로 지어내지 않는다).
 * - 결과를 낸 규칙의 버전(checkRedFlags trace.configVersion = RULES_VERSION)을 기록에 찍는다 — 리포트·내려받기 파일이
 *   기록마다 그때의 규칙 버전을 보인다(감사 추적). 나중에 RULES_VERSION을 올려도 이미 남긴 기록의 버전은 그대로다.
 * - id는 붙이지 않는다 — 저장할 때 스토어가 붙인다(여기엔 무작위가 없다).
 */
export function buildSymptomRecord(
  form: SymptomForm,
  deliveryDate: LocalDateString | null,
  now: Date,
): { record: Omit<SymptomRecord, "id">; result: RedFlagResult } {
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
  const record: Omit<SymptomRecord, "id"> = {
    date: now.toISOString(),
    lochiaIncreased: input.lochiaIncreased,
    lochiaRed: input.lochiaRed,
    feverEvent: input.feverEvent,
    painNrs: input.painNrs,
    redFlagCode: result.hospitalSignal?.code ?? null,
    postpartumDays,
    rulesVersion: result.trace.configVersion,
    ...riskFlagsOf(input),
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

/**
 * 걸린 신호가 없을 때의 안내 — 제목·본문 두 줄(RecordFlowView.swift:290, :295, 감사 #53).
 * "위험 신호가 없다"고 판정하지 않고, 체크한 항목이 목록과 맞지 않았다는 사실만 말한다(법률 사전 검토 H5 D-17).
 * 웹 신규 문구 — CPO 확인 필요 (content.json disclaimers.record_normal — iOS 원문 "즉시 내원이 필요한 위험 신호는 없어요"를 바꿈)
 */
export const RECORD_NORMAL_RESULT: { title: string; body: string } = (() => {
  const [title, body = ""] = content.disclaimers.record_normal.split(" / ");
  return { title, body };
})();

// MARK: 홈 회복 기록 — 전부 가장 최근 기록 하나에서 파생한다(기록이 없으면 지어내지 않는다)

/** 가장 최근 증상 기록 — 홈 회복 기록 카드의 유일한 근거(기록은 최신순). */
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

export type RecoveryStateLabel = (typeof METRIC_STATUS_LABEL)[keyof typeof METRIC_STATUS_LABEL];

/**
 * 홈 기록 카드의 라벨 — 지표 배지와 같은 세 글자(METRIC_STATUS_LABEL). 기록이 없으면 null(기록 유도 카드). 규칙은 AppStore.swift:69-73 그대로.
 * 회복이 좋다·나쁘다를 말하지 않는다 — 가장 최근 기록의 값이 어떤 안내에 해당하는지만 말한다.
 */
export function recoveryStateLabel(latest: SymptomRecord | null | undefined): RecoveryStateLabel | null {
  if (!latest) return null;
  if (latest.redFlagCode != null) return METRIC_STATUS_LABEL.alert;
  return metrics(latest).some((m) => m.status !== "normal") ? METRIC_STATUS_LABEL.watch : METRIC_STATUS_LABEL.normal;
}

/** 가장 최근 기록에 위기 상담 신호(나·아기를 해칠 것 같은 생각)가 있는가 — 대표 신호가 119여도 토글 칸으로 본다(rules-1.2) */
export function recordHasCrisisSignal(latest: SymptomRecord | null | undefined): boolean {
  if (!latest) return false;
  return latest.harmThoughts === true || redFlagSeverity(latest.redFlagCode) === "crisis";
}

/**
 * 웹 신규 문구 — CPO 확인 필요 (홈 기록 카드 제목. iOS 원문 "오늘의 회복 상태"·"최근 회복 상태 · …"를 바꿈 — "상태"는 회복을 평가하는
 * 말로 읽힌다. 법률 사전 검토 H5)
 */
export const RECOVERY_RECORD_TITLE = "오늘의 회복 기록";

/**
 * 기록 카드 제목. 최근 기록이 오늘 것이 아니면 기록 날짜를 붙여 오래된 기록을 오늘 것처럼 보이지 않게 한다
 * (HomeView.swift:213-218, 감사 #10). 기록이 없을 때의 기록 유도 카드 제목도 같다.
 */
export function recoveryStateTitle(latest: SymptomRecord | null | undefined, now: Date): string {
  const d = latest ? new Date(latest.date) : null;
  if (!d || Number.isNaN(d.getTime()) || isSameLocalDay(d, now)) {
    return RECOVERY_RECORD_TITLE;
  }
  // iOS `.dateTime.month().day()` (ko_KR) = "9월 23일" — 연도는 붙이지 않는다
  return `최근 회복 기록 · ${d.getMonth() + 1}월 ${d.getDate()}일`; // 웹 신규 문구 — CPO 확인 필요 (위 제목과 같은 까닭)
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
