// 우리 지역 지원사업 — 화면 쪽(regionalPrograms.ts 보기 모델·RegionalProgramsSection 마크업). 목록은 시험 자료를 수집 규칙으로 고른 것.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/gov24-serviceList.sample.json";
import { EMPTY_META, SIDO, type RegionalDataset } from "./regionalCore.mjs";
import { selectPrograms } from "./regionalFetch.mjs";
import {
  INITIAL_VISIBLE,
  REGIONAL_ENABLED,
  formatAsOf,
  loadRegionalDataset,
  programsFor,
  regionalDataUrl,
  sidoOptions,
  type FetchJson,
} from "./regionalPrograms";
import { RegionalProgramsCard, RegionalProgramsSection, programLinkId, type RegionalProgramsCardProps } from "./RegionalProgramsSection";
import { GOV24_LOCAL_BIRTH_URL, REGIONAL_TEXT } from "./regionalText";
import { SupportProgramScreen } from "./SupportProgramScreen";

vi.stubEnv("__NEXT_TRAILING_SLASH", "true");
afterAll(() => {
  vi.unstubAllEnvs();
});

const DATASET: RegionalDataset = { version: 1, asOf: "2026-11-08", programs: selectPrograms(fixture.data as Record<string, unknown>[]).programs };
const META = { asOf: "2026-11-08", count: DATASET.programs.length, hash: "0123456789ab" };

describe("기능 표시 — 저장소 그대로(키 없는 빌드)는 꺼져 있다", () => {
  it("REGIONAL_ENABLED false → 카드도 요청도 없다", () => {
    expect(REGIONAL_ENABLED).toBe(false);
    expect(renderToStaticMarkup(h(RegionalProgramsSection))).toBe("");
  });

  it("지원사업 화면에 우리 지역 카드가 없다(첫 화면 그대로)", () => {
    const html = renderToStaticMarkup(h(SupportProgramScreen));
    expect(html).not.toContain(REGIONAL_TEXT.title);
    expect(html).not.toContain("support-programs.json");
  });
});

describe("목록 받기 — 이 사이트의 정적 파일 하나(지역은 주소에 없다)", () => {
  it("주소: basePath 아래 + ?v=해시", () => {
    expect(regionalDataUrl("/onmom_web", "0123456789ab")).toBe("/onmom_web/support-programs.json?v=0123456789ab");
    expect(regionalDataUrl("", "0123456789ab")).toBe("/support-programs.json?v=0123456789ab");
    expect(regionalDataUrl("/onmom_web/", "0123456789ab")).toBe("/onmom_web/support-programs.json?v=0123456789ab");
  });

  it("같은 origin 요청 한 번, 받은 목록은 검사를 거친다", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchJson: FetchJson = async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(DATASET)) };
    };
    const ds = await loadRegionalDataset(META, "/onmom_web", fetchJson);
    expect(ds.programs).toHaveLength(DATASET.programs.length);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/onmom_web/support-programs.json?v=0123456789ab");
    expect(calls[0].url.startsWith("/")).toBe(true);
    expect(calls[0].init.credentials).toBe("same-origin");
  });

  it("HTTP 오류·형식이 틀린 목록·꺼진 빌드는 예외(꺼진 빌드는 요청하지 않는다)", async () => {
    let requests = 0;
    const respond =
      (ok: boolean, body: unknown): FetchJson =>
      async () => {
        requests++;
        return { ok, status: ok ? 200 : 404, json: async () => body };
      };
    await expect(loadRegionalDataset(META, "", respond(false, null))).rejects.toThrow(/HTTP 404/);
    const bad = { ...DATASET, programs: [{ ...DATASET.programs[0], url: "javascript:alert(1)" }] };
    await expect(loadRegionalDataset(META, "", respond(true, bad))).rejects.toThrow(/형식 오류/);
    requests = 0;
    await expect(loadRegionalDataset(EMPTY_META, "", respond(true, DATASET))).rejects.toThrow();
    expect(requests).toBe(0);
  });
});

