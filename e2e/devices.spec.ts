// 실기기 흉내(iphone = Playwright WebKit + iPhone 17 설명자, android = Chromium + Pixel 10 설명자 — 터치·모바일 뷰포트·dsf 3)에서
// 접근성 검사(axe)와 글자 150%의 일부. 게스트 흐름 전체(guest-flow.spec.ts)도 같은 프로젝트에서 돈다(playwright.config.ts).
// WebKit은 iOS Safari와 같은 엔진이지만 macOS·Linux용 빌드다 — VoiceOver·실제 Safari aA·날짜 선택기는 여기서 볼 수 없다(docs/ACCESSIBILITY.md §7).
import type { Page } from "@playwright/test";
import { SERVER_BUILD_SKIP, expect, screenReady, test } from "./support/app";
import { expectNoAxeViolations } from "./support/axe";
import { expectNoLayoutProblems, applyRootFontSize150 } from "./support/layout";

async function checkScreen(page: Page, label: string): Promise<void> {
  await screenReady(page);
  await expectNoAxeViolations(page, label);
  await expectNoLayoutProblems(page, label);
}

test("로그인 · 온보딩 출산 정보 — axe·배치", async ({ page, browserOnly }) => {
  await page.goto("./login/");
  await expect(page.getByRole("button", { name: "게스트로 시작" })).toBeVisible();
  await checkScreen(page, "로그인");
  test.skip(!browserOnly, SERVER_BUILD_SKIP);
  await page.getByRole("button", { name: "게스트로 시작" }).click();
  await page.getByRole("button", { name: "시작하기" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "출산 정보를 알려주세요" })).toBeVisible();
  await page.getByRole("textbox", { name: "출산일" }).fill("2026-09-29");
  await page.getByText("자연분만", { exact: true }).click();
  await checkScreen(page, "온보딩 2 출산 정보");
});

test.describe("온보딩을 마친 게스트", () => {
  test.use({ seed: "redFlag" });
  test.beforeEach(({ browserOnly }) => {
    test.skip(!browserOnly, SERVER_BUILD_SKIP);
  });

  test("홈 · 기록 결과 · AI 상담 · PDF 리포트 — axe·배치", async ({ page }) => {
    await page.goto("./home/");
    await expect(page.getByRole("region", { name: "산후 회복" })).toBeVisible();
    await checkScreen(page, "홈");

    await page.goto("./record/");
    await page.getByRole("switch", { name: "어지러움·실신·균형장애" }).click();
    await page.getByRole("button", { name: "확인하기" }).click();
    await expect(page.getByRole("main").getByRole("alert").first()).toBeVisible();
    await checkScreen(page, "기록 — 위험 신호 결과");

    await page.goto("./chat/");
    await page.getByRole("textbox", { name: "메시지를 입력하세요" }).fill("산후 운동은 언제부터 해도 되나요?");
    await page.getByRole("button", { name: "메시지 보내기" }).click();
    await expect(page.getByRole("main").getByText("산후 운동은 언제부터 해도 되나요?")).toBeVisible();
    await checkScreen(page, "AI 상담 — 답 하나");

    await page.goto("./settings/report/");
    await expect(page.getByRole("button", { name: "PDF로 저장" })).toBeVisible();
    await checkScreen(page, "PDF 리포트");
  });

  test("글자 150% — 홈 · 기록 · 기록장 글쓰기 · 설정 · PDF 리포트", async ({ page }) => {
    await applyRootFontSize150(page);
    for (const [label, path] of [
      ["홈", "./home/"],
      ["기록 — 입력", "./record/"],
      ["기록장 — 글쓰기", "./journal/write/"],
      ["설정", "./settings/"],
      ["PDF 리포트", "./settings/report/"],
    ] as const) {
      await page.goto(path);
      await screenReady(page);
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe("24px");
      await expectNoLayoutProblems(page, `글자 150% — ${label}`);
    }
  });
});
