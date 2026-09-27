// 동의의 판 — 모든 모듈이 이 파일 하나로 "지금 판의 동의를 받았는가"를 판단한다(공유 계약).
//
// - 온보딩 동의 단계(또는 다시 동의 화면)가 동의를 받으면 프로필에 판(consentVersion)과 시각(consentAcceptedAt)을 남긴다.
// - 서버로 건강 기록을 올리는 것(store/sync)은 hasCurrentConsent일 때만.
// - Supabase가 설정된 빌드에서 로그인·온보딩을 마쳤는데 지금 판의 동의가 없으면 앱 관문이 다시 동의 화면으로 보낸다
//   (store/appStore rootScreenFor → "consent" → /onboarding/?consent=1).
// - 동의 문구(서버 저장 범위·수탁사 등)가 바뀌면 이 값을 새 날짜로 바꾼다 — 예전 판에 동의한 사람은 다시 동의할 때까지 올리지 않는다.

import type { UserProfile } from "./types";

/** 지금 동의 문구의 판 */
export const CURRENT_CONSENT_VERSION = "web-2026-09-28";

/** 지금 판의 동의를 받았는가 — 동의(consentAccepted)와 판이 모두 맞아야 한다. */
export function hasCurrentConsent(profile: Pick<UserProfile, "consentAccepted" | "consentVersion">): boolean {
  return profile.consentAccepted && profile.consentVersion === CURRENT_CONSENT_VERSION;
}
