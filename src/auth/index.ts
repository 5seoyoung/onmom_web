// 사용자 관리(Supabase Auth) — 게스트(익명 계정)·카카오 로그인·계정 연결 + 사용자별 서버 저장. 설정 방법: docs/SUPABASE_SETUP.md
//
// 켜지는 조건: NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY가 둘 다 있을 때(config.isSupabaseConfigured).
// 꺼져 있으면 카카오 버튼은 "준비 중", Supabase 요청·번들 없음, 게스트는 이 브라우저에만 저장(지금까지와 같다).
//
// 서버로 기록을 올리는 것은 지금 판의 동의 뒤에만(domain/consent.ts hasCurrentConsent — 동의는 프로필에 있다).
// 동의는 온보딩 화면이 updateProfile로(또는 store.actions.acceptConsent()로) 남긴다. 이 모듈에 따로 알릴 것은 없다.

import type { AppStore } from "@/store/appStore";
import { getBrowserStore } from "@/store/browserStore";
import { authSession, type DeleteAccountResult, type GuestSignInResult, type KakaoSignInResult, type SignOutResult } from "./session";

export type { AccountSyncStatus, CallbackOutcome, DeleteAccountResult, GuestSignInResult, KakaoSignInResult, SignOutResult } from "./session";
export { useAccountSession, useAuthSession, useSyncStatus } from "./useAuth";

/**
 * [게스트로 시작] — 설정이 있으면 Supabase 익명 계정을 만든다(사이트 키가 있으면 Turnstile 확인 뒤). 없거나 실패하면 지금처럼
 * 이 브라우저 전용 게스트(다음에 페이지를 열 때 익명 계정으로 옮긴다). 어느 쪽이든 끝나면 계정이 생겨 관문이 온보딩으로 보낸다.
 */
export function signInGuest(store: AppStore = getBrowserStore()): Promise<GuestSignInResult> {
  return authSession.signInGuest(store);
}

/**
 * [카카오로 시작하기]·[카카오 계정 연결] — 지금 사용자가 이 브라우저 게스트의 익명 계정이면 그 계정에 카카오를 연결하고(기록·서버 행 그대로),
 * 아니면 카카오로 로그인한다. 성공하면 브라우저가 카카오 동의 화면으로 이동한다. 실패하면 결과로 알린다.
 */
export function signInWithKakao(store: AppStore = getBrowserStore()): Promise<KakaoSignInResult> {
  return authSession.signInWithKakao(store);
}

/**
 * 로그아웃(설정 화면). 카카오 계정: 기다리는 변경을 올린 뒤(최대 8초) Supabase 세션을 끝내고 앱 계정을 로그아웃한다.
 * 서버에 다 올라갔으면 이 브라우저의 건강 기록 사본을 지운다(공용 PC — 감사 #19). 올리지 못했으면 아무것도 하지 않고
 * { ok: false, reason: "unsynced" } — 경고 뒤 { force: true }로 다시 부르면 기록은 이 브라우저에 남긴 채 로그아웃한다.
 * 설정이 있는 빌드의 게스트는 로그아웃하지 않는다({ ok: false, reason: "guest" }) — 카카오 연결 또는 계정 삭제.
 */
export function signOutEverywhere(store: AppStore = getBrowserStore(), opts?: { force?: boolean }): Promise<SignOutResult> {
  return authSession.signOut(store, opts);
}

/**
 * 계정 삭제(설정 화면). 카카오·익명 게스트 계정이면 서버의 delete_my_account()가 성공했을 때만 로그아웃하고 이 브라우저를 비운다.
 * 실패하면 아무것도 지우지 않고 오류를 돌려준다(감사 #18). 브라우저 전용 게스트·설정 없음은 이 브라우저만 비운다.
 */
export function deleteAccountEverywhere(store: AppStore = getBrowserStore()): Promise<DeleteAccountResult> {
  return authSession.deleteAccount(store);
}
