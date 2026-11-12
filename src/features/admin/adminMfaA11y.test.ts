// @vitest-environment jsdom
// 관리자 2단계 인증(0014)과 무동작 자동 로그아웃 — 화면 전체(AdminScreen)를 jsdom에 그리고 가짜 AdminClient로 흐름과 접근성(axe)을 본다.
//   등록(QR·키·숫자 칸) → 틀린 형식·틀린 숫자 안내 → 맞는 숫자면 다시 권한 확인 → 대시보드
//   숫자 확인(인증 앱이 이미 있음)
//   15분 동안 쓰지 않으면 로그아웃 안내(이 브라우저에서 signOut)
// 규칙은 adminA11y.test.ts와 같다(WCAG 2.1 A/AA, color-contrast는 jsdom에서 잴 수 없어 끔).
import { createElement as h } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import axe from "axe-core";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { AdminClient, AdminRpcError, MfaFactor } from "./adminApi";
import { ADMIN_IDLE_MINUTES, ADMIN_TEXT } from "./adminModel";

const ADMIN_ID = "6f1c3c6e-8a40-4c55-9d2e-3b1f0a6f0001";
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#000"/></svg>';
/** 등록 QR(로고 그림과 구분 — 로고는 장식이라 alt가 비어 있다) */
const QR = `img[alt="${ADMIN_TEXT.mfaQrAlt}"]`;

const fake = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("@/config", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/config")>()), isSupabaseConfigured: () => true }));
vi.mock("@/auth/client", () => ({ getSupabaseClient: async () => ({}) }));
vi.mock("./adminApi", async (importOriginal) => ({ ...(await importOriginal<typeof import("./adminApi")>()), adminClientFrom: () => fake.client }));

interface World {
  aal: "aal1" | "aal2";
  factors: MfaFactor[];
  /** 맞는 숫자 */
  code: string;
  calls: string[];
  signedOut: number;
}

/** 관리자 목록에 있는 카카오 계정 — 숫자를 맞히면 세션이 aal2가 되고, 대시보드의 데이터 함수는 없는 것처럼(설치 안내) 답한다 */
function makeClient(world: World): AdminClient {
  const err = (code: string): AdminRpcError => ({ code });
  return {
    getSessionUser: async () => ({ user: { id: ADMIN_ID, is_anonymous: false }, failed: false }),
    rpc: async (fn) => {
      world.calls.push(fn);
      if (fn === "admin_membership") return { data: true, error: null };
      if (fn === "is_admin") return { data: world.aal === "aal2", error: null };
      return { data: null, error: err("PGRST202") };
    },
    onSignedOut: () => () => {},
    signOut: async () => {
      world.signedOut += 1;
    },
    mfa: {
      assurance: async () => ({ data: { current: world.aal, next: world.factors.some((f) => f.status === "verified") ? "aal2" : "aal1" }, error: null }),
      factors: async () => ({ data: world.factors, error: null }),
      enrollTotp: async () => {
        world.factors = [...world.factors.filter((f) => f.status === "verified"), { id: "f-new", type: "totp", status: "unverified" }];
        return { data: { id: "f-new", qrCode: `data:image/svg+xml;utf-8,${SVG}`, secret: "JBSWY3DPEHPK3PXPJBSW" }, error: null };
      },
      unenroll: async (id) => {
        world.factors = world.factors.filter((f) => f.id !== id);
        return { data: null, error: null };
      },
      verify: async (id, code) => {
        world.calls.push(`verify:${id}:${code}`);
        if (code !== world.code) return { data: null, error: err("mfa_verification_failed") };
        world.aal = "aal2";
        world.factors = world.factors.map((f) => (f.id === id ? { ...f, status: "verified" } : f));
        return { data: null, error: null };
      },
    },
  };
}

async function violations(context: Element | Document = document) {
  const results = await axe.run(context, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    rules: {
      "color-contrast": { enabled: false },
      "heading-order": { enabled: true },
      "page-has-heading-one": { enabled: true },
      "landmark-one-main": { enabled: true },
      "landmark-no-duplicate-main": { enabled: true },
      "landmark-unique": { enabled: true },
    },
    resultTypes: ["violations"],
  });
  return results.violations.map((v) => ({ rule: v.id, nodes: v.nodes.map((n) => n.html.slice(0, 160)) }));
}

function typeInto(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function buttonNamed(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === name);
  if (!found) throw new Error(`단추 없음: ${name}`);
  return found;
}

async function settle(check: () => void) {
  await vi.waitFor(check, { timeout: 10_000, interval: 20 });
  await act(async () => {});
}

const SLOW = 30_000;
let root: Root | null = null;
let container: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  document.documentElement.lang = "ko";
  document.title = ADMIN_TEXT.title;
  globalThis.IntersectionObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  vi.restoreAllMocks();
  if (root !== null) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

async function render(world: World) {
  fake.client = makeClient(world);
  const { AdminScreen } = await import("./AdminScreen");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(h(AdminScreen));
  });
}

