// 익명(게스트) 로그인의 봇 막기 — Cloudflare Turnstile. NEXT_PUBLIC_TURNSTILE_SITE_KEY(공개값)가 있을 때만 쓴다.
// Supabase 대시보드(Attack Protection → CAPTCHA)에 Turnstile 비밀 키를 넣으면 signInAnonymously가 토큰을 요구한다.
// 키가 없으면 토큰 없이 부른다(Supabase에서 CAPTCHA를 켜지 않았을 때).
//
// - 스크립트는 처음 필요할 때 한 번만 받는다(게스트 로그인·예전 게스트 옮기기 때). 설정이 없으면 받지 않는다.
// - 위젯은 appearance "interaction-only" — 대부분은 보이지 않고 끝난다. 사람 확인이 필요할 때만 화면 아래 가운데에 잠깐 뜬다.
// - 토큰은 한 번만 쓸 수 있다 — 요청마다 새로 받고, 받은 뒤 위젯은 지운다.
// - Turnstile은 Cloudflare로 기기 신호를 보낸다 — 개인정보처리방침에 적어야 한다(CPO).

import { config } from "@/config";

export const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
/** 스크립트를 받는 최대 시간 */
export const TURNSTILE_LOAD_TIMEOUT_MS = 15_000;
/** 토큰을 기다리는 최대 시간 — 사람 확인(체크 상자)이 뜨는 경우까지 */
export const TURNSTILE_TOKEN_TIMEOUT_MS = 60_000;

export type CaptchaResult =
  /** 이 빌드는 CAPTCHA를 쓰지 않는다(사이트 키 없음) — 토큰 없이 부른다 */
  | { kind: "none" }
  | { kind: "token"; token: string }
  /** 스크립트를 못 받았거나 확인에 실패했다 */
  | { kind: "failed" };

export interface TurnstileRenderOptions {
  sitekey: string;
  action?: string;
  appearance?: "always" | "execute" | "interaction-only";
  language?: string;
  callback: (token: string) => void;
  "error-callback": () => void;
  "expired-callback": () => void;
  "timeout-callback": () => void;
}

/** window.turnstile에서 쓰는 것만 */
export interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileRenderOptions): string | null | undefined;
  remove(widgetId: string): void;
}

export interface CaptchaDeps {
  siteKey: string | null;
  loadApi: () => Promise<TurnstileApi | null>;
  /** 위젯을 둘 자리 — 끝나면 dispose */
  createContainer: () => { element: HTMLElement; dispose: () => void } | null;
  tokenTimeoutMs?: number;
}

/** 토큰 하나를 받는다. 사이트 키가 없으면 { kind: "none" }. 어떤 경우에도 던지지 않는다. */
export function createCaptchaProvider(deps: CaptchaDeps): () => Promise<CaptchaResult> {
  const timeoutMs = deps.tokenTimeoutMs ?? TURNSTILE_TOKEN_TIMEOUT_MS;
  return async () => {
    if (deps.siteKey === null) return { kind: "none" };
    let api: TurnstileApi | null;
    try {
      api = await deps.loadApi();
    } catch {
      api = null;
    }
    if (api === null) return { kind: "failed" };
    const slot = deps.createContainer();
    if (slot === null) return { kind: "failed" };
    const siteKey = deps.siteKey;
    const turnstile = api;

    return new Promise<CaptchaResult>((resolve) => {
      let widgetId: string | null = null;
      let done = false;
      const finish = (result: CaptchaResult) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        // 콜백 안에서 바로 지우면 Turnstile이 경고를 낸다 — 다음 차례에 정리한다
        setTimeout(() => {
          try {
            if (widgetId !== null) turnstile.remove(widgetId);
          } catch {
            // 이미 없어졌다
          }
          slot.dispose();
        }, 0);
        resolve(result);
      };
      const timer = setTimeout(() => finish({ kind: "failed" }), timeoutMs);
      try {
        widgetId =
          turnstile.render(slot.element, {
            sitekey: siteKey,
            action: "guest",
            appearance: "interaction-only",
            language: "ko",
            callback: (token) => finish(typeof token === "string" && token.length > 0 ? { kind: "token", token } : { kind: "failed" }),
            "error-callback": () => finish({ kind: "failed" }),
            "expired-callback": () => finish({ kind: "failed" }),
            "timeout-callback": () => finish({ kind: "failed" }),
          }) ?? null;
      } catch {
        finish({ kind: "failed" });
      }
    });
  };
}

// MARK: 브라우저

let scriptPromise: Promise<TurnstileApi | null> | null = null;

function windowTurnstile(): TurnstileApi | null {
  const t = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
  return t && typeof t.render === "function" ? t : null;
}

/** Turnstile 스크립트를 한 번만 넣는다. 못 받으면 null(다음에 다시 시도). */
export function loadTurnstileApi(): Promise<TurnstileApi | null> {
  if (typeof window === "undefined" || typeof document === "undefined") return Promise.resolve(null);
  const ready = windowTurnstile();
  if (ready) return Promise.resolve(ready);
  scriptPromise ??= new Promise<TurnstileApi | null>((resolve) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    const fail = () => {
      clearTimeout(timer);
      script.remove();
      scriptPromise = null;
      resolve(null);
    };
    const timer = setTimeout(fail, TURNSTILE_LOAD_TIMEOUT_MS);
    script.onload = () => {
      clearTimeout(timer);
      const api = windowTurnstile();
      if (api === null) scriptPromise = null;
      resolve(api);
    };
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/** 화면 아래 가운데의 빈 자리 — 사람 확인이 필요할 때만 위젯이 보인다. */
export function createTurnstileContainer(): { element: HTMLElement; dispose: () => void } | null {
  if (typeof document === "undefined" || !document.body) return null;
  const element = document.createElement("div");
  element.setAttribute("data-onmom-turnstile", "");
  Object.assign(element.style, {
    position: "fixed",
    left: "50%",
    bottom: "calc(1rem + env(safe-area-inset-bottom))",
    transform: "translateX(-50%)",
    zIndex: "2147483000",
  });
  document.body.appendChild(element);
  return { element, dispose: () => element.remove() };
}

/** 브라우저 기본 — config의 사이트 키로 */
export const browserCaptcha = createCaptchaProvider({
  siteKey: config.turnstileSiteKey,
  loadApi: loadTurnstileApi,
  createContainer: createTurnstileContainer,
});
