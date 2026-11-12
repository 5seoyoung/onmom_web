// 운동 탭 맨 위 "오늘의 체조" 카드 모델 — 지금 열린 단계 중 오늘 볼 것을 최대 3개 고른다. 순수 함수(오늘 날짜는 화면이 넘긴다).
//
// 무엇이 열렸는지는 운동 탭과 같은 규칙이다(새 기준을 만들지 않는다).
// - 본문 분기(exerciseGate): 분만 방식·출산일이 없으면 카드 없음(그 안내 블록이 대신), 최근 기록에 레드플래그가 있으면 멈춤 —
//   멈춤은 운동 탭의 멈춤 블록(ExerciseBlocks RedFlagBlock "운동 영상 추천을 멈췄어요 … 모든 운동 추천을 잠시 멈춰요")이 같은 자리에 보인다.
// - 단계: 주차가 됐고(startWeek — 분만 방식별) 산모수첩 소견으로 막히지 않은(blockedBuckets) 단계. 영상 카드의 "가능"(exercisePlan unlocked)·
//   유튜브 추천(youtubePlan)과 같은 조건이다.
// - 주의 오버레이(content.json caution_overlays): 회복 단계 분석과 같은 판정(rules/recovery recoveryRecommendation의 caution)으로 하나라도 있으면
//   "주의 사항이 있어요" 한 줄과 분석 화면 링크만 둔다 — 주의 문구는 분석 결과의 "주의" 묶음에 있고 카드에 되풀이하지 않는다.
//
// 항목은 content.json stage_buckets의 단계 제목·요약 그대로다(rules/exercise STAGE_BUCKETS). content.json·운동 탭에 단계별 동작 목록이 없어
// 단계 요약 하나를 항목 하나로 쓴다 — 요약을 쪼개거나 시간·횟수·방법을 붙이지 않는다(의료 내용을 새로 만들지 않는다).
// 영상 목록(영상 서버)은 쓰지 않는다 — 서버가 잠들어 있거나 오프라인이어도 카드가 같은 목록을 보이게.
//
// 고르기(routinePool → pickTodayStages)
// - 회복 우선기는 지금 단계일 때(0~1주)만 넣는다 — 요약이 "호흡·이완만. 윗몸일으키기 등 복부운동 금지"라는 제한이라,
//   뒤 단계(예: 코어 강화 "복근·코어 강화·요가")와 나란히 두면 서로 어긋난다(2026-11-08 결정).
// - 지금 단계(열린 단계 중 가장 늦은 것 = rules/exercise currentStage)는 늘 넣고, 그보다 앞 단계에서 2개를 날짜 순번으로 돌려 고른다.
//   같은 날(로컬 달력)에는 같은 목록, 다음 날은 한 칸 밀린 묶음 — 앞 단계마다 같은 횟수로 나온다. 고를 단계가 3개 이하면 날마다 모두.
// - 화면 순서는 단계순.
//
// [오늘 했어요] 체크한 날은 이 브라우저에만 둔다(routineChecks.ts) — 여기서는 그 목록으로 버튼·"이번 주 n일"만 만든다.

import type { DeliveryMethod, LocalDateString, MaternityRecord } from "@/domain/types";
import { toLocalDateString } from "@/domain/date";
import { ANALYZE_TEXT } from "@/features/analyze/analyzeModel";
import { STAGE_BUCKETS, blockedBuckets, bucketByKey, startWeek, type StageBucket } from "@/rules/exercise";
import { recoveryRecommendation } from "@/rules/recovery";
import { ROUTES } from "@/routes";
import type { ExerciseGate } from "./exerciseModel";
import { thisWeekCount } from "./routineChecks";

/** 오늘의 체조에 넣는 단계 수 상한 */
export const TODAY_ROUTINE_MAX = 3;

