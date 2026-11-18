// 분석 결과의 근거 칩 — 설명 칩은 항목마다 보이고, 출처(src:)는 묶음 끝 "출처 보기" 하나에 중복 없이(2026-11-15 산부인과 전문의 화면 검토).
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { RecItem } from "@/rules/recovery";
import type { RedFlag } from "@/rules/redflag";
import { AnalyzeResult } from "./AnalyzeResult";
import type { AnalyzeResultModel } from "./analyzeModel";

// next.config의 trailingSlash: true를 흉내 낸다(빌드 때 주입되는 값)
vi.stubEnv("__NEXT_TRAILING_SLASH", "true");
afterAll(() => {
  vi.unstubAllEnvs();
});

const model = (items: RecItem[], hospitalSignal: RedFlag | null = null): AnalyzeResultModel => ({
  hospitalSignal,
  profile: { stage: "단계", subtitle: "부제", source: "기준", note: "안내" },
  blocks: [{ kind: "group", group: { key: "caution", title: "주의", tone: "accent", items } }],
  videos: null,
  done: "완료",
  restart: "다시",
});
const render = (m: AnalyzeResultModel) => renderToStaticMarkup(h(AnalyzeResult, { model: m, onRestart: () => {} }));
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("AnalyzeResult — 근거 칩", () => {
  it("지금 운동 항목 칩(출처 없음)은 그대로 칩 줄, '출처 보기'는 없다", () => {
    const html = render(model([{ item: "a", label: "항목", evidenceChips: ["6주차부터 가능", "회복 단계 기준"] }]));
    expect(html).toContain(">6주차부터 가능</span>");
    expect(html).toContain(">회복 단계 기준</span>");
    expect(html).not.toContain("<details");
  });

  it("항목마다 출처가 붙으면 항목에는 설명 칩만, 묶음 끝에 '출처 보기' 하나(합집합·중복 없음)", () => {
    const html = render(
      model([
        { item: "a", label: "항목1", evidenceChips: ["설명1", "src:문헌 A"] },
        { item: "b", label: "항목2", evidenceChips: ["설명2", "src:문헌 A", "src:문헌 B"] },
      ]),
    );
    expect(count(html, "<details")).toBe(1);
    const before = html.slice(0, html.indexOf("<details"));
    expect(before).toContain(">설명1</span>");
    expect(before).toContain(">설명2</span>");
    expect(before).not.toContain("문헌");
    expect(count(html, '<span class="sr-only">출처: </span>문헌 A</li>')).toBe(1);
    expect(count(html, '<span class="sr-only">출처: </span>문헌 B</li>')).toBe(1);
  });

  it("병원 신호 카드(RedFlagCard)도 출처는 흰 글씨 '출처 보기' 안에", () => {
    const signal: RedFlag = { code: "x", severity: "immediate", messagePatient: "바로 병원에", evidenceChips: ["신호", "src:임산부수첩 2023"] };
    const html = render(model([], signal));
    expect(html).toContain(">신호</span>");
    expect(html).toMatch(/<summary class="[^"]*text-white[^"]*">/);
    expect(html).toContain('<span class="sr-only">출처: </span>임산부수첩 2023</li>');
  });
});
