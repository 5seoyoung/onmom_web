// 브라우저 자동 시험 — 브라우저 전용 빌드(Supabase 값 없음)의 게스트 흐름 전체. docs/DEV_NOTES.md §11.
// 소개 → 로그인 → 게스트 → 온보딩 4단계 → 홈 "N일차" → 기록(어지러움 → 즉시 내원) → 홈 "확인 필요" → 운동 멈춤
// → 이용약관 → 한국어 404 → 설정 > 계정 삭제 → 로그인, onmom.web.* 키 없음.
// 모든 시험에서: 콘솔 오류·페이지 예외 0개, 이 사이트 밖으로 나가는 요청 0개(브라우저 전용 빌드는 건강 정보를 어디에도 보내지 않는다).
import { expect, test as base, type Page } from "@playwright/test";

/** 이 사이트(시험 서버) 밖 주소인지 — 밖으로 나가는 요청은 막고 기록한다 */
function isExternal(url: string, baseURL: string): boolean {
  if (url.startsWith("data:") || url.startsWith("blob:")) return false;
  return new URL(url).origin !== new URL(baseURL).origin;
}

interface Guard {
  /** 이 주소의 404 응답이 콘솔에 남기는 "Failed to load resource" 한 줄만 허용 — 없는 주소를 일부러 여는 단계용 */
  allowNotFound(url: string): void;
}

const test = base.extend<{ guard: Guard }>({
  guard: [
    async ({ page, baseURL }, use) => {
      const errors: string[] = [];
      const external: string[] = [];
      const allowed404 = new Set<string>();
      page.on("console", (m) => {
        if (m.type() !== "error") return;
        // 없는 주소는 GitHub Pages처럼 상태 404로 404.html을 준다 — Chromium은 문서 자체의 404를 콘솔 오류로 남긴다.
        if (m.text().startsWith("Failed to load resource") && allowed404.has(m.location().url)) return;
        errors.push(`${m.text()} @ ${m.location().url}`);
      });
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
      // CSP(src/csp.ts) 위반도 오류로 센다 — 콘솔 문구에 기대지 않고 securitypolicyviolation 이벤트를 직접 받는다.
      await page.exposeBinding("__onmomCspViolation", (_src, v: string) => {
        errors.push(`csp: ${v}`);
      });
      await page.addInitScript(() => {
        document.addEventListener("securitypolicyviolation", (e) => {
          const w = window as unknown as { __onmomCspViolation?: (v: string) => void };
          w.__onmomCspViolation?.(`${e.effectiveDirective} ${e.blockedURI}`);
        });
      });
      await page.context().route(
        (url) => isExternal(url.href, baseURL!),
        (route) => {
          external.push(route.request().url());
          return route.abort("blockedbyclient");
        },
      );
      await use({ allowNotFound: (url) => allowed404.add(url) });
      expect(errors, "콘솔 오류·페이지 예외").toEqual([]);
      expect(external, "사이트 밖으로 나간 요청").toEqual([]);
    },
    { auto: true },
  ],
});

/** 한국 날짜 기준 n일 전(YYYY-MM-DD) — 앱은 사용자 로컬 자정 기준이고 브라우저 시간대는 Asia/Seoul */
function seoulDateDaysAgo(n: number): string {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

async function onmomKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("onmom.web.")));
}

/** 이 빌드가 Supabase 값 없이 만든 브라우저 전용 빌드인지 — 로그인 화면의 카카오 버튼이 "준비 중"으로 잠겨 있으면 그렇다 */
async function isBrowserOnlyBuild(page: Page): Promise<boolean> {
  await page.goto("./login/");
  await expect(page.getByRole("button", { name: "게스트로 시작" })).toBeVisible();
  const kakao = page.getByRole("button", { name: /^카카오로 시작하기/ });
  await expect(kakao).toBeVisible();
  return (await kakao.isDisabled()) && /준비 중/.test((await kakao.textContent()) ?? "");
}

test("서비스 소개가 열리고 [시작하기]가 로그인으로 간다", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("heading", { level: 1, name: "산후 회복, 하루 1분 기록으로" })).toBeVisible();
  // 운영 빌드에는 CSP 메타가 실린다(src/app/layout.tsx) — 위반 0개는 guard가 확인한다.
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);
  await page.getByRole("banner").getByRole("link", { name: "시작하기" }).click();
  await expect(page).toHaveURL(/\/login\/$/);
  await expect(page.getByRole("button", { name: "게스트로 시작" })).toBeVisible();
});

test("이용약관이 열린다", async ({ page }) => {
  await page.goto("./terms/");
  await expect(page.getByRole("heading", { level: 1, name: "온맘 이용약관" })).toBeVisible();
  await expect(page.getByText("법률 검토 전").first()).toBeVisible();
});

