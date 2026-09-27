// 지원사업 추천 — 보기 모델(결과 표시 조건·링크 검사)과 첫 화면 서버 렌더 마크업.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";
import { SUPPORT_DOMAINS, SUPPORT_TEXT, SUPPORT_UNIVERSAL } from "@/rules/support";
import { SupportProgramScreen } from "./SupportProgramScreen";
import { SUPPORT_LINK_HOSTS, supportLink, supportResultHeadingId, supportResultsView } from "./supportViewModel";

// next.config의 trailingSlash: true를 흉내 낸다(빌드 때 주입되는 값 — 없으면 Link가 끝 슬래시를 뗀다).
vi.stubEnv("__NEXT_TRAILING_SLASH", "true");
afterAll(() => {
  vi.unstubAllEnvs();
});

describe("supportResultsView (SupportProgramView.swift:127-139)", () => {
  it("[추천 받기] 전에는 결과 자리를 그리지 않는다(체크가 있어도)", () => {
    expect(supportResultsView(new Set([1, 13]), false)).toEqual({ visible: false, showNothingChecked: false, domains: [] });
  });

  it("누른 뒤: 체크한 영역만 표 순서로", () => {
    const view = supportResultsView(new Set([16, 1, 2]), true);
    expect(view.visible).toBe(true);
    expect(view.showNothingChecked).toBe(false);
    expect(view.domains.map((d) => d.title)).toEqual(["경제적 안정성·재정 부담", "미숙아·선천성 이상아"]);
  });

  it("누른 뒤 체크를 모두 풀면 안내 문구만(카드 없음)", () => {
    expect(supportResultsView(new Set(), true)).toEqual({ visible: true, showNothingChecked: true, domains: [] });
  });

  it("결과 제목 id는 영역마다 다르다", () => {
    const ids = SUPPORT_DOMAINS.map((d) => supportResultHeadingId(d.id));
    expect(new Set(ids).size).toBe(SUPPORT_DOMAINS.length);
  });
});

describe("supportLink — 링크는 Swift에 있는 두 곳만, 검사를 통과할 때만", () => {
  it("공통 안내(정부24)는 새 탭 외부 링크", () => {
    expect(supportLink(SUPPORT_UNIVERSAL.url)).toEqual({
      kind: "web",
      href: "https://www.gov.kr/portal/onestopSvc/happyBirth",
    });
    expect([...SUPPORT_LINK_HOSTS]).toEqual(["www.gov.kr"]);
  });

  it("중앙난임·우울증상담센터는 전화 링크", () => {
    const solution = SUPPORT_DOMAINS.flatMap((d) => d.solutions).find((s) => s.url?.startsWith("tel:"));
    expect(solution?.name).toBe("중앙난임·우울증상담센터 02-2276-2276");
    expect(supportLink(solution?.url)).toEqual({ kind: "tel", href: "tel:0222762276" });
  });

  it("content.json에서 링크가 걸리는 항목은 정확히 두 개", () => {
    const all = [SUPPORT_UNIVERSAL, ...SUPPORT_DOMAINS.flatMap((d) => d.solutions)];
    expect(all.filter((s) => supportLink(s.url) !== null).map((s) => s.name)).toEqual([
      "정부24 행복출산 원스톱 서비스",
      "중앙난임·우울증상담센터 02-2276-2276",
    ]);
  });

  it("공용 허용 목록(영상·카카오)도 통과", () => {
    expect(supportLink("https://youtu.be/abc")).toEqual({ kind: "web", href: "https://youtu.be/abc" });
  });

  it.each([
    [null],
    [undefined],
    [""],
    ["   "],
    ["http://www.gov.kr/portal"],
    ["https://gov.kr.evil.example/portal"],
    ["https://evil.example/?u=https://www.gov.kr"],
    ["https://user:pw@www.gov.kr/"],
    ["https://www.gov.kr:8443/"],
    ["javascript:alert(1)"],
    ["tel:"],
    ["tel:02-2276-2276"],
    ["tel:0222762276;ext=1"],
    ["tel:javascript:alert(1)"],
    ["mailto:a@b.c"],
  ])("링크로 만들지 않음: %s", (url) => {
    expect(supportLink(url)).toBeNull();
  });
});

describe("SupportProgramScreen 첫 화면 마크업", () => {
  const html = renderToStaticMarkup(h(SupportProgramScreen));
  const escapeHtml = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
  const indexOf = (text: string) => {
    const i = html.indexOf(text);
    expect(i, text).toBeGreaterThanOrEqual(0);
    return i;
  };
  /** 글자 그대로의 문구 찾기(React가 이스케이프한 형태로) */
  const textAt = (text: string) => indexOf(escapeHtml(text));

  it("순서: 제목 → 안내 → 모든 산모 공통 → 6영역 16문항 → 추천 받기 → 하단 안내", () => {
    const order = [
      indexOf(`>${escapeHtml(SUPPORT_TEXT.title)}</h1>`),
      textAt(SUPPORT_TEXT.intro),
      indexOf(`>${escapeHtml(SUPPORT_TEXT.universalTitle)}</h2>`),
      textAt(SUPPORT_UNIVERSAL.name),
      textAt(SUPPORT_UNIVERSAL.note),
      ...SUPPORT_DOMAINS.flatMap((d) => [indexOf(`>${escapeHtml(d.title)}</legend>`), ...d.questions.map((q) => textAt(q.text))]),
      indexOf(`>${escapeHtml(SUPPORT_TEXT.recommendButton)}</button>`),
      textAt(SUPPORT_TEXT.footer),
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("처음에는 체크 없음 → [추천 받기] 비활성, 결과·빈 안내 없음", () => {
    expect(html.match(/type="checkbox"/g)).toHaveLength(16);
    expect(html).not.toMatch(/type="checkbox"[^>]*checked/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>추천 받기<\/button>/);
    expect(html).not.toContain(SUPPORT_TEXT.nothingChecked);
    expect(html).not.toContain("저소득층 기저귀·조제분유 지원 사업");
  });

  it("공통 안내는 새 탭 링크(noopener noreferrer) + 숨은 새 창 안내", () => {
    expect(html).toContain(
      '<a href="https://www.gov.kr/portal/onestopSvc/happyBirth" target="_blank" rel="noopener noreferrer"',
    );
    expect(html).toContain('<span class="sr-only"> (새 창)</span>');
  });

  it("뒤로 가기는 프로필로(끝 슬래시)", () => {
    expect(html).toContain('href="/profile/"');
  });
});
