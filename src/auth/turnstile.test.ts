import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCaptchaProvider, type TurnstileApi, type TurnstileRenderOptions } from "./turnstile";

function fakeApi(behave: (o: TurnstileRenderOptions) => void) {
  const removed: string[] = [];
  const rendered: TurnstileRenderOptions[] = [];
  const api: TurnstileApi = {
    render(_el, options) {
      rendered.push(options);
      behave(options);
      return "w1";
    },
    remove(id) {
      removed.push(id);
    },
  };
  return { api, removed, rendered };
}

function slot() {
  const disposed = { count: 0 };
  return { disposed, create: () => ({ element: {} as HTMLElement, dispose: () => void disposed.count++ }) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("Turnstile — 익명(게스트) 로그인의 사람 확인", () => {
  it("사이트 키가 없으면 스크립트를 받지 않고 { kind: none } — 토큰 없이 익명 로그인", async () => {
    const loadApi = vi.fn();
    const get = createCaptchaProvider({ siteKey: null, loadApi, createContainer: () => null });
    expect(await get()).toEqual({ kind: "none" });
    expect(loadApi).not.toHaveBeenCalled();
  });

  it("토큰을 받으면 돌려주고, 위젯·자리를 치운다(토큰은 한 번만 쓸 수 있다)", async () => {
    const { api, removed, rendered } = fakeApi((o) => setTimeout(() => o.callback("tok"), 10));
    const s = slot();
    const get = createCaptchaProvider({ siteKey: "0x4AAA", loadApi: async () => api, createContainer: s.create });
    const p = get();
    await vi.advanceTimersByTimeAsync(10);
    expect(await p).toEqual({ kind: "token", token: "tok" });
    await vi.advanceTimersByTimeAsync(1); // 콜백 안에서 바로 지우지 않고 다음 차례에
    expect(removed).toEqual(["w1"]);
    expect(s.disposed.count).toBe(1);
    expect(rendered[0]).toMatchObject({ sitekey: "0x4AAA", appearance: "interaction-only", action: "guest", language: "ko" });
  });

  it("오류·만료·시간 초과·스크립트 못 받음 → failed(던지지 않는다)", async () => {
    const s = slot();
    const err = createCaptchaProvider({ siteKey: "k", loadApi: async () => fakeApi((o) => o["error-callback"]()).api, createContainer: s.create });
    expect(await err()).toEqual({ kind: "failed" });

    const never = createCaptchaProvider({ siteKey: "k", loadApi: async () => fakeApi(() => {}).api, createContainer: s.create, tokenTimeoutMs: 1_000 });
    const p = never();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await p).toEqual({ kind: "failed" });

    const noScript = createCaptchaProvider({ siteKey: "k", loadApi: async () => null, createContainer: s.create });
    expect(await noScript()).toEqual({ kind: "failed" });
    const throws = createCaptchaProvider({ siteKey: "k", loadApi: () => Promise.reject(new Error("x")), createContainer: s.create });
    expect(await throws()).toEqual({ kind: "failed" });
  });
});
