// 설정 · 프로필 편집 표시·저장 규칙 — iOS MoreView.swift(SettingsView · ProfileEditView).
// 화면은 여기서 고른 문구·행·저장 값만 쓴다. 저장 자체의 정규화(날짜·숫자·enum)는 store(updateProfile·updateMaternity)가 한다.

import { parseLocalDate, postpartumDayCount } from "@/domain/date";
import type {
  DeliveryMethod,
  LocalDateString,
  MaternityRecord,
  RecoveryGoal,
  UserProfile,
} from "@/domain/types";
import type { AccountProvider } from "@/store/account";
import { PROFILE_TEXT, deliveryMethodLabel, goalLabel, neighborhoodValue } from "@/features/profile/profileView";

export const SETTINGS_TEXT = {
  title: "설정", // 원문: MoreView.swift:92
  // 계정
  account: "계정", // 원문: MoreView.swift:17
  signInRow: "로그인", // 원문: MoreView.swift:18
  signOut: "로그아웃", // 원문: MoreView.swift:21
  deleteAccount: "계정 삭제", // 원문: MoreView.swift:26
  deleteAccountHint: "계정과 이 기기의 모든 건강 데이터가 즉시 삭제되며 복구할 수 없어요", // 원문: MoreView.swift:27
  // 프로필
  profile: "프로필", // 원문: MoreView.swift:39
  edit: "편집", // 원문: MoreView.swift:44
  dayCount: "산후 일수", // 원문: MoreView.swift:49
  // 알림 — 웹은 리마인더 미구현(D4): 토글 없이 준비 중으로만 보인다
  notifications: "알림", // 원문: MoreView.swift:59
  reminderTitle: "매일 회복 체크 리마인더", // 원문: MoreView.swift:62
  reminderBody: "저녁 8시, 이상 증상 빠른 기록 알림", // 원문: MoreView.swift:63
  comingSoon: "준비 중", // 웹 신규 문구 — CPO 확인 필요 (D4: 웹 알림 미구현 표시)
  // 개인정보·안전 — D9와 같은 이유로 iOS 원문 그대로
  privacy: "개인정보·안전", // 원문: MoreView.swift:72
  // 원문: MoreView.swift:73
  privacyBody:
    "본 앱은 진단 기기가 아니며, 모든 권고는 의료진 상담을 권유합니다. 건강 데이터는 내 기기에만 저장됩니다. 챗봇 등 일부 기능 사용 시 질문 내용이 답변 생성을 위해 서버로 전송돼요.",
  privacyPolicy: "개인정보처리방침", // 원문: MoreView.swift:78
  // 확인 창
  cancel: "취소", // 원문: MoreView.swift:97
  signOutConfirmTitle: "로그아웃할까요?", // 원문: MoreView.swift:95
  signOutConfirm: "로그아웃", // 원문: MoreView.swift:96
  deleteConfirmTitle: "계정을 삭제할까요?", // 원문: MoreView.swift:103
  deleteConfirm: "계정과 모든 데이터 삭제", // 원문: MoreView.swift:104
  // 원문: MoreView.swift:109 (웹에는 Apple 로그인이 없어 :108의 Apple 연결 해제 안내는 쓰지 않는다)
  deleteMessage: "계정 정보와 이 기기에 저장된 프로필·증상 기록·글이 모두 삭제됩니다. 이 작업은 되돌릴 수 없어요.",
} as const;

export const SETTINGS_HREF = "/settings/";
export const PROFILE_EDIT_HREF = "/settings/profile/";
export const PRIVACY_HREF = "/privacy/";
export const PROFILE_HREF = "/profile/";

/** 로그아웃 확인 문구 — 게스트면 다시 게스트로 이어 보기, 그 외는 같은 계정일 때만 이어 보기(MoreView.swift:99-101). */
export function signOutMessage(provider: AccountProvider | null | undefined): string {
  return provider === "guest"
    ? "기록은 이 기기에 남아 있어요. 다시 게스트로 시작하면 이어서 볼 수 있어요." // 원문: MoreView.swift:100
    : "기록은 이 기기에 남아 있어요. 같은 계정으로 다시 로그인하면 이어서 볼 수 있지만, 다른 계정이나 게스트로 들어오면 새로 시작해요."; // 원문: MoreView.swift:101
}