describe("고른 지역의 사업 묶기", () => {
  it("시·도 선택지는 늘 16개(정부24 순서), 시·군·구는 목록에 있는 이름만 가나다순", () => {
    const options = sidoOptions(DATASET);
    expect(options.map((o) => o.id)).toEqual(SIDO.map((s) => s.id));
    expect(options.find((o) => o.id === "seoul")?.sigungu).toEqual(["강남구"]);
    expect(options.find((o) => o.id === "jeonnam-gwangju")?.sigungu).toEqual(["광양시", "북구"]);
    expect(options.find((o) => o.id === "sejong")?.sigungu).toEqual([]);
    expect(options.find((o) => o.id === "busan")?.sigungu).toEqual([]);
  });

  it("시·도만: 시·도 전체 사업 + 전국. 시·군·구까지: 그 시·군·구 사업도. 다른 지역 사업은 없다", () => {
    const ids = (ps: { id: string }[]) => ps.map((p) => p.id);
    const none = programsFor(DATASET, null, null);
    expect(none.sido).toEqual([]);
    expect(none.sigungu).toEqual([]);
    expect(ids(none.national)).toEqual(["135200000901", "B55100000902", "000000000916"]);

    const seoul = programsFor(DATASET, "seoul", null);
    expect(ids(seoul.sido)).toEqual(["611000000904", "741000000905"]);
    expect(seoul.sigungu).toEqual([]);

    const gangnam = programsFor(DATASET, "seoul", "강남구");
    expect(ids(gangnam.sigungu)).toEqual(["322000000903"]);
    expect(ids(gangnam.sido)).toEqual(["611000000904", "741000000905"]);

    // 이름이 같은 구(북구)는 시·도로 나뉜다
    expect(programsFor(DATASET, "busan", "북구").sigungu).toEqual([]);
    expect(ids(programsFor(DATASET, "jeonnam-gwangju", "북구").sigungu)).toEqual(["362000000908"]);
  });

  it("기준일은 한국식으로", () => {
    expect(formatAsOf("2026-11-08")).toBe("2026년 11월 8일");
  });
});

