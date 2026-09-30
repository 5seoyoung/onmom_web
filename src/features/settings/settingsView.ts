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
import type { DeleteAccountResult, KakaoSignInResult, SignOutResult } from "@/auth";
import type { AccountProvider } from "@/store/account";
import { ROUTES } from "@/routes";
import { PROFILE_TEXT, deliveryMethodLabel, goalLabel, neighborhoodValue } from "@/features/profile/profileView";
import { STORAGE_REGION } from "@/features/privacy/dataItems";

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
  // 원문: MoreView.swift:73 — 설정 없는 빌드만 그대로. 서버 저장 빌드는 privacyBodyFor가 "내 기기에만" 문장을 바꾼다.
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

export const SETTINGS_HREF = ROUTES.settings;
export const PROFILE_EDIT_HREF = ROUTES.settingsProfile;
export const PRIVACY_HREF = ROUTES.privacy;
/** 이용약관(초안) — 개인정보·안전 카드의 두 번째 링크(features/terms) */
export const TERMS_HREF = ROUTES.terms;
export const PROFILE_HREF = ROUTES.profile;

/** 로그아웃 확인 문구 — 게스트면 다시 게스트로 이어 보기, 그 외는 같은 계정일 때만 이어 보기(MoreView.swift:99-101). */
export function signOutMessage(provider: AccountProvider | null | undefined): string {
  return provider === "guest"
    ? "기록은 이 기기에 남아 있어요. 다시 게스트로 시작하면 이어서 볼 수 있어요." // 원문: MoreView.swift:100
    : "기록은 이 기기에 남아 있어요. 같은 계정으로 다시 로그인하면 이어서 볼 수 있지만, 다른 계정이나 게스트로 들어오면 새로 시작해요."; // 원문: MoreView.swift:101
}

// MARK: 서버 계정 — 사용자 관리(Supabase)가 켜진 빌드의 카카오·게스트(익명) 계정
// 로그아웃·계정 삭제·카카오 연결이 서버를 거친다(src/auth). 설정 없음은 iOS처럼 이 브라우저에서만.
// iOS에는 서버 계정이 없어 원문이 없다 — 아래 문구는 원문 표시가 없으면 모두 웹 신규.

/**
 * 계정 카드의 모양
 * - "local": 설정 없는 빌드(또는 모르는 공급자) — 지금까지와 같다: 로그아웃(기록은 남음)·계정 삭제(이 브라우저만).
 * - "guest": 설정 있는 빌드의 게스트(Supabase 익명 계정 — 익명 로그인이 안 돼 아직 이 브라우저 전용인 게스트도 같게) —
 *            로그아웃이 없다(익명 계정은 로그아웃하면 다시 찾을 수 없다). [카카오 계정 연결]·[이 기기에서 기록 지우기(계정 삭제)].
 * - "kakao": 설정 있는 빌드의 카카오 — 로그아웃(남은 변경을 올린 뒤)·계정 삭제(서버 먼저).
 */
export type AccountMode = "local" | "guest" | "kakao";

export function accountModeFor(provider: AccountProvider | null | undefined, supabaseConfigured: boolean): AccountMode {
  if (!supabaseConfigured) return "local";
  if (provider === "guest") return "guest";
  if (provider === "kakao") return "kakao";
  return "local";
}

/** 로그아웃·계정 삭제가 서버를 거치는가(확인 창이 서버 문구를 쓰는가) — 설정 있는 빌드의 카카오·게스트. */
export function usesServerAccount(provider: AccountProvider | null | undefined, supabaseConfigured: boolean): boolean {
  return accountModeFor(provider, supabaseConfigured) !== "local";
}

/** 계정 카드에 보이는 동작 */
export interface AccountCardActions {
  signOut: boolean;
  linkKakao: boolean;
  /** 삭제 버튼 제목 */
  deleteLabel: string;
  /** 로그아웃이 없는 까닭(게스트) — 없으면 null */
  notice: string | null;
}

export function accountCardActions(mode: AccountMode): AccountCardActions {
  if (mode === "guest") {
    return { signOut: false, linkKakao: true, deleteLabel: GUEST_ACCOUNT_TEXT.deleteAccount, notice: GUEST_ACCOUNT_TEXT.noSignOut };
  }
  return { signOut: true, linkKakao: false, deleteLabel: SETTINGS_TEXT.deleteAccount, notice: null };
}

