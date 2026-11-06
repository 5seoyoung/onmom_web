// 홈 화면이 "무엇을, 어떤 조건에서" 보여줄지 — iOS `HomeView.swift` · `AppStore.swift`(홈 파생값)를 옮긴 순수 함수.
// 판정은 전부 rules/*가 한다. 여기서는 그 결과를 카드 단위로 묶기만 한다. 시각은 `now`로 받는다.
// 조건이 거짓인 카드는 null — 화면은 null이면 카드를 그리지 않는다(빈 카드 금지, 원칙 3).

import content from "@/content";
import { calendarDaysBetween, parseLocalDate, postpartumDayCount, weekFromDayCount } from "@/domain/date";
import type { PersistedState, SymptomRecord, UserProfile } from "@/domain/types";
import { DELIVERY_TITLE, GOAL_TITLE, homeStageCard, type HomeStageCard } from "@/rules/exercise";
import { moodCardSignal } from "@/rules/mood";
import {
  RECOVERY_RECORD_TITLE,
  isRedFlagActive,
  latestRecord,
  recordHasCrisisSignal,
  recoveryStateLabel,
  recoveryStateTitle,
  relativeRecordTime,
  type RecoveryStateLabel,
} from "@/rules/record";
import { METRIC_STATUS_LABEL, metrics, type RecoveryMetric } from "@/rules/redflag";
import { weightPlan, type WeightPlan } from "@/rules/weight";
import { ROUTES } from "@/routes";

// MARK: - 화면 문구 (Swift 원문)

export const HOME_TEXT = {
  brand: "온맘", // 원문: HomeView.swift:63
  // iOS 원문은 "말로 물어보기"(HomeView.swift:70, 누르면 바로 녹음). 웹은 음성 입력이 없어 이름을 동작에 맞췄다 — CPO 결정 2026-09-27.
  askButton: "AI 상담",
  heroTitle: "산후 회복", // 원문: HomeView.swift:86
  dayUnit: "일차", // 원문: HomeView.swift:93
  // 웹 신규 문구 — CPO 확인 필요 (히어로 칩 목록의 스크린리더 이름. 칩 = 분만 방식 + 목표 또는 복직 D-n — heroChips)
  heroChipsLabel: "분만 방식·목표",
  emptyStateTitle: RECOVERY_RECORD_TITLE, // 기록 카드 제목과 같다(rules/record)
  emptyStateHeadline: "아직 기록이 없어요", // 원문: HomeView.swift:194
  // 웹 신규 문구 — CPO 확인 필요 (iOS 원문 "…상태를 알려드려요"를 바꿈 — 앱이 상태를 평가해 준다는 말로 읽힌다. 법률 사전 검토 H5)
  emptyStateBody: "오로·통증·발열을 기록하면 해당하는 안내를 보여 드려요.",
  moodTitle: "요즘 힘든 날이 이어지고 있어요", // 원문: HomeView.swift:275
  moodBody: "산후에는 열 명 중 한두 명이 겪는 일이고, 이야기를 나누면 나아져요. 혼자 견디지 마세요.", // 원문: HomeView.swift:279
  moodSupport: "지원사업 보기", // 원문: HomeView.swift:286
  moodLater: "나중에 볼게요", // 원문: HomeView.swift:293
  moodDisclaimer: content.disclaimers.mood_card, // = HomeView.swift:298
  analyzeTitle: "회복 단계 분석", // 원문: HomeView.swift:335
  analyzeSubtitle: "내 정보를 확인하고 가능/금지 안내받기", // 원문: HomeView.swift:338
  metricsTitle: "회복 지표", // 원문: HomeView.swift:359
  quickRecord: "이상 증상 빠른 기록", // 원문: HomeView.swift:468
  footer: content.disclaimers.home_footer, // = HomeView.swift:27
} as const;

/**
 * 상단 "AI 상담" 버튼이 여는 주소. iOS는 홈에서 시트로 열고 닫으면 홈으로 돌아온다(HomeView.swift:50-56).
 * 챗 화면은 `?from=home`이 있을 때만 뒤로를 홈으로 보낸다(features/chat chatBackHref) — 없으면 프로필로 간다.
 */
export const HOME_CHAT_HREF = `${ROUTES.chat}?from=home`;

/**
 * 마음 연계 카드의 전화 — 1577-0199·02-2276-2276은 원문(HomeView.swift:282-283). 02-2276-2276은 예약 상담 기관이라 위기 연락처가 아니므로
 * 자살예방상담전화 109와 위급할 때 119를 더했다(임상 사전 검토 M-CARD·B3, K3·K7 — 2026-11-04 대표 결정으로 "목록 변경 금지"를 이 갱신에 한해 풀었다).
 */
