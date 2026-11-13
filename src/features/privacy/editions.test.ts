import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EDITION_2026_10_24, EDITION_2026_11_06, POLICY_EDITION_TEXT } from "./editions";
import { policyFor, seoulDate } from "./policy";
import { PolicyPreviousEditions, PolicyUpcomingNotice } from "./PrivacyPolicy";
import { WEB_POLICY_CHANGES, WEB_POLICY_EFFECTIVE, WEB_POLICY_EFFECTIVE_DATE, webPolicySections } from "./webPolicyText";

const BEFORE = new Date("2026-11-19T23:59:00+09:00");
const ON = new Date(`${WEB_POLICY_EFFECTIVE_DATE}T00:00:00+09:00`);

describe("처리방침 판 — 시행 7일 전 안내와 지난 판(2026-11-20 개정)", () => {
  it("시행일은 한국 날짜로 본다(빌드 서버는 UTC)", () => {
    expect(seoulDate(new Date("2026-11-19T14:59:00Z"))).toBe("2026-11-19");
    expect(seoulDate(new Date("2026-11-19T15:00:00Z"))).toBe("2026-11-20");
  });

  it("시행 전: 본문은 2026-11-06 판 고정본, 새 판은 개정 안내(요약 + 전문), 지난 판은 초안", () => {
    const p = policyFor({ serverStorage: true, now: BEFORE });
    expect(p.effective).toBe("시행일: 2026년 11월 6일");
    expect(p.sections).toBe(EDITION_2026_11_06.sections);
    expect(p.upcoming?.effective).toBe(WEB_POLICY_EFFECTIVE);
    expect(p.upcoming?.changes).toBe(WEB_POLICY_CHANGES);
    expect(p.upcoming?.sections).toEqual(webPolicySections());
    expect(p.previous.map((e) => e.id)).toEqual(["2026-10-24"]);
  });

  it("시행일부터: 본문은 새 판, 안내는 없고, 지난 판은 최근 판부터 둘", () => {
    const p = policyFor({ serverStorage: true, now: ON });
    expect(p.effective).toBe(WEB_POLICY_EFFECTIVE);
    expect(p.sections).toEqual(webPolicySections());
    expect(p.upcoming).toBeNull();
    expect(p.previous.map((e) => e.id)).toEqual(["2026-11-06", "2026-10-24"]);
  });

  it("선택 기능을 켠 빌드는 시행 전이라도 새 판이 본문 — 고정본(선택 기능 꺼짐)에는 켠 업체가 없어서", () => {
    const p = policyFor({ serverStorage: true, now: BEFORE, webOptions: { turnstile: false, reminders: false, youtube: true } });
    expect(p.effective).toBe(WEB_POLICY_EFFECTIVE);
    expect(p.upcoming).toBeNull();
    expect(p.sections.map((x) => x.body).join("\n")).toContain("YouTube");
  });

  it("브라우저 전용 빌드(iOS 원문)에는 안내·지난 판이 없다", () => {
    const p = policyFor({ serverStorage: false, now: BEFORE });
    expect(p.upcoming).toBeNull();
    expect(p.previous).toEqual([]);
  });

  it("고정본은 그때 게시한 글자 그대로 — 표시·시행일·절 수", () => {
    expect([EDITION_2026_11_06.draftLabel, EDITION_2026_11_06.effective, EDITION_2026_11_06.sections.length]).toEqual([
      "시범 운영 중",
      "시행일: 2026년 11월 6일",
      18,
    ]);
    expect([EDITION_2026_10_24.draftLabel, EDITION_2026_10_24.sections.length]).toEqual(["초안 - 법률 검토 전", 17]);
    expect(EDITION_2026_11_06.sections.at(-1)?.body).toContain("• 2026년 11월 6일: 시행(이 판)");
  });

  it("새 판의 18절은 이전 판을 화면에서 볼 수 있다고 알리고, 이력에 새 판 줄이 있다", () => {
    const last = webPolicySections().at(-1)!;
    expect(last.title).toBe("18. 방침의 변경");
    expect(last.body).toContain("• 2026년 11월 20일: 개정(이 판)");
    expect(last.body).toContain("이전 판은 이 화면 맨 아래 '이전 판'에서 적용 기간과 함께 볼 수 있습니다.");
    expect(last.body).not.toContain("요청하면 보내 드립니다");
  });

  it("화면 — 개정 안내는 제목·요약 목록·접힌 새 판 전문, 지난 판은 판마다 접힌 전문(제목 단계는 한 단계 아래)", () => {
    const before = policyFor({ serverStorage: true, now: BEFORE });
    const notice = renderToStaticMarkup(createElement(PolicyUpcomingNotice, { policy: before, headingLevel: "h2" }));
    expect(notice).toContain(`<h2 id="policy-upcoming-h2"`);
    expect(notice).toContain(POLICY_EDITION_TEXT.upcomingLead("2026년 11월 20일"));
    for (const c of WEB_POLICY_CHANGES) expect(notice).toContain(`<li>${c}</li>`);
    expect(notice).toMatch(/<details[^>]*><summary[^>]*>바뀌는 방침 전체 보기<\/summary>/);
    expect(notice).toContain("<h3 ");
    const prev = renderToStaticMarkup(createElement(PolicyPreviousEditions, { policy: policyFor({ serverStorage: true, now: ON }), headingLevel: "h3" }));
    expect(prev).toContain(`<h3 id="policy-previous-h3"`);
    expect(prev).toContain(`>${EDITION_2026_11_06.period}</summary>`);
    expect(prev).toContain(`>${EDITION_2026_10_24.period}</summary>`);
    expect(prev).toContain("<h4 ");
    // 새 판이 시행된 뒤에는 안내가 없다
    expect(renderToStaticMarkup(createElement(PolicyUpcomingNotice, { policy: policyFor({ serverStorage: true, now: ON }), headingLevel: "h2" }))).toBe("");
  });
});
