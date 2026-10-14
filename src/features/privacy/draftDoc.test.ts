import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CURRENT_CONSENT_VERSION } from "@/domain/consent";
import { AI_TRANSFER_NOTICE, REQUIRED_CONSENTS, SERVER_CONSENT_TEXT } from "@/features/onboarding/consentText";
import { policyFor } from "./policy";
import { webPolicySections } from "./webPolicyText";

// CPO·법률 검토 문서(docs/privacy/CONSENT_AND_POLICY_DRAFT.md)가 코드의 문구를 빠짐없이 담고 있는가.
// 코드가 원본이다 — 문구를 바꾸면 이 테스트가 실패하므로 검토 문서도 같이 고친다(검토받지 않은 문구가 나가지 않게).
// CI에서는 건너뛴다: 검토 문서(md)는 소유자 컴퓨터에만 최신본을 두고 커밋·푸시하지 않는다(2026-09-30 결정). 저장소의 사본은
// 옛 판이라 CI에서는 문구를 고칠 때마다 실패한다 — 이 대조는 최신 문서가 있는 소유자 컴퓨터에서 돌린다.
const ON_CI = !!process.env.CI;
const DOC = ON_CI ? "" : readFileSync(fileURLToPath(new URL("../../../docs/privacy/CONSENT_AND_POLICY_DRAFT.md", import.meta.url)), "utf8");

describe.skipIf(ON_CI)("검토 문서가 코드 문구와 같다", () => {
  it("동의 판", () => {
    expect(DOC).toContain(CURRENT_CONSENT_VERSION);
  });

  it("온보딩 동의 단계 — 머리·안내·버튼·필수 셋·AI 국외 이전 안내", () => {
    const texts = [
      SERVER_CONSENT_TEXT.subtitle,
      ...SERVER_CONSENT_TEXT.lines,
      SERVER_CONSENT_TEXT.reconsentNote,
      SERVER_CONSENT_TEXT.reconsentButton,
      SERVER_CONSENT_TEXT.decline,
      ...[...REQUIRED_CONSENTS, AI_TRANSFER_NOTICE].flatMap((c) => [c.title, c.summary, ...c.details.flatMap((d) => [d.term, d.text])]),
    ];
    for (const t of texts) expect(DOC, t).toContain(t);
    // 뱃지 표시 줄(필수 / 안내 / 자세히)
    expect(DOC).toContain(`${SERVER_CONSENT_TEXT.requiredBadge} / ${SERVER_CONSENT_TEXT.noticeBadge} / ${SERVER_CONSENT_TEXT.more}`);
  });

  it("강조(중요한 내용) 줄이 문서 표에서도 ● — 코드의 emphasis와 같다", () => {
    for (const c of [...REQUIRED_CONSENTS, AI_TRANSFER_NOTICE]) {
      for (const d of c.details) {
        if (d.emphasis === true) expect(DOC, `${c.title} ${d.term}`).toContain(`| ${d.term} | ${d.text} | ● |`);
      }
    }
  });

  it("웹 처리방침 초안 — 모든 절의 모든 줄(Turnstile·매일 리마인더를 쓰는 빌드 — 하나만·둘 다 — 포함)", () => {
    const web = policyFor({ serverStorage: true });
    for (const t of [web.draftLabel!, web.effective, web.note]) expect(DOC, t).toContain(t);
    const variants = [
      { turnstile: true, reminders: false },
      { turnstile: false, reminders: true },
      { turnstile: true, reminders: true },
    ].flatMap((o) => webPolicySections(o));
    for (const s of [...web.sections, ...variants]) {
      expect(DOC, s.title).toContain(s.title);
      for (const line of s.body.split("\n").filter((l) => l.trim() !== "")) expect(DOC, line).toContain(line);
    }
  });

  // 서비스 소개 저장 카드(빌드별 문구) 대조는 없앴다 — 서비스 소개 화면을 없앴다(2026-10-14 CPO 결정).
});
