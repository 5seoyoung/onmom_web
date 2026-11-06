import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import content from "@/content";
import { lookupSubstance, substanceHeader } from "@/rules/substance";
import { canCheckSubstance, checkSubstance, substanceResultChips, VERDICT_BADGE_CLASS, verdictBadge } from "./substanceModel";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("상단 안내(SubstanceCheckView.swift:18-27)", () => {
  it("수유 중이면 안내 한 줄, 보조 문구 없음", () => {
    expect(substanceHeader(true)).toEqual({ lead: "수유 중 약·음식을 입력하면 안전 분류를 확인해요.", note: null });
  });
  it("수유 안 함이면 프로필 안내 전체 문장", () => {
    expect(substanceHeader(false)).toEqual({
      lead: "약·음식을 입력하면 산후 안전 분류를 확인해요.",
      note: "프로필이 '모유수유 안 함'으로 되어 있어요. 수유 중이라면 프로필 편집에서 바꿔주세요 - 분류 기준이 달라져요.",
    });
  });
});

describe("canCheckSubstance — [확인하기] 활성", () => {
  it("빈 입력·공백·탭만은 비활성", () => {
    expect(canCheckSubstance("")).toBe(false);
    expect(canCheckSubstance("   ")).toBe(false);
    expect(canCheckSubstance("\t 　")).toBe(false);
  });
  it("글자가 있으면 활성", () => {
    expect(canCheckSubstance(" 타이레놀 ")).toBe(true);
  });
});

describe("판정 배지", () => {
  it("라벨은 content.json verdict_labels 그대로", () => {
    for (const v of ["safe", "caution", "avoid", "unknown"] as const) {
      expect(verdictBadge(v).label).toBe(content.verdict_labels[v]);
    }
    expect(verdictBadge("safe").label).toBe("수유 중 가능");
    expect(verdictBadge("unknown").label).toBe("정보 부족");
  });
  it("색은 Swift 매핑 — safe 정상, caution 관찰, avoid 이상, unknown textSecondary", () => {
    expect(VERDICT_BADGE_CLASS.safe).toBe("bg-state-normal/15 text-state-normal-text");
    expect(VERDICT_BADGE_CLASS.caution).toBe("bg-state-watch/15 text-state-watch-text");
    expect(VERDICT_BADGE_CLASS.avoid).toBe("bg-state-alert/15 text-state-alert-text");
    expect(VERDICT_BADGE_CLASS.unknown).toContain("text-text-secondary");
  });
});

describe("AI를 쓰지 않는다 — 표에 없는 항목은 '정보 부족'으로 끝난다(2026-11-06 대표 결정, 사전 검토 H5·D-10)", () => {
  // 예전에는 술 행 "피하세요", 철분·페니실린계 행 "수유 중 가능", 카페인·식중독 행으로 갔다(rules/substanceMatch.ts — 임상 사전 검토 §4-6)
  const NOW_UNLISTED = ["수술 후 진통제", "다이어트 영양제", "퀴놀론계 항생제", "세티리진", "레보티록신", "아티반", "콜라겐", "회음부 연고"];

  it("표에 없는 항목: 표의 '정보 부족' 문구·칩 그대로, 서버 호출 없음", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    for (const q of [...NOW_UNLISTED, "처음보는약이름"]) {
      const r = checkSubstance(q);
      expect(r, q).toEqual({
        query: q,
        verdict: "unknown",
        detail: content.substance_unknown.detail,
        evidenceChips: content.substance_unknown.chips,
        source: "table",
      });
      expect(verdictBadge(r.verdict).label).toBe("정보 부족");
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("표에 있는 항목: 표 결과 그대로", () => {
    const known = content.substances[0].aliases[0];
    expect(checkSubstance(known)).toEqual(lookupSubstance(known));
    expect(checkSubstance(known).source).toBe("table");
  });

  it("화면·모델은 LLM·동의 카드에 닿지 않는다 — AI 판정 배지로 가는 길이 코드에 없다", () => {
    for (const file of ["./SubstanceCheckScreen.tsx", "./substanceModel.ts"]) {
      const src = readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8");
      for (const name of ["llmComplete", "@/api/llm", "resolveSubstance", "llmLookup", "AiConsentCard", "useAiConsent", "isLLMBackendConfigured", "@/features/chat"]) {
        expect(src, `${file} ${name}`).not.toContain(name);
      }
    }
  });
});

describe("substanceResultChips — 표의 근거·출처 칩", () => {
  it("토큰 그대로, 빈 칩은 그리지 않는다", () => {
    expect(substanceResultChips({ evidenceChips: ["src:FDA", " ", "", "확인된 정보 없음"] })).toEqual(["src:FDA", "확인된 정보 없음"]);
  });
});
