// 운동 탭 화면 모델 — iOS ExerciseView.swift의 "어떤 조건에서 무엇을 보여주나"를 순수 함수로 옮긴 것.
// 규칙(주차 게이팅·임상 차단·배지·잠금 문구)은 rules/exercise가 정하고, 여기서는 화면 분기와 조합만 한다.
// 현재 시각·네트워크는 화면이 넘긴다.

import { safeExternalUrl } from "@/api/safeUrl";
import type { FetchVideosResult } from "@/api/video";
import { parseLocalDate, postpartumDayCount, weekFromDayCount } from "@/domain/date";
import type { DeliveryMethod, LocalDateString, MaternityRecord } from "@/domain/types";
import {
  EXERCISE_TEXT,
  blockedNow,
  exerciseHeaderSubtitle,
  exercisePlan,
  exerciseTabGate,
  lockedBody,
  planSections,
  unavailableStage,
  videoBadge,
  type PlanVideo,
  type StateTone,
  type Video,
} from "@/rules/exercise";

// MARK: - 본문 분기

/**
 * 운동 탭 본문 분기. Swift 순서(분만 방식 없음 → 레드플래그 → 플랜, ExerciseView.swift:33-39)에
 * 웹에만 있는 경우 하나를 더한다: 분만 방식은 있는데 출산일이 없거나 읽을 수 없으면 주차를 모른다.
 * iOS는 출산일이 늘 있었다. 0주차로 두고 게이팅하면 지어낸 값이라(원칙 3) 플랜을 보여주지 않는다.
 * 레드플래그 안내는 주차와 무관하므로 출산일 확인보다 먼저 보여준다.
 */
export type ExerciseGate = "needsDelivery" | "redFlag" | "needsDeliveryDate" | "plan";

export function exerciseGate(
  delivery: DeliveryMethod | null,
  deliveryDate: LocalDateString | null,
  activeRedFlag: boolean,
): ExerciseGate {
  const gate = exerciseTabGate(delivery, activeRedFlag);
  if (gate !== "plan") return gate;
  return parseLocalDate(deliveryDate) === null ? "needsDeliveryDate" : "plan";
}

/** 산후 주차 — 출산일이 없거나 형식이 틀리면 null(0주차로 추정하지 않는다) */
export function exerciseWeek(deliveryDate: LocalDateString | null, now: Date): number | null {
  if (parseLocalDate(deliveryDate) === null) return null;
  return weekFromDayCount(postpartumDayCount(deliveryDate, now));
}

/** 헤더 부제 "산후 n주차 · {분만} 기준" — 주차를 모르면 부제를 그리지 않는다(null). */
export function exerciseSubtitle(delivery: DeliveryMethod | null, week: number | null): string | null {
  return week === null ? null : exerciseHeaderSubtitle(week, delivery);
}

// 웹 신규 문구 — CPO 확인 필요. 분만 방식은 있는데 출산일이 없는 경우(iOS에는 없는 상태).
// "분만 방식이 필요해요" 블록(ExerciseView.swift:122-124)과 같은 모양·말투로 맞췄다. 출산일은 설정 > 프로필 편집에 있다(D11).
export const NEEDS_DELIVERY_DATE_TEXT = {
  title: "출산일이 필요해요", // 웹 신규 문구 — CPO 확인 필요
  body: "운동은 출산 후 지난 주차에 따라 열려요. 프로필 > 설정 > 프로필 편집에서 출산일을 골라주세요.", // 웹 신규 문구 — CPO 확인 필요
} as const;

// MARK: - 영상 조회 결과

/** 영상 조회 결과 — 서버 미설정(재시도해도 소용없음)과 실패(재시도 가능)를 구분한다(ExerciseView.swift:10-15). */
export type VideoLoad =
  | { kind: "loaded"; videos: readonly Video[] }
  | { kind: "unavailable"; message: string }
  | { kind: "failed"; message: string };

export function videoLoadFromResult(res: FetchVideosResult): VideoLoad {
  if (res.ok) return { kind: "loaded", videos: res.videos };
  if (res.kind === "notConfigured") return { kind: "unavailable", message: res.message };
  return { kind: "failed", message: res.message || EXERCISE_TEXT.failedFallback };
}

/** fetchVideos가 예외로 끝났을 때(예상 밖) — Swift의 기본 문구 "영상을 불러오지 못했어요."(ExerciseView.swift:89) */
export const VIDEO_LOAD_THROWN: VideoLoad = { kind: "failed", message: EXERCISE_TEXT.failedFallback };

