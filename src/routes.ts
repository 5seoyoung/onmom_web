// 사이트 안 주소 — 링크·이동·앱 관문은 모두 여기 값을 쓴다(문자열 경로를 새로 적지 않는다, DEV_NOTES §4).
//
// - trailingSlash: true라 모두 "/"로 끝난다. 쿼리는 슬래시 뒤에 붙인다(`${ROUTES.chat}?from=home`).
// - basePath(/onmom_web)는 붙이지 않는다 — next/link·useRouter가 붙이고, usePathname은 떼고 준다.
// - "/"는 서비스 소개(랜딩)다. 앱의 홈 탭은 ROUTES.home("/home/").
// - 새 화면을 만들면 여기에 먼저 더한다. routes.test.ts가 src/app의 페이지 파일과 맞는지 확인한다.

export const ROUTES = {
  /** 서비스 소개 — 누구나 */
  landing: "/",
  /** 개인정보처리방침 — 누구나 */
  privacy: "/privacy/",
  /** 이용약관(초안 — 법률 검토 전) — 누구나. 서비스 소개 바닥글·설정·온보딩 동의 옆에서 연다(features/terms). */
  terms: "/terms/",
  /** 로그인 공급자에서 돌아오는 주소 — 누구나(아직 페이지 없음, 카카오 로그인 준비 중) */
  authCallback: "/auth/callback/",
  /**
   * 관리자 화면(집계·계정 메타데이터만, 건강 기록 없음) — 메뉴에 링크하지 않는다.
   * 앱 관문이 옮기지 않는 주소여야 한다(features/flow/gate.ts — 로그인·온보딩과 무관하게 그린다).
   * 권한은 화면이 Supabase의 is_admin()으로 스스로 확인하고, 데이터는 서버 함수가 막는다(supabase/migrations/0002_admin.sql).
   */
  admin: "/admin/",

  login: "/login/",
  onboarding: "/onboarding/",

  // 앱 — 로그인과 온보딩을 마친 뒤에만(src/app/(app))
  home: "/home/",
  exercise: "/exercise/",
  record: "/record/",
  journal: "/journal/",
  journalWrite: "/journal/write/",
  /** 글 상세 — `${ROUTES.journalPost}?id=…` */
  journalPost: "/journal/post/",
  profile: "/profile/",
  analyze: "/analyze/",
  guide: "/guide/",
  lifestyle: "/lifestyle/",
  support: "/support/",
  substance: "/substance/",
  chat: "/chat/",
  region: "/region/",
  settings: "/settings/",
  settingsProfile: "/settings/profile/",
} as const;

export type RouteName = keyof typeof ROUTES;
export type RoutePath = (typeof ROUTES)[RouteName];

/** 끝 슬래시를 지운 경로("/"는 그대로). 빈 값은 "/"로 본다. 주소 비교용. */
export function normalizePathname(pathname: string | null | undefined): string {
  let p = (pathname ?? "").trim();
  if (!p.startsWith("/")) p = `/${p}`;
  p = p.replace(/\/+$/, "");
  return p === "" ? "/" : p;
}

/**
 * pathname이 route 화면이거나 그 아래 화면인가 — 끝 슬래시는 무시하고, 접두만 같은 주소("/homework")는 아니다.
 * "/"(랜딩)는 정확히 "/"일 때만.
 */
export function isPathWithin(pathname: string | null | undefined, route: string): boolean {
  const p = normalizePathname(pathname);
  const r = normalizePathname(route);
  if (r === "/") return p === "/";
  return p === r || p.startsWith(`${r}/`);
}
