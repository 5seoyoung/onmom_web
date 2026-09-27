import { describe, expect, it, vi } from "vitest";
import content from "@/content";
import {
  buildSubstanceLlmRequest,
  localizedCaseInsensitiveContains,
  lookupSubstance,
  parseSubstanceAnswer,
  resolveSubstance,
  substanceHeader,
  verdictLabel,
  type LlmSubstanceAnswer,
} from "./substance";

// 기대값은 iOS OnmomEngine.checkSubstance를 직접 실행해 확인했다(2026-09-23).
const UNKNOWN_DETAIL = content.substance_unknown.detail;
const AI_SUFFIX = " (AI 답변이며 진단·처방이 아닙니다. 복용 전 의료진·약사와 상담하세요.)";

describe("큐레이션 표 (02 §8)", () => {
  it("21행 모두 첫 별칭으로 자기 행을 찾는다", () => {
    expect(content.substances).toHaveLength(21);
    for (const row of content.substances) {
      const r = lookupSubstance(row.aliases[0]);
      // 첫 별칭이 앞 행 별칭을 포함하면 앞 행이 이긴다 — 현재 표에는 그런 행이 없다
      expect(r.verdict).toBe(row.verdict);
      expect(r.detail).toBe(row.detail);
      expect(r.evidenceChips).toEqual(row.chips);
      expect(r.source).toBe("table");
    }
  });

  it("코데인 → 피하세요(FDA)", () => {
    expect(lookupSubstance("코데인")).toEqual({
      query: "코데인",
      verdict: "avoid",
      detail: "일부 산모에서 아기에게 과량 전달 위험이 있어 수유 중 권장되지 않습니다.",
      evidenceChips: ["회피", "src:FDA"],
      source: "table",
    });
    expect(verdictLabel("avoid")).toBe("피하세요");
  });

  it("포함 여부로 찾고 대소문자를 무시한다", () => {
    expect(lookupSubstance("ACETAMINOPHEN").verdict).toBe("safe");
    expect(lookupSubstance("SSRI").verdict).toBe("caution");
    expect(lookupSubstance("codeine 30mg").verdict).toBe("avoid");
    expect(lookupSubstance("맥주 한 잔").verdict).toBe("avoid");
    expect(lookupSubstance("비타민C").evidenceChips).toEqual(["수유 가능", "src:WHO-PNC"]);
  });

  it("표 순서대로 첫 일치 — iOS 그대로의 부분일치 특성", () => {
    // "생선회"는 20행(회)보다 19행(생선)에 먼저 걸린다
    expect(lookupSubstance("생선회").evidenceChips).toEqual(["섭취 제한", "src:FDA-EPA"]);
    expect(lookupSubstance("회복").evidenceChips).toEqual(["위생 주의", "src:WHO-PNC"]);
    expect(lookupSubstance("파티").evidenceChips).toEqual(["용량 주의", "src:WHO-PNC"]);
    expect(lookupSubstance("커피우유").detail).toBe("하루 200–300mg 이하 권장. 과다 시 아기 수면에 영향.");
  });

  it("앞뒤 공백·탭만 지우고, 줄바꿈은 iOS처럼 남긴다", () => {
    expect(lookupSubstance(" 타이레놀 ").query).toBe("타이레놀");
    expect(lookupSubstance("\t홍삼\t").query).toBe("홍삼");
    expect(lookupSubstance("타이레놀\n").query).toBe("타이레놀\n");
    expect(lookupSubstance("타이레놀\n").verdict).toBe("safe");
  });

  it("자모가 분리된(NFD) 한글 입력도 찾는다", () => {
    expect(lookupSubstance("감기약".normalize("NFD")).verdict).toBe("caution");
  });

  it("미등재·영문 상품명·빈 입력 → 정보 부족", () => {
    for (const q of ["없는약", "Tylenol", ""]) {
      const r = lookupSubstance(q);
      expect(r.verdict).toBe("unknown");
      expect(r.detail).toBe(UNKNOWN_DETAIL);
      expect(r.evidenceChips).toEqual(["확인된 정보 없음"]);
    }
    expect(verdictLabel("unknown")).toBe("정보 부족");
  });

  it("빈 별칭은 어떤 입력에도 일치하지 않는다(Swift와 같게)", () => {
    expect(localizedCaseInsensitiveContains("아무거나", "")).toBe(false);
  });
});