/** 요약이 제한 문구라 지금 단계일 때만 넣는 단계 — content.json stage_buckets의 key */
export const RESTRICTION_STAGE_KEY = "recovery_priority";
if (bucketByKey(RESTRICTION_STAGE_KEY) === null) throw new Error(`content.json stage_buckets에 '${RESTRICTION_STAGE_KEY}'가 없습니다`);

export const TODAY_ROUTINE_TEXT = {
  heading: "오늘의 체조", // 웹 신규 문구 — CPO 확인 필요
  // 웹 신규 문구 — CPO 확인 필요. 고를 단계가 TODAY_ROUTINE_MAX보다 많아 날마다 바뀔 때
  introRotating: "지금 열린 단계에서 날마다 바꿔 골라요.",
  // 웹 신규 문구 — CPO 확인 필요. 고를 단계를 모두 보일 때(날마다 같다)
  introPicked: "지금 열린 단계에서 골랐어요.",
  // 웹 신규 문구 — CPO 확인 필요. 근거: ACOG FAQ131 "Exercise After Pregnancy"(2022-09 갱신, 2024-10 검토 — 통증이 있으면 멈춤,
  // docs/dev/clinical/CLINICAL_PREREVIEW.md 참고문헌 G3, 원문 확인). 출혈·어지러움은 그 정리에서 확인하지 못했다 — 앱의 병원 신호(기록 탭의
  // 출혈·어지러움 항목)와 같은 보수적 안내로 넣었다. ACOG CO 804 본문(유료)은 확인하지 못했다. 임상 확인 필요.
  stopNote: "운동 중 통증·출혈·어지러움이 있으면 멈추고 의료진과 상담하세요.",
  // 웹 신규 문구 — CPO 확인 필요. 산모수첩 확인 항목에 주의 오버레이가 하나라도 있을 때(주의 문구는 분석 결과에만)
  cautionNote: "산모수첩 확인 항목에 따른 주의 사항이 있어요.",
  // 웹 신규 문구 — CPO 확인 필요. 화면 이름은 분석 화면 제목 그대로(ANALYZE_TEXT.title — 원문: AnalyzeFlowView.swift:69)
  cautionLink: `${ANALYZE_TEXT.title}에서 확인하기`,
  checkLabel: "오늘 했어요", // 웹 신규 문구 — CPO 확인 필요
  weekCount: (n: number) => `이번 주 ${n}일`, // 웹 신규 문구 — CPO 확인 필요
  // 웹 신규 문구 — CPO 확인 필요. 체크한 날은 서버로 보내지 않는다(routineChecks.ts)
  deviceNote: "체크한 날은 이 브라우저에만 저장되고 서버로 보내지 않아요.",
} as const;

export interface TodayRoutineItem {
  /** 단계 key(content.json stage_buckets) */
  key: string;
  /** 단계 제목 그대로 */
  title: string;
  /** 단계 요약 그대로 */
  summary: string;
}

export type TodayRoutineModel =
  /** 분만 방식·출산일이 없어 주차를 모른다(또는 열린 단계가 없다) — 카드를 그리지 않는다 */
  | { kind: "none" }
  /** 레드플래그로 운동 추천을 멈췄다 — 카드 대신 운동 탭의 멈춤 블록이 보인다 */
  | { kind: "stopped" }
  | {
      kind: "routine";
      heading: string;
      intro: string;
      items: TodayRoutineItem[];
      /** 목록 아래 — 운동 중 멈출 때 */
      stopNote: string;
      /** 주의 오버레이가 있을 때만 — 분석 화면 링크 */
      caution: { text: string; linkLabel: string; href: string } | null;
    };

/** 지금 열린 단계 — 주차가 됐고 산모수첩 소견으로 막히지 않은 단계, 단계순 */
export function openStages(delivery: DeliveryMethod, week: number, maternity: MaternityRecord): StageBucket[] {
  const blocked = blockedBuckets(maternity);
  return STAGE_BUCKETS.filter((b) => week >= startWeek(b, delivery) && blocked[b.key] === undefined).sort((a, b) => a.order - b.order);
}

