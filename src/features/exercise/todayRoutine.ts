// 운동 탭 맨 위 "오늘의 체조" 카드 모델 — 지금 열린 단계 중 오늘 볼 것을 최대 3개 고른다. 순수 함수(오늘 날짜는 화면이 넘긴다).
//
// 무엇이 열렸는지는 운동 탭과 같은 규칙이다(새 기준을 만들지 않는다).
// - 본문 분기(exerciseGate): 분만 방식·출산일이 없으면 카드 없음(그 안내 블록이 대신), 최근 기록에 레드플래그가 있으면 멈춤 —
//   멈춤은 운동 탭의 멈춤 블록(ExerciseBlocks RedFlagBlock "운동 영상 추천을 멈췄어요 … 모든 운동 추천을 잠시 멈춰요")이 같은 자리에 보인다.
// - 단계: 주차가 됐고(startWeek — 분만 방식별) 산모수첩 소견으로 막히지 않은(blockedBuckets) 단계. 영상 카드의 "가능"(exercisePlan unlocked)·
//   유튜브 추천(youtubePlan)과 같은 조건이다. 주의 오버레이(content.json caution_overlays)는 운동 탭이 쓰지 않아(회복 단계 분석 화면만) 여기서도 쓰지 않는다.
//
// 항목은 content.json stage_buckets의 단계 제목·요약 그대로다(rules/exercise STAGE_BUCKETS). content.json·운동 탭에 단계별 동작 목록이 없어
// 단계 요약 하나를 항목 하나로 쓴다 — 요약을 쪼개거나 시간·횟수·방법을 붙이지 않는다(의료 내용을 새로 만들지 않는다).
// 영상 목록(영상 서버)은 쓰지 않는다 — 서버가 잠들어 있거나 오프라인이어도 카드가 같은 목록을 보이게.
//
// 고르기(pickTodayStages): 지금 단계(열린 단계 중 가장 늦은 것 = rules/exercise currentStage)는 늘 넣고, 그보다 앞의 열린 단계에서
// 2개를 날짜 순번으로 돌려 고른다. 같은 날(로컬 달력)에는 같은 목록, 다음 날은 한 칸 밀린 묶음 — 앞 단계마다 같은 횟수로 나온다.
// 열린 단계가 3개 이하면 날마다 모두 보인다. 화면 순서는 단계순.

import type { DeliveryMethod, MaternityRecord } from "@/domain/types";
import { STAGE_BUCKETS, blockedBuckets, startWeek, type StageBucket } from "@/rules/exercise";
import type { ExerciseGate } from "./exerciseModel";

/** 오늘의 체조에 넣는 단계 수 상한 */
export const TODAY_ROUTINE_MAX = 3;

export const TODAY_ROUTINE_TEXT = {
  heading: "오늘의 체조", // 웹 신규 문구 — CPO 확인 필요
  // 웹 신규 문구 — CPO 확인 필요. 열린 단계가 TODAY_ROUTINE_MAX보다 많아 날마다 바뀔 때
  introRotating: "지금 열린 단계에서 날마다 바꿔 골라요.",
  // 웹 신규 문구 — CPO 확인 필요. 열린 단계를 모두 보일 때(날마다 같다)
  introAll: "지금 열린 단계를 모두 담았어요.",
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
  | { kind: "routine"; heading: string; intro: string; items: TodayRoutineItem[] };

/** 지금 열린 단계 — 주차가 됐고 산모수첩 소견으로 막히지 않은 단계, 단계순 */
export function openStages(delivery: DeliveryMethod, week: number, maternity: MaternityRecord): StageBucket[] {
  const blocked = blockedBuckets(maternity);
  return STAGE_BUCKETS.filter((b) => week >= startWeek(b, delivery) && blocked[b.key] === undefined).sort((a, b) => a.order - b.order);
}

/** 로컬 달력 날짜의 일련번호(1970-01-01 = 0) — 같은 날이면 몇 시든 같은 값 */
export function localDayNumber(d: Date): number {
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

/**
 * 열린 단계(단계순)에서 오늘 볼 단계를 고른다(머리 주석). 지금 단계는 늘 넣고, 앞 단계에서 TODAY_ROUTINE_MAX − 1개를
 * dayNumber로 돌려 고른다. 결과는 단계순.
 */
export function pickTodayStages(open: readonly StageBucket[], dayNumber: number): StageBucket[] {
  if (open.length <= TODAY_ROUTINE_MAX) return [...open];
  const current = open[open.length - 1];
  const earlier = open.slice(0, -1);
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
  const open = openStages(delivery, week, maternity);
  if (open.length === 0) return { kind: "none" };
  const picked = pickTodayStages(open, localDayNumber(today));
  return {
    kind: "routine",
    heading: TODAY_ROUTINE_TEXT.heading,
    intro: open.length > TODAY_ROUTINE_MAX ? TODAY_ROUTINE_TEXT.introRotating : TODAY_ROUTINE_TEXT.introAll,
    items: picked.map((b) => ({ key: b.key, title: b.title, summary: b.summary })),
  };
}
