import { describe, expect, it } from "vitest";
import { ROUTES } from "@/routes";
import { PRIVACY_BACK_FROM, privacyBackHref } from "./privacyView";

describe("privacyBackHref", () => {
  it("앱을 쓰는 사람(로그인 + 온보딩 완료)은 설정으로 돌아간다", () => {
    expect(privacyBackHref({ hydrated: true, isSignedIn: true, hasOnboarded: true })).toBe(ROUTES.settings);
  });

  it("로그인 전 방문자는 시작 주소(/)로 — 그 주소가 로그인 화면으로 옮긴다", () => {
    expect(privacyBackHref({ hydrated: true, isSignedIn: false, hasOnboarded: false })).toBe(ROUTES.root);
    // 로그아웃해도 기록(hasOnboarded)은 남는다 — 계정이 없으면 여전히 시작 주소로
    expect(privacyBackHref({ hydrated: true, isSignedIn: false, hasOnboarded: true })).toBe(ROUTES.root);
  });

  it("로그인했지만 온보딩 전이면 시작 주소로(앱 홈을 거쳐 관문이 온보딩으로 보낸다)", () => {
    expect(privacyBackHref({ hydrated: true, isSignedIn: true, hasOnboarded: false })).toBe(ROUTES.root);
  });

  it("저장소를 읽기 전에는 공개 주소(시작 주소)", () => {
    expect(privacyBackHref({ hydrated: false, isSignedIn: true, hasOnboarded: true })).toBe(ROUTES.root);
  });
});

describe("PRIVACY_BACK_FROM", () => {
  it("이 화면으로 링크하는 설정 — 앞 기록이 그 화면이면 [뒤로]가 그 화면으로 돌아간다(시작 주소는 화면이 없어 빠진다)", () => {
    expect([...PRIVACY_BACK_FROM]).toEqual([ROUTES.settings]);
  });
});
