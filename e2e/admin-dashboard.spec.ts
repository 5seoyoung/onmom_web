// 관리자 대시보드를 실제 브라우저에서 — 색 대비(axe color-contrast)·글자 150%·Chrome 글꼴 크기 24px·확대·320px. "zoom" 프로젝트(Chromium)에서만.
// 대시보드는 Supabase 관리자 세션이 있어야 그려진다(정적 빌드에서는 "권한이 없어요"까지). 그래서:
//   1) src/features/admin/adminA11y.test.ts(jsdom + 가짜 AdminClient)를 이 자리에서 한 번 돌려, 데이터가 다 온 대시보드의 <main> 마크업을 받는다
//      (지금 소스 그대로 — 저장해 둔 사본이 아니다. 계정 찾기 결과·CSV 접근 기록 실패 안내까지 연 상태).
//   2) 빌드된 /admin/ 페이지를 열어 그 문서(같은 CSS·글꼴·CSP)에서 스크립트를 빼고 <main>만 바꾼 페이지를 같은 사이트 주소로 띄운다.
//   3) 그 페이지를 모드마다 잰다. 이름·역할·제목 같은 구조 규칙은 1)의 jsdom 검사가 이미 본다.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CDPSession, Page } from "@playwright/test";
import { SERVER_BUILD_SKIP, expect, test } from "./support/app";
import { expectNoAxeViolations } from "./support/axe";
import { expectNoLayoutProblems } from "./support/layout";

const ROOT = join(__dirname, "..");
let markup = "";

test.beforeAll(async ({ browserOnly }, testInfo) => {
  // 서버 모드 빌드(CI 두 번째 시험)에서는 건너뛴다 — CSS·마크업은 같고, 그 빌드의 /admin/은 Supabase 세션을 찾는다
  if (!browserOnly) return;
  const out = join(testInfo.project.outputDir, "admin-dashboard-main.html");
  execFileSync(process.execPath, [join(ROOT, "node_modules/vitest/vitest.mjs"), "run", "src/features/admin/adminA11y.test.ts"], {
    cwd: ROOT,
    env: { ...process.env, ONMOM_ADMIN_MARKUP_OUT: out, CI: "1" },
    stdio: "pipe",
  });
  markup = readFileSync(out, "utf8");
});

interface Mode {
  label: string;
  viewport: { width: number; height: number };
  text?: "root150" | "chromeFont24";
  /** 색 대비까지 재는 모드(글자 크기만 바꾼 모드는 색이 같아 배치만) */
  axe?: boolean;
}

const MODES: readonly Mode[] = [
  { label: "폰 402", viewport: { width: 402, height: 874 }, axe: true },
  { label: "PC 1440", viewport: { width: 1440, height: 900 }, axe: true },
  { label: "폰 글자 150%", viewport: { width: 402, height: 874 }, text: "root150" },
  { label: "PC 글자 150%", viewport: { width: 1440, height: 900 }, text: "root150" },
  { label: "PC Chrome 글꼴 크기 아주 큼(24px)", viewport: { width: 1440, height: 900 }, text: "chromeFont24" },
  { label: "폰 확대 150%", viewport: { width: 268, height: 583 } },
  { label: "PC 확대 150%", viewport: { width: 960, height: 600 } },
  { label: "320px 폭", viewport: { width: 320, height: 640 } },
];

async function openDashboard(page: Page, cdp: CDPSession, url: string, mode: Mode): Promise<void> {
  await page.setViewportSize(mode.viewport);
  // 한 페이지로 모드를 차례로 돈다 — 브라우저 기본 글자 크기는 이 CDP 세션이 살아 있는 동안 페이지에 남으므로 모드마다 다시 정한다
  await cdp.send("Page.setFontSizes", { fontSizes: { standard: mode.text === "chromeFont24" ? 24 : 16 } });
  await page.goto(url);
  if (mode.text === "root150") await page.evaluate(() => (document.documentElement.style.fontSize = "150%"));
  const expected = mode.text === undefined ? "16px" : "24px";
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe(expected);
  await expect(page.getByRole("heading", { level: 1, name: "온맘 관리자" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

test("관리자 대시보드(가짜 행) — 대비·글자 150%·확대·320px", async ({ page, baseURL, browserOnly }) => {
  test.skip(!browserOnly, SERVER_BUILD_SKIP);
  expect(markup).toContain("admin_audit");
  await page.goto("./admin/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const shell = await page.content();
  expect(shell.match(/<main[\s>]/g)).toHaveLength(1);
  const html = shell.replace(/<script\b[\s\S]*?<\/script>/g, "").replace(/<main[\s>][\s\S]*<\/main>/, () => markup);
  const url = new URL("./__admin-dashboard-a11y__/", baseURL).href;
  await page.route(url, (route) => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html }));

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Page.enable");
  for (const mode of MODES) {
    await openDashboard(page, cdp, url, mode);
    // 접근 기록 안내가 보인다(모든 모드)
    await expect(page.getByText("admin_audit 표에", { exact: false }).first()).toBeVisible();
    if (mode.axe) await expectNoAxeViolations(page, `관리자 대시보드 — ${mode.label}`);
    await expectNoLayoutProblems(page, `관리자 대시보드 — ${mode.label}`);
  }
});
