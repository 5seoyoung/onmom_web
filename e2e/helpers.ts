// 브라우저 자동 시험의 공용 도우미 — 여러 spec이 같이 쓴다(이 파일은 spec이 아니라 Playwright가 시험으로 집지 않는다).
import { expect, type Page } from "@playwright/test";

/** 한국 날짜 기준 n일 전(YYYY-MM-DD) — 앱은 사용자 로컬 자정 기준이고 브라우저 시간대는 Asia/Seoul */
export function seoulDateDaysAgo(n: number): string {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** 이 빌드가 Supabase 값 없이 만든 브라우저 전용 빌드인지 — 로그인 화면의 카카오 버튼이 "준비 중"으로 잠겨 있으면 그렇다 */
export async function isBrowserOnlyBuild(page: Page): Promise<boolean> {
  await page.goto("./login/");
  await expect(page.getByRole("button", { name: "게스트로 시작" })).toBeVisible();
  const kakao = page.getByRole("button", { name: /^카카오로 시작하기/ });
  await expect(kakao).toBeVisible();
  return (await kakao.isDisabled()) && /준비 중/.test((await kakao.textContent()) ?? "");
}

/** 로그인 화면에서 게스트로 시작해 온보딩 4단계를 마치고 홈에 닿는다(40일 전 자연분만·전업). 브라우저 전용 빌드에서만 부른다. */
export async function finishOnboardingAsGuest(page: Page): Promise<void> {
  await page.goto("./login/");
  await page.getByRole("button", { name: "게스트로 시작" }).click();
  await expect(page).toHaveURL(/\/onboarding\/$/);
  await page.getByRole("button", { name: "시작하기" }).click();
  const next = page.getByRole("button", { name: "다음" });
  await page.getByRole("textbox", { name: "출산일" }).fill(seoulDateDaysAgo(40));
  await page.getByText("자연분만", { exact: true }).click();
  await next.click();
  await page.locator("label").filter({ has: page.getByRole("radio", { name: /^전업/ }) }).click();
  await next.click();
  await page.getByRole("switch", { name: "개인정보·민감정보 처리 방침에 동의합니다" }).click();
  await page.getByRole("button", { name: "온맘 시작하기" }).click();
  await expect(page).toHaveURL(/\/home\/$/);
}
