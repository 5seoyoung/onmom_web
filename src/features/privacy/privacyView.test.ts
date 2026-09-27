import { describe, expect, it } from "vitest";
import { ROUTES } from "@/routes";
import { PRIVACY_BACK_FROM, privacyBackHref } from "./privacyView";

describe("privacyBackHref", () => {
  it("앱을 쓰는 사람(로그인 + 온보딩 완료)은 설정으로 돌아간다", () => {
    expect(privacyBackHref({ hydrated: true, isSignedIn: true, hasOnboarded: true })).toBe(ROUTES.settings);
  });

  it("로그인 전 방문자는 서비스 소개로 — 설정으로 보내면 관문이 로그인 화면으로 돌린다", () => {
    expect(privacyBackHref({ hydrated: true, isSignedIn: false, hasOnboarded: false })).toBe(ROUTES.landing);
    // 로그아웃해도 기록(hasOnboarded)은 남는다 — 계정이 없으면 여전히 서비스 소개로
    expect(privacyBackHref({ hydrated: true, isSignedIn: false, hasOnboarded: true })).toBe(ROUTES.landing);
  });

  it("로그인했지만 온보딩 전이면 서비스 소개로", () => {
    expect(privacyBackHref({ hydrated: true, isSignedIn: true, hasOnboarded: false })).toBe(ROUTES.landing);
  });

  it("저장소를 읽기 전에는 공개 주소(서비스 소개)", () => {
    expect(privacyBackHref({ hydrated: false, isSignedIn: true, hasOnboarded: true })).toBe(ROUTES.landing);
  });
});

describe("PRIVACY_BACK_FROM", () => {
  it("이 화면으로 링크하는 서비스 소개·설정 — 앞 기록이 이 중 하나면 [뒤로]가 그 화면으로 돌아간다", () => {
    expect([...PRIVACY_BACK_FROM].sort()).toEqual([ROUTES.landing, ROUTES.settings].sort());
  });
});
