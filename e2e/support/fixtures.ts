// 모든 브라우저 시험의 공통 검사(docs/DEV_NOTES.md §11) — 콘솔 오류·페이지 예외·CSP 위반 0개, 이 사이트 밖으로 나가는 요청 0개.
// 브라우저 전용 빌드는 건강 정보를 어디에도 보내지 않는다 — 밖으로 나가는 요청은 막고 기록한다(운영 서버·영상 서버·카카오에 요청하지 않는다).
// 시험 파일은 @playwright/test 대신 여기의 test·expect를 쓴다(guard가 자동으로 붙는다).
import { expect, test as base } from "@playwright/test";

/** 이 사이트(시험 서버) 밖 주소인지 */
function isExternal(url: string, baseURL: string): boolean {
  if (url.startsWith("data:") || url.startsWith("blob:")) return false;
  return new URL(url).origin !== new URL(baseURL).origin;
}

export interface Guard {
  /** 이 주소의 404 응답이 콘솔에 남기는 "Failed to load resource" 한 줄만 허용 — 없는 주소를 일부러 여는 단계용 */
  allowNotFound(url: string): void;
}

/** 없는 주소 문서의 404가 콘솔에 남기는 줄인가 */
function isNotFoundConsoleLine(text: string): boolean {
  return text.startsWith("Failed to load resource");
}

/**
 * WebKit은 문서를 떠날 때(page.goto·주소창 이동) 끝나지 않은 같은 사이트 요청(Next의 미리 받기 .txt)을 취소하며
 * "Fetch API cannot load <주소> due to access control checks."를 페이지 오류로 남긴다(Chromium은 남기지 않는다).
 * 같은 사이트 요청은 접근 제어(CORS)에 걸릴 수 없으므로 이 문구 + 같은 사이트 주소 + 방금 문서 이동을 시작했을 때만 뺀다.
 */
const WEBKIT_CANCELLED_FETCH = /^Fetch API cannot load (\S+) due to access control checks\.$/;
const NAVIGATION_GRACE_MS = 3_000;

export const test = base.extend<{ guard: Guard }>({
  guard: [
    async ({ page, baseURL }, use) => {
      const errors: string[] = [];
      const external: string[] = [];
      const allowed404 = new Set<string>();
      page.on("console", (m) => {
        if (m.type() !== "error") return;
        // 없는 주소는 GitHub Pages처럼 상태 404로 404.html을 준다 — 브라우저는 문서 자체의 404를 콘솔 오류로 남긴다.
        if (isNotFoundConsoleLine(m.text()) && allowed404.has(m.location().url)) return;
        errors.push(`${m.text()} @ ${m.location().url}`);
      });
      let lastDocumentNavigation = Number.NEGATIVE_INFINITY;
      page.on("request", (r) => {
        if (r.isNavigationRequest() && r.frame() === page.mainFrame()) lastDocumentNavigation = Date.now();
      });
      page.on("pageerror", (e) => {
        // Playwright WebKit은 이 줄을 "이름: 메시지"로 나눠 준다 — 합쳐서 본다
        const text = e.message.startsWith("/") ? `${e.name}:${e.message}` : `${e.name}: ${e.message}`;
        const cancelled = WEBKIT_CANCELLED_FETCH.exec(text);
        if (cancelled && !isExternal(cancelled[1], baseURL!) && Date.now() - lastDocumentNavigation < NAVIGATION_GRACE_MS) return;
        errors.push(`pageerror: ${text}`);
      });
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

export { expect };
