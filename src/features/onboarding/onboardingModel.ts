// 온보딩 4단계의 화면 규칙 — iOS OnboardingFlowView.swift를 옮긴 순수 함수(무엇을 언제 보이고 켜는지).
//
// iOS와 다른 점(의도적):
// - 입력값은 [온맘 시작하기]를 누를 때 한 번에 저장한다. iOS는 단계마다 store.profile에 바로 썼지만,
//   동의 전 건강 정보를 저장소에 남기지 않는다(감사 #15). 그때까지는 화면(OnboardingDraft)에만 있다.
// - 출산일은 비어 있는 날짜 입력으로 시작한다. iOS는 기본값 '오늘'을 두고 "실제로 조작했는가"를 따로 셌다
//   (OnboardingFlowView.swift:6-10). 웹은 빈 값이 곧 "안 고름"이다. 오늘보다 뒤(직접 입력)도 고르지 않은 것으로 본다.

import type { DeliveryMethod, LocalDateString, RecoveryGoal, UserProfile } from "@/domain/types";
import { parseLocalDate } from "@/domain/date";
import { DELIVERY_TITLE } from "@/rules/exercise";

export const ONBOARDING_TOTAL_STEPS = 4; // 원문: OnboardingFlowView.swift:12
export const ONBOARDING_LAST_STEP = ONBOARDING_TOTAL_STEPS - 1;

/** 0 시작 · 1 출산 정보 · 2 목표 · 3 동의(OnboardingFlowView.swift:3) */
export type OnboardingStep = 0 | 1 | 2 | 3;

/** 동의 전까지 화면에만 들고 있는 입력값. 날짜는 <input type="date"> 값 그대로("" = 고르지 않음). */
export interface OnboardingDraft {
  deliveryDate: string;
  deliveryMethod: DeliveryMethod | null;
  isBreastfeeding: boolean;
  goal: RecoveryGoal | null;
  returnToWorkDate: string;
  /** 0 = 미입력(MeasurementField) */
  heightCm: number;
  currentWeightKg: number;
  prePregnancyWeightKg: number;
  consentAccepted: boolean;
}

// MARK: - 문구 (Swift 원문)

export const ONBOARDING_TEXT = {
  // 시작(OnboardingFlowView.swift:111-118)
  welcomeTitle: "온맘",
  welcomeSubtitle: "엄마의 산후 회복 케어앱",
  welcomeBody: "산모의 건강한 회복을\n온맘이 함께합니다.",
  // 출산 정보(OnboardingFlowView.swift:138-139, 146, 149, 185-187)
  deliveryTitle: "출산 정보를 알려주세요",
  deliverySubtitle: "출산일과 분만 방식에 따라 회복 관리 루트가 달라져요.",
  deliveryDateLabel: "출산일",
  deliveryDatePicked: "회복 주차 계산에 사용돼요",
  deliveryDateNotPicked: "날짜를 눌러 선택해주세요",
  breastfeedingLabel: "모유수유 중이에요",
  breastfeedingDescription: "약·음식 안전 분류가 수유 기준으로 바뀌어요",
  // 목표(OnboardingFlowView.swift:208-209, 231, 235-236, 273)
  goalTitle: "목표를 설정해주세요",
  goalSubtitle: "AI 상담과 홈 화면이 내 상황을 참고해요.",
  returnDateLabel: "복직 예정일 (선택)",
  returnDateEmpty: "고르면 홈에 남은 기간이 표시돼요",
  returnDateSet: "홈 화면에 남은 기간을 표시해요",
  weightTitle: "체중 관리 (선택)",
  heightLabel: "키(cm)", // 원문: OnboardingFlowView.swift:275
  currentWeightLabel: "현재 체중(kg)", // 원문: OnboardingFlowView.swift:277
  preWeightLabel: "임신 전 체중(kg)", // 원문: OnboardingFlowView.swift:279
  // 동의(OnboardingFlowView.swift:303-304, 309-313, 317, 328)
  consentTitle: "데이터 이용에 동의해주세요",
  consentSubtitle: "건강 정보는 민감정보라 기기 밖으로 내보내지 않는 걸 원칙으로 해요.",
  consentLines: [
    "건강 정보는 내 기기에만 저장 (서버 계정 없음)",
    "운동 영상을 받을 때 분만 방식만 서버로 전송 (AI 상담은 이번 버전에서 연결 전)",
    "위험 신호가 확인되면 의료진 상담 안내",
  ],
  consentToggle: "개인정보·민감정보 처리 방침에 동의합니다",
  consentPolicyLink: "개인정보처리방침 전문 보기",
  // 위쪽 막대(OnboardingFlowView.swift:29)
  backLabel: "이전 단계",
  // 웹 신규 문구 — CPO 확인 필요 (단계 표시의 스크린리더 이름. iOS StepIndicator에는 접근성 이름이 없다)
  stepIndicatorLabel: "시작하기 진행 단계",
} as const;

/**
 * 분만 방식 선택지 — 순서·제목은 Models.swift:6-29(DeliveryMethod.allCases).
 * 온보딩 행은 아이콘·제목만 보여준다(OnboardingFlowView.swift:169-175 SelectableRow에 subtitle 없음).
 * DeliveryMethod.subtitle(Models.swift:23-28)은 이 화면에 쓰지 않는다.
 */
export const DELIVERY_OPTIONS: ReadonlyArray<{ value: DeliveryMethod; title: string }> = [
  { value: "vaginal", title: DELIVERY_TITLE.vaginal },
  { value: "cesarean", title: DELIVERY_TITLE.cesarean },
];

