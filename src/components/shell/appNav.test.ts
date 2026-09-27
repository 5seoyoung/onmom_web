import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import content from "@/content";
import { routeKindFor } from "@/features/flow/gate";
import { PROFILE_MENU } from "@/features/profile/profileView";
import { ROUTES } from "@/routes";
import { APP_NAV_TEXT, APP_TABS, isNavItemActive, SERVICE_LINKS } from "./appNav";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("앱 메뉴 정의", () => {
  it("탭 5개 — 홈/운동/기록/기록장/프로필 순서, 앱 홈은 /home/", () => {
    expect(APP_TABS.map((t) => t.label)).toEqual(["홈", "운동", "기록", "기록장", "프로필"]);
    expect(APP_TABS.map((t) => t.href)).toEqual([ROUTES.home, ROUTES.exercise, ROUTES.record, ROUTES.journal, ROUTES.profile]);
  });

  it("서비스 7개는 프로필 허브와 같은 순서·제목·주소(한 곳에서 가져옴)", () => {
    expect(SERVICE_LINKS).toHaveLength(7);
    expect(SERVICE_LINKS.map((s) => [s.key, s.label, s.href])).toEqual(PROFILE_MENU.map((m) => [m.key, m.title, m.href]));
  });

  it("모든 메뉴 주소는 로그인 뒤 앱 화면(관문 main)이고 서로 겹치지 않는다", () => {
    const hrefs = [...APP_TABS.map((t) => t.href), ...SERVICE_LINKS.map((s) => s.href)];
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const h of hrefs) {
      expect(Object.values(ROUTES)).toContain(h);
      expect(routeKindFor(h), h).toBe("main");
    }
  });

  it("면책 문구는 content.json 원문 그대로", () => {
    expect(APP_NAV_TEXT.disclaimer).toBe(content.disclaimers.home_footer);
  });
});

describe("isNavItemActive — 지금 화면 표시", () => {
  const activeTabs = (path: string) => APP_TABS.filter((t) => isNavItemActive(path, t.href)).map((t) => t.label);
  const activeServices = (path: string) => SERVICE_LINKS.filter((s) => isNavItemActive(path, s.href)).map((s) => s.label);

  it("탭 화면마다 탭 하나만 켜진다(끝 슬래시 무시)", () => {
    expect(activeTabs("/home/")).toEqual(["홈"]);
    expect(activeTabs("/home")).toEqual(["홈"]);
    expect(activeTabs("/record/")).toEqual(["기록"]);
    expect(activeTabs("/profile/")).toEqual(["프로필"]);
  });

  it("아래 화면도 부모 항목을 켠다 — 글쓰기·글 상세 → 기록장, 프로필 편집 → 설정", () => {
    expect(activeTabs("/journal/write/")).toEqual(["기록장"]);
    expect(activeTabs("/journal/post/")).toEqual(["기록장"]);
    expect(activeServices("/settings/profile/")).toEqual(["설정"]);
  });

  it("서비스 화면에서는 탭이 켜지지 않고 그 서비스만 켜진다", () => {
    expect(activeTabs("/chat/")).toEqual([]);
    expect(activeServices("/chat/")).toEqual(["AI 상담"]);
    expect(activeServices("/guide/")).toEqual(["회복 가이드"]);
  });

  it("서비스 소개(/)·접두만 같은 주소·메뉴 밖 화면에서는 아무것도 켜지지 않는다", () => {
    for (const p of ["/", "/homework/", "/recordings/", "/analyze/"]) {
      expect(activeTabs(p), p).toEqual([]);
      expect(activeServices(p), p).toEqual([]);
    }
  });
});

// 폰 = 하단 탭바, PC = 사이드바. 둘의 경계(lg)가 어긋나면 둘 다 보이거나 둘 다 사라진다.
describe("껍데기 경계 — 탭바와 사이드바는 같은 lg에서 바뀐다", () => {
  it("탭바는 lg에서 숨고, 사이드바는 lg에서만 보인다", () => {
    const tabBar = read("../TabBar.tsx");
    const sideNav = read("./SideNav.tsx");
    expect(tabBar).toMatch(/className="[^"]*\blg:hidden\b[^"]*"/);
    expect(sideNav).toMatch(/className="[^"]*\bhidden\b[^"]*\blg:flex\b[^"]*"/);
  });

  it("앱 묶음 레이아웃이 AppShell을, 탭 레이아웃이 TabBar를 쓴다", () => {
    expect(read("../../app/(app)/layout.tsx")).toMatch(/<AppShell>/);
    expect(read("../../app/(app)/(tabs)/layout.tsx")).toMatch(/<TabBar \/>/);
  });

  it("로그인·온보딩·처리방침은 사이드바 없는 CardColumn", () => {
    for (const p of ["login", "onboarding", "privacy"]) {
      const src = read(`../../app/${p}/page.tsx`);
      expect(src, p).toMatch(/<CardColumn>/);
      expect(src, p).not.toMatch(/AppShell|SideNav/);
    }
  });
});