test("게스트 흐름: 온보딩 → 위험 신호 → 계정 삭제", async ({ page, guard, baseURL }) => {
  test.skip(
    !(await isBrowserOnlyBuild(page)),
    "Supabase 값이 들어간 빌드 — 게스트 시작이 실제 서버에 익명 계정을 만들므로 이 시험은 브라우저 전용 빌드에서만 돈다(DEV_NOTES §11)",
  );

  // 로그인 → 게스트
  await page.getByRole("button", { name: "게스트로 시작" }).click();
  await expect(page).toHaveURL(/\/onboarding\/$/);

  // 1단계 — 시작
  await expect(page.getByRole("progressbar", { name: "시작하기 진행 단계" })).toBeVisible();
  await page.getByRole("button", { name: "시작하기" }).click();

  // 2단계 — 출산 정보(40일 전, 자연분만)
  await expect(page.getByRole("heading", { level: 1, name: "출산 정보를 알려주세요" })).toBeVisible();
  const next = page.getByRole("button", { name: "다음" });
  await expect(next).toBeDisabled();
  await page.getByRole("textbox", { name: "출산일" }).fill(seoulDateDaysAgo(40));
  // 라디오는 화면에서 숨기고(sr-only) 줄 전체가 라벨 — 사람처럼 라벨을 누른다
  await page.getByText("자연분만", { exact: true }).click();
  await expect(page.getByRole("radio", { name: "자연분만" })).toBeChecked();
  await next.click();

  // 3단계 — 목표(전업)
  await expect(page.getByRole("heading", { level: 1, name: "목표를 설정해주세요" })).toBeVisible();
  await expect(next).toBeDisabled();
  await page.locator("label").filter({ has: page.getByRole("radio", { name: /^전업/ }) }).click();
  await expect(page.getByRole("radio", { name: /^전업/ })).toBeChecked();
  await next.click();

  // 4단계 — 동의
  await expect(page.getByRole("heading", { level: 1, name: "데이터 이용에 동의해주세요" })).toBeVisible();
  const start = page.getByRole("button", { name: "온맘 시작하기" });
  await expect(start).toBeDisabled();
  // 동의 전에는 건강 정보를 저장하지 않는다(감사 #15)
  const beforeConsent = await page.evaluate(() => JSON.stringify(localStorage));
  expect(beforeConsent).not.toContain(seoulDateDaysAgo(40));
  const consent = page.getByRole("switch", { name: "개인정보·민감정보 처리 방침에 동의합니다" });
  await consent.click();
  await expect(consent).toBeChecked();
  await start.click();

  // 홈 — 산후 40일차
  await expect(page).toHaveURL(/\/home\/$/);
  const recovery = page.getByRole("region", { name: "산후 회복" });
  await expect(recovery.getByText(/^40\s*일차$/)).toBeVisible();
  await expect(recovery.getByText("자연분만")).toBeVisible();
  await expect(recovery.getByText("전업")).toBeVisible();

  // 기록 — 어지러움 → 즉시 내원
  const nav = page.getByRole("navigation", { name: "주요 메뉴" });
  await nav.getByRole("link", { name: "기록", exact: true }).click();
  await expect(page).toHaveURL(/\/record\/$/);
  const dizzy = page.getByRole("switch", { name: "어지러움·실신·균형장애" });
  await dizzy.click();
  await expect(dizzy).toBeChecked();
  await page.getByRole("button", { name: "확인하기" }).click();
  const redFlag = page.getByRole("main").getByRole("alert");
  await expect(redFlag.getByText("즉시 내원", { exact: true })).toBeVisible();
  await expect(redFlag).toContainText("어지러움·실신·균형장애");

  // 홈 — 확인 필요 + 운동 안내 멈춤
  await nav.getByRole("link", { name: "홈", exact: true }).click();
  await expect(page).toHaveURL(/\/home\/$/);
  await expect(page.getByRole("region", { name: "오늘의 회복 상태" }).getByRole("paragraph").filter({ hasText: /^확인 필요$/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "운동 안내를 멈췄어요" })).toBeVisible();

  // 운동 — 위험 신호면 영상 추천을 멈춘다(영상 서버도 부르지 않는다)
  await nav.getByRole("link", { name: "운동", exact: true }).click();
  await expect(page).toHaveURL(/\/exercise\/$/);
  await expect(page.getByRole("heading", { name: "운동 영상 추천을 멈췄어요" })).toBeVisible();

  // 없는 주소 — 온보딩을 마친 사람에게는 한국어 404
  const unknown = new URL("./no-such-page/", baseURL).href;
  guard.allowNotFound(unknown);
  const res = await page.goto(unknown);
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "페이지를 찾을 수 없어요" })).toBeVisible();
  await page.getByRole("link", { name: "홈으로" }).click();
  await expect(page).toHaveURL(/\/home\/$/);

  // 프로필 → 설정 → 계정 삭제
  expect(await onmomKeys(page)).not.toEqual([]);
  await page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("link", { name: "프로필", exact: true }).click();
  await expect(page).toHaveURL(/\/profile\/$/);
  // 프로필 목록의 [설정] 카드(PC는 사이드바에도 설정 링크가 있다)
  await page.getByRole("main").getByRole("link", { name: /^설정/ }).click();
  await expect(page).toHaveURL(/\/settings\/$/);
  await page.getByRole("button", { name: /^계정 삭제/ }).click();
  const dialog = page.getByRole("dialog", { name: "계정을 삭제할까요?" });
  await expect(dialog).toBeVisible();
  // 확인 창의 첫 버튼이 되돌릴 수 없는 삭제, 다음이 [취소]
  const destructive = dialog.getByRole("button").first();
  await expect(destructive).toContainText("삭제");
  await destructive.click();

  await expect(page).toHaveURL(/\/login\/$/);
  await expect(page.getByRole("button", { name: "게스트로 시작" })).toBeVisible();
  expect(await onmomKeys(page)).toEqual([]);
});