describe("표 우선, 미등재만 LLM (SubstanceCheckView.swift:97-102, 검수 #1)", () => {
  const answer = (a: Partial<LlmSubstanceAnswer>): LlmSubstanceAnswer => ({
    verdict: "safe",
    detail: "LLM 설명",
    sources: ["LactMed"],
    ...a,
  });

  it("코데인: LLM이 safe라 해도 표의 avoid 그대로, LLM 호출 0회", async () => {
    const llmLookup = vi.fn(async () => answer({ verdict: "safe" }));
    const r = await resolveSubstance("코데인", { llmLookup });
    expect(llmLookup).not.toHaveBeenCalled();
    expect(r.verdict).toBe("avoid");
    expect(r.evidenceChips).toEqual(["회피", "src:FDA"]);
    expect(r.evidenceChips).not.toContain("AI 답변");
    expect(r.detail).not.toContain("AI 답변");
  });

  it("아스피린·술도 LLM을 부르지 않는다", async () => {
    const llmLookup = vi.fn(async () => answer({}));
    expect((await resolveSubstance("아스피린", { llmLookup })).verdict).toBe("avoid");
    expect((await resolveSubstance("술", { llmLookup })).verdict).toBe("avoid");
    expect(llmLookup).not.toHaveBeenCalled();
  });

  it("미등재 + 코드펜스 JSON → 파싱해 AI 답변 칩과 병기 문구를 단다", async () => {
    const raw = '```json\n{"verdict":"caution","detail":"소량은 괜찮아요.","sources":["LactMed","NHS"]}\n```';
    const llmLookup = vi.fn(async () => parseSubstanceAnswer(raw));
    const r = await resolveSubstance(" 없는약 ", { llmLookup });
    expect(llmLookup).toHaveBeenCalledTimes(1);
    expect(llmLookup).toHaveBeenCalledWith("없는약");
    expect(r).toEqual({
      query: "없는약",
      verdict: "caution",
      detail: "소량은 괜찮아요." + AI_SUFFIX,
      evidenceChips: ["src:LactMed", "src:NHS", "AI 답변"],
      source: "llm",
    });
  });

  it("LLM이 unknown을 주면 그 답으로 바꾼다(iOS 그대로 — AI 칩이 붙는다)", async () => {
    const r = await resolveSubstance("없는약", { llmLookup: async () => answer({ verdict: "unknown", sources: [] }) });
    expect(r.verdict).toBe("unknown");
    expect(r.evidenceChips).toEqual(["AI 답변"]);
    expect(r.source).toBe("llm");
  });

  it("verdict가 4값 밖이면 정보 부족 그대로", async () => {
    const raw = '{"verdict":"maybe","detail":"x","sources":[]}';
    const r = await resolveSubstance("없는약", { llmLookup: async () => parseSubstanceAnswer(raw) });
    expect(r).toEqual(lookupSubstance("없는약"));
    // 파서를 거치지 않은 비정상 값도 막는다
    const bad = { verdict: "maybe", detail: "x", sources: [] } as unknown as LlmSubstanceAnswer;
    expect((await resolveSubstance("없는약", { llmLookup: async () => bad })).detail).toBe(UNKNOWN_DETAIL);
  });

  it("LLM이 null·오류면 정보 부족 그대로", async () => {
    expect(await resolveSubstance("없는약", { llmLookup: async () => null })).toEqual(lookupSubstance("없는약"));
    const failing = async (): Promise<LlmSubstanceAnswer | null> => {
      throw new Error("offline");
    };
    expect(await resolveSubstance("없는약", { llmLookup: failing })).toEqual(lookupSubstance("없는약"));
  });

  it("LLM 미설정이면 표 결과만", async () => {
    expect(await resolveSubstance("없는약")).toEqual(lookupSubstance("없는약"));
  });
});

describe("LLM 답변 파싱", () => {
  it("앞뒤 설명이 붙어도 첫 { ~ 마지막 }만 읽는다", () => {
    expect(parseSubstanceAnswer('답변입니다: {"verdict":"avoid","detail":"d","sources":["FDA"]} 끝')).toEqual({
      verdict: "avoid",
      detail: "d",
      sources: ["FDA"],
    });
  });

  it("필드가 빠졌거나 형이 틀리면 null", () => {
    expect(parseSubstanceAnswer('{"verdict":"safe","detail":"d"}')).toBeNull();
    expect(parseSubstanceAnswer('{"verdict":"safe","detail":1,"sources":[]}')).toBeNull();
    expect(parseSubstanceAnswer('{"verdict":"safe","detail":"d","sources":[1]}')).toBeNull();
    expect(parseSubstanceAnswer('{"verdict":"SAFE","detail":"d","sources":[]}')).toBeNull();
  });

  it("JSON이 아니거나 괄호 순서가 뒤집히면 null", () => {
    expect(parseSubstanceAnswer("모르겠어요")).toBeNull();
    expect(parseSubstanceAnswer("} {")).toBeNull();
    expect(parseSubstanceAnswer("{ not json }")).toBeNull();
    expect(parseSubstanceAnswer("")).toBeNull();
  });
});

describe("LLM 요청 (SubstanceCheckView.swift:118-126, 검수 #24)", () => {
  it("입력어 1개 · preset substance · 수유 여부와 산후 일차 · 512토큰", () => {
    expect(buildSubstanceLlmRequest({ query: "없는약", isBreastfeeding: true, dayCount: 12 })).toEqual({
      messages: [{ role: "user", content: "없는약" }],
      preset: "substance",
      context: "모유수유 중, 산후 12일차",
      maxTokens: 512,
    });
    expect(buildSubstanceLlmRequest({ query: "x", isBreastfeeding: false, dayCount: 0 }).context).toBe(
      "모유수유 안 함, 산후 0일차",
    );
  });
});

describe("화면 안내 (SubstanceCheckView.swift:18-27, 검수 #32)", () => {
  it("수유 중이면 수유 안내만", () => {
    expect(substanceHeader(true)).toEqual({ lead: "수유 중 약·음식을 입력하면 안전 분류를 확인해요.", note: null });
  });
  it("수유 안 하면 다른 안내 + 프로필 안내 전문", () => {
    expect(substanceHeader(false)).toEqual({
      lead: "약·음식을 입력하면 산후 안전 분류를 확인해요.",
      note: "프로필이 '모유수유 안 함'으로 되어 있어요. 수유 중이라면 프로필 편집에서 바꿔주세요 — 분류 기준이 달라져요.",
    });
  });
});
