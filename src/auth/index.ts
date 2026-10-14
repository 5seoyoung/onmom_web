// 사용자 관리(Supabase Auth) — 게스트(익명 계정)·카카오 로그인·계정 연결 + 사용자별 서버 저장. 설정 방법: docs/SUPABASE_SETUP.md
//
// 켜지는 조건: NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY가 둘 다 있을 때(config.isSupabaseConfigured).
// 꺼져 있으면 카카오 버튼은 "준비 중", Supabase 요청·번들 없음, 게스트는 이 브라우저에만 저장(지금까지와 같다).
//
// 서버로 기록을 올리는 것은 지금 판의 동의 뒤에만(domain/consent.ts hasCurrentConsent — 동의는 프로필에 있다).
// 동의는 온보딩 화면이 updateProfile로(또는 store.actions.acceptConsent()로) 남긴다. 이 모듈에 따로 알릴 것은 없다.

// 화면은 훅으로 쓴다 — 로그인·로그아웃·계정 삭제·카카오 연결은 useAccountSession(), 세션 이어받기는 useAuthSession(),
// 서버 저장 상태 줄은 useSyncStatus()(모두 useAuth.ts — 이 브라우저의 스토어로 authSession을 부른다).
export type { AccountSyncStatus, CallbackOutcome, DeleteAccountResult, GuestSignInResult, KakaoSignInResult, SignOutResult } from "./session";
export { useAccountSession, useAuthSession, useSyncStatus } from "./useAuth";
