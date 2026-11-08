// 검색 노출 — 스위치(NEXT_PUBLIC_SITE_INDEXABLE) 하나가 robots.txt·sitemap.xml·화면마다의 robots 메타를 같은 목록(SEARCH_INDEX_ROUTES)으로 정하는지.
// robots.txt·sitemap.xml은 빌드가 쓰는 그대로 — src/app/robots.ts·sitemap.ts의 기본 내보내기를 불러 Next의 직렬화 함수로 글을 만든다.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveRobots, resolveSitemap } from "next/dist/build/webpack/loaders/metadata/resolve-route-data";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SEARCH_INDEX_ROUTES } from "@/config";
import { ROUTES, type RouteName } from "@/routes";
import { LINK_PREVIEW_BOTS, robotsRules, sitemapEntries } from "./searchIndex";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const APP = join(ROOT, "src", "app");
const SITE = "https://onmomcare.app/";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

/** 그 빌드 값으로 만든 out/robots.txt·out/sitemap.xml과 config(robotsFor) */
async function build(env: { indexable?: string; siteUrl?: string; basePath?: string }) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SITE_INDEXABLE", env.indexable ?? "");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", env.siteUrl ?? "");
  vi.stubEnv("NEXT_PUBLIC_BASE_PATH", env.basePath ?? "");
  const robots = (await import("@/app/robots")).default;
  const sitemap = (await import("@/app/sitemap")).default;
  const cfg = await import("@/config");
  return { robotsTxt: resolveRobots(robots()), sitemapXml: resolveSitemap(sitemap()), robotsFor: cfg.robotsFor, config: cfg.config };
}

const lines = (txt: string) => txt.split("\n").filter((l) => l.trim() !== "");

/** src/app 아래 page.tsx 전부(경로 묶음 "(app)" 포함) */
function pageFiles(dir = APP): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return pageFiles(p);
    return e.name === "page.tsx" ? [p] : [];
  });
}

/** "/" → src/app/page.tsx, "/privacy/" → src/app/privacy/page.tsx */
const pageFileOf = (route: string) => join(APP, ...route.split("/").filter(Boolean), "page.tsx");
const routeNameOf = (route: string) => (Object.keys(ROUTES) as RouteName[]).find((k) => ROUTES[k] === route)!;

