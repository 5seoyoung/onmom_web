// 카카오 로그인(Supabase Auth) + 사용자별 서버 저장 — 설정 방법: docs/SUPABASE_SETUP.md
//
// 켜지는 조건: NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY가 둘 다 있을 때(config.isSupabaseConfigured).
// 꺼져 있으면 카카오 버튼은 "준비 중", Supabase 요청·번들 없음, 게스트만 동작(지금까지와 같다).

import type { AppStore } from "@/store/appStore";
import { getBrowserStore } from "@/store/browserStore";
import { authSession, type DeleteAccountResult, type KakaoSignInResult, type SignOutResult } from "./session";

export type { AccountSyncStatus, CallbackOutcome, DeleteAccountResult, KakaoSignInResult, SignOutResult } from "./session";
export { SERVER_STORAGE_CONSENT_VERSION } from "@/store/sync/marks";
export { useAccountSession, useAuthSession, useSyncStatus } from "./useAuth";

/** [카카오로 시작하기] — 성공하면 브라우저가 카카오 동의 화면으로 이동한다. 실패하면 결과로 알린다. */
export function signInWithKakao(): Promise<KakaoSignInResult> {
  return authSession.signInWithKakao();
}

/**
 * 로그아웃(설정 화면). 기다리는 변경을 올린 뒤(최대 8초) Supabase 세션을 끝내고 앱 계정을 로그아웃한다.
 * 카카오 계정이고 서버에 다 올라갔으면 이 브라우저의 건강 기록 사본을 지운다(공용 PC — 감사 #19).
 * 올리지 못했으면 아무것도 하지 않고 { ok: false, reason: "unsynced" } — 경고 뒤 { force: true }로 다시 부르면
 * 기록은 이 브라우저에 남긴 채 로그아웃한다.
 */
export function signOutEverywhere(store: AppStore = getBrowserStore(), opts?: { force?: boolean }): Promise<SignOutResult> {
  return authSession.signOut(store, opts);
}

/**
 * 계정 삭제(설정 화면). 카카오 계정이면 서버의 delete_my_account()가 성공했을 때만 로그아웃하고 이 브라우저를 비운다.
 * 실패하면 아무것도 지우지 않고 오류를 돌려준다(감사 #18). 게스트는 지금처럼 이 브라우저만 비운다.
 */
export function deleteAccountEverywhere(store: AppStore = getBrowserStore()): Promise<DeleteAccountResult> {
  return authSession.deleteAccount(store);
}

/**
 * 서버 저장 동의를 받았다(온보딩). 카카오 계정은 이 동의가 있어야 기록을 서버로 올린다 — 온보딩 3단계의
 * "내 기기에만 저장" 동의(profile.consentAccepted)만으로는 올리지 않는다(감사 #15·#20).
 * - 새 카카오 사용자: 온보딩 3단계에서 서버 저장 동의 문구에 동의하면 completeOnboarding()과 함께 부른다(순서 무관).
 * - 게스트로 쓰던 기록을 가져온 카카오 사용자: 다시 동의를 받는 화면에서 부른다(동기화 상태가 "waitingConsent"인 동안).
 * 동의 문구가 바뀌면 SERVER_STORAGE_CONSENT_VERSION(store/sync/marks.ts)을 올린다.
 * 카카오 계정이 아니거나 설정이 없으면 아무것도 하지 않고 false.
 */
export function acceptServerStorageConsent(store: AppStore = getBrowserStore()): boolean {
  return authSession.acceptServerStorageConsent(store);
}