export const MOOD_CALLS: readonly { name: string; number: string }[] = [
  { name: "정신건강복지센터", number: "1577-0199" },
  // 웹 신규 문구 — CPO 확인 필요
  { name: "자살예방상담전화 (24시간)", number: "109" },
  { name: "중앙난임·우울증상담센터", number: "02-2276-2276" },
  // 웹 신규 문구 — CPO 확인 필요
  { name: "위급할 때", number: "119" },
];

/** 분만 방식을 고르지 않았을 때의 히어로 칩 — 원문: HomeView.swift:99 `?? "분만"` */
export const DELIVERY_CHIP_FALLBACK = "분만";

// MARK: - 오늘의 회복 기록

export type StateTone = "normal" | "watch" | "alert";

/** 3단계 인디케이터 순서(HomeView.swift:147-148) — 라벨은 지표 배지와 같은 글자(rules/redflag METRIC_STATUS_LABEL) */
export const RECOVERY_STEPS: readonly { label: RecoveryStateLabel; tone: StateTone }[] = [
  { label: METRIC_STATUS_LABEL.normal, tone: "normal" },
  { label: METRIC_STATUS_LABEL.watch, tone: "watch" },
  { label: METRIC_STATUS_LABEL.alert, tone: "alert" },
];

/**
 * 라벨별 설명 — 회복이 좋다·나쁘다를 평가하지 않고, 기록한 값이 목록과 맞았는지만 말한다(iOS 원문 "회복이 순조롭게 진행되고 있어요" 등을 바꿈 —
 * 법률 사전 검토 H5, 임상 사전 검토 H-DESC). 해당 없음에도 "걱정되면 의료진" 안내를 늘 붙인다.
 */
export const RECOVERY_DESCRIPTOR: Readonly<Record<RecoveryStateLabel, string>> = {
  // 웹 신규 문구 — CPO 확인 필요
  [METRIC_STATUS_LABEL.normal]: "기록한 항목 중에는 살펴볼 신호나 병원 확인 신호에 해당하는 것이 없었어요. 증상이 계속되거나 걱정되면 의료진과 상담하세요.",
  // 웹 신규 문구 — CPO 확인 필요
  [METRIC_STATUS_LABEL.watch]: "기록한 항목 중에 살펴볼 신호가 있어요. 회복 지표에서 어떤 항목인지 볼 수 있어요. 계속되거나 심해지면 의료진과 상담하세요.",
  // 웹 신규 문구 — CPO 확인 필요
  [METRIC_STATUS_LABEL.alert]: "기록에 '바로 병원에 가야 하는 신호'에 해당하는 항목이 있어요. 아직 병원에 가지 않았다면 바로 문의하세요.",
};

/**
 * 가장 최근 기록에 위기 상담 신호가 있을 때의 설명 — 결과 화면의 상담 전화 카드는 그때만 보이므로, 홈에서도 연락처를 놓치지 않게 한다.
 * 어떤 생각이었는지는 적지 않는다(곁에서 화면을 볼 수 있다). 임상 사전 검토 §3-2 T11.
 */
// 웹 신규 문구 — CPO 확인 필요
export const RECOVERY_CRISIS_DESCRIPTOR =
  "혼자 견디지 마세요. 자살예방상담전화 109(24시간)나 정신건강위기상담전화 1577-0199에 연락하세요. 지금 위험하다면 119나 112에 연락하세요.";

const TONE_OF: Readonly<Record<RecoveryStateLabel, StateTone>> = {
  [METRIC_STATUS_LABEL.normal]: "normal",
  [METRIC_STATUS_LABEL.watch]: "watch",
  [METRIC_STATUS_LABEL.alert]: "alert",
};

export type RecoveryStateCard =
  /** 기록 없음 — 기록 유도 카드(탭하면 기록 화면) */
  | { kind: "empty" }
  | {
      kind: "filled";
      /** "오늘의 회복 기록" 또는 "최근 회복 기록 · M월 d일" */
      title: string;
      label: RecoveryStateLabel;
      tone: StateTone;
      descriptor: string;
    };

// MARK: - 홈 전체

export interface HomeViewModel {
  /** 산후 일차. 출산일이 없거나 형식이 틀리면 null — 지어낸 "0일차"를 보이지 않는다. */
  dayCount: number | null;
  /** 히어로 칩 — [분만 방식, (복직 D-n | 목표)] */
  heroChips: string[];
  recoveryState: RecoveryStateCard;
  /** 마음 연계 카드 — 기분 신호가 있고 접어두지 않았을 때만. 레드플래그 중에도 숨기지 않는다. */
  showMoodCard: boolean;
  /** 회복 지표 카드 — 최근 기록이 없으면 null(카드 숨김) */
  metrics: { items: RecoveryMetric[]; relativeTime: string | null; recordDate: string } | null;
  /** 지금 회복 단계 카드 — 레드플래그면 "운동 안내를 멈췄어요", 그릴 단계가 없으면 null */
  stageCard: HomeStageCard | null;
  /** 체중 목표 카드 — 키·현재 체중이 있고 레드플래그가 아닐 때만 */
  weightPlan: WeightPlan | null;
}