export const GUEST_ACCOUNT_TEXT = {
  // 웹 신규 문구 — CPO 확인 필요 (게스트의 카카오 연결 — 같은 계정에 카카오를 붙인다. 문구는 작업 지시의 CPO 표현)
  linkKakao: "카카오 계정 연결",
  // 웹 신규 문구 — CPO 확인 필요 (위 버튼의 설명 줄 — 작업 지시의 CPO 표현)
  linkKakaoHint: "기록을 잃지 않고 다른 기기에서도 이어 쓰기",
  // 웹 신규 문구 — CPO 확인 필요 (게스트의 계정 삭제 버튼 — 작업 지시의 CPO 표현. 설명 줄은 원문 deleteAccountHint)
  deleteAccount: "이 기기에서 기록 지우기(계정 삭제)",
  // 웹 신규 문구 — CPO 확인 필요 (게스트에게 로그아웃이 없는 까닭 — 익명 계정은 로그아웃하면 다시 들어갈 방법이 없다)
  noSignOut: "게스트는 로그아웃하면 기록을 다시 찾을 수 없어요. 기록을 지키려면 카카오 계정을 연결해 주세요.",
  /** 카카오 화면으로 보내지 못했다(연결 설정 꺼짐·네트워크) */
  linkFailed: "카카오 로그인 창을 열지 못했어요. 잠시 후 다시 시도해주세요.", // 원문: KakaoLoginService.swift:29
} as const;

export const SERVER_ACCOUNT_TEXT = {
  // 웹 신규 문구 — CPO 확인 필요 (카카오 로그아웃 확인 창: 서버에 다 올라갔으면 이 브라우저 사본을 지운다 — 감사 #19)
  signOutMessage: "서버에 저장된 기록은 같은 카카오 계정으로 다시 로그인하면 이어서 볼 수 있어요. 공용 기기에 남지 않도록 이 브라우저의 기록은 지워요.",
  // 웹 신규 문구 — CPO 확인 필요 (로그아웃 전 올리지 못함 — 네트워크 실패·서버 저장 동의 전·새 형식 서버 기록)
  unsyncedTitle: "아직 서버에 저장되지 않은 기록이 있어요",
  // 웹 신규 문구 — CPO 확인 필요
  unsyncedMessage: "지금 로그아웃하면 이 기록은 서버에 저장되지 않고 이 브라우저에만 남아요.",
  // 웹 신규 문구 — CPO 확인 필요
  unsyncedConfirm: "그래도 로그아웃",
  // 웹 신규 문구 — CPO 확인 필요 (카카오 계정 삭제 확인 창 — MoreView.swift:109에 서버를 더한 것)
  deleteMessage: "계정 정보와 서버·이 브라우저에 저장된 프로필·증상 기록·글이 모두 삭제됩니다. 이 작업은 되돌릴 수 없어요.",
  // 웹 신규 문구 — CPO 확인 필요 (서버 삭제 실패 — 아무것도 지우지 않았다, 감사 #18)
  deleteFailed: "계정을 삭제하지 못했어요. 아무것도 삭제되지 않았어요. 인터넷 연결을 확인하고 잠시 후 다시 시도해 주세요.",
  // 웹 신규 문구 — CPO 확인 필요 (로그인이 끝나 서버에 삭제를 요청할 수 없음)
  deleteNoSession: "로그인이 끝나 계정을 삭제하지 못했어요. 아무것도 삭제되지 않았어요. 로그아웃한 뒤 카카오로 다시 로그인해 삭제해 주세요.",
  // 웹 신규 문구 — CPO 확인 필요 (진행 중 상태 — 로그아웃은 남은 저장을 최대 8초 기다린다)
  signingOut: "로그아웃하고 있어요",
  // 웹 신규 문구 — CPO 확인 필요
  deleting: "계정을 삭제하고 있어요",
  // 웹 신규 문구 — CPO 확인 필요 (서버 저장 빌드의 설정 "개인정보·안전" — MoreView.swift:73의 "건강 데이터는 내 기기에만 저장됩니다."를
  // 바꾼 한 문장. 온보딩 동의 부제(consentText.ts SERVER_CONSENT_TEXT.subtitle)와 같은 사실)
  privacyStorage: `건강 데이터는 동의를 받은 뒤에만 온맘 서버(${STORAGE_REGION})에 저장돼요.`,
} as const;

/** iOS 개인정보·안전 본문 중 서버 저장 빌드에서 사실이 아닌 문장(MoreView.swift:73) */
const PRIVACY_DEVICE_ONLY_SENTENCE = "건강 데이터는 내 기기에만 저장됩니다.";

/**
 * 설정 "개인정보·안전" 카드 본문. 설정 없는 빌드는 iOS 원문 그대로.
 * 서버 저장 빌드(Supabase 설정 있음)는 건강 기록이 동의 뒤 서버(서울)에 저장되므로 "내 기기에만 저장" 한 문장만 바꾼다 —
 * 온보딩 서버 저장 동의(features/onboarding/consentText.ts)와 어긋나지 않게. 나머지 문장(진단 기기 아님·챗봇 전송)은 원문.
 */
