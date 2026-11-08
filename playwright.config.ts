// 브라우저 자동 시험(e2e) — docs/DEV_NOTES.md §11.
// 빌드된 정적 사이트(out/)를 e2e/serve.mjs가 GitHub Pages처럼 BASE_PATH 아래에 띄우고, 폰·PC 크기 Chromium으로 연다.
// 프로젝트: phone·desktop(게스트 흐름 + 접근성 axe), zoom(글자 150%·확대 150%·320px).
// 빌드와 BASE_PATH가 같아야 한다 — `npm run e2e`(빌드 + 시험) 또는 CI(배포와 같은 빌드를 시험).
// 서버 연결 시험(e2e/server/)은 사람이 직접 켤 때만 돈다(E2E_SERVER=1 — `npm run e2e:server`, 방법은 그 파일 머리말). 실제 Supabase에
// 시험 계정을 만들었다 지우므로 기본 실행(`npm run e2e`·`e2e:run`·CI)은 그 폴더를 아예 보지 않는다. 켜면 그 폴더만, 폰 크기 하나로
// 한 번에 하나씩·다시 시도 없이 돈다.
import { defineConfig, devices } from "@playwright/test";

// 4173은 Vite preview의 기본 포트라 다른 프로젝트와 겹치기 쉽다 — 비교적 드문 4317을 쓴다(E2E_PORT로 바꿀 수 있음).
const PORT = Number(process.env.E2E_PORT ?? 4317);
// 빌드의 basePath와 같게 — 로컬 기본 "/onmom_web", CI는 configure-pages 값(커스텀 도메인이면 "")
const BASE_PATH = (process.env.BASE_PATH ?? "/onmom_web").replace(/\/+$/, "");
const CI = !!process.env.CI;
const SERVER = process.env.E2E_SERVER === "1";

const PHONE = { ...devices["Desktop Chrome"], viewport: { width: 402, height: 874 }, isMobile: false, hasTouch: true };
const ALWAYS_IGNORED = SERVER ? [] : ["**/e2e/server/**"];
// 자기 프로젝트에서만 도는 시험 — phone·desktop은 보지 않는다
const ONLY_IN_OWN_PROJECT = ["**/zoom.spec.ts"];

export default defineConfig({
  testDir: SERVER ? "e2e/server" : "e2e",
  testIgnore: ALWAYS_IGNORED,
  fullyParallel: !SERVER,
  forbidOnly: CI,
  retries: CI && !SERVER ? 1 : 0,
  workers: SERVER ? 1 : CI ? 2 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  outputDir: "test-results",
  use: {
    // 끝 슬래시가 있어야 page.goto("./login/")가 basePath 아래로 풀린다
    baseURL: `http://localhost:${PORT}${BASE_PATH}/`,
    trace: "on-first-retry",
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    // 시험 중 서비스 워커가 페이지 요청을 가로채지 않게(캐시된 옛 파일로 시험하지 않도록)
    serviceWorkers: "block",
  },
  projects: SERVER
    ? [{ name: "server", use: PHONE }]
    : [
        // 게스트 흐름(guest-flow) + 접근성 검사(a11y) — 폰·PC Chromium
        { name: "phone", use: PHONE, testIgnore: [...ALWAYS_IGNORED, ...ONLY_IN_OWN_PROJECT] },
        {
          name: "desktop",
          use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
          testIgnore: [...ALWAYS_IGNORED, ...ONLY_IN_OWN_PROJECT],
        },
        // 글자 150%·확대 150%·320px(zoom.spec.ts). 크기는 시험이 모드마다 정한다.
        // Chromium(Chrome 글꼴 크기 설정을 CDP로 바꾸는 모드가 있음)
        { name: "zoom", use: { ...devices["Desktop Chrome"] }, testMatch: ["zoom.spec.ts"] },
      ],
  webServer: {
    command: "node e2e/serve.mjs",
    url: `http://localhost:${PORT}${BASE_PATH}/`,
    reuseExistingServer: !CI,
    timeout: 30_000,
    env: { BASE_PATH, E2E_PORT: String(PORT) },
  },
});