export interface SettingsRow {
  key: "dayCount" | "deliveryMethod" | "goal" | "neighborhood";
  label: string;
  value: string;
}

/**
 * 설정 "프로필" 카드 — 산후 일수 · 분만 방식 · 목표 · 내 동네(있을 때). MoreView.swift:48-55
 * iOS는 출산일이 늘 있었다. 웹은 출산일이 없으면 0일차를 지어내지 않고 "미설정"으로 둔다.
 */
export function settingsProfileRows(profile: UserProfile, now: Date): SettingsRow[] {
  const rows: SettingsRow[] = [
    {
      key: "dayCount",
      label: SETTINGS_TEXT.dayCount,
      value: parseLocalDate(profile.deliveryDate)
        ? `${postpartumDayCount(profile.deliveryDate, now)}일차` // 원문: MoreView.swift:49
        : PROFILE_TEXT.unset,
    },
    { key: "deliveryMethod", label: PROFILE_TEXT.deliveryMethod, value: deliveryMethodLabel(profile.deliveryMethod) },
    { key: "goal", label: PROFILE_TEXT.goal, value: goalLabel(profile.goal) },
  ];
  const neighborhood = neighborhoodValue(profile.neighborhood);
  if (neighborhood) rows.push({ key: "neighborhood", label: PROFILE_TEXT.neighborhood, value: neighborhood });
  return rows;
}

// MARK: 프로필 편집

export const PROFILE_EDIT_TEXT = {
  title: "프로필 편집", // 원문: MoreView.swift:171
  cancel: "취소", // 원문: MoreView.swift:174
  save: "저장", // 원문: MoreView.swift:176
  basics: "기본 정보", // 원문: MoreView.swift:197
  deliveryDate: "출산일", // 원문: MoreView.swift:199
  deliveryMethod: "분만 방식", // 원문: MoreView.swift:203
  goal: "목표", // 원문: MoreView.swift:213
  // 복직 예정일 — ProfileEditView에는 없고 온보딩 2단계에만 있던 입력(작업 지시: 목표 + 복직일). 문구는 온보딩 원문.
  returnToWork: "복직 예정일 (선택)", // 원문: OnboardingFlowView.swift:231
  returnToWorkHintEmpty: "고르면 홈에 남은 기간이 표시돼요", // 원문: OnboardingFlowView.swift:235
  returnToWorkHintSet: "홈 화면에 남은 기간을 표시해요", // 원문: OnboardingFlowView.swift:236
  neighborhood: "내 동네", // 원문: MoreView.swift:223
  neighborhoodPlaceholder: "예: 서울 노원구", // 원문: MoreView.swift:224
  breastfeeding: "모유수유 중", // 원문: MoreView.swift:231
  weight: "체중 (선택)", // 원문: MoreView.swift:242
  weightHelp: "입력하면 BMI·체중 회복 목표를 계산해요.", // 원문: MoreView.swift:243
  height: "키 (cm)", // 원문: MoreView.swift:245
  currentWeight: "현재 체중 (kg)", // 원문: MoreView.swift:247
  preWeight: "임신 전 체중 (kg)", // 원문: MoreView.swift:249
  maternity: "재활 고려사항", // 원문: MoreView.swift:258
  maternityHelp: "산모수첩·진료기록에서 확인된 항목. 운동 추천 강도·금기에 반영돼요.", // 원문: MoreView.swift:259
} as const;

/** 분만 방식·목표 선택지 — Swift allCases 순서(Models.swift:6-8, 32-34). 표시명은 profileView와 같은 표. */
export const DELIVERY_OPTIONS: readonly DeliveryMethod[] = ["vaginal", "cesarean"];
export const GOAL_OPTIONS: readonly RecoveryGoal[] = ["homemaker", "returningToWork"];

