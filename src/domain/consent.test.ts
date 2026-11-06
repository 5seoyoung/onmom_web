import { describe, expect, it } from "vitest";
import { CURRENT_CONSENT_VERSION, hasCurrentConsent } from "./consent";

describe("hasCurrentConsent — 지금 판의 동의", () => {
  it("판은 web-<날짜> 문자열", () => {
    expect(CURRENT_CONSENT_VERSION).toBe("web-2026-11-06");
  });

  it("동의했고 판이 지금 판일 때만 true", () => {
    expect(hasCurrentConsent({ consentAccepted: true, consentVersion: CURRENT_CONSENT_VERSION })).toBe(true);
    expect(hasCurrentConsent({ consentAccepted: false, consentVersion: CURRENT_CONSENT_VERSION })).toBe(false);
    // 서버 저장이 없던 빌드("내 기기에만 저장")의 동의 — 판이 없다
    expect(hasCurrentConsent({ consentAccepted: true, consentVersion: null })).toBe(false);
    // 동의 문구가 바뀌기 전의 판 — 2026-11-06 판을 시행하기 전에 받은 동의(web-2026-09-28)는 다시 받아야 한다
    expect(hasCurrentConsent({ consentAccepted: true, consentVersion: "web-2026-01-01" })).toBe(false);
    expect(hasCurrentConsent({ consentAccepted: true, consentVersion: "web-2026-09-28" })).toBe(false);
  });
});
