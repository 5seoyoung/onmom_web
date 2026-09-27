import { describe, expect, it } from "vitest";
import { initialState } from "@/store/defaults";
import { rootScreenFor, type AppSnapshot } from "@/store/appStore";
import { gateDecision, normalizePathname, routeKindFor, SCREEN_PATH } from "./gate";

function snap(over: Partial<AppSnapshot> & { hasOnboarded?: boolean }): AppSnapshot {
  const { hasOnboarded = false, ...rest } = over;
  return {
    hydrated: true,
    storageAvailable: true,
    account: null,
    ...rest,
    state: { ...initialState(), hasOnboarded },
  };
}

const guest = { id: "guest-1", name: null, provider: "guest" } as const;

describe("normalizePathname", () => {
  it("끝 슬래시를 무시한다", () => {
    expect(normalizePathname("/login/")).toBe("/login");
    expect(normalizePathname("/login")).toBe("/login");
    expect(normalizePathname("/login//")).toBe("/login");
    expect(normalizePathname("/")).toBe("/");
    expect(normalizePathname("")).toBe("/");
    expect(normalizePathname(null)).toBe("/");
    expect(normalizePathname("login")).toBe("/login");
  });
});

describe("routeKindFor", () => {
  it("로그인·온보딩", () => {
    expect(routeKindFor("/login/")).toBe("login");
    expect(routeKindFor("/login")).toBe("login");
    expect(routeKindFor("/onboarding/")).toBe("onboarding");
  });

  it("서비스 소개·개인정보처리방침·로그인 콜백·관리자 화면은 늘 연다", () => {
    expect(routeKindFor("/admin/")).toBe("public");
    expect(routeKindFor("/admin")).toBe("public");
    expect(routeKindFor("/")).toBe("public");
    expect(routeKindFor("")).toBe("public");
    expect(routeKindFor("/privacy/")).toBe("public");
    expect(routeKindFor("/privacy")).toBe("public");
    expect(routeKindFor("/auth/callback/")).toBe("public");
    expect(routeKindFor("/auth/callback")).toBe("public");
  });

  it("개발용 카탈로그(/dev/*)는 없어졌다 — 다른 없는 주소처럼 메인", () => {
    expect(routeKindFor("/dev/components/")).toBe("main");
    expect(routeKindFor("/dev")).toBe("main");
  });

  it("그 외는 메인(탭·하위 화면·없는 주소)", () => {
    for (const p of ["/home/", "/exercise/", "/record/", "/journal/", "/journal/post/", "/profile/", "/analyze/", "/settings/", "/settings/profile/", "/chat/", "/nope/"]) {
      expect(routeKindFor(p)).toBe("main");
    }
    // 접두만 같은 주소는 다른 화면
    expect(routeKindFor("/login-help/")).toBe("main");
    expect(routeKindFor("/privacy/extra/")).toBe("main");
    expect(routeKindFor("/auth/")).toBe("main");
    expect(routeKindFor("/auth/callback/x/")).toBe("main");
  });
});

