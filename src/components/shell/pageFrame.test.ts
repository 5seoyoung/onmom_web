// PC 화면 틀 — 모든 앱 화면이 같은 틀을 쓰는지, 사이드바에 있는 화면만 PC에서 [뒤로]를 숨기는지(소스·마크업으로 확인).
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SubPageHeader } from "@/components/ui";
import { ROUTES } from "@/routes";
import { SERVICE_LINKS } from "./appNav";
import { PAGE_EDGE_TOP, PAGE_EDGE_X, PAGE_FRAME, READING_BLOCK, READING_WIDTH } from "./pageFrame";

const SRC = fileURLToPath(new URL("../../", import.meta.url));
const APP_GROUP = join(SRC, "app", "(app)");

function pageFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? pageFiles(join(dir, e.name)) : e.name === "page.tsx" ? [join(dir, e.name)] : [],
  );
}

/** src/app/(app)/(tabs)/journal/write/page.tsx → "/journal/write/" (묶음 폴더는 주소에 없다) */
function routeOf(pageFile: string): string {
  const segs = relative(join(SRC, "app"), pageFile).split(sep).slice(0, -1).filter((s) => !/^\(.*\)$/.test(s));
  return `/${segs.map((s) => `${s}/`).join("")}`;
}

/** 경로 파일이 그리는 화면 파일의 소스 — `import { …Screen } from "@/features/…"` */
function screenSource(pageFile: string): string {
  const m = /import \{ \w+Screen \} from "@\/features\/([^"]+)"/.exec(readFileSync(pageFile, "utf8"));
  if (!m) throw new Error(`화면 import를 찾지 못함: ${pageFile}`);
  return readFileSync(join(SRC, "features", `${m[1]}.tsx`), "utf8");
}

const APP_PAGES = pageFiles(APP_GROUP).map((file) => ({ file, route: routeOf(file) }));
const byRoute = (route: string) => {
  const page = APP_PAGES.find((p) => p.route === route);
  if (!page) throw new Error(`앱 화면 없음: ${route}`);
  return screenSource(page.file);
};

describe("PC 화면 틀(pageFrame)", () => {
  it("모든 값이 lg: 접두 — 폰·태블릿 화면에는 영향이 없다", () => {
    const all = [PAGE_FRAME.wide, PAGE_FRAME.reading, PAGE_EDGE_X, PAGE_EDGE_TOP, READING_WIDTH, READING_BLOCK].join(" ");
    for (const cls of all.split(/\s+/)) expect(cls.startsWith("lg:"), cls).toBe(true);
  });

  it("읽기 화면은 최대 48rem, 한 줄 블록은 그 글줄 폭(48 − 1.5×2 = 45rem), 격자 화면은 폭 제한 없음(껍데기 64rem)", () => {
    expect(PAGE_FRAME.reading).toContain("lg:max-w-[48rem]");
    expect(PAGE_EDGE_X).toBe("lg:px-6");
    expect(READING_BLOCK).toBe("lg:max-w-[45rem]");
    expect(PAGE_FRAME.wide).not.toMatch(/max-w/);
    // 가운데 정렬 없음(왼쪽 선이 모든 화면에서 같다)
    expect(`${PAGE_FRAME.wide} ${PAGE_FRAME.reading}`).not.toMatch(/mx-auto/);
  });

  it("앱 화면(src/app/(app))은 모두 이 틀을 쓴다", () => {
    expect(APP_PAGES.length).toBeGreaterThanOrEqual(16);
    for (const { file, route } of APP_PAGES) {
      const src = screenSource(file);
      expect(src, route).toMatch(/PAGE_FRAME\.(wide|reading)|PAGE_EDGE_TOP/);
      // 화면이 따로 가운데 기둥을 만들지 않는다(예전 AI 상담 mx-auto 44rem)
      expect(src, route).not.toMatch(/mx-auto w-full max-w-\[/);
    }
  });

  it("사이드바 서비스 7개는 PC에서 [뒤로]를 숨긴다", () => {
    expect(SERVICE_LINKS).toHaveLength(7);
    for (const { href } of SERVICE_LINKS) expect(byRoute(href), href).toMatch(/<SubPageHeader[^>]*\bhideBackWithSidebar\b/);
  });

  it("더 깊은 화면(프로필 편집·글쓰기·글 상세·분석)은 PC에서도 [뒤로]를 같은 자리에 둔다", () => {
    for (const route of [ROUTES.settingsProfile, ROUTES.journalWrite, ROUTES.journalPost, ROUTES.analyze]) {
      expect(byRoute(route), route).not.toMatch(/hideBackWithSidebar/);
    }
  });
});

describe("SubPageHeader [뒤로]", () => {
  const backLink = (html: string) => /<a [^>]*>/.exec(html)?.[0] ?? "";

  it("기본: 모든 폭에서 보인다", () => {
    const html = renderToStaticMarkup(h(SubPageHeader, { title: "설정", backHref: ROUTES.profile }));
    // 테스트 환경의 Link는 trailingSlash 설정이 없어 끝 슬래시를 뗀다
    expect(backLink(html)).toMatch(/href="\/profile\/?"/);
    expect(backLink(html)).not.toMatch(/lg:hidden/);
  });

  it("hideBackWithSidebar: 사이드바가 보이는 폭(lg)에서만 숨는다 — 폰·태블릿은 그대로", () => {
    const html = renderToStaticMarkup(h(SubPageHeader, { title: "설정", backHref: ROUTES.profile, hideBackWithSidebar: true }));
    const link = backLink(html);
    expect(link).toMatch(/\blg:hidden\b/);
    expect(link).not.toMatch(/(^|\s|")hidden\b/);
    expect(html).toContain("<h1");
  });
});
