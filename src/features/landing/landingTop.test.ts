// 서비스 소개 머리 로고 — 서비스 소개에서는 맨 위로 스크롤, 그 밖에서는 보통 링크.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ROUTES } from "@/routes";
import { LandingHomeLink } from "./LandingHomeLink";
import { landingScrollBehavior, shouldScrollToLandingTop, urlWithoutHash, type LogoClick } from "./landingTop";

const plain: LogoClick = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false };

describe("shouldScrollToLandingTop", () => {
  it("서비스 소개에서 보통 누름 → 맨 위로(링크 이동 대신)", () => {
    expect(shouldScrollToLandingTop("/", plain)).toBe(true);
    expect(shouldScrollToLandingTop(ROUTES.landing, plain)).toBe(true);
  });

  it("다른 화면·모르는 주소에서는 보통 링크 — 이동 뒤 Next가 새 화면 맨 위로 옮긴다", () => {
    for (const p of [ROUTES.home, ROUTES.login, ROUTES.privacy, "/homework", null, undefined]) {
      expect(shouldScrollToLandingTop(p, plain), String(p)).toBe(false);
    }
  });

  it("새 탭·새 창·다른 처리기가 막은 누름은 건드리지 않는다", () => {
    expect(shouldScrollToLandingTop("/", { ...plain, button: 1 })).toBe(false);
    expect(shouldScrollToLandingTop("/", { ...plain, metaKey: true })).toBe(false);
    expect(shouldScrollToLandingTop("/", { ...plain, ctrlKey: true })).toBe(false);
    expect(shouldScrollToLandingTop("/", { ...plain, shiftKey: true })).toBe(false);
    expect(shouldScrollToLandingTop("/", { ...plain, altKey: true })).toBe(false);
    expect(shouldScrollToLandingTop("/", { ...plain, defaultPrevented: true })).toBe(false);
  });
});

describe("landingScrollBehavior", () => {
  it("움직임 줄이기면 바로, 아니면 부드럽게", () => {
    expect(landingScrollBehavior(true)).toBe("instant");
    expect(landingScrollBehavior(false)).toBe("smooth");
  });
});

describe("urlWithoutHash", () => {
  it("섹션 조각만 떼고 basePath·쿼리는 그대로", () => {
    expect(urlWithoutHash({ pathname: "/onmom_web/", search: "", hash: "#features" })).toBe("/onmom_web/");
    expect(urlWithoutHash({ pathname: "/", search: "?a=1", hash: "#steps" })).toBe("/?a=1");
  });

  it("조각이 없으면 주소를 바꾸지 않는다", () => {
    expect(urlWithoutHash({ pathname: "/", search: "", hash: "" })).toBeNull();
  });
});

describe("LandingHomeLink", () => {
  it("정적 HTML에서도 서비스 소개로 가는 보통 링크", () => {
    const html = renderToStaticMarkup(h(LandingHomeLink, { className: "x", children: "온맘" }));
    expect(html).toBe(`<a class="x" href="/">온맘</a>`);
  });
});
