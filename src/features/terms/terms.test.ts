import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import content from "@/content";
import { PRIVACY_POLICY_SECTIONS } from "@/features/privacy/policyText";
import { WEB_POLICY_DRAFT_LABEL, webPolicySections } from "@/features/privacy/webPolicyText";
import { CONTACT_EMAIL, CONTACT_TEXT, extractContactEmail, mailtoHref } from "./contact";
import { TermsNote, TermsSections } from "./Terms";
import { TermsSheetLink } from "./TermsSheetLink";
import { hasTermsText, TERMS_TEXT, termsDocument, termsSections } from "./termsText";

const textOf = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

describe("문의처 — 개인정보처리방침의 이메일을 그대로 쓴다", () => {
  it("iOS 방침 원문(7. 문의처)의 주소와 같고, 웹 초안 15절도 같은 주소다", () => {
    expect(CONTACT_EMAIL).toBe("inmani1555@gmail.com"); // 원문: PrivacyPolicyView.swift:64
    const web = webPolicySections().find((s) => s.title.includes("문의처"))!;
    expect(web.body).toContain(CONTACT_EMAIL!);
  });

  it("문의처 절이 없거나 이메일이 없으면 null — 주소를 지어내지 않는다", () => {
    expect(extractContactEmail([])).toBeNull();
    expect(extractContactEmail([{ title: "7. 문의처", body: "이메일 없음" }])).toBeNull();
    expect(extractContactEmail(PRIVACY_POLICY_SECTIONS)).toBe(CONTACT_EMAIL);
  });

  it("mailto 링크 — 제목만 미리 채우고 본문은 비운다(건강 정보를 메일에 넣도록 유도하지 않는다)", () => {
    const href = mailtoHref("a@b.co");
    expect(href).toBe(`mailto:a@b.co?subject=${encodeURIComponent(CONTACT_TEXT.subject)}`);
    expect(href).not.toContain("body=");
    expect(CONTACT_TEXT.label).toBe("문의");
  });
});

describe("이용약관 초안 — 내용", () => {
  const sections = termsSections();
  const all = sections.map((s) => `${s.title}\n${s.body}`).join("\n");

  it("초안 표시는 웹 처리방침 초안과 같은 글자, 시행일은 정하지 않았다", () => {
    const doc = termsDocument();
    expect(doc.draftLabel).toBe(WEB_POLICY_DRAFT_LABEL);
    expect(doc.draftLabel).toBe("초안 — 법률 검토 전");
    expect(doc.effective).toContain("시행일: 법률 검토 후 정함");
    expect(doc.title).toBe(TERMS_TEXT.title);
    expect(hasTermsText()).toBe(true);
  });

  it("다뤄야 할 항목이 모두 있다 — 서비스 성질·계정·이용자 의무·금지 행위·변경/중단·종료·책임 제한·준거법·문의·변경 고지", () => {
    const titles = sections.map((s) => s.title);
    for (const word of ["서비스의 성질", "계정", "이용자의 의무", "금지 행위", "변경·중단", "이용 계약의 종료", "개인정보 보호", "책임의 제한", "준거법", "문의", "약관의 변경"]) {
      expect(titles.some((t) => t.includes(word)), word).toBe(true);
    }
    expect(all).toContain("대한민국 법");
    expect(all).toContain("「민사소송법」");
    expect(all).toContain("「약관의 규제에 관한 법률」");
    expect(all).toContain("고의나 중대한 과실");
    expect(all).toContain("만 14세 이상");
    expect(all).toContain("게스트");
    expect(all).toContain("카카오");
  });

  it("의료기기 아님 — 면책은 content.json 문장 그대로, 우리가 하는 일에 진단·판정·처방·치료를 쓰지 않는다(web/07 §1)", () => {
    const nature = sections.find((s) => s.title.includes("서비스의 성질"))!;
    expect(nature.body).toContain(content.disclaimers.home_footer);
    expect(nature.body).toContain(content.disclaimers.onboarding_consent);
    expect(all).not.toMatch(/판정|처방/);
    // "진단"은 면책 원문("진단·치료에 관한 판단", "진단 기기가 아니며")과 부정문("진단하거나 … 매기지 않으며")에만
    const allowed = [content.disclaimers.home_footer, content.disclaimers.onboarding_consent, "진단하거나 점수·등급을 매기지 않으며"];
    let rest = all;
    for (const a of allowed) rest = rest.split(a).join("");
    expect(rest).not.toContain("진단");
    expect(rest).not.toContain("점수");
  });

  it("문의는 개인정보처리방침의 이메일, 계정 삭제·내 데이터 내려받기처럼 실제 있는 기능만 말한다", () => {
    const contact = sections.find((s) => s.title === "13. 문의")!;
    expect(contact.body).toBe(`${CONTACT_TEXT.label}: ${CONTACT_EMAIL}`);
    expect(all).toContain("설정 > 계정 삭제");
    expect(all).toContain("설정 > 내 데이터 내려받기");
    // 없는 기능을 약속하지 않는다
    expect(all).not.toMatch(/유료 기능을 제공|결제|구독료/);
  });

  it("가짜 수치·후기가 없다", () => {
    expect(all).not.toMatch(/\d[\d,.]*\s*(만|천)?\s*(명|점|%)/);
    expect(all).not.toMatch(/후기|리뷰|평점/);
  });
});

describe("이용약관 — 화면", () => {
  it("본문은 절 제목(h2/h3) + 줄바꿈을 살린 본문, 안내 상자는 굵은 초안 표시 먼저", () => {
    const terms = termsDocument();
    const markup = renderToStaticMarkup(h(TermsSections, { terms, headingLevel: "h2" }));
    expect(markup.match(/<h2\b/g)).toHaveLength(terms.sections.length);
    expect(markup).toContain("whitespace-pre-line");
    const text = textOf(markup);
    for (const s of terms.sections) {
      expect(text).toContain(s.title);
      for (const line of s.body.split("\n").filter((l) => l.trim() !== "")) expect(text, line).toContain(line);
    }
    const note = textOf(renderToStaticMarkup(h(TermsNote, { terms })));
    expect(note.startsWith(terms.draftLabel)).toBe(true);
    expect(note).toContain(terms.note);
  });

  it("온보딩 동의 옆 링크 — 시트를 여는 글자 버튼(aria-haspopup), 시트는 닫힌 채 시작한다", () => {
    const markup = renderToStaticMarkup(h(TermsSheetLink, { className: "x" }));
    expect(markup).toMatch(new RegExp(`<button type="button" aria-haspopup="dialog" class="x">${TERMS_TEXT.openLink}</button>`));
    expect(markup).not.toContain("<dialog");
    expect(TERMS_TEXT.openLink).toBe("이용약관 보기");
  });
});
