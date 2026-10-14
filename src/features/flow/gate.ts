// 앱 관문(첫 화면 분기) — iOS RootView.swift:10-17을 주소 기반으로 옮긴 순수 함수.
//
// iOS는 한 화면 안에서 로그인 ↔ 온보딩 ↔ 메인 탭을 바꿔 그렸다. 웹은 화면마다 주소가 있으므로
// "지금 보여야 할 화면(rootScreenFor)"과 "지금 주소"가 어긋나면 맞는 주소로 바꾼다(router.replace).
// 웹에는 앱 밖의 공개 주소(시작 주소 "/", 개인정보처리방침, 이용약관, 로그인 콜백, 관리자 화면)가 더 있다 — 늘 그린다.
// 시작 주소는 화면이 없다 — 그 페이지(RootRedirect)가 저장소를 읽은 뒤 rootPathFor의 주소로 옮긴다.
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

/**
 * 각 화면의 대표 주소 — main은 앱 홈 탭(시작 주소 "/"가 아니다).
 * consent(다시 동의 — 서버 저장이 설정된 빌드에서 지금 판의 동의가 없음)는 온보딩 주소 + ?consent=1: 온보딩 화면이 동의 단계만 보인다.
 * (쿼리는 끝 슬래시 뒤 — trailingSlash. 화면은 쿼리가 없어도 온보딩을 마친 사람이면 다시 동의로 연다.)
 */
export const SCREEN_PATH: Readonly<Record<Exclude<RootScreen, "loading">, string>> = {
  login: ROUTES.login,
  onboarding: ROUTES.onboarding,
  consent: `${ROUTES.onboarding}?consent=1`,
  main: ROUTES.home,
};

/**
 * 늘 여는 주소(끝 슬래시 없이 비교) — 시작 주소, 개인정보처리방침, 이용약관, 로그인 콜백, 관리자 화면.
 * 시작 주소는 관문이 옮기지 않고 그 페이지(RootRedirect)가 스스로 옮긴다 — 관문은 그동안 아무것도 덧그리지 않는다.
 * 관리자 화면은 로그인·온보딩과 무관하게 그리고, 권한은 화면이 Supabase is_admin()으로 확인한다(데이터는 서버 함수가 막는다).
 */
const PUBLIC_PATHS: ReadonlySet<string> = new Set(
  [ROUTES.root, ROUTES.privacy, ROUTES.terms, ROUTES.authCallback, ROUTES.admin].map(normalizePathname),
);

/** 화면 → 그 화면을 그리는 주소 묶음. 다시 동의는 온보딩 주소에서 그린다. */
const ROUTE_OF_SCREEN: Readonly<Record<Exclude<RootScreen, "loading">, RouteKind>> = {
  login: "login",
  onboarding: "onboarding",
  consent: "onboarding",
  main: "main",
};

/**
 * 주소 → 화면 묶음.
 * - / — 시작 주소(RootRedirect가 스스로 옮긴다), /privacy/ — 로그인·온보딩에서도 여는 문서(LoginView.swift:80, OnboardingFlowView.swift:305),
 *   /auth/callback/ — 로그인 공급자에서 돌아오는 주소, /admin/ — 관리자 화면: 늘 연다
 * - /login/, /onboarding/ — 그 화면일 때만(/onboarding/은 다시 동의 화면이기도 하다)
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
  if (route === ROUTE_OF_SCREEN[screen]) return { kind: "render" };
  return { kind: "redirect", to: SCREEN_PATH[screen] };
}

/**
 * 시작 주소("/")에서 옮겨 갈 곳 — 저장소를 읽기 전(loading)은 null(옮기지 않고 기다린다).
 * 로그인 전 → 로그인, 로그인했으면(게스트 포함) 앱 홈 탭. 온보딩 중·다시 동의가 필요한 사람은 앱 홈에서 관문이
 * 온보딩(또는 다시 동의)으로 한 번 더 옮긴다 — 시작 주소는 계정이 있는지만 본다. 어느 쪽도 "/"로 되돌아오지 않는다.
 */
export function rootPathFor(screen: RootScreen): string | null {
  switch (screen) {
    case "loading":
      return null;
    case "login":
      return ROUTES.login;
    case "onboarding":
    case "consent":
    case "main":
      return ROUTES.home;
  }
}
