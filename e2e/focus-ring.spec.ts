// 초점 링 — 키보드로 닿는 컨트롤에는 링, 스크립트가 초점만 옮겨 주는 상자(tabIndex -1 제목 등)에는 링 없음(src/app/globals.css).
// 온보딩 [시작하기]를 키보드(Enter)로 누르면 다음 단계 제목(h1, tabIndex -1)으로 초점이 간다 — 크롬은 이 초점도 :focus-visible로 본다.
import { expect, test, type Page } from "@playwright/test";
import { isBrowserOnlyBuild } from "./helpers";

/** 지금 초점을 받은 요소의 태그·:focus-visible 여부·윤곽선 모양 */
async function activeFocus(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return null;
    const style = getComputedStyle(el);
    return {
      tag: el.tagName,
      text: el.textContent?.trim() ?? "",
      focusVisible: el.matches(":focus-visible"),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });
}

test("온보딩: 키보드로 다음 단계 → 제목(h1)은 링 없이 초점, 다음 Tab 컨트롤은 링", async ({ page }) => {
  test.skip(
    !(await isBrowserOnlyBuild(page)),
    "Supabase 값이 들어간 빌드 — 게스트 시작이 실제 서버에 익명 계정을 만들므로 브라우저 전용 빌드에서만 돈다(DEV_NOTES §11)",
  );
  await page.getByRole("button", { name: "게스트로 시작" }).click();
  await expect(page).toHaveURL(/\/onboarding\/$/);

  const start = page.getByRole("button", { name: "시작하기" });
  await start.focus();
  await page.keyboard.press("Enter");
  const heading = page.getByRole("heading", { level: 1, name: "출산 정보를 알려주세요" });
  await expect(heading).toBeFocused();

  const onHeading = await activeFocus(page);
  expect(onHeading).toMatchObject({ tag: "H1", focusVisible: true }); // 크롬이 이 초점을 키보드 초점으로 본다 — 그래도
  expect(onHeading?.outlineStyle).toBe("none"); // 링은 그리지 않는다

  await page.keyboard.press("Tab");
  const onControl = await activeFocus(page);
  expect(onControl?.tag).not.toBe("H1");
  expect(onControl?.focusVisible).toBe(true);
  expect(onControl?.outlineStyle).toBe("solid");
  expect(onControl?.outlineWidth).toBe("2px");
});
