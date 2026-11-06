// 약물·음식 체크 결과 카드의 서버 렌더 마크업 — 표의 출처 칩·판정 배지. AI 표시는 없다(AI는 상담에만 쓴다).
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import content from "@/content";
import { lookupSubstance, substanceHeader } from "@/rules/substance";
import { SubstanceCheckScreen, SubstanceIntro, SubstanceResultCard } from "./SubstanceCheckScreen";
import { SUBSTANCE_TEXT } from "./substanceModel";

describe("머리 안내 — 일반 정보이고 복용 전 상담이 필요하다고 늘 말한다(임상 사전 검토 B4, 법률 사전 검토 4-2)", () => {
  const ids = { leadId: "l", noteId: "n", generalId: "g" };

  it("문구는 일반 정보·의사·약사 상담을 말하고, 안전 분류를 해 준다고 말하지 않는다", () => {
    expect(SUBSTANCE_TEXT.generalNote).toBe("공개 자료를 정리한 일반 정보예요. 약이나 음식을 먹기 전에 의사·약사와 상담하세요.");
    for (const isBreastfeeding of [true, false]) expect(substanceHeader(isBreastfeeding).lead).not.toContain("안전");
  });

  it("수유 여부와 상관없이 늘 그려진다", () => {
    for (const isBreastfeeding of [true, false]) {
      const html = renderToStaticMarkup(h(SubstanceIntro, { header: substanceHeader(isBreastfeeding), ...ids }));
      expect(html).toContain(`id="g"`);
      expect(html).toContain(SUBSTANCE_TEXT.generalNote);
    }
  });
});

describe("SubstanceResultCard", () => {
  it("표 결과(코데인): 확인된 출처 칩 — 숨은 '출처: ' + 돋보기 아이콘, AI 표시 없음", () => {
    const html = renderToStaticMarkup(h(SubstanceResultCard, { result: lookupSubstance("코데인") }));
    expect(html).toContain(">코데인</h2>");
    expect(html).toContain(`>${content.verdict_labels.avoid}</span>`);
    expect(html).toContain('<span class="sr-only">출처: </span>FDA');
    expect(html).toContain("<svg"); // 돋보기 아이콘(확인된 출처)
    expect(html).not.toContain("AI");
  });

  it("정보 부족(표): 칩 '확인된 정보 없음' 하나, 링크·AI 표시 없음", () => {
    const html = renderToStaticMarkup(h(SubstanceResultCard, { result: lookupSubstance("모르는약") }));
    expect(html).toContain(content.substance_unknown.detail);
    expect(html).toContain(">확인된 정보 없음</span>");
    expect(html).not.toContain("AI");
    expect(html).not.toContain("<a ");
  });

  it("예전에 엉뚱한 행으로 가던 입력도 같은 '정보 부족' 카드 — 입력어 그대로 제목, '피하세요'·'수유 중 가능' 없음", () => {
    for (const q of ["수술 후 진통제", "다이어트 영양제", "퀴놀론계 항생제", "콜라겐"]) {
      const html = renderToStaticMarkup(h(SubstanceResultCard, { result: lookupSubstance(q) }));
      expect(html, q).toContain(`>${q}</h2>`);
      expect(html, q).toContain(`>${content.verdict_labels.unknown}</span>`);
      expect(html, q).toContain(content.substance_unknown.detail);
      expect(html, q).not.toContain(content.verdict_labels.avoid);
      expect(html, q).not.toContain(content.verdict_labels.safe);
    }
  });
});

describe("SubstanceCheckScreen", () => {
  it("첫 화면에 동의 카드·AI 표시가 없다", () => {
    const html = renderToStaticMarkup(h(SubstanceCheckScreen));
    expect(html).not.toContain("AI");
    expect(html).not.toContain("동의");
  });
});
