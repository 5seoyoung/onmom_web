import { describe, expect, it } from "vitest";
import { callbackDestination, callbackRetryHref } from "./callbackRoute";

describe("로그인 콜백이 끝난 뒤 갈 곳", () => {
  it("관문과 같은 판단 — 온보딩 전 → 온보딩, 다시 동의 → /onboarding/?consent=1, 앱 사용자 → 홈", () => {
    expect(callbackDestination("onboarding", false)).toBe("/onboarding/");
    expect(callbackDestination("consent", false)).toBe("/onboarding/?consent=1");
    expect(callbackDestination("main", false)).toBe("/home/");
    expect(callbackDestination("login", false)).toBe("/login/");
    expect(callbackDestination("loading", false)).toBe("/login/");
  });

  it("게스트의 카카오 계정 연결이 끝났으면 연결을 시작한 설정으로 — 동의·온보딩이 먼저면 그쪽", () => {
    expect(callbackDestination("main", true)).toBe("/settings/");
    expect(callbackDestination("consent", true)).toBe("/onboarding/?consent=1");
    expect(callbackDestination("onboarding", true)).toBe("/onboarding/");
  });

  it("실패 안내의 [다시 시도] — 게스트로 쓰는 중이면 설정, 아니면 로그인 화면", () => {
    expect(callbackRetryHref({ id: "guest-a", name: null, provider: "guest" })).toBe("/settings/");
    expect(callbackRetryHref(null)).toBe("/login/");
    expect(callbackRetryHref({ id: "kakao-1", name: null, provider: "kakao" })).toBe("/login/");
  });
});
