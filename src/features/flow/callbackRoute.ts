// 로그인 콜백(/auth/callback/)이 끝난 뒤 갈 곳 — 순수 함수(AuthCallbackScreen이 쓴다).

import { ROUTES } from "@/routes";
import type { Account } from "@/store/account";
import type { RootScreen } from "@/store/appStore";
import { SCREEN_PATH } from "./gate";

/**
 * 로그인을 마친 뒤 갈 곳 — 관문과 같은 판단(rootScreenFor → SCREEN_PATH: 온보딩 / 다시 동의 / 홈).
 * 게스트의 카카오 계정 연결이 끝났고(linked) 바로 앱을 쓸 수 있으면 연결을 시작한 설정 화면으로 돌아간다.
 */
export function callbackDestination(screen: RootScreen, linked: boolean): string {
  if (screen === "loading") return ROUTES.login;
  if (screen === "main" && linked) return ROUTES.settings;
  return SCREEN_PATH[screen];
}

/** 실패 안내의 [다시 시도] — 로그인 전이면 로그인 화면, 게스트로 쓰는 중이면(설정의 카카오 계정 연결) 설정 화면 */
export function callbackRetryHref(account: Account | null): string {
  return account?.provider === "guest" ? ROUTES.settings : ROUTES.login;
}
