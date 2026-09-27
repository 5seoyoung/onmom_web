import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CURRENT_CONSENT_VERSION } from "@/domain/consent";
import { FEATURES, LANDING_TEXT } from "@/features/landing/landingContent";
import { AI_TRANSFER_NOTICE, REQUIRED_CONSENTS, SERVER_CONSENT_TEXT } from "@/features/onboarding/consentText";
import { policyFor } from "./policy";
import { webPolicySections } from "./webPolicyText";

// CPO·법률 검토 문서(docs/privacy/CONSENT_AND_POLICY_DRAFT.md)가 코드의 문구를 빠짐없이 담고 있는가.
// 코드가 원본이다 — 문구를 바꾸면 이 테스트가 실패하므로 검토 문서도 같이 고친다(검토받지 않은 문구가 나가지 않게).
const DOC = readFileSync(fileURLToPath(new URL("../../../docs/privacy/CONSENT_AND_POLICY_DRAFT.md", import.meta.url)), "utf8");

describe("검토 문서가 코드 문구와 같다", () => {
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

  it("웹 처리방침 초안 — 모든 절의 모든 줄(Turnstile을 쓰는 빌드 포함)", () => {
    const web = policyFor({ serverStorage: true });
    for (const t of [web.draftLabel!, web.effective, web.note]) expect(DOC, t).toContain(t);
    for (const s of [...web.sections, ...webPolicySections({ turnstile: true })]) {
      expect(DOC, s.title).toContain(s.title);
      for (const line of s.body.split("\n").filter((l) => l.trim() !== "")) expect(DOC, line).toContain(line);
    }
  });

  it("서비스 소개 저장 카드 — 빌드별 문구", () => {
    const storage = FEATURES.find((f) => f.icon === "storage")!;
    expect(DOC).toContain(storage.title);
    expect(DOC).toContain(storage.titleWhenKakaoLogin!);
    for (const p of storage.body) {
      for (const t of [p.text, p.whenKakaoLogin, p.whenLlm]) if (t !== undefined) expect(DOC, t).toContain(t);
    }
    expect(DOC).toContain(LANDING_TEXT.ctaNote);
    expect(DOC).toContain(LANDING_TEXT.ctaNoteKakao);
  });
});
