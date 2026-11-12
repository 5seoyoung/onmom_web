// 글자 150% · 브라우저 확대 150% · 320px 폭에서 화면이 깨지지 않는지 — docs/dev/ACCESSIBILITY.md §1-1·§3을 시험으로 옮긴 것("zoom" 프로젝트, Chromium).
// 무엇이 실제 설정을 흉내 내나:
//   - text150(폰 402·PC 1440): <html> font-size 150%. 이 사이트의 글자는 모두 rem이라 Android Chrome "텍스트 크기 조정"·iOS Safari aA 글자 크기처럼
//     글자만 1.5배가 되고 화면 폭(미디어쿼리)은 그대로다. deviceScaleFactor는 확대가 아니다(픽셀 밀도만 바뀜).
//   - chromeFont24(PC 1440): 데스크톱 Chrome 설정 > 모양 > 글꼴 크기 "아주 큼"(기본 16 → 24px) — CDP Page.setFontSizes로 브라우저 기본값 자체를 바꾼다.
//     이때는 미디어쿼리의 rem도 24px 기준이라 lg(64rem = 1536px)가 꺼져 1440 창에서도 폰·태블릿 배치가 된다(text150과 다름).
//   - zoom150(폰·PC): 브라우저 확대(Ctrl/⌘ +) 150% = CSS 폭이 1/1.5 — 폰 268×583(dsf 3), PC 960×600(dsf 1.5). 미디어쿼리도 그 폭으로 바뀐다.
//   - reflow320: WCAG 1.4.10 — 320 CSS px(1280px 창의 400% 확대와 같음)에서 가로 스크롤 없이 읽혀야 한다.
// 화면마다 e2e/support/layout.ts가 가로 넘침·화면 밖 요소·잘린 글자·짓눌린 글자·가려진 컨트롤을 잰다.
import type { CDPSession, Page } from "@playwright/test";
import { SERVER_BUILD_SKIP, expect, screenReady, test, type SeedName } from "./support/app";
import { expectNoLayoutProblems, applyRootFontSize150 } from "./support/layout";
import { SEED_POST_ID } from "./support/seed";

type TextMode = "none" | "root150" | "chromeFont24";

interface Mode {
  id: string;
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  text: TextMode;
}

const MODES: readonly Mode[] = [
  { id: "폰 글자 150%", viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, text: "root150" },
  { id: "폰 확대 150%", viewport: { width: 268, height: 583 }, deviceScaleFactor: 3, text: "none" },
  { id: "PC 글자 150%", viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, text: "root150" },
  { id: "PC Chrome 글꼴 크기 아주 큼(24px)", viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, text: "chromeFont24" },
  { id: "PC 확대 150%", viewport: { width: 960, height: 600 }, deviceScaleFactor: 1.5, text: "none" },
  { id: "320px 폭(재배치)", viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, text: "none" },
];

/** 글자 모드를 건다. Chrome 글꼴 크기는 CDP 세션이 살아 있는 동안만 유지되므로(세션을 끊으면 16px로 돌아간다) 세션을 돌려준다 — 시험 끝까지 쥐고 있는다 */
async function applyTextMode(page: Page, mode: TextMode): Promise<CDPSession | null> {
  if (mode === "root150") await applyRootFontSize150(page);
  if (mode !== "chromeFont24") return null;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Page.enable");
  await cdp.send("Page.setFontSizes", { fontSizes: { standard: 24 } });
  return cdp;
}

/** 지금 화면의 글자 크기가 이 모드의 것인가 — 시험이 아무것도 바꾸지 않은 채(또는 도중에 풀린 채) 통과하지 않게 */
async function expectTextMode(page: Page, mode: TextMode): Promise<void> {
  const [fontSize, lg] = await page.evaluate(() => [getComputedStyle(document.documentElement).fontSize, matchMedia("(min-width: 64rem)").matches]);
  expect(fontSize, "루트 글자 크기").toBe(mode === "none" ? "16px" : "24px");
  // Chrome 글꼴 크기 24px이면 미디어쿼리의 rem도 24px — 1440 창에서도 lg(64rem = 1536px)가 꺼진다. 저자 CSS 150%는 미디어쿼리를 바꾸지 않는다.
  if (mode === "chromeFont24") expect(lg, "lg 미디어쿼리").toBe(false);
}

