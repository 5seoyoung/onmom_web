// 서비스 소개 머리의 로고("온맘") 동작 — 판단만 순수 함수로(LandingHomeLink.tsx가 브라우저 값을 넘긴다).
//
// - 서비스 소개("/")에서 누르면: 페이지 맨 위(히어로)로 부드럽게 올라간다. 움직임 줄이기(prefers-reduced-motion)면 바로 올라간다.
//   주소의 섹션 조각(#features 등)은 지운다 — 새로고침·공유해도 맨 위에서 열리게. 방문 기록은 늘리지 않는다(replace).
//   Next Link는 같은 주소로의 이동에서 스크롤을 옮기지 않아(스크롤 유지) 전에는 눌러도 아무 일이 없었다.
// - 다른 화면에서 누르면(이 머리는 서비스 소개에만 있지만 막지 않는다): 보통 링크처럼 서비스 소개로 이동하고,
//   Next가 새 화면의 맨 위로 옮긴다.
// - 새 탭·새 창(가운데 버튼, Ctrl·⌘·Shift·Alt 누름)이나 다른 처리기가 이미 막은 누름은 건드리지 않는다.

import { isPathWithin, ROUTES } from "@/routes";

export interface LogoClick {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
}

/** 이 누름을 가로채 서비스 소개의 맨 위로 스크롤할까 — 아니면 링크가 평소대로 이동한다(지금 주소를 모르면 이동). */
export function shouldScrollToLandingTop(pathname: string | null | undefined, click: LogoClick): boolean {
  if (pathname === null || pathname === undefined) return false;
  if (click.defaultPrevented || click.button !== 0) return false;
  if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return false;
  return isPathWithin(pathname, ROUTES.landing);
}

/** 맨 위로 가는 방식 — 움직임 줄이기면 바로(instant), 아니면 부드럽게(smooth). */
export function landingScrollBehavior(prefersReducedMotion: boolean): ScrollBehavior {
  return prefersReducedMotion ? "instant" : "smooth";
}

/** 섹션 조각을 뗀 지금 주소(basePath 포함 그대로) — 조각이 없으면 null(주소를 바꿀 필요 없음). */
export function urlWithoutHash(location: { pathname: string; search: string; hash: string }): string | null {
  return location.hash ? `${location.pathname}${location.search}` : null;
}
