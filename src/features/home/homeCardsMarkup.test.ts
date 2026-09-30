// 홈 히어로 카드 마크업 검사 — 칩 목록의 스크린리더 이름(서버 렌더로 확인).
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HeroCard } from "./HomeCards";
import { HOME_TEXT } from "./homeViewModel";

describe("HeroCard — 칩 목록", () => {
  const html = renderToStaticMarkup(h(HeroCard, { dayCount: 40, chips: ["자연분만", "전업"] }));

  it("칩 목록에 이름(분만 방식·목표)이 있고 칩은 목록 항목", () => {
    expect(HOME_TEXT.heroChipsLabel).toBe("분만 방식·목표");
    expect(html).toContain('<ul aria-label="분만 방식·목표"');
    expect(html.match(/<li [^>]*>자연분만<\/li>/g)).toHaveLength(1);
    expect(html.match(/<li [^>]*>전업<\/li>/g)).toHaveLength(1);
  });

  it("카드 영역 이름은 그대로 제목(산후 회복)", () => {
    expect(html).toContain('aria-labelledby="home-hero-title"');
    expect(html).toMatch(/<h2 id="home-hero-title"[^>]*>산후 회복<\/h2>/);
  });
});
