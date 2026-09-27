// 앱 메뉴 정의 — 폰의 하단 탭바(components/TabBar.tsx)와 PC의 왼쪽 사이드바(SideNav.tsx)가 같이 쓴다.
// 탭 5개는 여기 한 곳에, 서비스 7개는 프로필 허브(features/profile/profileView PROFILE_MENU)를 그대로 가져온다 — 다시 적지 않는다.

import { BookHeart, ClipboardPen, House, PersonStanding, UserRound, type LucideIcon } from "lucide-react";
import content from "@/content";
import { PROFILE_MENU } from "@/features/profile/profileView";
import { isPathWithin, ROUTES } from "@/routes";

export interface AppTab {
  href: string;
  label: string;
  Icon: LucideIcon;
}

/** 하단 탭 5개(01 §2) — 순서·라벨은 RootView.swift:39-51, SF Symbol → lucide 근사 아이콘. */
export const APP_TABS: readonly AppTab[] = [
  { href: ROUTES.home, label: "홈", Icon: House }, // 원문: RootView.swift:39
  { href: ROUTES.exercise, label: "운동", Icon: PersonStanding }, // 원문: RootView.swift:42
  { href: ROUTES.record, label: "기록", Icon: ClipboardPen }, // 원문: RootView.swift:45
  { href: ROUTES.journal, label: "기록장", Icon: BookHeart }, // 원문: RootView.swift:48
  { href: ROUTES.profile, label: "프로필", Icon: UserRound }, // 원문: RootView.swift:51
];

export interface ServiceLink {
  key: string;
  href: string;
  label: string;
}

/** 서비스 7개 — 프로필 허브와 같은 순서·같은 제목(ProfileView.swift:18-26). */
export const SERVICE_LINKS: readonly ServiceLink[] = PROFILE_MENU.map(({ key, href, title }) => ({ key, href, label: title }));

export const APP_NAV_TEXT = {
  brand: "온맘", // 원문: HomeView.swift:63 · LoginView.swift:26
  // 웹 신규 문구 — CPO 확인 필요 (하단 탭바·PC 사이드바 nav 낭독 이름, 안 보임. 둘 중 하나만 보인다: 폰 = 탭바, PC = 사이드바)
  navLabel: "주요 메뉴",
  // 웹 신규 문구 — CPO 확인 필요 (PC 사이드바의 서비스 7개 묶음 이름. iOS 프로필 탭이 흡수한 옛 '더보기' 탭 — ProfileView.swift:4)
  servicesLabel: "더보기",
  // 웹 신규 문구 — CPO 확인 필요 (PC에서 키보드로 사이드바 메뉴 13개를 건너뛰는 링크. 초점을 받을 때만 보임)
  skipToContent: "본문 바로가기",
  disclaimer: content.disclaimers.home_footer, // = HomeView.swift:27
} as const;

/** 메뉴 항목이 지금 화면인가 — 아래 화면도 포함(기록장 탭은 글쓰기·글 상세에서도, 설정은 프로필 편집에서도 켜진다). */
export function isNavItemActive(pathname: string | null | undefined, href: string): boolean {
  return isPathWithin(pathname, href);
}