describe("색인할 주소 목록", () => {
  it("시작 주소·처리방침·약관 셋 — 앱 관문의 공개 주소 중 안내 문서만(로그인 콜백·관리자 화면은 빼고)", () => {
    expect(SEARCH_INDEX_ROUTES).toEqual([ROUTES.root, ROUTES.privacy, ROUTES.terms]);
    for (const route of [ROUTES.authCallback, ROUTES.admin, ROUTES.login, ROUTES.onboarding, ROUTES.home]) expect(SEARCH_INDEX_ROUTES).not.toContain(route);
  });

  it("목록의 페이지는 자기 주소로 robotsFor를 부르고, 다른 페이지는 robots를 정하지 않는다(레이아웃의 robotsFor(\"app\") — noindex)", () => {
    for (const route of SEARCH_INDEX_ROUTES) {
      expect(readFileSync(pageFileOf(route), "utf8"), route).toContain(`robots: robotsFor(ROUTES.${routeNameOf(route)}),`);
    }
    const listed = new Set(SEARCH_INDEX_ROUTES.map(pageFileOf));
    for (const file of pageFiles().filter((f) => !listed.has(f))) {
      expect(readFileSync(file, "utf8"), relative(ROOT, file)).not.toMatch(/robotsFor\(|robots:/);
    }
    expect(readFileSync(join(APP, "layout.tsx"), "utf8")).toContain('robots: robotsFor("app"),');
  });
});

describe("꺼짐(기본 — 1.0 공개 전)", () => {
  it("robots.txt는 예전 정적 파일과 같은 규칙 — 모든 크롤러 Disallow: /, 링크 미리보기 봇만 Allow: /, Sitemap 줄 없음", async () => {
    const { robotsTxt } = await build({});
    expect(lines(robotsTxt)).toEqual([...LINK_PREVIEW_BOTS.map((b) => `User-Agent: ${b}`), "Allow: /", "User-Agent: *", "Disallow: /"]);
    expect(robotsTxt).not.toMatch(/sitemap/i);
  });

  it("sitemap.xml은 항목이 없다", async () => {
    const { sitemapXml } = await build({});
    expect(sitemapXml).toBe('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n');
  });

  it("값이 정확히 \"true\"가 아니면 꺼짐(1·TRUE·yes)", async () => {
    for (const indexable of ["1", "TRUE", "yes", "false"]) {
      const { robotsTxt, sitemapXml, config } = await build({ indexable, siteUrl: SITE });
      expect(config.siteIndexable, indexable).toBe(false);
      expect(robotsTxt).not.toContain("Allow: /$");
      expect(sitemapXml).not.toContain("<url>");
    }
  });

  it("화면마다 noindex", async () => {
    const { robotsFor } = await build({});
    for (const route of [...Object.values(ROUTES), "app" as const]) expect(robotsFor(route), route).toEqual({ index: false, follow: false });
  });
});

describe("켜짐(NEXT_PUBLIC_SITE_INDEXABLE=true — 아직 켜지 않는다)", () => {
  it("robots.txt — 목록의 주소만 정확히 허용하고 나머지는 계속 막는다, 미리보기 봇은 그대로, Sitemap은 사이트 주소 아래", async () => {
    const { robotsTxt } = await build({ indexable: "true", siteUrl: SITE });
    expect(lines(robotsTxt)).toEqual([
      ...LINK_PREVIEW_BOTS.map((b) => `User-Agent: ${b}`),
      "Allow: /",
      "User-Agent: *",
      "Allow: /$",
      "Allow: /privacy/$",
      "Allow: /terms/$",
      "Disallow: /",
      "Sitemap: https://onmomcare.app/sitemap.xml",
    ]);
  });

  it("sitemap.xml — 목록의 절대 주소(NEXT_PUBLIC_SITE_URL), 날짜 없이", async () => {
    const { sitemapXml } = await build({ indexable: "true", siteUrl: SITE });
    const locs = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual(["https://onmomcare.app/", "https://onmomcare.app/privacy/", "https://onmomcare.app/terms/"]);
    expect(sitemapXml).not.toContain("<lastmod>");
  });

  it("화면 메타 — 목록의 주소만 index·follow, 그 밖(로그인·관리자·앱 화면)은 noindex", async () => {
    const { robotsFor } = await build({ indexable: "true", siteUrl: SITE });
    for (const route of Object.values(ROUTES)) {
      const open = (SEARCH_INDEX_ROUTES as readonly string[]).includes(route);
      expect(robotsFor(route), route).toEqual({ index: open, follow: open });
    }
    expect(robotsFor("app")).toEqual({ index: false, follow: false });
  });

  it("하위 경로 빌드(GitHub 프로젝트 페이지)는 Allow·sitemap 주소에 basePath가 붙는다", async () => {
    const { robotsTxt, sitemapXml } = await build({ indexable: "true", siteUrl: "https://5seoyoung.github.io/onmom_web/", basePath: "/onmom_web" });
    expect(lines(robotsTxt)).toEqual(expect.arrayContaining(["Allow: /onmom_web/$", "Allow: /onmom_web/privacy/$", "Allow: /onmom_web/terms/$", "Sitemap: https://5seoyoung.github.io/onmom_web/sitemap.xml"]));
    expect(sitemapXml).toContain("<loc>https://5seoyoung.github.io/onmom_web/privacy/</loc>");
  });
});

describe("robotsRules·sitemapEntries — 빌드 값만으로 정해진다", () => {
  it("꺼짐이면 siteUrl·basePath와 무관하게 같다", () => {
    const off = robotsRules({ indexable: false, basePath: "", siteUrl: SITE });
    expect(robotsRules({ indexable: false, basePath: "/onmom_web", siteUrl: "https://5seoyoung.github.io/onmom_web/" })).toEqual(off);
    expect(sitemapEntries({ indexable: false, siteUrl: SITE })).toEqual([]);
  });
});