/** 화면을 열고(또는 지금 화면에서) 다 그려진 뒤 잰다 */
async function check(page: Page, mode: Mode, label: string, path?: string): Promise<void> {
  if (path !== undefined) await page.goto(path);
  await screenReady(page);
  await expectTextMode(page, mode.text);
  await expectNoLayoutProblems(page, label);
}

for (const mode of MODES) {
  test.describe(mode.id, () => {
    test.use({ viewport: mode.viewport, deviceScaleFactor: mode.deviceScaleFactor });
    let cdp: CDPSession | null = null;
    test.beforeEach(async ({ page }) => {
      cdp = await applyTextMode(page, mode.text);
    });
    test.afterEach(async () => {
      await cdp?.detach();
      cdp = null;
    });

    test.describe("처음 온 사람", () => {
      test("로그인·시트·처리방침·이용약관·관리자", async ({ page }) => {
        await page.goto("./login/");
        await expect(page.getByRole("button", { name: "게스트로 시작" })).toBeVisible();
        await check(page, mode, "로그인");
        await page.getByRole("button", { name: "개인정보처리방침 보기" }).click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await expectNoLayoutProblems(page, "로그인 > 개인정보처리방침 시트");
        await page.keyboard.press("Escape");
        await check(page, mode, "개인정보처리방침", "./privacy/");
        await check(page, mode, "이용약관", "./terms/");
        await check(page, mode, "관리자(권한 없음)", "./admin/");
      });

      test("온보딩 4단계", async ({ page, browserOnly }) => {
        test.skip(!browserOnly, SERVER_BUILD_SKIP);
        await page.goto("./login/");
        await page.getByRole("button", { name: "게스트로 시작" }).click();
        await expect(page.getByRole("button", { name: "시작하기" })).toBeVisible();
        await check(page, mode, "온보딩 1");
        await page.getByRole("button", { name: "시작하기" }).click();
        await expect(page.getByRole("heading", { level: 1, name: "출산 정보를 알려주세요" })).toBeVisible();
        await page.getByRole("textbox", { name: "출산일" }).fill("2026-09-29");
        await page.getByText("자연분만", { exact: true }).click();
        await check(page, mode, "온보딩 2 출산 정보(날짜 줄)");
        await page.getByRole("button", { name: "다음" }).click();
        await expect(page.getByRole("heading", { level: 1, name: "목표를 설정해주세요" })).toBeVisible();
        await page.locator("label").filter({ has: page.getByRole("radio", { name: /^복직/ }) }).click();
        await check(page, mode, "온보딩 3 목표(복직 예정일 줄)");
        await page.getByRole("button", { name: "다음" }).click();
        await expect(page.getByRole("heading", { level: 1, name: "데이터 이용에 동의해주세요" })).toBeVisible();
        for (const summary of await page.locator("details > summary").all()) await summary.click();
        await check(page, mode, "온보딩 4 동의(펼침)");
      });
    });

    const seeded = (seed: SeedName) => {
      test.use({ seed });
      test.beforeEach(({ browserOnly }) => {
        test.skip(!browserOnly, SERVER_BUILD_SKIP);
      });
    };

    test.describe("게스트 — 주요 탭", () => {
      seeded("redFlag");

      test("홈·운동·기록(입력·결과)·회복 분석(폼·결과)", async ({ page }) => {
        await check(page, mode, "홈(위험 신호·마음 카드)", "./home/");
        await check(page, mode, "운동(멈춤)", "./exercise/");
        await page.goto("./record/");
        await expect(page.getByRole("button", { name: "확인하기" })).toBeVisible();
        await check(page, mode, "기록 — 입력");
        await page.getByRole("switch", { name: "어지러움·실신·균형장애" }).click();
        await page.getByRole("button", { name: "확인하기" }).click();
        await expect(page.getByRole("main").getByRole("alert").first()).toBeVisible();
        await check(page, mode, "기록 — 위험 신호 결과");
        await page.goto("./analyze/");
        await expect(page.getByRole("button", { name: "분석 시작" })).toBeVisible();
        await check(page, mode, "회복 분석 — 폼(출산일 줄)");
        await page.getByRole("button", { name: "분석 시작" }).click();
        await expect(page.getByRole("button", { name: "분석 시작" })).toHaveCount(0);
        await check(page, mode, "회복 분석 — 결과");
      });

      test("전체 기록·삭제 확인 창·기록 수정", async ({ page }) => {
        await page.goto("./record/history/");
        const records = page.getByRole("region", { name: "증상 기록" });
        await expect(records.getByRole("button", { name: /삭제/ }).first()).toBeVisible();
        await check(page, mode, "전체 기록");
        await records.getByRole("button", { name: /삭제/ }).first().click();
        await expect(page.getByRole("dialog", { name: "이 기록을 삭제할까요?" })).toBeVisible();
        await expectNoLayoutProblems(page, "전체 기록 — 삭제 확인 창");
        await page.keyboard.press("Escape");
        await page.goto("./record/edit/?id=e2e-today");
        await expect(page.getByRole("switch", { name: "어지러움·실신·균형장애" })).toBeChecked();
        await check(page, mode, "기록 수정");
      });

      test("기록장(목록·글쓰기·글·수정)·AI 상담", async ({ page }) => {
        await page.goto("./journal/");
        await expect(page.getByText("둘째 주 산책")).toBeVisible();
        await check(page, mode, "기록장 — 목록");
        await check(page, mode, "기록장 — 글쓰기", "./journal/write/");
        await page.goto(`./journal/post/?id=${SEED_POST_ID}`);
        await expect(page.getByText("무리하지 않기")).toBeVisible();
        await check(page, mode, "기록장 — 글 상세");
        await page.goto(`./journal/edit/?id=${SEED_POST_ID}`);
        await expect(page.getByRole("textbox", { name: /제목/ })).toHaveValue("둘째 주 산책");
        await check(page, mode, "기록장 — 글 수정");
        await page.goto("./chat/");
        const input = page.getByRole("textbox", { name: "메시지를 입력하세요" });
        await input.fill("산후 운동은 언제부터 해도 되나요?");
        await page.getByRole("button", { name: "메시지 보내기" }).click();
        await expect(page.getByRole("main").getByText("산후 운동은 언제부터 해도 되나요?")).toBeVisible();
        await check(page, mode, "AI 상담 — 답 하나");
      });
    });

    test.describe("게스트 — 더보기·설정", () => {
      seeded("redFlag");

      test("가이드·생활·지원사업·약물 체크·지역 연계·프로필", async ({ page }) => {
        await check(page, mode, "가이드", "./guide/");
        await check(page, mode, "생활", "./lifestyle/");
        await page.goto("./support/");
        for (const box of (await page.getByRole("checkbox").all()).slice(0, 3)) await box.check({ force: true });
        await page.getByRole("button", { name: "추천 받기" }).click();
        await check(page, mode, "지원사업 — 추천 결과");
        await page.goto("./substance/");
        await page.getByRole("searchbox").fill("코데인");
        await page.getByRole("button", { name: "확인하기" }).click();
        await expect(page.getByRole("heading", { level: 2, name: "코데인" })).toBeVisible();
        await check(page, mode, "약물 체크 — 코데인");
        await check(page, mode, "지역 연계", "./region/");
        await check(page, mode, "프로필", "./profile/");
      });

      test("설정·계정 삭제 창·프로필 편집·PDF 리포트·404", async ({ page, guard, baseURL }) => {
        await page.goto("./settings/");
        await expect(page.getByRole("button", { name: /^계정 삭제/ })).toBeVisible();
        await check(page, mode, "설정");
        await page.getByRole("button", { name: /^계정 삭제/ }).click();
        await expect(page.getByRole("dialog", { name: "계정을 삭제할까요?" })).toBeVisible();
        await expectNoLayoutProblems(page, "설정 — 계정 삭제 창");
        await page.keyboard.press("Escape");
        await check(page, mode, "설정 — 프로필 편집", "./settings/profile/");
        await page.goto("./settings/report/");
        await expect(page.getByRole("button", { name: "PDF로 저장" })).toBeVisible();
        await page.getByRole("checkbox", { name: "기록장 글 포함" }).check();
        await check(page, mode, "PDF 리포트(기록장 글 포함 — 판 표시 있음·없음)");
        const unknown = new URL("./no-such-page/", baseURL).href;
        guard.allowNotFound(unknown);
        await page.goto(unknown);
        await expect(page.getByRole("heading", { level: 1, name: "페이지를 찾을 수 없어요" })).toBeVisible();
        await check(page, mode, "404");
      });
    });

    test.describe("게스트 — 오늘 신호 없음", () => {
      seeded("normal");

      test("홈·운동(단계 안내)", async ({ page }) => {
        await check(page, mode, "홈(신호 없음)", "./home/");
        await check(page, mode, "운동(단계 안내)", "./exercise/");
      });
    });
  });
}
