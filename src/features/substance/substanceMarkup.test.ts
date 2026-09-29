// 약물·음식 체크 결과 카드의 서버 렌더 마크업 — 표 결과와 AI 답의 칩 모양이 다른지(원칙 4), 병기 문구·배지.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import content from "@/content";
import { lookupSubstance, type SubstanceResult } from "@/rules/substance";
import { AI_SOURCE_SR_PREFIX, SubstanceResultCard } from "./SubstanceCheckScreen";

const AI_ANSWER: SubstanceResult = {
  query: "모르는약",
  verdict: "caution",
  detail: "근거가 제한적이에요. (AI 답변이며 진단·처방이 아닙니다. 복용 전 의료진·약사와 상담하세요.)",
  evidenceChips: ["src:LactMed", "AI 답변"],
  source: "llm",
};

describe("SubstanceResultCard", () => {
  it("표 결과(코데인): 확인된 출처 칩 — 숨은 '출처: ' + 돋보기 아이콘, AI 표시 없음", () => {
    const html = renderToStaticMarkup(h(SubstanceResultCard, { result: lookupSubstance("코데인") }));
    expect(html).toContain(">코데인</h2>");
    expect(html).toContain(`>${content.verdict_labels.avoid}</span>`);
    expect(html).toContain('<span class="sr-only">출처: </span>FDA');
    expect(html).toContain("<svg"); // 돋보기 아이콘(확인된 출처)
    expect(html).not.toContain("AI");
  });

  it("AI 답: 출처는 중립 점선 칩 + 숨은 'AI가 제시한 출처: ', 확인된 출처 칩 모양(돋보기·'출처: ')은 쓰지 않는다", () => {
    const html = renderToStaticMarkup(h(SubstanceResultCard, { result: AI_ANSWER }));
    expect(html).toContain(`<span class="sr-only">${AI_SOURCE_SR_PREFIX}</span>LactMed`);
    expect(html).toContain("border-dashed");
    expect(html).not.toContain('<span class="sr-only">출처: </span>');
    expect(html).not.toContain("<svg");
    // "AI 답변" 칩(Swift 원문)과 병기 문구는 그대로
    expect(html).toContain(">AI 답변</span>");
    expect(html).toContain("(AI 답변이며 진단·처방이 아닙니다. 복용 전 의료진·약사와 상담하세요.)");
    expect(html).toContain(`>${content.verdict_labels.caution}</span>`);
  });

  it("정보 부족(표): 칩 '확인된 정보 없음' 하나, 링크·AI 표시 없음", () => {
    const html = renderToStaticMarkup(h(SubstanceResultCard, { result: lookupSubstance("모르는약") }));
    expect(html).toContain(content.substance_unknown.detail);
    expect(html).toContain(">확인된 정보 없음</span>");
    expect(html).not.toContain("AI");
    expect(html).not.toContain("<a ");
  });
});
