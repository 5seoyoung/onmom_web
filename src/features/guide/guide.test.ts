// 회복 가이드 — 보기 모델과 서버 렌더 마크업(문구가 Swift·content.json 그대로, 순서, 출처 칩).
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";
import content from "@/content";
import { GuideScreen } from "./GuideScreen";
import { GUIDE_TEXT, guideCardViews, guideRedFlags, sourceToken } from "./guideContent";
import { SF_ICON_FALLBACK, hasSfIcon, sfIcon } from "./sfIcons";

// next.config의 trailingSlash: true를 흉내 낸다(빌드 때 주입되는 값 — 없으면 Link가 끝 슬래시를 뗀다).
vi.stubEnv("__NEXT_TRAILING_SLASH", "true");
afterAll(() => {
  vi.unstubAllEnvs();
});

const html = renderToStaticMarkup(h(GuideScreen));
const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
const indexOf = (text: string) => {
  const i = html.indexOf(text);
  expect(i, text).toBeGreaterThanOrEqual(0);
  return i;
};
/** 글자 그대로의 문구 찾기(React가 이스케이프한 형태로) */
const textAt = (text: string) => indexOf(escapeHtml(text));

describe("guideContent (GuideView.swift)", () => {
  it("Swift 원문 문구", () => {
    expect(GUIDE_TEXT).toEqual({
      title: "회복 가이드",
      subtitle: "2023 임산부수첩·ACOG 지침 기반 산후 회복 안내",
      redFlagTitle: "즉시 병원에 가야 할 신호",
      redFlagSource: "산욕기 이상소견 · 임산부수첩 2023",
      footnote:
        "출처: 2023 임산부수첩(보건복지부·인구보건복지협회), ACOG Committee Opinion 736. 본 안내는 정보 제공이며 진단이 아닙니다.",
    });
  });

  it("즉시 내원 신호 5줄 — content.json 순서 그대로", () => {
    expect(guideRedFlags()).toEqual([
      "다량의 선홍색 질출혈",
      "38℃ 이상의 고열",
      "아랫배의 심한 복통",
      "유방이 딱딱해지고 심한 통증",
      "회음절개부의 심한 통증",
    ]);
    expect(guideRedFlags(["a", " ", ""])).toEqual(["a"]);
  });

  it("카드 8장 — 순서·요점·출처 칩 토큰", () => {
    const cards = guideCardViews();
    expect(cards.map((c) => c.title)).toEqual([
      "산후 회복 단계 (산욕기)",
      "오로(분비물) 변화",
      "회음부·절개부 관리",
      "산후 운동 복귀",
      "수유·유방 관리",
      "산후 영양",
      "산후 정신건강",
      "산후 검진·피임",
    ]);
    expect(cards.map((c) => c.sourceToken)).toEqual([
      "src:임산부수첩 2023 · ACOG-736",
      "src:임산부수첩 2023",
      "src:임산부수첩 2023",
      "src:ACOG-736 · 임산부수첩 2023",
      "src:임산부수첩 2023",
      "src:임산부수첩 2023",
      "src:임산부수첩 2023(EPDS) · NICE NG194",
      "src:임산부수첩 2023 · ACOG-736",
    ]);
    expect(cards.map((c) => c.points)).toEqual(content.guide_cards.map((c) => c.points));
    expect(new Set(cards.map((c) => c.key)).size).toBe(8);
  });

  it("출처가 비면 칩을 지어내지 않는다", () => {
    expect(sourceToken("")).toBeNull();
    expect(sourceToken("  ")).toBeNull();
    expect(sourceToken(null)).toBeNull();
    expect(sourceToken("src:ACOG-736")).toBe("src:ACOG-736");
    expect(guideCardViews([{ icon_sf: "x", title: "t", points: ["p", ""], source: "" }])[0]).toMatchObject({
      points: ["p"],
      sourceToken: null,
    });
  });
});

describe("sfIcons", () => {
  it("content.json의 가이드·생활 권고 아이콘은 모두 매핑돼 있다", () => {
    const names = [...content.guide_cards.map((c) => c.icon_sf), ...content.lifestyle_tips.map((t) => t.icon_sf)];
    for (const name of names) expect(hasSfIcon(name), name).toBe(true);
  });

  it("모르는 이름은 중립 아이콘, 프로토타입 키는 매핑으로 보지 않는다", () => {
    expect(sfIcon("no.such.symbol")).toBe(SF_ICON_FALLBACK);
    expect(hasSfIcon("toString")).toBe(false);
    expect(sfIcon("drop.fill").filled).toBe(true);
  });
});

describe("GuideScreen 마크업", () => {
  it("순서: 제목 → 부제 → 위험 신호 카드 → 카드 8장 → 각주", () => {
    const order = [
      indexOf(`>${escapeHtml(GUIDE_TEXT.title)}</h1>`),
      textAt(GUIDE_TEXT.subtitle),
      textAt(GUIDE_TEXT.redFlagTitle),
      ...guideRedFlags().map(textAt),
      textAt(GUIDE_TEXT.redFlagSource),
      ...guideCardViews().map((c) => indexOf(`>${escapeHtml(c.title)}</h2>`)),
      textAt(GUIDE_TEXT.footnote),
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("모든 요점이 글자 그대로 나오고, 카드마다 출처 칩이 하나씩", () => {
    for (const point of content.guide_cards.flatMap((c) => c.points)) textAt(point);
    expect(html.match(/<span class="sr-only">출처: <\/span>/g)).toHaveLength(8);
  });

  it("뒤로 가기는 프로필로(끝 슬래시)", () => {
    expect(html).toContain('href="/profile/"');
  });

  it("위험 신호 카드는 제목으로 이름이 붙은 영역", () => {
    expect(html).toContain('aria-labelledby="guide-red-flags"');
    expect(html).toContain(`id="guide-red-flags"`);
  });
});