describe("RegionalProgramsCard 마크업", () => {
  const props = (patch: Partial<RegionalProgramsCardProps> = {}): RegionalProgramsCardProps => ({
    phase: { kind: "ready", dataset: DATASET },
    asOf: "2026-11-08",
    sido: null,
    sigungu: null,
    expanded: new Set(),
    onOpen: () => {},
    onSido: () => {},
    onSigungu: () => {},
    onExpand: () => {},
    ...patch,
  });
  const render = (patch: Partial<RegionalProgramsCardProps> = {}) => renderToStaticMarkup(h(RegionalProgramsCard, props(patch)));

  it("처음: 안내·저장하지 않는다는 말·[지역 고르기]·기준일·정본 안내·출처, 선택지는 아직 없다", () => {
    const html = render({ phase: { kind: "idle" } });
    expect(html).toContain('aria-labelledby="regional-programs-title"');
    expect(html).toContain(`>${REGIONAL_TEXT.title}</h2>`);
    expect(html).toContain(REGIONAL_TEXT.intro);
    expect(html).toContain(REGIONAL_TEXT.privacy);
    expect(html).toMatch(new RegExp(`<button[^>]*>${REGIONAL_TEXT.open}</button>`));
    expect(html).toContain(REGIONAL_TEXT.asOf("2026년 11월 8일"));
    expect(html).toContain(REGIONAL_TEXT.authoritative);
    expect(html).toContain(REGIONAL_TEXT.source);
    expect(html).not.toContain("<select");
  });

  it("받는 중: 상태 알림 / 실패: 경고 + [다시 시도]", () => {
    expect(render({ phase: { kind: "loading" } })).toContain(`<p role="status" class="text-[0.8125rem] text-text-secondary">${REGIONAL_TEXT.loading}</p>`);
    const error = render({ phase: { kind: "error" } });
    expect(error).toContain(`role="alert"`);
    expect(error).toContain(REGIONAL_TEXT.error);
    expect(error).toMatch(new RegExp(`<button[^>]*>${REGIONAL_TEXT.retry}</button>`));
  });

  it("받은 뒤 시·도를 고르기 전: 이름 붙은 선택 두 개(시·군·구는 잠김), 전국 사업만", () => {
    const html = render();
    expect(html).toContain(`<label for="regional-sido"`);
    expect(html).toContain(`<label for="regional-sigungu"`);
    expect(html.match(/<select/g)).toHaveLength(2);
    expect(html).toMatch(/<select id="regional-sigungu"[^>]*disabled=""/);
    for (const s of SIDO) expect(html).toContain(`<option value="${s.id}">${s.name}</option>`);
    expect(html).toContain(REGIONAL_TEXT.pickSido);
    expect(html).toContain(`${REGIONAL_TEXT.nationalTitle} <span class="font-normal text-text-subtle-aa">3개</span>`);
    expect(html).not.toContain("[시험] 강남구 출산 지원");
  });

  it("서울 강남구: 강남구 사업 → 서울 전체 사업 → 전국 사업 순, 다른 지역 사업은 없다", () => {
    const html = render({ sido: "seoul", sigungu: "강남구" });
    const order = ["서울특별시 강남구 사업", "[시험] 강남구 출산 지원", "서울특별시 사업", "[시험] 서울특별시 산후 지원", "[시험] 교육청 출산 가정 안내", REGIONAL_TEXT.nationalTitle, "[시험] 산모 건강관리 지원"].map(
      (t) => html.indexOf(t),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).not.toContain("[시험] 성남시 출산 장려");
    expect(html).not.toContain(REGIONAL_TEXT.pickSido);
  });

  it("각 사업: 이름·기관·요약·새 탭 정부24 링크(이름이 든 접근 가능한 이름 + 숨은 새 창 안내)", () => {
    const html = render({ sido: "seoul", sigungu: "강남구" });
    expect(html).toContain(
      `<a id="${programLinkId("sigungu", 0)}" href="https://www.gov.kr/portal/rcvfvrSvc/dtlEx/322000000903" target="_blank" rel="noopener noreferrer"`,
    );
    expect(html).toContain(`<span class="sr-only">[시험] 강남구 출산 지원 </span>${REGIONAL_TEXT.detail}`);
    expect(html).toContain(`<span class="sr-only">${REGIONAL_TEXT.newTab}</span>`);
    expect(html).toContain(">서울특별시 강남구</p>");
    expect(html).toContain(">시험 자료 - 강남구 출산 가정 안내입니다.</p>");
    // 모든 외부 링크는 정부24(https://www.gov.kr)로만, 새 탭으로
    const hrefs = [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>/g)].map((m) => m[0]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const a of hrefs) {
      expect(a).toMatch(/href="https:\/\/www\.gov\.kr\//);
      expect(a).toContain('target="_blank" rel="noopener noreferrer"');
    }
    expect(html).toContain(`href="${GOV24_LOCAL_BIRTH_URL}"`);
  });

  it("시·군·구 사업이 없는 시·도(세종): 시·군·구 선택 잠김 + 안내, 시·도 사업은 보인다", () => {
    const html = render({ sido: "sejong" });
    expect(html).toMatch(/<select id="regional-sigungu"[^>]*disabled=""/);
    expect(html).toContain(REGIONAL_TEXT.sigunguEmpty);
    expect(html).toContain("[시험] 세종 신생아 지원");
  });

  it("실린 사업이 없는 시·도(부산): 안내 한 줄 + 전국 사업(시·군·구를 고르라고 하지 않는다)", () => {
    const html = render({ sido: "busan" });
    expect(html).toContain(REGIONAL_TEXT.noLocal);
    expect(html).not.toContain(REGIONAL_TEXT.pickSigungu);
    expect(html).toContain(REGIONAL_TEXT.nationalTitle);
  });

  it("시·도만 고르면 시·도 사업 + 시·군·구를 고르라는 안내(시·군·구 사업은 고른 뒤에)", () => {
    const seoul = render({ sido: "seoul" });
    expect(seoul).toContain("[시험] 서울특별시 산후 지원");
    expect(seoul).toContain(REGIONAL_TEXT.pickSigungu);
    expect(seoul).not.toContain("[시험] 강남구 출산 지원");
    expect(seoul).not.toContain(REGIONAL_TEXT.noLocal);
  });

  it("고른 시·군·구가 그 시·도에 없으면(시·도를 바꾼 직후) 시·군·구 묶음 없이 고르라는 안내", () => {
    const html = render({ sido: "gyeonggi", sigungu: "강남구" });
    expect(html).not.toContain("경기도 강남구 사업");
    expect(html).not.toContain("[시험] 성남시 출산 장려");
    expect(html).toContain(REGIONAL_TEXT.pickSigungu);
    expect(html).toContain('<option value="" selected="">');
    expect(html).toContain('<option value="성남시">성남시</option>');
    expect(render({ sido: "gyeonggi", sigungu: "성남시" })).toContain("[시험] 성남시 출산 장려");
  });

  it(`사업이 ${INITIAL_VISIBLE}개보다 많으면 처음 ${INITIAL_VISIBLE}개 + [N개 더 보기], 펼치면 전부`, () => {
    const many: RegionalDataset = {
      ...DATASET,
      programs: Array.from({ length: INITIAL_VISIBLE + 3 }, (_, i) => ({ ...DATASET.programs[0], id: `N${i}`, name: `[시험] 전국 사업 ${i}` })),
    };
    const folded = render({ phase: { kind: "ready", dataset: many } });
    expect(folded.match(/rcvfvrSvc\/dtlEx/g)).toHaveLength(INITIAL_VISIBLE);
    expect(folded).toMatch(new RegExp(`<button[^>]*>${REGIONAL_TEXT.showMore(3)}</button>`));
    const open = render({ phase: { kind: "ready", dataset: many }, expanded: new Set(["national"]) });
    expect(open.match(/rcvfvrSvc\/dtlEx/g)).toHaveLength(INITIAL_VISIBLE + 3);
    expect(open).not.toContain(REGIONAL_TEXT.showMore(3));
    expect(open).toContain(`id="${programLinkId("national", INITIAL_VISIBLE)}"`);
  });

  it("문구는 해요체·의료 효과를 말하지 않는다", () => {
    const texts = Object.values(REGIONAL_TEXT).map((v) => (typeof v === "function" ? (v as (x: never) => string)("가" as never) : v));
    for (const t of texts) {
      expect(t).not.toMatch(/(습니다|입니다|합니다)[.]?$/);
      expect(t).not.toMatch(/치료|효과|완치|예방됩니다/);
    }
  });
});
