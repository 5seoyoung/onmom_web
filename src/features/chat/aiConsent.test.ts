import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AI_CONSENT_VERSION as SHARED_AI_CONSENT_VERSION } from "../../../supabase/functions/_shared/aiConsent";
import { AI_CONSENT_ITEMS, AI_SENSITIVE_CONSENT, AI_TRANSFER_CONSENT, AI_TRANSFER_NOTICE } from "@/features/onboarding/consentText";
import { DETAIL_EMPHASIS_CLASS, SUMMARY_EMPHASIS_CLASS } from "@/features/onboarding/ServerConsentStep";
import { AI_CONTEXT_MAX_MESSAGES, AI_TRANSFER_ITEMS } from "@/features/privacy/dataItems";
import { STORAGE_PREFIX } from "@/store/persistence";
import { AI_CONSENT_TEXT, AiConsentCard } from "./AiConsentCard";
import {
  AI_CONSENT_STORAGE_KEY,
  AI_CONSENT_VERSION,
  aiMode,
  clearAiConsent,
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
  const kakao = { aiAvailable: true, loginRequired: false, consented: false, declined: false };

  it("스위치가 꺼졌거나 이번에 거절했으면 off", () => {
    expect(aiMode({ ...kakao, aiAvailable: false, consented: true })).toBe("off");
    expect(aiMode({ ...kakao, declined: true })).toBe("off");
  });
  it("동의 전이면 ask, 동의했으면 on", () => {
    expect(aiMode(kakao)).toBe("ask");
    expect(aiMode({ ...kakao, consented: true })).toBe("on");
  });
  it("카카오 계정이 아니면 login — 동의 카드(ask)도 AI(on)도 없다. 브라우저에 동의가 남아 있어도 같다", () => {
    expect(aiMode({ ...kakao, loginRequired: true })).toBe("login");
    expect(aiMode({ ...kakao, loginRequired: true, consented: true })).toBe("login");
    expect(aiMode({ ...kakao, loginRequired: true, declined: true })).toBe("login");
  });
  it("AI 스위치가 꺼져 있으면 카카오 연결을 권하지 않는다(연결해도 쓸 수 없다)", () => {
    expect(aiMode({ ...kakao, aiAvailable: false, loginRequired: true })).toBe("off");
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

  it("clearAiConsent — 서버가 동의 기록을 찾지 못하면(403) 그 계정의 동의만 지운다(다른 계정의 값·깨진 값·막힌 저장소에도 던지지 않는다)", () => {
    const storage = { ...memoryStorage(), removeItem: (k: string) => void storage.map.delete(k) };
    saveAiConsent("kakao-1", new Date(), storage);
    clearAiConsent("guest-2", storage);
    expect(readAiConsent("kakao-1", storage)).toBe(true);
    clearAiConsent("kakao-1", storage);
    expect(readAiConsent("kakao-1", storage)).toBe(false);
    expect(storage.map.has(AI_CONSENT_STORAGE_KEY)).toBe(false);
    storage.map.set(AI_CONSENT_STORAGE_KEY, "{");
    expect(() => clearAiConsent("kakao-1", storage)).not.toThrow();
    expect(() => clearAiConsent("kakao-1", null)).not.toThrow();
    const blocked = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(() => clearAiConsent("kakao-1", blocked)).not.toThrow();
  });
});

describe("판 — 웹과 Edge Function chat이 한 곳의 값을 쓴다", () => {
  it("이 모듈의 판 = supabase/functions/_shared/aiConsent.ts의 판(함수가 서버 기록과 비교하는 값)", () => {
    expect(AI_CONSENT_VERSION).toBe(SHARED_AI_CONSENT_VERSION);
  });

  it("[동의하고 계속하기]는 이 브라우저에 남기고 서버 기록을 시작한다 — 화면은 그 기록을 기다리지 않는다", () => {
    const src = readFileSync(fileURLToPath(new URL("./aiConsent.ts", import.meta.url)), "utf8");
    const accept = src.slice(src.indexOf("const accept = useCallback"), src.indexOf("const revoke = useCallback"));
    expect(accept).toContain("saveAiConsent(accountId, now);");
    expect(accept).toContain("void startAiConsentRecord(accountId, now);");
    expect(accept).not.toContain("await");
    const revoke = src.slice(src.indexOf("const revoke = useCallback"), src.indexOf("return { consented"));
    expect(revoke).toContain("clearAiConsent(accountId);");
  });
});

const textOf = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

describe("동의 카드 — 민감정보 처리와 국외 이전을 따로 묻는 자리(법 §23①1, §28의8①1·②)", () => {
  const markup = renderToStaticMarkup(h(AiConsentCard, { onAccept: () => {}, onDecline: () => {} }));
  const text = textOf(markup);
  /** <details> 밖 — 접어도 늘 보이는 글자 */
  const always = textOf(markup.replace(/<details[\s\S]*<\/details>/, ""));

  it("제목·첫 문장이 동의 요청이다(온보딩의 안내가 아니다)", () => {
    expect(text).toContain(AI_CONSENT_TEXT.title);
    expect(text).toContain(AI_CONSENT_TEXT.lead);
    expect(AI_CONSENT_TEXT.lead).toContain("각각 동의가 필요해요");
    expect(text).not.toContain(AI_TRANSFER_NOTICE.title);
  });

  it("동의 둘을 따로 받는다 — 스위치 둘, 처음에는 모두 꺼져 있고 [동의하고 계속하기]는 잠겨 있다", () => {
    expect(AI_CONSENT_ITEMS.map((item) => item.title)).toEqual(["민감정보(건강정보) 처리 동의", "개인정보 국외 이전 동의"]);
    expect(markup.match(/role="switch"/g)).toHaveLength(2);
    expect(markup.match(/aria-checked="false"/g)).toHaveLength(2);
    expect(markup).not.toContain('aria-checked="true"');
    const accept = new RegExp(`<button[^>]*disabled=""[^>]*>${AI_CONSENT_TEXT.accept}</button>`);
    expect(markup).toMatch(accept);
    // [동의하지 않기]는 언제든 누를 수 있다
    expect(markup).not.toMatch(new RegExp(`<button[^>]*disabled=""[^>]*>${AI_CONSENT_TEXT.decline}</button>`));
  });

  it("접어도 법정 고지 항목이 늘 보인다 — 항목·국가·시기와 방법·받는 자와 연락처·목적·보유 기간·거부 효과", () => {
    for (const fact of [
      AI_TRANSFER_ITEMS,
      "AI 답변을 만드는 데 써요",
      "온맘 서버에는 저장하지 않아요",
      "질문할 때마다",
      "암호화해",
      "Anthropic, PBC(미국, privacy@anthropic.com)",
      "30일 안에 삭제",
      "이용정책 위반이 의심되면 최대 2년",
      "동의하지 않아도 온맘에 담긴 안내로 답해요.",
    ]) {
      expect(always, fact).toContain(fact);
    }
    // 요약은 온보딩의 강조 요약과 같은 모양
    for (const item of AI_CONSENT_ITEMS) expect(markup).toContain(`<span class="${SUMMARY_EMPHASIS_CLASS}">${item.summary}</span>`);
  });

  it("전송 항목은 실제 전송과 같다 — 같은 대화의 최근 메시지(이전 AI 답변 포함) + 산후 주차·분만 방식·수유 여부", () => {
    expect(AI_SENSITIVE_CONSENT.summary).toContain(`같은 대화의 최근 메시지 최대 ${AI_CONTEXT_MAX_MESSAGES}개, 이전 AI 답변 포함`);
    for (const word of ["산후 주차", "분만 방식", "수유 여부"]) expect(AI_SENSITIVE_CONSENT.summary).toContain(word);
  });

  it("전문은 '자세히' 하나에 접힌다 — 모든 줄이 그 안에 있고, 중요한 줄은 크게·굵게·밑줄", () => {
    expect(markup.match(/<details/g)).toHaveLength(1);
    expect(markup).not.toMatch(/<details[^>]* open/);
    expect(text).toContain(AI_CONSENT_TEXT.more);
    for (const item of AI_CONSENT_ITEMS) {
      for (const row of item.details) {
        expect(text, row.term).toContain(row.term);
        expect(text, row.term).toContain(row.text);
      }
    }
    const emphasized = (item: (typeof AI_CONSENT_ITEMS)[number]) => item.details.filter((row) => row.emphasis === true);
    expect(emphasized(AI_SENSITIVE_CONSENT).map((row) => row.term)).toEqual(["처리 항목", "이용 목적", "보유 기간"]);
    expect(emphasized(AI_TRANSFER_CONSENT).map((row) => row.term)).toEqual(["이전받는 자", "이전 항목", "이용 목적", "보유 기간"]);
    for (const item of AI_CONSENT_ITEMS) {
      for (const row of emphasized(item)) expect(markup).toContain(`<dd class="${DETAIL_EMPHASIS_CLASS}">${row.text}</dd>`);
    }
  });

  it("국외 이전 전문 — 받는 자·연락처·국가·시기와 방법·보유 기간·철회, 상담만·카카오 계정만", () => {
    const row = (term: string) => AI_TRANSFER_CONSENT.details.find((d) => d.term === term)!.text;
    expect(row("이전받는 자")).toBe("Anthropic, PBC (미국) · privacy@anthropic.com");
    expect(row("이전 국가")).toBe("미국");
    expect(row("이전 시기·방법")).toContain("온맘 서버(대한민국 서울)");
    expect(row("보유 기간")).toContain("받은 날부터 30일 안에 삭제");
    expect(row("보유 기간")).toContain("최대 2년");
    expect(row("거부 방법과 효과")).toContain("설정 > 내 데이터");
    expect(row("해당 기능")).toContain("카카오 계정만");
    expect(row("해당 기능")).toContain("약물·음식 체크는 AI를 쓰지 않아요");
  });

  it("버튼 둘 — 동의하고 계속하기 / 동의하지 않기", () => {
    expect(text).toContain(AI_CONSENT_TEXT.accept);
    expect(text).toContain(AI_CONSENT_TEXT.decline);
  });
});

/**
 * 동의 글자의 지문 — 판(AI_CONSENT_VERSION)마다 하나. 카드의 제목·첫 문장이나 두 동의의 요약·전문(consentText.ts AI_CONSENT_ITEMS —
 * 예: 이전받는 자 연락처·보유 기간을 고칠 때)을 바꾸면 여기서 실패한다. 그때는 AI_CONSENT_VERSION을 올리고(모두에게 다시 묻는다)
 * 아래에 새 줄을 더한다. 이미 있는 줄의 지문만 고쳐 넘어가지 않는다 — 예전 글자에 동의한 사람이 바뀐 글자에 동의한 것으로 남는다.
 * - web-2026-09-28.2: 동의 하나(국외 이전)일 때 — [제목, 첫 문장, 전문 줄]로 만든 값이다.
 * - web-2026-11-06.1: 두 동의(민감정보 처리·국외 이전) — [제목, 첫 문장, 두 동의]로 만든 값이다.
 */
const AI_CONSENT_FINGERPRINTS: Readonly<Record<string, string>> = {
  "web-2026-09-28.2": "caa886e2baeeca67a827abf76abdb5f624a1c676945b6a909665e941f4a4c3a6",
  "web-2026-11-06.1": "7995c78ce0d0b2fd4f0b484ef2c3a1b836e3457b5e21040cbac1387617c7611c",
};

describe("AI 동의 판 — 글자를 바꾸면 판을 올린다", () => {
  it("지금 글자의 지문 = 지금 판의 지문", () => {
    const fingerprint = createHash("sha256")
      .update(JSON.stringify([AI_CONSENT_TEXT.title, AI_CONSENT_TEXT.lead, AI_CONSENT_ITEMS]))
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
