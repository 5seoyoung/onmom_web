// 생활 권고 — 보기 모델과 서버 렌더 마크업(문구가 content.json 그대로, 순서, 근거·출처 칩, 면책 배너).
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";
import content from "@/content";
import { LifestyleScreen } from "./LifestyleScreen";
import { LIFESTYLE_TEXT, lifestyleTipViews } from "./lifestyleContent";

// next.config의 trailingSlash: true를 흉내 낸다(빌드 때 주입되는 값 — 없으면 Link가 끝 슬래시를 뗀다).
vi.stubEnv("__NEXT_TRAILING_SLASH", "true");
afterAll(() => {
  vi.unstubAllEnvs();
});

const html = renderToStaticMarkup(h(LifestyleScreen));
const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
const indexOf = (text: string) => {
  const i = html.indexOf(text);
  expect(i, text).toBeGreaterThanOrEqual(0);
  return i;
};
/** 글자 그대로의 문구 찾기(React가 이스케이프한 형태로) */
const textAt = (text: string) => indexOf(escapeHtml(text));

describe("lifestyleContent (LifestyleView.swift · OnmomEngine.swift:59-80)", () => {
  it("화면 제목은 Swift 원문", () => {
    expect(LIFESTYLE_TEXT.title).toBe("생활 권고");
  });

  it("5장 — 표 순서, 분류·제목·칩 그대로", () => {
    const tips = lifestyleTipViews();
    expect(tips.map((t) => [t.category, t.title, t.chips])).toEqual([
      ["정신건강", "기분 살피기", ["EPDS", "src:임산부수첩 2023"]],
      ["수면·안정", "충분한 수면과 안정", ["산후 몸조리", "src:임산부수첩 2023"]],
      ["영양", "단백질·철분 보충", ["빈혈 예방", "src:임산부수첩 2023"]],
      ["활동", "가벼운 활동부터", ["조기보행", "src:ACOG-736"]],
      ["수분", "수분과 카페인", ["수유", "src:임산부수첩 2023"]],
    ]);
    expect(tips.map((t) => t.detail)).toEqual(content.lifestyle_tips.map((t) => t.detail));
  });

  it("빈 칩 토큰은 뺀다", () => {
    const [tip] = lifestyleTipViews([{ icon_sf: "x", category: "c", title: "t", detail: "d", chips: ["", "src:A"] }]);
    expect(tip.chips).toEqual(["src:A"]);
  });
});

describe("LifestyleScreen 마크업", () => {
  it("순서: 제목 → (분류 → 제목 → 설명 → 칩) × 5 → 면책 배너", () => {
    const order = [
      indexOf(`>${escapeHtml(LIFESTYLE_TEXT.title)}</h1>`),
      ...lifestyleTipViews().flatMap((t) => [
        indexOf(`>${escapeHtml(t.category)}</p>`),
        indexOf(`>${escapeHtml(t.title)}</h2>`),
        textAt(t.detail),
      ]),
      indexOf('role="note"'),
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("근거 칩 5개 + 출처 칩 5개, 면책 배너 문구", () => {
    expect(html.match(/<span class="sr-only">출처: <\/span>/g)).toHaveLength(5);
    for (const chip of ["EPDS", "산후 몸조리", "빈혈 예방", "조기보행", "수유"]) indexOf(`>${escapeHtml(chip)}</span>`);
    textAt("온맘은 의료기기가 아니며, 제공되는 정보는 참고용입니다.");
    expect(html).toContain('href="/profile/"');
  });
});
