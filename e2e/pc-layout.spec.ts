// PC 화면 틀(components/shell/AppShell·SideNav·pageFrame) — 창 폭별로 사이드바와 본문 자리를 잰다. docs/dev/DEV_NOTES.md §7-2·§9.
// - 1024~1440: 사이드바는 창 왼쪽 끝, 본문(최대 64rem)은 남은 자리 가운데. 1440 창에서 제목 x = 392.
// - 1440 초과(큰 모니터): 사이드바·본문 묶음(최대 90rem)이 가운데 — 메뉴와 본문 사이는 1440 창과 같은 80px에서 더 벌어지지 않고,
//   묶음 양옆 빈자리가 같다. 본문(제목) 자리는 전과 같다(묶음 가운데 = 예전 본문 가운데).
// 폰 크기 프로젝트에서는 사이드바가 없어 건너뛴다.
import { expect, test, type Page } from "@playwright/test";
import { finishOnboardingAsGuest, isBrowserOnlyBuild } from "./helpers";

type Box = { x: number; y: number; width: number; height: number };

async function boxOf(page: Page, selector: string): Promise<Box> {
  const box = await page.locator(selector).first().boundingBox();
  expect(box, selector).not.toBeNull();
  return box!;
}

/** 사이드바(주요 메뉴 nav를 감싼 기둥)·본문 묶음(#app-content)·화면 제목(h1)의 자리 */
async function measure(page: Page) {
  const side = await page.getByRole("navigation", { name: "주요 메뉴" }).locator("xpath=..").boundingBox();
  expect(side).not.toBeNull();
  const content = await boxOf(page, "#app-content");
  const title = await page.getByRole("main").getByRole("heading", { level: 1 }).boundingBox();
  return { side: side!, content, title };
}

test("PC 창 폭별 사이드바·본문 자리 — 큰 모니터에서 메뉴와 본문 사이가 벌어지지 않는다", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "사이드바는 PC(lg 이상)에만 있다");
  test.skip(
    !(await isBrowserOnlyBuild(page)),
    "Supabase 값이 들어간 빌드 — 게스트 시작이 실제 서버에 익명 계정을 만들므로 브라우저 전용 빌드에서만 돈다(DEV_NOTES §11)",
  );
  await finishOnboardingAsGuest(page);
  // 설정 = 읽기 화면(48rem, 왼쪽 정렬)이고 제목이 보인다(홈의 PC 제목은 화면 낭독용으로 숨김)
  await page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("link", { name: "설정", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/$/);
  await expect(page.getByRole("main").getByRole("heading", { level: 1, name: "설정" })).toBeVisible();

  // 1024·1280: 사이드바는 창 왼쪽 끝, 본문 묶음이 남은 자리를 채운다(64rem 이하)
  for (const width of [1024, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    const { side, content } = await measure(page);
    expect(side.x, `${width}: 사이드바 왼쪽`).toBe(0);
    expect(side.width).toBe(256);
    expect(content.x, `${width}: 본문 묶음 왼쪽`).toBe(256);
    expect(content.width).toBe(width - 256);
  }

  // 1440: 기준 배치 — 사이드바 0~256, 여백 80, 본문 1024, 여백 80. 모든 화면의 제목 x = 392(§9)
  await page.setViewportSize({ width: 1440, height: 900 });
  {
    const { side, content, title } = await measure(page);
    expect(side.x).toBe(0);
    expect(content.x - (side.x + side.width)).toBe(80);
    expect(content.width).toBe(1024);
    expect(title!.x).toBe(392);
  }

  // 큰 모니터: 1440의 배치가 가운데로 — 메뉴와 본문 사이 80, 묶음 양옆 빈자리가 같다, 제목은 예전 자리(창 가운데 − 328)
  for (const [width, height] of [
    [1920, 1080],
    [2560, 1440],
  ]) {
    await page.setViewportSize({ width, height });
    const { side, content, title } = await measure(page);
    const left = side.x;
    const right = width - (content.x + content.width + 80);
    expect(content.x - (side.x + side.width), `${width}: 메뉴와 본문 사이`).toBe(80);
    expect(content.width).toBe(1024);
    expect(left, `${width}: 묶음 왼쪽 빈자리`).toBe((width - 1440) / 2);
    expect(Math.abs(left - right), `${width}: 묶음이 가운데`).toBeLessThanOrEqual(1);
    expect(title!.x, `${width}: 제목 자리`).toBe(width / 2 - 328);
    // 사이드바는 여전히 창 높이에 붙어 있다(sticky — 묶음이 가운데로 와도 위아래로 늘지 않는다)
    expect(side.y).toBe(0);
    expect(side.height).toBe(height);
  }
});
