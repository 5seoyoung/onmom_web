import { createHash } from "node:crypto";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AI_TRANSFER_NOTICE } from "@/features/onboarding/consentText";
import { DETAIL_EMPHASIS_CLASS } from "@/features/onboarding/ServerConsentStep";
import { AI_TRANSFER_ITEMS } from "@/features/privacy/dataItems";
import { STORAGE_PREFIX } from "@/store/persistence";
import { AI_CONSENT_ROWS, AI_CONSENT_TEXT, AiConsentCard } from "./AiConsentCard";
import {
  AI_CONSENT_STORAGE_KEY,
  AI_CONSENT_VERSION,
  aiMode,
  parseAiConsent,
  readAiConsent,
  saveAiConsent,
  serializeAiConsent,
} from "./aiConsent";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe("aiMode — AI(서버)에 물을지", () => {
  it("스위치가 꺼졌거나 이번에 거절했으면 off", () => {
    expect(aiMode({ aiAvailable: false, consented: true, declined: false })).toBe("off");
    expect(aiMode({ aiAvailable: true, consented: false, declined: true })).toBe("off");
  });
  it("동의 전이면 ask, 동의했으면 on", () => {
    expect(aiMode({ aiAvailable: true, consented: false, declined: false })).toBe("ask");
    expect(aiMode({ aiAvailable: true, consented: true, declined: false })).toBe("on");
  });
});

describe("동의 저장 — 계정별·판별", () => {
  it("키는 onmom.web. 접두 — 계정 삭제가 함께 지운다", () => {
    expect(AI_CONSENT_STORAGE_KEY.startsWith(STORAGE_PREFIX)).toBe(true);
  });

  it("같은 계정·지금 판이면 동의", () => {
    const raw = serializeAiConsent("kakao-1", new Date("2026-09-28T01:00:00Z"));
    expect(JSON.parse(raw)).toEqual({ accountId: "kakao-1", version: AI_CONSENT_VERSION, acceptedAt: "2026-09-28T01:00:00.000Z" });
    expect(parseAiConsent(raw, "kakao-1")).toBe(true);
  });

  it("다른 계정(공용 PC)·예전 판·깨진 값·로그인 전이면 동의 아님", () => {
    const raw = serializeAiConsent("kakao-1", new Date());
    expect(parseAiConsent(raw, "guest-2")).toBe(false);
    expect(parseAiConsent(JSON.stringify({ accountId: "kakao-1", version: "web-2020-01-01" }), "kakao-1")).toBe(false);
    expect(parseAiConsent("{", "kakao-1")).toBe(false);
    expect(parseAiConsent("null", "kakao-1")).toBe(false);
    expect(parseAiConsent(null, "kakao-1")).toBe(false);
    expect(parseAiConsent(raw, null)).toBe(false);
  });

  it("저장하고 읽는다, 저장소가 없거나 막혀 있으면 동의 아님(던지지 않는다)", () => {
    const storage = memoryStorage();
    expect(readAiConsent("kakao-1", storage)).toBe(false);
    saveAiConsent("kakao-1", new Date(), storage);
    expect(readAiConsent("kakao-1", storage)).toBe(true);
    expect(readAiConsent("guest-9", storage)).toBe(false);
    expect(readAiConsent("kakao-1", null)).toBe(false);
    const broken = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
    };
    expect(readAiConsent("kakao-1", broken)).toBe(false);
    expect(() => saveAiConsent("kakao-1", new Date(), broken)).not.toThrow();
  });
});

const textOf = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