/** 로컬 달력 날짜의 일련번호(1970-01-01 = 0) — 같은 날이면 몇 시든 같은 값 */
export function localDayNumber(d: Date): number {
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

/** 고를 단계 — 열린 단계(단계순)에서 지금 단계가 아닌 회복 우선기를 뺀다(머리 주석) */
export function routinePool(open: readonly StageBucket[]): StageBucket[] {
  return open.filter((b, i) => b.key !== RESTRICTION_STAGE_KEY || i === open.length - 1);
}

/**
 * 고를 단계(단계순, 마지막이 지금 단계)에서 오늘 볼 단계를 고른다(머리 주석). 지금 단계는 늘 넣고, 앞 단계에서
 * TODAY_ROUTINE_MAX − 1개를 dayNumber로 돌려 고른다. 결과는 단계순.
 */
export function pickTodayStages(pool: readonly StageBucket[], dayNumber: number): StageBucket[] {
  if (pool.length <= TODAY_ROUTINE_MAX) return [...pool];
  const current = pool[pool.length - 1];
  const earlier = pool.slice(0, -1);
  const n = earlier.length;
  const start = ((dayNumber % n) + n) % n;
  const picked = Array.from({ length: TODAY_ROUTINE_MAX - 1 }, (_, i) => earlier[(start + i) % n]);
  return [...picked, current].sort((a, b) => a.order - b.order);
}

/** 운동 탭 본문 분기·프로필 → 오늘의 체조 카드 */
export function todayRoutine(
  gate: ExerciseGate,
  delivery: DeliveryMethod | null,
  week: number | null,
  maternity: MaternityRecord,
  today: Date,
): TodayRoutineModel {
  if (gate === "redFlag") return { kind: "stopped" };
  if (gate !== "plan" || delivery === null || week === null || Number.isNaN(today.getTime())) return { kind: "none" };
  const pool = routinePool(openStages(delivery, week, maternity));
  if (pool.length === 0) return { kind: "none" };
  const picked = pickTodayStages(pool, localDayNumber(today));
  // 회복 단계 분석과 같은 판정 — 산모수첩 확인 항목에 걸린 주의 오버레이가 있는가
  const hasCaution = recoveryRecommendation(delivery, week, maternity).caution.length > 0;
  return {
    kind: "routine",
    heading: TODAY_ROUTINE_TEXT.heading,
    intro: pool.length > TODAY_ROUTINE_MAX ? TODAY_ROUTINE_TEXT.introRotating : TODAY_ROUTINE_TEXT.introPicked,
    items: picked.map((b) => ({ key: b.key, title: b.title, summary: b.summary })),
    stopNote: TODAY_ROUTINE_TEXT.stopNote,
    caution: hasCaution ? { text: TODAY_ROUTINE_TEXT.cautionNote, linkLabel: TODAY_ROUTINE_TEXT.cautionLink, href: ROUTES.analyze } : null,
  };
}

// MARK: - [오늘 했어요]

export interface RoutineCheckModel {
  label: string;
  /** 오늘 체크했는가(aria-pressed) */
  done: boolean;
  /** "이번 주 n일" — 이번 주(월요일부터)에 체크한 날이 없으면 null(그리지 않는다) */
  weekText: string | null;
  deviceNote: string;
}

export function routineCheckModel(dates: readonly LocalDateString[], today: Date): RoutineCheckModel {
  const count = thisWeekCount(dates, today);
  return {
    label: TODAY_ROUTINE_TEXT.checkLabel,
    done: dates.includes(toLocalDateString(today)),
    weekText: count > 0 ? TODAY_ROUTINE_TEXT.weekCount(count) : null,
    deviceNote: TODAY_ROUTINE_TEXT.deviceNote,
  };
}
