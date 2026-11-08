// 접근성·확대 시험의 공통 준비 — fixtures.ts의 guard(콘솔 오류·바깥 요청 0개)에 더해:
// - seed: 온보딩을 마친 게스트 상태(seed.ts)로 시작한다(test.use({ seed: "redFlag" })). 기본은 빈 저장소(처음 온 사람).
// - browserOnly: 이 빌드가 Supabase 값 없는 브라우저 전용 빌드인가(워커마다 한 번 확인). 서버 모드 빌드(CI 두 번째 시험 = 배포 빌드)에서는
//   게스트 상태를 넣은 화면이 운영 서버에 동기화를 시도하므로 그 시험들은 건너뛴다(guest-flow.spec.ts와 같은 이유 — DEV_NOTES §11).
import type { Page } from "@playwright/test";
import { isBrowserOnlyBuild } from "../helpers";
import { expect, test as base } from "./fixtures";
import { seededLocalStorage, type SeedOptions } from "./seed";

export type SeedName = "none" | "redFlag" | "normal";

const SEEDS: Record<Exclude<SeedName, "none">, SeedOptions> = {
  redFlag: { redFlagToday: true },
  normal: { redFlagToday: false },
};

export const test = base.extend<{ seed: SeedName }, { browserOnly: boolean }>({
  seed: ["none", { option: true }],
  // 픽스처의 둘째 인자 이름은 provide — "use"면 React 훅 규칙(eslint react-hooks)이 훅으로 오인한다
  storageState: async ({ seed, baseURL }, provide) => {
    if (seed === "none") return provide({ cookies: [], origins: [] });
    await provide({ cookies: [], origins: [{ origin: new URL(baseURL!).origin, localStorage: seededLocalStorage(new Date(), SEEDS[seed]) }] });
  },
  browserOnly: [
    async ({ browser }, provide, workerInfo) => {
      const baseURL = workerInfo.project.use.baseURL;
      // storageState를 비워 둔다 — 테스트 러너가 browser.newContext에 지금 테스트의 use 값(게스트 상태)을 넣기 때문
      const context = await browser.newContext({ baseURL, serviceWorkers: "block", storageState: { cookies: [], origins: [] } });
      const page = await context.newPage();
      // 바깥 요청은 막는다(확인하는 동안에도 운영 서버에 가지 않게)
      const origin = new URL(baseURL!).origin;
      await context.route((url) => url.origin !== origin && url.protocol.startsWith("http"), (r) => r.abort());
      const result = await isBrowserOnlyBuild(page);
      await context.close();
      await provide(result);
    },
    { scope: "worker" },
  ],
});

export { expect };

export const SERVER_BUILD_SKIP =
  "Supabase 값이 들어간 빌드 — 게스트 상태로 연 화면이 실제 서버에 동기화를 시도하므로 브라우저 전용 빌드에서만 돈다(DEV_NOTES §11)";

/** 화면이 그려질 때까지 — h1이 보이고 앱 관문의 "불러오는 중"이 사라질 때까지 */
export async function screenReady(page: Page): Promise<void> {
  await expect(page.locator("h1").first()).toBeAttached();
  await expect(page.getByRole("status").filter({ hasText: "불러오는 중이에요" })).toHaveCount(0);
  // 글꼴이 다 그려진 뒤에 잰다(대비·넘침 모두 글자 크기에 달렸다)
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}
