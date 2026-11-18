// 지원사업 추천 — 보기 모델(결과 표시 조건·링크 검사)과 첫 화면 서버 렌더 마크업.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";
import { SUPPORT_LINK_HOSTS } from "@/api/safeUrl";
import { SUPPORT_DOMAINS, SUPPORT_TEXT, SUPPORT_UNIVERSAL, type SupportPhone } from "@/rules/support";
import { SolutionCard, SupportProgramScreen } from "./SupportProgramScreen";
import { GOV24_LOCAL_BIRTH_URL } from "./regionalText";
import { supportLink, supportPhone, supportResultHeadingId, supportResultsView } from "./supportViewModel";

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

describe("supportLink — 공식 페이지(검토한 호스트)·전화만, 검사를 통과할 때만", () => {
  const ALL = [SUPPORT_UNIVERSAL, ...SUPPORT_DOMAINS.flatMap((d) => d.solutions)];

  it("공통 안내(정부24)는 새 탭 외부 링크", () => {
    expect(supportLink(SUPPORT_UNIVERSAL.url)).toEqual({
      kind: "web",
      href: "https://www.gov.kr/portal/onestopSvc/happyBirth",
    });
  });

  it("중앙난임·우울증상담센터는 전화 링크", () => {
    const solution = SUPPORT_DOMAINS.flatMap((d) => d.solutions).find((s) => s.url?.startsWith("tel:"));
    expect(solution?.name).toBe("중앙난임·우울증상담센터 02-2276-2276");
    expect(supportLink(solution?.url)).toEqual({ kind: "tel", href: "tel:0222762276" });
  });

  it("content.json의 모든 항목이 링크로 이어진다(2026-11-18 전문의 검토) — 글자만 남는 항목이 없다", () => {
    expect(ALL).toHaveLength(21);
    expect(ALL.filter((s) => supportLink(s.url) === null).map((s) => s.name)).toEqual([]);
    // 주소는 정규화해도 그대로(검사를 거쳐 바뀌는 주소가 없다)
    for (const s of ALL) expect(supportLink(s.url)?.href, s.name).toBe(s.url);
  });

  it("허용 호스트는 정부·공공기관 공식 페이지뿐이고, 모두 실제로 쓰인다(안 쓰는 호스트를 남기지 않는다)", () => {
    expect([...SUPPORT_LINK_HOSTS].sort()).toEqual(
      [
        "www.gov.kr",
        "www.bokjiro.go.kr",
        "www.mohw.go.kr",
        "www.mogef.go.kr",
        "www.childcare.go.kr",
        "central.childcare.go.kr",
        "www.familynet.or.kr",
        "www.e-health.go.kr",
      ].sort(),
    );
    // 정부 도메인(gov.kr·*.go.kr) 또는 공공기관(*.or.kr — 가족센터)
    for (const host of SUPPORT_LINK_HOSTS) expect(host, host).toMatch(/(^www\.gov\.kr|\.go\.kr|\.or\.kr)$/);
    const used = new Set(
      [...ALL.map((s) => s.url), GOV24_LOCAL_BIRTH_URL]
        .filter((u): u is string => u !== null && u.startsWith("https://"))
        .map((u) => new URL(u).hostname),
    );
    expect([...used].sort()).toEqual([...SUPPORT_LINK_HOSTS].sort());
  });

  it("2026-11-18에 넣은 공식 페이지(열어서 사업 이름을 확인한 주소)", () => {
    const urlOf = (name: string) => SUPPORT_DOMAINS.flatMap((d) => d.solutions).find((s) => s.name === name)?.url;
    expect(urlOf("긴급복지지원제도")).toBe("https://www.mohw.go.kr/menu.es?mid=a10708010100");
    expect(urlOf("아이돌봄 서비스")).toBe("https://www.gov.kr/portal/rcvfvrSvc/dtlEx/423000000362");
    expect(urlOf("지자체 산후조리비 지원")).toBe(GOV24_LOCAL_BIRTH_URL);
    expect(urlOf("국공립 어린이집 우선입소")).toBe("https://www.childcare.go.kr/?menuno=174");
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

  it.each([["https://www.bokjiro.go.kr.evil.example/"], ["https://bokjiro.go.kr/"], ["http://www.mohw.go.kr/"], ["https://www.mogef.go.kr:8443/"]])(
    "새로 허용한 호스트도 같은 규칙(정확한 호스트·https·포트 없음): %s",
    (url) => {
      expect(supportLink(url)).toBeNull();
    },
  );
});

describe("supportPhone — 전화 문의를 tel: 링크로 걸어도 되는지", () => {
  it("번호는 숫자만 남긴 tel:, 보이는 글자는 표기 그대로", () => {
    expect(supportPhone({ label: "보건복지상담센터", number: "129" })).toEqual({
      href: "tel:129",
      label: "보건복지상담센터",
      number: "129",
      ariaLabel: "보건복지상담센터 129에 전화 걸기",
    });
    expect(supportPhone({ label: " 아이돌봄서비스 ", number: " 1577-2514 " })).toMatchObject({
      href: "tel:15772514",
      label: "아이돌봄서비스",
      number: "1577-2514",
    });
    expect(supportPhone({ label: "아동권리보장원", number: "02-6454-8500" })?.href).toBe("tel:0264548500");
  });

  it.each<[SupportPhone | null | undefined]>([
    [null],
    [undefined],
    [{ label: "", number: "129" }],
    [{ label: "   ", number: "129" }],
    [{ label: "센터", number: "" }],
    [{ label: "센터", number: "1" }],
    [{ label: "센터", number: "12345" }],
    [{ label: "센터", number: "1577 2514" }],
    [{ label: "센터", number: "+82-2-1234-5678" }],
    [{ label: "센터", number: "1577-2514;ext=1" }],
    [{ label: "센터", number: "javascript:alert(1)" }],
    [{ label: "센터", number: "1577--2514" }],
    [{ label: 1 as unknown as string, number: "129" }],
  ])("걸지 않음: %j", (phone) => {
    expect(supportPhone(phone)).toBeNull();
  });

  it("content.json의 전화 문의는 모두 검사를 통과한다", () => {
    for (const s of SUPPORT_DOMAINS.flatMap((d) => d.solutions)) {
      if (s.phone) expect(supportPhone(s.phone), s.name).not.toBeNull();
    }
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

describe("해결책 행의 전화번호(web/07 §5 — 전화 링크로)", () => {
  const domainOf = (id: number) => SUPPORT_DOMAINS.find((d) => d.id === id)!;

  it("링크가 없는 행의 설명 속 번호(고용노동부 고객상담 1350)는 번호만 tel: 링크 — 글자는 그대로", () => {
    // content.json의 행은 이제 모두 링크가 있다 — 링크 없는 행의 길(PhoneLinks)은 url만 비운 같은 행으로 확인한다
    const [leave] = domainOf(2).solutions;
    const html = renderToStaticMarkup(h(SolutionCard, { title: "t", solutions: [{ ...leave, url: null, phone: null }] }));
    expect(html).toContain(
      '고용노동부 - 고객상담 <a href="tel:1350" aria-label="1350에 전화 걸기" class="whitespace-nowrap rounded-xs underline underline-offset-2 text-primary-text">1350</a>',
    );
    expect(html.match(/<a /g)).toHaveLength(1);
  });

  it("공식 페이지와 전화가 둘 다 있는 행(육아휴직) — 행은 새 탭 링크, 전화는 행 아래 따로(링크를 겹치지 않음)", () => {
    const html = renderToStaticMarkup(h(SolutionCard, { title: "t", solutions: [domainOf(2).solutions[0]] }));
    expect(html.match(/<a /g)).toHaveLength(2);
    const rowStart = html.indexOf('<a href="https://www.bokjiro.go.kr/');
    expect(rowStart).toBeGreaterThanOrEqual(0);
    const rowEnd = html.indexOf("</a>", rowStart);
    const row = html.slice(rowStart, rowEnd);
    expect(row).toContain('target="_blank" rel="noopener noreferrer"');
    expect(row).not.toContain("tel:"); // 행 링크 안에 전화 링크가 없다 — 설명 속 1350은 글자로만
    expect(row).toContain('고용노동부 - 고객상담 <span class="whitespace-nowrap">1350</span>');
    // 전화 링크는 행 링크가 닫힌 뒤
    const tel = html.indexOf('<a href="tel:1350"');
    expect(tel).toBeGreaterThan(rowEnd);
    expect(html).toContain('<a href="tel:1350" aria-label="고용노동부 고객상담센터 1350에 전화 걸기"');
    expect(html).toContain('고용노동부 고객상담센터 <span class="whitespace-nowrap">1350</span>');
  });

  it("전화 문의가 있는 넷은 모두 눌러서 걸 수 있고, 접근성 이름이 보이는 글자로 시작한다", () => {
    const all = SUPPORT_DOMAINS.flatMap((d) => d.solutions);
    const rendered = all
      .filter((s) => s.phone)
      .map((s) => {
        const html = renderToStaticMarkup(h(SolutionCard, { title: "t", solutions: [s] }));
        return html.match(/<a href="(tel:\d+)" aria-label="([^"]+)"/)?.slice(1);
      });
    expect(rendered).toEqual([
      ["tel:129", "보건복지상담센터 129에 전화 걸기"],
      ["tel:1350", "고용노동부 고객상담센터 1350에 전화 걸기"],
      ["tel:15772514", "아이돌봄서비스 1577-2514에 전화 걸기"],
      ["tel:15779337", "가족센터 1577-9337에 전화 걸기"],
    ]);
  });

  it("전화 문의가 없는 행은 행 링크 하나뿐", () => {
    const html = renderToStaticMarkup(h(SolutionCard, { title: "t", solutions: domainOf(6).solutions }));
    expect(html.match(/<a /g)).toHaveLength(4);
    expect(html).not.toContain("tel:");
    expect(html.match(/target="_blank" rel="noopener noreferrer"/g)).toHaveLength(4);
    expect(html.match(/<span class="sr-only"> \(새 창\)<\/span>/g)).toHaveLength(4);
  });

  it("행 전체가 링크인 항목(중앙난임·우울증상담센터)은 안에 링크를 겹치지 않는다", () => {
    // 같은 카드의 다른 셋은 2026-11-18부터 공식 페이지 링크 — 이 행만 따로 그려 본다
    const counseling = domainOf(5).solutions.filter((s) => s.url?.startsWith("tel:"));
    expect(counseling).toHaveLength(1);
    const html = renderToStaticMarkup(h(SolutionCard, { title: "t", solutions: counseling }));
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain('<a href="tel:0222762276"');
    expect(html).not.toContain("tel:02-2276-2276");
    // 번호는 한 줄로 묶기만(링크 없이 — 행이 이미 전화 링크)
    expect(html).toContain('중앙난임·우울증상담센터 <span class="whitespace-nowrap">02-2276-2276</span>');
  });

  it("번호가 없는 행은 링크가 없다(공통 안내 카드는 정부24 링크 하나)", () => {
    const html = renderToStaticMarkup(h(SolutionCard, { title: "t", solutions: [SUPPORT_UNIVERSAL] }));
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).not.toContain("tel:");
  });
});