export function privacyBodyFor(supabaseConfigured: boolean): string {
  if (!supabaseConfigured) return SETTINGS_TEXT.privacyBody;
  return SETTINGS_TEXT.privacyBody.replace(PRIVACY_DEVICE_ONLY_SENTENCE, SERVER_ACCOUNT_TEXT.privacyStorage);
}

/** 로그아웃 확인 창 본문 — 서버 계정이면 서버 안내, 아니면 iOS 문구(signOutMessage). */
export function signOutConfirmMessage(provider: AccountProvider | null | undefined, serverAccount: boolean): string {
  return serverAccount ? SERVER_ACCOUNT_TEXT.signOutMessage : signOutMessage(provider);
}

/** 계정 삭제 확인 창 본문 — 서버 계정이면 서버 기록까지 지운다고 알린다. */
export function deleteConfirmMessage(serverAccount: boolean): string {
  return serverAccount ? SERVER_ACCOUNT_TEXT.deleteMessage : SETTINGS_TEXT.deleteMessage;
}

/** 서버 계정 삭제 실패 안내(deleteAccountEverywhere의 실패 이유별). */
export function deleteFailureMessage(reason: "failed" | "noSession"): string {
  return reason === "noSession" ? SERVER_ACCOUNT_TEXT.deleteNoSession : SERVER_ACCOUNT_TEXT.deleteFailed;
}

/**
 * 로그아웃·계정 삭제·카카오 연결을 누른 뒤 화면이 할 일 — done: 끝(계정이 없어지면 관문이 로그인 화면으로),
 * redirecting: 브라우저가 카카오 화면으로 이동한다(버튼을 잠근 채 둔다), unsynced: 경고 창, failed: 안내
 */
export type AccountActionOutcome = { kind: "done" } | { kind: "redirecting" } | { kind: "unsynced" } | { kind: "failed"; message: string };

/**
 * 로그아웃. Supabase가 없는 빌드는 지금까지처럼 스토어에서 바로(기록은 남는다 — iOS와 같음).
 * 있는 빌드는 signOutEverywhere(카카오는 남은 변경을 올린 뒤) — 못 올렸으면 unsynced(아무것도 하지 않았다).
 * 있는 빌드의 게스트는 로그아웃하지 않는다(화면에 버튼이 없다).
 */
export async function performSignOut(deps: {
  supabaseConfigured: boolean;
  force: boolean;
  signOutLocal: () => void;
  signOutEverywhere: (opts?: { force?: boolean }) => Promise<SignOutResult>;
}): Promise<AccountActionOutcome> {
  if (!deps.supabaseConfigured) {
    deps.signOutLocal();
    return { kind: "done" };
  }
  const result = await deps.signOutEverywhere(deps.force ? { force: true } : undefined);
  if (result.ok) return { kind: "done" };
  // 게스트는 로그아웃하지 않는다(화면에 버튼이 없다 — 혹시 불리면 까닭만 알린다)
  return result.reason === "guest" ? { kind: "failed", message: GUEST_ACCOUNT_TEXT.noSignOut } : { kind: "unsynced" };
}

/** 게스트의 [카카오 계정 연결] — 성공하면 카카오 화면으로 이동한다(돌아오면 로그인 콜백이 연결을 마친다). */
export async function performLinkKakao(deps: { signInWithKakao: () => Promise<KakaoSignInResult> }): Promise<AccountActionOutcome> {
  const result = await deps.signInWithKakao();
  return result.ok ? { kind: "redirecting" } : { kind: "failed", message: GUEST_ACCOUNT_TEXT.linkFailed };
}

/**
 * 계정 삭제. Supabase가 없는 빌드는 이 브라우저만 비운다(MoreView.swift:113-118).
 * 있는 빌드는 deleteAccountEverywhere — 카카오·익명 게스트 계정은 서버를 먼저 지우고, 실패하면 아무것도 지우지 않아 안내만 한다.
 */
export async function performDeleteAccount(deps: {
  supabaseConfigured: boolean;
  deleteLocal: () => void;
  deleteAccountEverywhere: () => Promise<DeleteAccountResult>;
}): Promise<AccountActionOutcome> {
  if (!deps.supabaseConfigured) {
    deps.deleteLocal();
    return { kind: "done" };
  }
  const result = await deps.deleteAccountEverywhere();
  return result.ok ? { kind: "done" } : { kind: "failed", message: deleteFailureMessage(result.reason) };
}