describe("gateDecision", () => {
  it("저장소를 읽기 전에는 보호된 화면을 그리지 않는다", () => {
    const screen = rootScreenFor({ ...snap({}), hydrated: false });
    expect(screen).toBe("loading");
    expect(gateDecision(screen, "/home/")).toEqual({ kind: "wait" });
    expect(gateDecision(screen, "/login/")).toEqual({ kind: "wait" });
    expect(gateDecision(screen, "/onboarding/")).toEqual({ kind: "wait" });
    expect(gateDecision(screen, "/settings/")).toEqual({ kind: "wait" });
  });

  it("공개 화면은 읽기 전에도, 어느 단계에서도 그대로 그린다(이동 없음)", () => {
    for (const screen of ["loading", "login", "onboarding", "consent", "main"] as const) {
      for (const p of ["/", "/privacy/", "/auth/callback/", "/admin/"]) {
        expect(gateDecision(screen, p)).toEqual({ kind: "render" });
      }
    }
  });

  it("로그인 전: 로그인 화면만, 나머지는 /login/으로", () => {
    const screen = rootScreenFor(snap({}));
    expect(screen).toBe("login");
    expect(gateDecision(screen, "/login/")).toEqual({ kind: "render" });
    expect(gateDecision(screen, "/home/")).toEqual({ kind: "redirect", to: "/login/" });
    expect(gateDecision(screen, "/onboarding/")).toEqual({ kind: "redirect", to: "/login/" });
    expect(gateDecision(screen, "/record/")).toEqual({ kind: "redirect", to: "/login/" });
  });

  it("로그인했고 온보딩 전: 온보딩만", () => {
    const screen = rootScreenFor(snap({ account: guest }));
    expect(screen).toBe("onboarding");
    expect(gateDecision(screen, "/onboarding/")).toEqual({ kind: "render" });
    expect(gateDecision(screen, "/login/")).toEqual({ kind: "redirect", to: "/onboarding/" });
    expect(gateDecision(screen, "/home/")).toEqual({ kind: "redirect", to: "/onboarding/" });
  });

  it("온보딩을 마쳤으면 메인. 로그인·온보딩 주소는 홈 탭(/home/)으로", () => {
    const screen = rootScreenFor(snap({ account: guest, hasOnboarded: true }));
    expect(screen).toBe("main");
    expect(SCREEN_PATH.main).toBe("/home/");
    expect(gateDecision(screen, "/home/")).toEqual({ kind: "render" });
    expect(gateDecision(screen, "/exercise/")).toEqual({ kind: "render" });
    expect(gateDecision(screen, "/login/")).toEqual({ kind: "redirect", to: "/home/" });
    expect(gateDecision(screen, "/onboarding")).toEqual({ kind: "redirect", to: "/home/" });
  });

  it("로그아웃하면 온보딩을 마쳤어도 로그인 화면(RootView.swift:10-11)", () => {
    const screen = rootScreenFor(snap({ hasOnboarded: true }));
    expect(screen).toBe("login");
    expect(gateDecision(screen, "/settings/")).toEqual({ kind: "redirect", to: "/login/" });
  });

  it("이동한 곳에서는 다시 이동하지 않는다(되돌이 없음) — usePathname은 쿼리를 떼고 준다", () => {
    for (const screen of ["login", "onboarding", "consent", "main"] as const) {
      for (const from of ["/", "/home/", "/login/", "/onboarding/", "/record/", "/x/"]) {
        const d = gateDecision(screen, from);
        if (d.kind === "redirect") {
          expect(d.to).toBe(SCREEN_PATH[screen]);
          const landedPath = d.to.split("?")[0];
          expect(gateDecision(screen, landedPath)).toEqual({ kind: "render" });
        }
      }
    }
  });
});

describe("다시 동의(consent) — 서버 저장이 설정된 빌드에서 지금 판의 동의가 없음", () => {
  it("온보딩을 마쳤어도 지금 판의 동의가 없으면 consent — 설정이 없으면(requireCurrentConsent=false) 지금처럼 main", () => {
    const s = snap({ account: guest, hasOnboarded: true });
    expect(rootScreenFor(s, true)).toBe("consent");
    expect(rootScreenFor(s, false)).toBe("main");
  });

  it("앱 화면·로그인 주소는 /onboarding/?consent=1로, 온보딩 주소에서는 그대로 그린다(동의 단계만 보이는 온보딩)", () => {
    expect(SCREEN_PATH.consent).toBe("/onboarding/?consent=1");
    expect(gateDecision("consent", "/home/")).toEqual({ kind: "redirect", to: "/onboarding/?consent=1" });
    expect(gateDecision("consent", "/settings/")).toEqual({ kind: "redirect", to: "/onboarding/?consent=1" });
    expect(gateDecision("consent", "/login/")).toEqual({ kind: "redirect", to: "/onboarding/?consent=1" });
    expect(gateDecision("consent", "/onboarding/")).toEqual({ kind: "render" });
    expect(gateDecision("consent", "/onboarding")).toEqual({ kind: "render" });
  });

  it("동의하면 main — 다시 동의 화면(온보딩 주소)에 남아 있으면 홈으로", () => {
    expect(gateDecision("main", "/onboarding/")).toEqual({ kind: "redirect", to: "/home/" });
  });
});
