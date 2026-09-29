// 로그인 콜백(/auth/callback/) 화면 문구와 실패 이유 → 문구 매핑 — 순수 모듈(AuthCallbackScreen이 쓴다, 테스트는 callbackText.test.ts).
// 문구는 iOS KakaoLoginService.swift 원문을 우선하고, iOS에 없는 상태만 웹 신규 문구로 둔다.
// 브라우저가 확실히 오프라인이면(navigator.onLine=false) 교환 실패·기록 못 읽음을 "카카오 응답을 처리하지 못했어요"가 아니라
// 오프라인 안내(다른 서버 기능과 같은 문구 features/home/useOnline OFFLINE_TEXT)로 말한다 — 취소·설정 없음은 연결과 무관하니 그대로.

import type { CallbackOutcome } from "@/auth/session";
import { OFFLINE_TEXT } from "@/features/home/useOnline";

export const AUTH_CALLBACK_TEXT = {
  // 웹 신규 문구 — CPO 확인 필요 (카카오에서 돌아와 세션을 만드는 동안. 연결하려던 카카오 계정이 이미 다른 온맘 계정이라
  // 그 계정으로 로그인하러 카카오에 다시 가는 동안(identity_already_exists → "redirecting")에도 같은 문구)
  working: "로그인하고 있어요",
  cancelled: "로그인이 취소되었어요.", // 원문: KakaoLoginService.swift:27
  failed: "카카오 응답을 처리하지 못했어요. 잠시 후 다시 시도해주세요.", // 원문: KakaoLoginService.swift:28
  // 웹 신규 문구 — CPO 확인 필요 (Supabase 설정이 없는 빌드에서 콜백 주소를 열었을 때 — 다시 시도해도 되지 않으므로
  // "잠시 후 다시 시도"라고 하지 않는다. 로그인 화면의 "준비 중"(LOGIN_TEXT.kakaoPending)과 같은 뜻)
  notConfigured: "카카오 로그인은 준비 중이에요.",
  // 웹 신규 문구 — CPO 확인 필요 (로그인은 됐지만 서버의 기록을 읽지 못함)
  syncFailed: "기록을 불러오지 못했어요",
  // 웹 신규 문구 — CPO 확인 필요 (위 문구의 안내 줄 — KakaoLoginService.swift의 "잠시 후 다시 시도해주세요."와 같은 말)
  syncFailedBody: "잠시 후 다시 시도해주세요.",
  retry: "다시 시도", // 원문: ExerciseView.swift:184
} as const;

export type CallbackErrorReason = Extract<CallbackOutcome, { kind: "error" }>["reason"];

/**
 * 실패 이유 → 안내 문구. cancelled = 카카오 동의 화면에서 취소(LoginView.swift는 조용히 무시했지만 웹은 콜백 페이지에 와 있으므로
 * 원문 문구로 알린다), failed = 교환 실패·네트워크·카카오 계정이 아님·게스트 정리 실패, notConfigured = 설정 없는 빌드.
 * online=false(확실히 오프라인)면 failed만 오프라인 안내로 바꾼다 — 네트워크가 없어 실패한 것을 카카오 응답 탓으로 말하지 않게.
 */
export function callbackErrorMessage(reason: CallbackErrorReason, online = true): string {
  switch (reason) {
    case "cancelled":
      return AUTH_CALLBACK_TEXT.cancelled;
    case "notConfigured":
      return AUTH_CALLBACK_TEXT.notConfigured;
    default:
      return online ? AUTH_CALLBACK_TEXT.failed : OFFLINE_TEXT;
  }
}

/** 로그인은 됐지만 서버 기록을 못 읽었을 때의 안내 줄 — 오프라인이면 그 사실을 말한다(온라인이 되면 다시 "잠시 후 다시 시도") */
export function callbackSyncFailedBody(online = true): string {
  return online ? AUTH_CALLBACK_TEXT.syncFailedBody : OFFLINE_TEXT;
}
