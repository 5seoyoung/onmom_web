// 앱 관문(첫 화면 분기) — iOS RootView.swift:10-17을 주소 기반으로 옮긴 순수 함수.
//
// iOS는 한 화면 안에서 로그인 ↔ 온보딩 ↔ 메인 탭을 바꿔 그렸다. 웹은 화면마다 주소가 있으므로
// "지금 보여야 할 화면(rootScreenFor)"과 "지금 주소"가 어긋나면 맞는 주소로 바꾼다(router.replace).
// 웹에는 앱 밖의 공개 주소(서비스 소개 "/", 개인정보처리방침, 로그인 콜백)가 더 있다 — 늘 그린다.
//
// 이동할 곳은 늘 그 화면을 그리는 주소이므로(login → /login/ …) 되돌이 이동이 생기지 않는다.
// 주소 비교는 끝 슬래시를 무시한다(trailingSlash: true라 usePathname이 "/login/"을 줄 수도 있다).
// usePathname은 basePath를 뗀 경로를 주고, router.replace는 basePath를 붙인다 — 여기서는 basePath를 모른다.

import type { RootScreen } from "@/store/appStore";
import { normalizePathname, ROUTES } from "@/routes";

export { normalizePathname } from "@/routes";

/** 주소가 속한 화면 묶음 — public은 로그인·온보딩 여부와 무관하게 늘 연다. */
export type RouteKind = "login" | "onboarding" | "main" | "public";

export type GateDecision =
  /** 지금 주소의 화면을 그린다 */
  | { kind: "render" }
  /** 저장소를 읽기 전 — 아무것도 그리지 않는다(보호된 화면·기본값을 번쩍이지 않게) */
  | { kind: "wait" }
  /** 맞는 주소로 바꾼다(그동안 아무것도 그리지 않는다) */
  | { kind: "redirect"; to: string };

/** 각 화면의 대표 주소 — main은 앱 홈 탭(서비스 소개 "/"가 아니다). */
export const SCREEN_PATH: Readonly<Record<Exclude<RootScreen, "loading">, string>> = {
  login: ROUTES.login,
  onboarding: ROUTES.onboarding,
  main: ROUTES.home,
};

/** 늘 여는 주소(끝 슬래시 없이 비교) */
const PUBLIC_PATHS: ReadonlySet<string> = new Set([ROUTES.landing, ROUTES.privacy, ROUTES.authCallback].map(normalizePathname));

/**
 * 주소 → 화면 묶음.
 * - / — 서비스 소개(랜딩), /privacy/ — 로그인·온보딩에서도 여는 문서(LoginView.swift:80, OnboardingFlowView.swift:305),
 *   /auth/callback/ — 로그인 공급자에서 돌아오는 주소: 늘 연다
 * - /login/, /onboarding/ — 그 화면일 때만
 * - 그 외(src/app/(app)의 탭·하위 화면, 없는 주소) — 로그인과 온보딩을 마친 뒤에만
 */
export function routeKindFor(pathname: string | null | undefined): RouteKind {
  const p = normalizePathname(pathname);
  if (PUBLIC_PATHS.has(p)) return "public";
  if (p === normalizePathname(ROUTES.login)) return "login";
  if (p === normalizePathname(ROUTES.onboarding)) return "onboarding";
  return "main";
}

export function gateDecision(screen: RootScreen, pathname: string | null | undefined): GateDecision {
  const route = routeKindFor(pathname);
  if (route === "public") return { kind: "render" };
  if (screen === "loading") return { kind: "wait" };
  if (route === screen) return { kind: "render" };
  return { kind: "redirect", to: SCREEN_PATH[screen] };
}