describe("관리자 2단계 인증 화면(0014)", { timeout: SLOW }, () => {
  it("등록 — QR·키·숫자 칸에 위반이 없고, 형식·틀린 숫자를 안내하고, 맞으면 대시보드로", async () => {
    // 확인 전에 남은 등록(창을 닫았던 것)은 지우고 새로 만든다
    const world: World = { aal: "aal1", factors: [{ id: "f-old", type: "totp", status: "unverified" }], code: "123456", calls: [], signedOut: 0 };
    await render(world);
    await settle(() => expect(document.querySelector("h1")?.textContent).toBe(ADMIN_TEXT.mfaEnrollTitle));
    await settle(() => expect(document.querySelector(QR)).not.toBeNull());
    expect(world.factors.map((f) => f.id)).toEqual(["f-new"]);
    const img = document.querySelector(QR)!;
    expect(img.getAttribute("alt")).toBe(ADMIN_TEXT.mfaQrAlt);
    expect(img.getAttribute("src")).toMatch(/^data:image\/svg\+xml;charset=utf-8,%3Csvg/);
    expect(document.body.textContent).toContain("JBSW Y3DP EHPK 3PXP JBSW");
    const input = document.querySelector<HTMLInputElement>("main form input")!;
    expect(input.getAttribute("autocomplete")).toBe("one-time-code");
    expect(input.getAttribute("inputmode")).toBe("numeric");
    expect(document.activeElement).toBe(input);
    expect(await violations()).toEqual([]);

    // 형식이 아니면 서버에 묻지 않는다
    await act(async () => typeInto(input, "12a"));
    await act(async () => buttonNamed(ADMIN_TEXT.mfaVerify).click());
    expect(document.querySelector('main [role="alert"]')?.textContent).toBe(ADMIN_TEXT.mfaCodeFormat);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(world.calls.filter((c) => c.startsWith("verify:"))).toEqual([]);
    expect(await violations()).toEqual([]);

    // 틀린 숫자
    await act(async () => typeInto(input, "000 000"));
    await act(async () => buttonNamed(ADMIN_TEXT.mfaVerify).click());
    await settle(() => expect(document.querySelector('main [role="alert"]')?.textContent).toBe(ADMIN_TEXT.mfaCodeInvalid));
    expect(world.calls).toContain("verify:f-new:000000");
    expect(input.value).toBe("");

    // 맞는 숫자 → 다시 권한 확인(aal2) → 대시보드
    await act(async () => typeInto(input, "123456"));
    await act(async () => buttonNamed(ADMIN_TEXT.mfaVerify).click());
    await settle(() => expect(document.querySelector("h1")?.textContent).toBe(ADMIN_TEXT.title));
    expect(world.calls.filter((c) => c === "is_admin").length).toBeGreaterThan(0);
  });

  it("숫자 확인 — 인증 앱이 이미 있으면 QR 없이 숫자만, 위반이 없다", async () => {
    const world: World = { aal: "aal1", factors: [{ id: "f-1", type: "totp", status: "verified" }], code: "654321", calls: [], signedOut: 0 };
    await render(world);
    await settle(() => expect(document.querySelector("h1")?.textContent).toBe(ADMIN_TEXT.mfaChallengeTitle));
    expect(document.querySelector(QR)).toBeNull();
    expect(document.body.textContent).toContain(ADMIN_TEXT.mfaLostHint);
    expect(await violations()).toEqual([]);
    await act(async () => typeInto(document.querySelector<HTMLInputElement>("main form input")!, "654321"));
    await act(async () => buttonNamed(ADMIN_TEXT.mfaVerify).click());
    await settle(() => expect(document.querySelector("h1")?.textContent).toBe(ADMIN_TEXT.title));
    expect(world.calls).toContain("verify:f-1:654321");
  });

  it(`${ADMIN_IDLE_MINUTES}분 동안 쓰지 않으면 이 브라우저에서 로그아웃하고 안내한다 — 돌아온 뒤 첫 입력도 시계를 되돌리지 않는다`, async () => {
    const world: World = { aal: "aal2", factors: [{ id: "f-1", type: "totp", status: "verified" }], code: "1", calls: [], signedOut: 0 };
    const start = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(start);
    await render(world);
    await settle(() => expect(document.querySelector("h1")?.textContent).toBe(ADMIN_TEXT.title));

    // 14분 뒤 입력 — 아직이다(시계가 다시 시작)
    vi.spyOn(Date, "now").mockReturnValue(start + (ADMIN_IDLE_MINUTES - 1) * 60_000);
    await act(async () => window.dispatchEvent(new Event("keydown")));
    expect(document.querySelector("h1")?.textContent).toBe(ADMIN_TEXT.title);

    // 그로부터 15분 넘게 아무것도 없다가 돌아와서 누름 — 그 누름은 시계를 되돌리지 않고 로그아웃
    vi.spyOn(Date, "now").mockReturnValue(start + (2 * ADMIN_IDLE_MINUTES) * 60_000);
    await act(async () => window.dispatchEvent(new Event("pointerdown")));
    await settle(() => expect(document.querySelector("h1")?.textContent).toBe(ADMIN_TEXT.idleTitle));
    expect(world.signedOut).toBe(1);
    expect(document.body.textContent).toContain(ADMIN_TEXT.idleBody);
    const login = [...document.querySelectorAll("a")].find((a) => a.textContent === ADMIN_TEXT.idleLogin);
    // 빌드(trailingSlash)에서는 "/login/" — 시험의 next/link는 그 설정 없이 끝 슬래시를 뗀다
    expect(login?.getAttribute("href")).toMatch(/^\/login\/?$/);
    // 대시보드 데이터는 화면에서 사라졌다
    expect(document.body.textContent).not.toContain(ADMIN_TEXT.privacyNote);
    expect(await violations()).toEqual([]);
  });
});