/** 목표 선택지 — Models.swift:32-48(RecoveryGoal.allCases). */
export const GOAL_OPTIONS: ReadonlyArray<{ value: RecoveryGoal; title: string; subtitle: string }> = [
  { value: "homemaker", title: "전업", subtitle: "복직 일정 없이 회복에 집중해요" }, // 원문: Models.swift:39, 45
  { value: "returningToWork", title: "복직 예정", subtitle: "복직 예정일까지 남은 기간을 홈에서 확인해요" }, // 원문: Models.swift:40, 46
];

// MARK: - 규칙

/** 저장된 프로필로 시작값을 만든다(iOS는 store.profile에 바로 묶여 있었다). 온보딩 전 프로필은 대개 기본값이다. */
export function initialDraft(profile: UserProfile): OnboardingDraft {
  return {
    deliveryDate: profile.deliveryDate ?? "",
    deliveryMethod: profile.deliveryMethod,
    isBreastfeeding: profile.isBreastfeeding,
    goal: profile.goal,
    returnToWorkDate: profile.returnToWorkDate ?? "",
    heightCm: profile.heightCm,
    currentWeightKg: profile.currentWeightKg,
    prePregnancyWeightKg: profile.prePregnancyWeightKg,
    consentAccepted: profile.consentAccepted,
  };
}

/**
 * 출산일을 골랐는가 — 형식이 맞고 오늘(로컬 달력) 이하. iOS DatePicker `in: ...Date()`(OnboardingFlowView.swift:158).
 * today는 브라우저에서 읽은 "YYYY-MM-DD" — 아직 모르면(빈 값) 고르지 않은 것으로 본다.
 */
export function isDeliveryDatePicked(value: string, today: LocalDateString): boolean {
  const d = parseLocalDate(value);
  const t = parseLocalDate(today);
  return d !== null && t !== null && d.getTime() <= t.getTime();
}

/** 출산일 아래 안내 — 고르기 전에는 강조색(OnboardingFlowView.swift:149-152). */
export function deliveryDateHint(picked: boolean): { text: string; emphasized: boolean } {
  return picked
    ? { text: ONBOARDING_TEXT.deliveryDatePicked, emphasized: false }
    : { text: ONBOARDING_TEXT.deliveryDateNotPicked, emphasized: true };
}

/** 복직 예정일을 골랐는가 — 형식만 본다(iOS DatePicker에 범위 제한 없음, OnboardingFlowView.swift:241-251). */
export function isReturnDatePicked(value: string): boolean {
  return parseLocalDate(value) !== null;
}

export function returnDateHint(value: string): string {
  return isReturnDatePicked(value) ? ONBOARDING_TEXT.returnDateSet : ONBOARDING_TEXT.returnDateEmpty;
}

/** 복직 예정일 카드는 '복직 예정'을 골랐을 때만(OnboardingFlowView.swift:226). */
export function showsReturnDateCard(draft: Pick<OnboardingDraft, "goal">): boolean {
  return draft.goal === "returningToWork";
}

/** 하단 버튼 글자(OnboardingFlowView.swift:65-80). */
export function bottomButtonTitle(step: OnboardingStep): string {
  if (step === 0) return "시작하기"; // 원문: OnboardingFlowView.swift:66
  if (step === ONBOARDING_LAST_STEP) return "온맘 시작하기"; // 원문: OnboardingFlowView.swift:77
  return "다음"; // 원문: OnboardingFlowView.swift:68, 73
}

/** 하단 버튼을 누를 수 있는가(OnboardingFlowView.swift:65-80). */
export function canProceed(step: OnboardingStep, draft: OnboardingDraft, today: LocalDateString): boolean {
  switch (step) {
    case 0:
      return true;
    case 1:
      return draft.deliveryMethod !== null && isDeliveryDatePicked(draft.deliveryDate, today);
    case 2:
      return draft.goal !== null;
    default:
      return draft.consentAccepted;
  }
}

export function nextStep(step: OnboardingStep): OnboardingStep {
  return Math.min(ONBOARDING_LAST_STEP, step + 1) as OnboardingStep;
}

/** [이전 단계] — 첫 단계에는 버튼이 없다(OnboardingFlowView.swift:21). */
export function previousStep(step: OnboardingStep): OnboardingStep | null {
  return step > 0 ? ((step - 1) as OnboardingStep) : null;
}

/**
 * [온맘 시작하기] 때 한 번에 저장할 프로필 값. 동의를 켜지 않았거나 출산일·분만 방식·목표가 없으면 null(저장 안 함).
 * 복직 예정일은 iOS처럼 목표와 무관하게 고른 값을 그대로 둔다(홈은 '복직 예정'일 때만 쓴다, HomeView.swift:126).
 */
export function completionPatch(draft: OnboardingDraft, today: LocalDateString): Partial<UserProfile> | null {
  if (!draft.consentAccepted) return null;
  if (!isDeliveryDatePicked(draft.deliveryDate, today) || draft.deliveryMethod === null || draft.goal === null) return null;
  const returnToWorkDate: LocalDateString | null = isReturnDatePicked(draft.returnToWorkDate) ? draft.returnToWorkDate : null;
  return {
    deliveryDate: draft.deliveryDate,
    deliveryMethod: draft.deliveryMethod,
    isBreastfeeding: draft.isBreastfeeding,
    goal: draft.goal,
    returnToWorkDate,
    heightCm: draft.heightCm,
    currentWeightKg: draft.currentWeightKg,
    prePregnancyWeightKg: draft.prePregnancyWeightKg,
    consentAccepted: true,
  };
}