// MARK: 내 데이터 — 열람권(내려받기)·동의 내역. iOS에 없던 카드라 문구는 모두 웹 신규.
// 근거: 웹 처리방침 초안 13절(열람·정정·삭제·처리정지·동의 철회), web/07 §3(consent_version 저장), DEV_NOTES §8-7(동의 증빙).

export const DATA_RIGHTS_TEXT = {
  // 웹 신규 문구 — CPO 확인 필요 (설정의 새 카드 제목)
  title: "내 데이터",
  // 웹 신규 문구 — CPO 확인 필요 (동의 내역 소제목·행 이름)
  consentTitle: "내 동의 내역",
  consentVersion: "동의 버전",
  consentAt: "동의 일시",
  // 웹 신규 문구 — CPO 확인 필요 (Supabase 계정 ID 행 — 문의·삭제 요청 때 관리자가 계정을 찾는 값. /admin/ "내 계정 ID"와 같은 값)
  accountId: "계정 ID",
  accountIdHint: "문의나 삭제 요청을 보낼 때 이 계정 ID를 함께 알려 주세요.",
  // 웹 신규 문구 — CPO 확인 필요 (철회 방법 = 계정 삭제 — 처리방침 초안 13절과 같은 사실)
  consentWithdraw: "동의를 철회하려면 위 계정 카드에서 계정을 삭제해 주세요.",
  // 웹 신규 문구 — CPO 확인 필요 (열람권 — 이 브라우저의 기록 전체를 JSON 파일로)
  exportButton: "내 데이터 내려받기",
  exportHint:
    "이 브라우저에 있는 내 기록 전체(프로필·산모수첩·증상 기록·기분 답·기록장)를 JSON 파일로 저장해요. 건강 정보가 들어 있으니 안전한 곳에 보관해 주세요.",
  // 웹 신규 문구 — CPO 확인 필요 (Blob 다운로드를 못 하는 브라우저)
  exportFailed: "파일을 만들지 못했어요. 브라우저를 최신 버전으로 바꾸거나 다른 브라우저에서 다시 시도해 주세요.",
} as const;

/** 카드 안 이름·값 한 줄(InfoRows) */
export interface InfoRow {
  key: string;
  label: string;
  value: string;
}

/** ISO 시각 → 이 기기의 로컬 시각 "2026.09.28 14:05". 읽을 수 없으면 null(지어내지 않는다). */
export function formatLocalDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${two(d.getMonth() + 1)}.${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

/**
 * "내 동의 내역" 행 — 있는 값만 보인다(형식만 바꾼다, 값을 만들지 않는다).
 * 설정 없는 빌드의 동의는 판이 없고(consentVersion null) 시각만 있다 → 동의 일시 한 줄. 서버 저장 빌드는 판 + 일시.
 * 동의 전(consentAccepted false)이면 빈 배열 — 설정 화면은 온보딩 뒤에만 열리므로 보통 비지 않는다.
 */
export function consentRows(profile: Pick<UserProfile, "consentAccepted" | "consentVersion" | "consentAcceptedAt">): InfoRow[] {
  if (!profile.consentAccepted) return [];
  const rows: InfoRow[] = [];
  if (profile.consentVersion !== null) rows.push({ key: "consentVersion", label: DATA_RIGHTS_TEXT.consentVersion, value: profile.consentVersion });
  const at = formatLocalDateTime(profile.consentAcceptedAt);
  if (at !== null) rows.push({ key: "consentAt", label: DATA_RIGHTS_TEXT.consentAt, value: at });
  return rows;
}

/**
 * 계정 ID 행 — Supabase 세션의 사용자 id(auth.users.id, UUID). 이용자가 문의로 삭제를 요청할 때 관리자가 계정을 찾는 값이라
 * 설정에 보인다(supabase/migrations/0005_admin_tools.sql 머리 주석). 앱 계정 id("kakao-<회원번호>"·"guest-…")는 그 값이 아니다.
 * 없으면(설정 없는 빌드·세션 없음) null — 지어내지 않는다.
 */
export function accountIdRow(serverUserId: string | null): InfoRow | null {
  if (serverUserId === null || serverUserId.trim().length === 0) return null;
  return { key: "accountId", label: DATA_RIGHTS_TEXT.accountId, value: serverUserId };
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

/**
 * 목표 선택지 — Swift allCases 순서(Models.swift:32-34). 표시명은 rules/exercise.ts GOAL_TITLE.
 * 분만 방식 선택지는 rules/exercise.ts DELIVERY_OPTIONS(온보딩·분석과 같은 배열).
 */
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