export function buildHomeViewModel(state: PersistedState, now: Date): HomeViewModel {
  const { profile, maternity, symptomHistory } = state;
  const dayCount = homeDayCount(profile, now);
  const activeRedFlag = isRedFlagActive(symptomHistory);
  const latest = latestRecord(symptomHistory);
  const items = metrics(latest);

  return {
    dayCount,
    heroChips: heroChips(profile, now),
    recoveryState: recoveryStateCard(state, now),
    showMoodCard: moodCardSignal(state.moodChecks, state.moodCardSnoozedUntil, now) !== null,
    metrics:
      latest && items.length > 0
        ? {
            items,
            relativeTime: relativeRecordTime(latest.date, recordReferenceTime(latest, now)) || null,
            recordDate: latest.date,
          }
        : null,
    // 레드플래그 카드는 주차와 무관하다. 출산일이 없으면 주차를 모르므로 단계 카드는 그리지 않는다.
    stageCard:
      activeRedFlag || dayCount !== null
        ? homeStageCard(profile.deliveryMethod, weekFromDayCount(dayCount ?? 0), maternity, activeRedFlag)
        : null,
    // 체중 목표 문구가 걷기 등 유산소를 권하므로 레드플래그 중에는 함께 숨긴다(HomeView.swift:443)
    weightPlan: activeRedFlag ? null : weightPlan(profile),
  };
}

/** 산후 일차 — 로컬 달력 기준(domain/date). 출산일이 없거나 형식이 틀리면 null. */
export function homeDayCount(profile: Pick<UserProfile, "deliveryDate">, now: Date): number | null {
  if (parseLocalDate(profile.deliveryDate) === null) return null;
  return postpartumDayCount(profile.deliveryDate, now);
}

/**
 * 복직 예정이고 복직일이 있으면 남은 기간 — "복직 D-day" / "복직 D-n". 지난 날짜면 null(HomeView.swift:125-133).
 */
export function returnToWorkChip(profile: Pick<UserProfile, "goal" | "returnToWorkDate">, now: Date): string | null {
  if (profile.goal !== "returningToWork") return null;
  const date = parseLocalDate(profile.returnToWorkDate);
  if (!date) return null;
  const days = calendarDaysBetween(now, date);
  if (days < 0) return null;
  return days === 0 ? "복직 D-day" : `복직 D-${days}`; // 원문: HomeView.swift:132
}

/** 히어로 칩 — 분만 방식(없으면 "분만"), 그다음 복직 D-n이 있으면 그것, 없으면 목표 이름(HomeView.swift:98-105). */
export function heroChips(profile: Pick<UserProfile, "deliveryMethod" | "goal" | "returnToWorkDate">, now: Date): string[] {
  const chips = [profile.deliveryMethod ? DELIVERY_TITLE[profile.deliveryMethod] : DELIVERY_CHIP_FALLBACK];
  const rtw = returnToWorkChip(profile, now);
  if (rtw !== null) chips.push(rtw);
  else if (profile.goal) chips.push(GOAL_TITLE[profile.goal]);
  return chips;
}

/**
 * 기록 시각을 잴 기준 시각 — 지금과 최근 기록 시각 중 늦은 쪽.
 * 화면의 시계(useNow)는 1분마다 갱신되는데, 다른 창에서 저장한 기록은 곧바로 들어온다. 그 사이에는 기록이
 * 화면 시계보다 늦어 "40초 후"처럼 미래로 보일 수 있다. iOS는 그릴 때마다 Date()를 읽어 이런 일이 없다
 * (HomeView.swift:364) — 기록보다 이른 시계는 낡은 시계이므로 기록 시각까지 당겨 쓴다.
 */
export function recordReferenceTime(latest: Pick<SymptomRecord, "date"> | null | undefined, now: Date): Date {
  const t = latest ? new Date(latest.date).getTime() : Number.NaN;
  return Number.isNaN(t) || t <= now.getTime() ? now : new Date(t);
}

/** 기록이 있으면 상태 카드, 없으면 기록 유도 카드(HomeView.swift:166-210). */
export function recoveryStateCard(state: Pick<PersistedState, "symptomHistory">, now: Date): RecoveryStateCard {
  const latest = latestRecord(state.symptomHistory);
  const label = recoveryStateLabel(latest);
  if (label === null) return { kind: "empty" };
  return {
    kind: "filled",
    title: recoveryStateTitle(latest, recordReferenceTime(latest, now)),
    label,
    tone: TONE_OF[label],
    descriptor: recordHasCrisisSignal(latest) ? RECOVERY_CRISIS_DESCRIPTOR : RECOVERY_DESCRIPTOR[label],
  };
}