// MARK: - 영상 카드

export type VideoCardAction =
  /** [영상 보기] — href가 null이면 링크로 만들 수 없는 주소(허용되지 않은 호스트·http 등)라 버튼을 그리지 않는다 */
  | { kind: "watch"; href: string | null }
  /** 잠김 — 임상 차단 사유(alert 색) 또는 단계 요약(보조 글씨색) */
  | { kind: "locked"; text: string; tone: "alert" | "secondary" };

export interface VideoCardModel {
  id: string;
  title: string;
  badge: { text: string; tone: StateTone };
  bucketTitle: string;
  /** 설명이 비면 null — 줄을 그리지 않는다(ExerciseView.swift:223) */
  description: string | null;
  action: VideoCardAction;
  /** 잠긴 카드는 흐리게(opacity 0.7, ExerciseView.swift:255) */
  dimmed: boolean;
}

export function videoCardModel(item: PlanVideo): VideoCardModel {
  return {
    id: item.video.video_id,
    title: item.video.title,
    badge: videoBadge(item),
    bucketTitle: item.bucket.title,
    description: item.video.description.length > 0 ? item.video.description : null,
    action: item.unlocked ? { kind: "watch", href: safeExternalUrl(item.video.url) } : { kind: "locked", ...lockedBody(item) },
    dimmed: !item.unlocked,
  };
}

// MARK: - 본문 (게이트가 "plan"일 때)

/** "{단계} 제외 — {사유}" — 홈 "지금 회복 단계" 카드와 같은 줄(원문: HomeView.swift:428). 운동 탭 "영상 준비 중"에도 붙인다(D7). */
export function excludedStageLines(delivery: DeliveryMethod, week: number, maternity: MaternityRecord): string[] {
  return blockedNow(delivery, week, maternity).map(({ bucket, reason }) => `${bucket.title} 제외 — ${reason}`); // 원문: HomeView.swift:428
}

/**
 * 영상 조회 중 스피너의 스크린리더 이름(화면에는 보이지 않는다). iOS ProgressView(ExerciseView.swift:53)는
 * VoiceOver가 시스템 문구로 읽지만 웹 스피너에는 이름이 없어 붙인다.
 */
export const VIDEO_LOADING_SR_LABEL = "운동 영상을 불러오고 있어요"; // 웹 신규 문구 — CPO 확인 필요

export type ExerciseBody =
  | { kind: "loading"; srLabel: string }
  | {
      kind: "unavailable";
      title: string;
      message: string;
      /** "지금은 n주차 · {단계} 단계예요" + 단계 요약 — 차단된 단계는 빼고 계산한다(감사 #4) */
      stage: { line: string; summary: string } | null;
      excluded: string[];
    }
  | { kind: "failed"; title: string; message: string; retry: string }
  | { kind: "empty"; message: string }
  | { kind: "plan"; sections: { title: string; count: number; cards: VideoCardModel[] }[] };

/** 조회 상태 + 저장된 프로필 → 본문. load가 null이면 조회 중. */
export function exerciseBody(
  load: VideoLoad | null,
  delivery: DeliveryMethod,
  week: number,
  maternity: MaternityRecord,
): ExerciseBody {
  if (load === null) return { kind: "loading", srLabel: VIDEO_LOADING_SR_LABEL };
  switch (load.kind) {
    case "unavailable":
      return {
        kind: "unavailable",
        title: EXERCISE_TEXT.unavailableTitle,
        message: load.message,
        stage: unavailableStage(delivery, week, maternity),
        excluded: excludedStageLines(delivery, week, maternity),
      };
    case "failed":
      return { kind: "failed", title: EXERCISE_TEXT.failedTitle, message: load.message, retry: EXERCISE_TEXT.retry };
    case "loaded": {
      // 플랜은 저장된 산모수첩·주차로 매번 다시 계산한다 — 다른 화면에서 값이 바뀌어도 바로 맞춰진다.
      const plan = exercisePlan(load.videos, delivery, week, maternity);
      if (plan.length === 0) return { kind: "empty", message: EXERCISE_TEXT.emptyPlan };
      return {
        kind: "plan",
        sections: planSections(plan).map((s) => ({ title: s.title, count: s.items.length, cards: s.items.map(videoCardModel) })),
      };
    }
  }
}