/** 재활 고려사항 토글 7개 — MoreView.swift 순서·라벨 그대로(:261-268). */
export const MATERNITY_TOGGLES: ReadonlyArray<{ key: keyof MaternityRecord; label: string }> = [
  { key: "isPrimiparous", label: "초산" }, // 원문: MoreView.swift:261
  { key: "gdm", label: "임신성 당뇨(GDM)" }, // 원문: MoreView.swift:263
  { key: "anemia", label: "산후 빈혈" }, // 원문: MoreView.swift:264
  { key: "heavyBleeding", label: "분만 시 출혈 많음" }, // 원문: MoreView.swift:265
  { key: "preeclampsia", label: "임신중독증·고혈압" }, // 원문: MoreView.swift:266
  { key: "pelvicPain", label: "골반통·치골결합 이개" }, // 원문: MoreView.swift:267
  { key: "diastasisRecti", label: "복직근 이개(DRA)" }, // 원문: MoreView.swift:268
];

/** 편집 중인 값. 날짜 입력은 비어 있을 수 있어 문자열("" = 비어 있음)로 든다. */
export interface ProfileDraft {
  deliveryDate: string;
  deliveryMethod: DeliveryMethod | null;
  goal: RecoveryGoal | null;
  returnToWorkDate: string;
  neighborhood: string;
  isBreastfeeding: boolean;
  heightCm: number;
  currentWeightKg: number;
  prePregnancyWeightKg: number;
  maternity: MaternityRecord;
}

/** 저장된 값으로 편집을 시작한다(MoreView.swift:184-189 onAppear). 분만 방식·목표가 없으면 아무것도 고르지 않은 채로 둔다. */
export function draftFromState(profile: UserProfile, maternity: MaternityRecord): ProfileDraft {
  return {
    deliveryDate: profile.deliveryDate ?? "",
    deliveryMethod: profile.deliveryMethod,
    goal: profile.goal,
    returnToWorkDate: profile.returnToWorkDate ?? "",
    neighborhood: profile.neighborhood,
    isBreastfeeding: profile.isBreastfeeding,
    heightCm: profile.heightCm,
    currentWeightKg: profile.currentWeightKg,
    prePregnancyWeightKg: profile.prePregnancyWeightKg,
    maternity: { ...maternity },
  };
}

export type DraftProblem = "deliveryDateMissing" | "deliveryDateFuture";

/**
 * 저장할 수 없는 이유 — 출산일은 비울 수 없고(앱의 기준점) 오늘보다 뒤일 수 없다(D11·D12).
 * 화면은 네이티브 입력 검증(required·max)으로 같은 조건을 알린다. 이 함수는 저장 직전의 마지막 확인이다.
 */
export function draftProblem(draft: ProfileDraft, today: LocalDateString): DraftProblem | null {
  if (!parseLocalDate(draft.deliveryDate)) return "deliveryDateMissing";
  // "YYYY-MM-DD"는 글자 순서 = 날짜 순서
  if (draft.deliveryDate > today) return "deliveryDateFuture";
  return null;
}

/**
 * 저장할 값 — [저장] 때 프로필·산모수첩을 한 번에 바꾼다(MoreView.swift:176-180).
 * 복직 예정일은 비우면 null(선택 입력). 내 동네는 앞뒤 공백을 뺀다.
 */
export function draftToPatches(draft: ProfileDraft): { profile: Partial<UserProfile>; maternity: MaternityRecord } {
  return {
    profile: {
      deliveryDate: draft.deliveryDate,
      deliveryMethod: draft.deliveryMethod,
      goal: draft.goal,
      returnToWorkDate: parseLocalDate(draft.returnToWorkDate) ? draft.returnToWorkDate : null,
      neighborhood: draft.neighborhood.trim(),
      isBreastfeeding: draft.isBreastfeeding,
      heightCm: draft.heightCm,
      currentWeightKg: draft.currentWeightKg,
      prePregnancyWeightKg: draft.prePregnancyWeightKg,
    },
    maternity: { ...draft.maternity },
  };
}

/** 복직 예정일 입력 칸은 목표가 "복직 예정"일 때만(OnboardingFlowView.swift:226). */
export function showsReturnToWork(goal: RecoveryGoal | null): boolean {
  return goal === "returningToWork";
}
