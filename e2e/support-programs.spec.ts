// 브라우저 자동 시험 — 지원사업 화면의 "우리 지역 지원사업"(src/features/support/RegionalProgramsSection.tsx). docs/DEV_NOTES.md §11.
// 빌드에 실린 표시(src/content/support-programs.generated.json)에 따라 두 갈래로 확인한다:
// - 비었으면(서비스 키 없음·수집 실패 — 저장소 그대로): 카드가 없고 목록 파일을 요청하지 않는다.
// - 있으면(CI가 DATA_GO_KR_SERVICE_KEY로 수집한 빌드): [지역 고르기] → 이 사이트의 정적 파일 한 번 → 시·도·시·군·구 → 정부24 새 탭 링크.
// 어느 쪽이든 콘솔 오류·CSP 위반 0개, 이 사이트 밖으로 나가는 요청 0개(링크는 누르지 않는다).
// 게스트 온보딩이 필요해 브라우저 전용 빌드(Supabase 값 없음)에서만 돈다 — 게스트 흐름 시험(guest-flow.spec.ts)과 같은 까닭.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

interface Meta {
  asOf: string | null;
  count: number;
  hash: string | null;
}
interface Program {
  id: string;
  name: string;
  sido: string | null;
  sigungu: string | null;
}

// Playwright는 저장소 루트에서 돈다(playwright.config.ts) — 빌드에 실린 표시·배포할 out/의 목록을 그대로 읽는다
const META = JSON.parse(readFileSync(join(process.cwd(), "src/content/support-programs.generated.json"), "utf8")) as Meta;
const ENABLED = META.asOf !== null && META.hash !== null && META.count > 0;

function seoulDateDaysAgo(n: number): string {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** 로그인 화면의 카카오 버튼이 "준비 중"으로 잠겨 있으면 브라우저 전용 빌드 */
async function isBrowserOnlyBuild(page: Page): Promise<boolean> {
  await page.goto("./login/");
  const kakao = page.getByRole("button", { name: /^카카오로 시작하기/ });
  await expect(kakao).toBeVisible();
  return (await kakao.isDisabled()) && /준비 중/.test((await kakao.textContent()) ?? "");
}

/** 게스트 → 온보딩 4단계 → 홈 */
async function onboardAsGuest(page: Page) {
  await page.getByRole("button", { name: "게스트로 시작" }).click();
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

test("지원사업 화면 — 우리 지역 지원사업", async ({ page, baseURL }) => {
  test.skip(!(await isBrowserOnlyBuild(page)), "Supabase 값이 들어간 빌드 — 게스트 시작이 실제 서버에 익명 계정을 만들므로 브라우저 전용 빌드에서만 돈다");

  const errors: string[] = [];
  const external: string[] = [];
  const dataRequests: string[] = [];
  const origin = new URL(baseURL!).origin;
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`${m.text()} @ ${m.location().url}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  await page.exposeBinding("__onmomCspViolation", (_src, v: string) => {
    errors.push(`csp: ${v}`);
  });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      const w = window as unknown as { __onmomCspViolation?: (v: string) => void };
      w.__onmomCspViolation?.(`${e.effectiveDirective} ${e.blockedURI}`);
    });
  });
  page.on("request", (r) => {
    if (r.url().includes("support-programs.json")) dataRequests.push(r.url());
  });
  await page.context().route(
    (url) => !url.href.startsWith("data:") && !url.href.startsWith("blob:") && url.origin !== origin,
    (route) => {
      external.push(route.request().url());
      return route.abort("blockedbyclient");
    },
  );

  await onboardAsGuest(page);
  await page.goto("./support/");
  await expect(page.getByRole("heading", { level: 1, name: "지원사업 추천" })).toBeVisible();
  const card = page.getByRole("region", { name: "우리 지역 지원사업" });

  if (!ENABLED) {
    // 저장소 그대로(키 없는 빌드): 카드도 요청도 없다
    await expect(card).toHaveCount(0);
    expect(dataRequests).toEqual([]);
  } else {
    const base = new URL(baseURL!).pathname.replace(/\/$/, "");
    const programs = (JSON.parse(readFileSync(join(process.cwd(), "out/support-programs.json"), "utf8")) as { programs: Program[] }).programs;
    await expect(card).toBeVisible();
    // 열기 전에는 받지 않는다
    expect(dataRequests).toEqual([]);
    await card.getByRole("button", { name: "지역 고르기" }).click();
    const sido = card.getByRole("combobox", { name: "시·도", exact: true });
    await expect(sido).toBeFocused();
    expect(dataRequests).toEqual([`${origin}${base}/support-programs.json?v=${META.hash}`]);

    // 시·군·구 사업이 있는 지역 하나를 골라 본다(없으면 시·도 사업)
    const local = programs.find((p) => p.sigungu !== null) ?? programs.find((p) => p.sido !== null);
    if (local) {
      await sido.selectOption(local.sido!);
      if (local.sigungu !== null) await card.getByRole("combobox", { name: "시·군·구", exact: true }).selectOption(local.sigungu);
      await expect(card.getByText(local.name, { exact: true }).first()).toBeVisible();
    }
    const links = card.getByRole("link", { name: /자세히 보기\(정부24\)/ });
    await expect(links.first()).toBeVisible();
    for (const a of await links.all()) {
      await expect(a).toHaveAttribute("href", /^https:\/\/www\.gov\.kr\//);
      await expect(a).toHaveAttribute("target", "_blank");
      await expect(a).toHaveAttribute("rel", "noopener noreferrer");
    }
    // 목록은 한 번만 받는다(지역을 바꿔도 다시 요청하지 않는다 — 고른 지역이 요청에 실리지 않는다)
    expect(dataRequests).toHaveLength(1);
    // 고른 지역을 저장하지 않는다 — localStorage 어디에도 시·도 id가 없다
    if (local?.sido) expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(local.sido);
  }

  expect(errors, "콘솔 오류·페이지 예외·CSP 위반").toEqual([]);
  expect(external, "사이트 밖으로 나간 요청").toEqual([]);
});
