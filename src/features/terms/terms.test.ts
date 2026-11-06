import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import content from "@/content";
import { GUEST_ACCOUNT_TEXT, SETTINGS_TEXT } from "@/features/settings/settingsView";
import { PRIVACY_POLICY_SECTIONS } from "@/features/privacy/policyText";
import { OPERATOR_NAME, WEB_POLICY_DRAFT_LABEL, webPolicySections } from "@/features/privacy/webPolicyText";
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
  it("iOS 방침 원문(7. 문의처)의 주소와 같고, 웹 방침 16절도 같은 주소다", () => {
    expect(CONTACT_EMAIL).toBe("inmani1555@gmail.com"); // 원문: PrivacyPolicyView.swift:64
    const web = webPolicySections().find((s) => s.title.includes("문의처"))!;
    expect(web.body).toContain(CONTACT_EMAIL!);
  });

  it("주소는 소스에 한 곳(iOS 방침 원문의 문의처, policyText.ts)에만 적혀 있다 — 웹 방침·약관·문의 링크는 contact.ts로 읽는다", () => {
    const SRC = fileURLToPath(new URL("../../", import.meta.url));
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? files(join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
      );
    const holders = files(SRC)
      .filter((f) => readFileSync(f, "utf8").includes(CONTACT_EMAIL!))
      .map((f) => relative(SRC, f).split(sep).join("/"));
    expect(holders).toEqual(["features/privacy/policyText.ts"]);
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

  it("상태 표시는 웹 개인정보처리방침과 같은 글자('시범 운영 중'), 시행일 2026년 11월 6일, 부칙에 변경 이력", () => {
    const doc = termsDocument();
    expect(doc.draftLabel).toBe(WEB_POLICY_DRAFT_LABEL);
    expect(doc.draftLabel).toBe("시범 운영 중");
    expect(doc.effective).toBe("시행일: 2026년 11월 6일");
    expect(doc.title).toBe(TERMS_TEXT.title);
    expect(hasTermsText()).toBe(true);
    // 시행 중인 약관이다 — 초안·"법률 검토"를 말하지 않는다(변경 이력의 "초안 게시"만 예외)
    for (const t of [doc.draftLabel, doc.effective, doc.note, all]) {
      expect(t).not.toContain("법률 검토");
      expect(t).not.toMatch(/초안(?! 게시)/);
    }
    const rider = sections.find((s) => s.title === "부칙")!.body;
    expect(rider).toContain("이 약관은 2026년 11월 6일부터 시행합니다.");
    expect(rider).toContain("• 2026년 10월 24일: 시범 운영 시작(초안 게시)");
    expect(rider).toContain("• 2026년 11월 6일: 시행(이 판)");
  });

  it("다뤄야 할 항목이 모두 있다 — 서비스 성질·계정·이용자 의무·금지 행위·변경/중단·종료·책임 제한·준거법·문의·변경 고지", () => {
    const titles = sections.map((s) => s.title);
    for (const word of ["서비스의 성질", "계정", "이용자의 의무", "금지 행위", "변경·중단", "이용 계약의 종료", "개인정보 보호", "책임의 제한", "준거법", "문의", "약관의 변경"]) {
      expect(titles.some((t) => t.includes(word)), word).toBe(true);
    }
    expect(all).toContain("대한민국 법");
    expect(all).toContain("「민사소송법」");
    expect(all).toContain("「약관의 규제에 관한 법률」");
    expect(all).toContain("만 14세 이상");
    expect(all).toContain("게스트");
    expect(all).toContain("카카오");
  });

  it("의료기기 아님(3조) — 식약처 권고 주의 문구, 진단·치료·판단을 하지 않음, 일반 정보와 본인 기록, 결정은 의료진, 응급은 119", () => {
    const nature = sections.find((s) => s.title.includes("서비스의 성질"))!.body;
    expect(nature).toContain("서비스는 의료기기가 아니므로 질병 유무를 판단할 수 없으며, 질병 유무 판단을 위해서는 의사의 검진이 필요합니다.");
    expect(nature).toContain("서비스는 일반적인 건강 정보와 이용자가 직접 입력한 기록을 보여 줍니다.");
    expect(nature).toContain("질병을 진단하거나 치료하지 않고, 몸 상태를 판단하거나 점수·등급을 매기지 않습니다.");
    expect(nature).toContain("목록에 해당하지 않는다는 안내가 몸 상태가 괜찮다는 뜻은 아닙니다.");
    expect(nature).toContain("진단과 치료에 관한 결정은 의료진이 합니다.");
    expect(nature).toContain("응급 상황에서는 서비스에 기록하기보다 먼저 119에 연락하세요.");
    // 약관 글자는 화면 면책(content.json)을 읽지 않는다 — 화면 문구를 고쳐도 약관이 몰래 바뀌지 않게(약관 변경은 14조대로 알린다)
    expect(nature).not.toContain(content.disclaimers.home_footer);
    expect(nature).not.toContain(content.disclaimers.onboarding_consent);
  });

  it("AI 상담(2·3조) — 서비스의 일부, 틀릴 수 있는 일반 정보, 시범 동안 카카오 계정만, 처음 쓸 때 따로 동의, 약물 체크는 AI를 쓰지 않음", () => {
    expect(all).toContain("지원사업 안내, AI 상담 등");
    expect(all).toContain("AI 상담의 답변은 AI가 만든 일반적인 건강 정보로 틀릴 수 있으며, 진단이나 치료를 대신하지 않습니다.");
    expect(all).toContain("시범 운영 동안 AI 상담은 카카오 계정에서만 쓸 수 있고, 처음 쓸 때 따로 동의를 받습니다.");
    expect(all).toContain("약물·음식 체크는 AI를 쓰지 않습니다.");
    expect(all).not.toMatch(/꺼져 있/);
  });

  it("우리가 하는 일에 진단·판정·처방·치료를 쓰지 않는다(web/07 §1) — 하지 않는다는 문장에만", () => {
    expect(all).not.toMatch(/판정|처방/);
    // "진단"·"점수"는 하지 않는다는 문장(3조)과 의료인의 일을 대신하지 않는다는 문장(3·11조)에만
    const allowed = [
      "질병을 진단하거나 치료하지 않고, 몸 상태를 판단하거나 점수·등급을 매기지 않습니다.",
      "진단과 치료에 관한 결정은 의료진이 합니다.",
      "의료인의 진단·치료를 대신하지 않습니다.",
      "진단이나 치료를 대신하지 않습니다.",
    ];
    let rest = all;
    for (const a of allowed) rest = rest.split(a).join("");
    expect(rest).not.toContain("진단");
    expect(rest).not.toContain("점수");
  });

  it("운영자 — 개인정보처리방침과 같은 글자('온맘 운영자'), 1·2·13조", () => {
    expect(OPERATOR_NAME).toBe("온맘 운영자");
    expect(sections.find((s) => s.title === "1. 목적")!.body).toContain(`${OPERATOR_NAME}(이하 '운영자')가 제공하는 온맘`);
    expect(sections.find((s) => s.title === "2. 용어")!.body).toContain(`• 운영자: 서비스를 제공하고 운영하는 ${OPERATOR_NAME}(운영자 정보와 문의처는 13조)`);
    expect(sections.find((s) => s.title === "13. 운영자와 문의")!.body).toContain(`• 운영자: ${OPERATOR_NAME}`);
  });

  it("기록의 이용(10조) — 서비스 제공과 개인을 알아볼 수 없는 통계 외에는 쓰지 않는다(개인정보처리방침의 처리 목적과 같은 범위)", () => {
    expect(sections.find((s) => s.title.startsWith("10. "))!.body).toContain(
      "서비스 제공(저장·표시·이용자 요청 처리)과 개인을 알아볼 수 없는 서비스 개선 통계(개인정보처리방침의 처리 목적) 외의 목적으로 이용하지 않습니다.",
    );
  });

  it("계정 삭제 안내 — 약관에서 처음 나오는 곳(4조)에 게스트 버튼 이름도 적는다, 실제 버튼 이름과 같다", () => {
    const first = sections.find((s) => s.body.includes("설정 > 계정 삭제"))!;
    expect(first.title).toBe("4. 계정");
    expect(first.body).toContain(`설정 > ${SETTINGS_TEXT.deleteAccount}(게스트 화면의 이름은 [${GUEST_ACCOUNT_TEXT.deleteAccount}]입니다. 아래에서도 같습니다)`);
    expect(all).not.toContain("이 기기에서 기록 지우기");
  });

  it("책임의 제한(11조) — 가벼운 과실을 면책하는 말이 없다(약관규제법 §7): 고의·과실이면 배상, 위탁 업체도 포함, 이용자에게 결과를 돌리지 않는다", () => {
    const liability = sections.find((s) => s.title === "11. 책임의 제한")!.body;
    expect(all).not.toContain("중대한 과실");
    expect(all).not.toContain("위탁 업체의 장애 등");
    expect(all).not.toContain("그 결과는 이용자에게 있습니다");
    expect(liability).toContain("운영자(운영자가 업무를 맡긴 업체를 포함합니다)의 고의 또는 과실로 이용자에게 손해가 생긴 경우 관련 법령에 따라 배상합니다.");
    expect(liability).toContain("운영자에게 고의 또는 과실이 없는 한 책임을 지지 않습니다.");
    // 면책은 그 줄의 두 경우뿐이고, 어느 줄도 고의·과실 없이는 면책을 넓히지 않는다
    expect(liability.split("\n").filter((l) => l.includes("책임을 지지 않습니다"))).toHaveLength(1);
    expect(liability).toContain("이 조항은 「약관의 규제에 관한 법률」 등 관련 법령이 허용하는 범위에서만 적용되며");
  });

  it("서비스 변경(7조) — 상당한 이유가 있을 때만, 불리한 변경은 30일 전, 중단 손해는 11조로", () => {
    const change = sections.find((s) => s.title === "7. 서비스의 변경·중단")!.body;
    expect(change).toContain("운영상·기술상 상당한 이유가 있거나 임상 근거·법령이 바뀐 경우");
    expect(change).toContain("적용 7일 전(불리한 변경은 30일 전)까지 서비스 안에 알립니다.");
    expect(change).toContain("중단으로 생긴 손해의 책임은 11조에 따릅니다.");
  });

  it("이용 제한(6·8조) — 먼저 일시 제한·사유 통지·소명 기회, 급박한 경우만 먼저 조치, 게스트는 서비스 안의 안내로", () => {
    const end = sections.find((s) => s.title === "8. 이용 계약의 종료")!.body;
    expect(end).toContain("먼저 이용을 일시 제한하고 사유를 알리며, 이용자가 소명할 기회를 줍니다.");
    expect(end).toContain("먼저 조치하고 나중에 알릴 수 있습니다.");
    expect(end).toContain("연락할 방법이 없는 게스트에게는 서비스 안의 안내로 알립니다.");
    expect(sections.find((s) => s.title === "6. 금지 행위")!.body).toContain("8조의 절차에 따라");
  });

  it("분쟁 조정(12조) — 개인정보분쟁조정위원회는 방침 17절과 같은 번호, 한국소비자원은 확인하지 않은 번호를 적지 않는다", () => {
    const dispute = sections.find((s) => s.title === "12. 분쟁 해결과 준거법")!.body;
    const remedy = webPolicySections().find((s) => s.title.includes("권익침해 구제"))!.body;
    expect(remedy).toContain("개인정보분쟁조정위원회: 1833-6972");
    expect(dispute).toContain("개인정보분쟁조정위원회(1833-6972)");
    expect(dispute).toContain("한국소비자원을 통해 피해구제나 조정을 신청할 수 있습니다.");
    expect(all).not.toMatch(/\[[^\]]*(확인|연락처)[^\]]*\]/);
  });

  it("약관 변경(14조) — 내용과 시행일을 알리고, 의사표시 의제는 그 뜻을 명확히 알린 경우에만(약관규제법 §12 1호), 시행일 전까지 끝낼 수 있다", () => {
    const amend = sections.find((s) => s.title === "14. 약관의 변경")!.body;
    expect(amend).toContain("바뀌는 내용과 시행일을 시행 7일 전(이용자에게 불리하거나 중요한 변경은 30일 전)부터 서비스 안에 알리고, 연락처를 아는 이용자에게는 따로 알립니다.");
    expect(amend).toContain('"시행일 전까지 거부 의사를 밝히지 않으면 바뀐 약관에 동의한 것으로 본다"는 뜻을 함께 명확히 알렸는데도');
    expect(amend).toContain("시행일 전까지 설정 > 계정 삭제로 이용을 끝낼 수 있습니다.");
  });

  it("만 14세 미만인 것이 확인되면 삭제(4조)", () => {
    expect(sections.find((s) => s.title === "4. 계정")!.body).toContain("만 14세 미만인 것이 확인되면 운영자는 그 계정과 기록을 지체 없이 삭제합니다.");
  });

  it("문의는 개인정보처리방침의 이메일, 계정 삭제·내 데이터 내려받기처럼 실제 있는 기능만 말한다", () => {
    const contact = sections.find((s) => s.title === "13. 운영자와 문의")!;
    expect(contact.body).toBe(`• 운영자: ${OPERATOR_NAME}\n• ${CONTACT_TEXT.label}: ${CONTACT_EMAIL}`);
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