describe("동의 카드 — 동의를 묻는 자리(개인정보보호법 §28의8 ②)", () => {
  const markup = renderToStaticMarkup(h(AiConsentCard, { onAccept: () => {}, onDecline: () => {} }));
  const text = textOf(markup);

  it("제목·첫 문장이 동의 요청이다(온보딩의 '안내'·'처음 쓸 때 따로 동의를 받아요'가 아니다)", () => {
    expect(text).toContain(AI_CONSENT_TEXT.title);
    expect(text).toContain(AI_CONSENT_TEXT.lead);
    expect(AI_CONSENT_TEXT.lead).toContain("동의가 필요해요");
    expect(text).not.toContain(AI_TRANSFER_NOTICE.title);
    expect(text).not.toContain("처음 쓸 때 따로 동의를 받아요");
  });

  it("첫 문장이 말하는 이전 항목 = 처리방침의 이전 항목(질문 내용, 산후 주차, 분만 방식, 수유 여부)", () => {
    for (const item of AI_TRANSFER_ITEMS.split(", ")) expect(AI_CONSENT_TEXT.lead).toContain(item);
    // 거부 효과 — 온보딩 안내의 둘째 문장 그대로
    expect(AI_TRANSFER_NOTICE.summary).toContain("동의하지 않아도 온맘에 담긴 안내로 답해요.");
    expect(AI_CONSENT_TEXT.lead).toContain("동의하지 않아도 온맘에 담긴 안내로 답해요.");
  });

  it("전문을 접지 않는다 — 모든 줄이 <details> 없이 보이고, 중요한 줄은 크게·굵게·밑줄", () => {
    expect(markup).not.toContain("<details");
    expect(AI_CONSENT_ROWS).toBe(AI_TRANSFER_NOTICE.details);
    for (const row of AI_CONSENT_ROWS) {
      expect(text).toContain(row.term);
      expect(text).toContain(row.text);
    }
    const emphasized = AI_CONSENT_ROWS.filter((row) => row.emphasis === true);
    expect(emphasized.map((row) => row.term)).toEqual(expect.arrayContaining(["이전받는 자", "이전 항목", "이용 목적", "보유 기간"]));
    for (const row of emphasized) expect(markup).toContain(`<dd class="${DETAIL_EMPHASIS_CLASS}">${row.text}</dd>`);
  });

  it("버튼 둘 — 동의하고 계속하기 / 동의하지 않기", () => {
    expect(text).toContain(AI_CONSENT_TEXT.accept);
    expect(text).toContain(AI_CONSENT_TEXT.decline);
  });
});

/**
 * 동의 글자의 지문 — 판(AI_CONSENT_VERSION)마다 하나. 카드의 제목·첫 문장이나 전문(consentText.ts AI_TRANSFER_NOTICE.details —
 * 예: 이전받는 자 연락처·보유 기간을 고칠 때)을 바꾸면 여기서 실패한다. 그때는 AI_CONSENT_VERSION을 올리고(모두에게 다시 묻는다)
 * 아래에 새 줄을 더한다. 이미 있는 줄의 지문만 고쳐 넘어가지 않는다 — 예전 글자에 동의한 사람이 바뀐 글자에 동의한 것으로 남는다.
 */
const AI_CONSENT_FINGERPRINTS: Readonly<Record<string, string>> = {
  "web-2026-09-28.2": "caa886e2baeeca67a827abf76abdb5f624a1c676945b6a909665e941f4a4c3a6",
};

describe("AI 동의 판 — 글자를 바꾸면 판을 올린다", () => {
  it("지금 글자의 지문 = 지금 판의 지문", () => {
    const fingerprint = createHash("sha256")
      .update(JSON.stringify([AI_CONSENT_TEXT.title, AI_CONSENT_TEXT.lead, AI_CONSENT_ROWS]))
      .digest("hex");
    expect({ version: AI_CONSENT_VERSION, fingerprint }).toEqual({
      version: AI_CONSENT_VERSION,
      fingerprint: AI_CONSENT_FINGERPRINTS[AI_CONSENT_VERSION],
    });
  });

  it("판마다 지문이 다르다", () => {
    const prints = Object.values(AI_CONSENT_FINGERPRINTS);
    expect(new Set(prints).size).toBe(prints.length);
  });
});
