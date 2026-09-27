import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { routeKindFor } from "@/features/flow/gate";
import { isPathWithin, normalizePathname, ROUTES } from "./routes";

const APP_DIR = fileURLToPath(new URL("./app", import.meta.url));

/** src/app 아래 page.tsx → 주소. 묶음 폴더 "(이름)"은 주소에 들어가지 않는다. trailingSlash: true라 "/"로 끝낸다. */
function pageRoutes(): { path: string; inAppGroup: boolean }[] {
  const out: { path: string; inAppGroup: boolean }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "page.tsx") {
        const segments = relative(APP_DIR, dir).split(sep).filter((s) => s !== "");
        const urlSegments = segments.filter((s) => !(s.startsWith("(") && s.endsWith(")")));
        out.push({ path: urlSegments.length === 0 ? "/" : `/${urlSegments.join("/")}/`, inAppGroup: segments[0] === "(app)" });
      }
    }
  };
  walk(APP_DIR);
  return out;
}

/** 아직 페이지가 없어도 되는 주소 — 카카오 로그인 콜백(서버 준비 전) */
const NO_PAGE_YET: ReadonlySet<string> = new Set([ROUTES.authCallback]);

describe("ROUTES", () => {
  const values = Object.values(ROUTES);

  it("모두 /로 시작하고 끝난다(trailingSlash)·겹치지 않는다", () => {
    for (const v of values) expect(v).toMatch(/^\/(?:[a-z]+\/)*$/);
    expect(new Set(values).size).toBe(values.length);
  });

  it("서비스 소개는 /, 앱 홈 탭은 /home/", () => {
    expect(ROUTES.landing).toBe("/");
    expect(ROUTES.home).toBe("/home/");
  });

  it("src/app의 모든 페이지에 ROUTES 값이 있다", () => {
    const pages = pageRoutes().map((r) => r.path);
    expect(pages.length).toBeGreaterThan(0);
    for (const p of pages) expect(values).toContain(p);
  });

  it("모든 ROUTES 값에 페이지가 있다(로그인 콜백 제외)", () => {
    const pages = new Set(pageRoutes().map((r) => r.path));
    for (const v of values) if (!NO_PAGE_YET.has(v)) expect(pages).toContain(v);
  });

  it("(app) 묶음 페이지는 모두 관문이 지키고(main), 묶음 밖 페이지는 아니다", () => {
    for (const { path, inAppGroup } of pageRoutes()) {
      if (inAppGroup) expect(routeKindFor(path), path).toBe("main");
      else expect(routeKindFor(path), path).not.toBe("main");
    }
  });

  it("개발용 카탈로그(/dev/)는 없다", () => {
    expect(pageRoutes().some((r) => r.path.startsWith("/dev/"))).toBe(false);
  });
});

describe("normalizePathname", () => {
  it("끝 슬래시를 무시하고 빈 값은 /", () => {
    expect(normalizePathname("/home/")).toBe("/home");
    expect(normalizePathname("/home")).toBe("/home");
    expect(normalizePathname("/")).toBe("/");
    expect(normalizePathname(undefined)).toBe("/");
  });
});

describe("isPathWithin", () => {
  it("같은 화면이거나 그 아래 화면", () => {
    expect(isPathWithin("/home/", ROUTES.home)).toBe(true);
    expect(isPathWithin("/home", ROUTES.home)).toBe(true);
    expect(isPathWithin("/journal/write/", ROUTES.journal)).toBe(true);
    expect(isPathWithin("/journal/post", ROUTES.journal)).toBe(true);
  });

  it("접두만 같은 주소·다른 화면은 아니다", () => {
    expect(isPathWithin("/homework/", ROUTES.home)).toBe(false);
    expect(isPathWithin("/", ROUTES.home)).toBe(false);
    expect(isPathWithin("/record/", ROUTES.journal)).toBe(false);
  });

  it("서비스 소개(/)는 정확히 /일 때만", () => {
    expect(isPathWithin("/", ROUTES.landing)).toBe(true);
    expect(isPathWithin("/home/", ROUTES.landing)).toBe(false);
    expect(isPathWithin(null, ROUTES.landing)).toBe(true);
  });
});
