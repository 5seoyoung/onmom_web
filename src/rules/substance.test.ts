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

const answer = (a: Partial<LlmSubstanceAnswer>): LlmSubstanceAnswer => ({
  verdict: "safe",
  detail: "LLM 설명",
  sources: ["LactMed"],
  ...a,
});

describe("큐레이션 표 (02 §8)", () => {
  it("23행(2026-11-13 트라마돌·먹는 세마글루타이드 행 추가) 모두 첫 별칭으로 자기 행을 찾는다", () => {
    expect(content.substances).toHaveLength(23);
    for (const row of content.substances) {
      const r = lookupSubstance(row.aliases[0]);
      // 표 순서와 상관없다 — 모든 별칭의 시험은 substanceMatch.test.ts
      expect(r.verdict).toBe(row.verdict);
      expect(r.detail).toBe(row.detail);
      expect(r.evidenceChips).toEqual(row.chips);
      expect(r.source).toBe("table");
    }
  });

  it("코데인 → 피하세요(FDA·LactMed) — 결론 먼저, 아기 관찰 신호를 함께(2026-11-13 LactMed LM347, 2026-11-18 문구)", () => {
    expect(lookupSubstance("코데인")).toEqual({
      query: "코데인",
      verdict: "avoid",
      detail:
        "수유 중에는 권장되지 않는 약이에요. 일부 산모에서는 아기에게 약이 너무 많이 전달될 위험이 있어요. 아기가 평소보다 많이 자거나, 젖을 잘 못 빨거나, 숨쉬기 힘들어하거나, 축 늘어지면 바로 의사에게 연락하세요.",
      evidenceChips: ["회피", "src:FDA", "src:LactMed"],
      source: "table",
    });
    expect(verdictLabel("avoid")).toBe("피하세요");
  });

  it("2026-11-13 새 행 — 트라마돌·울트라셋은 주의(FDA 비권고·아기 관찰), 먹는 세마글루타이드는 피하세요(LactMed)", () => {
    for (const q of ["트라마돌", "울트라셋", "tramadol"]) {
      const r = lookupSubstance(q);
      expect(r.verdict, q).toBe("caution");
      expect(r.detail, q).toContain("FDA");
      expect(r.detail, q).toContain("축 늘어지면");
    }
    for (const q of ["리벨서스", "먹는 세마글루타이드", "경구 세마글루타이드"]) expect(lookupSubstance(q).verdict, q).toBe("avoid");
    // 주사형은 표에 없다 — 정보 부족(안심 쪽 판정을 만들지 않는다)
    for (const q of ["위고비", "오젬픽", "세마글루타이드 주사"]) expect(lookupSubstance(q).verdict, q).toBe("unknown");
  });

  it("2026-11-13 문구 — 생선은 식약처 기준(주 100g·400g), 날생선은 안심 문구 없이, 아스피린은 임의 중단 금지", () => {
    expect(lookupSubstance("고등어").detail).toContain("일주일에 400g 이하");
    expect(lookupSubstance("참치").detail).toContain("일주일에 100g 이하");
    expect(lookupSubstance("참치").evidenceChips).toEqual(["섭취량 주의", "src:식약처 2017"]);
    expect(lookupSubstance("생선회").detail).not.toContain("문제없");
    expect(lookupSubstance("아스피린").verdict).toBe("avoid");
    expect(lookupSubstance("아스피린").detail).toContain("임의로 끊지 말고");
    // 출처 칩 — WHO 2022 지침에 없는 WHO-PNC·확인 못 한 ACOG 대신
    expect(lookupSubstance("카페인").evidenceChips).toEqual(["용량 주의", "src:LactMed", "src:CDC"]);
    expect(lookupSubstance("술").evidenceChips).toEqual(["회피", "src:CDC"]);
    expect(lookupSubstance("담배").evidenceChips).toEqual(["회피", "src:LactMed"]);
  });

  it("낱말로 찾고 대소문자를 무시한다 — 별칭 뒤의 양·용량·영문 표기는 그대로 둔다", () => {
    expect(lookupSubstance("ACETAMINOPHEN").verdict).toBe("safe");
    expect(lookupSubstance("SSRI").verdict).toBe("caution");
    expect(lookupSubstance("codeine 30mg").verdict).toBe("avoid");
    expect(lookupSubstance("맥주 한 잔").verdict).toBe("avoid");
    expect(lookupSubstance("철분 20mg").evidenceChips).toEqual(["수유 가능", "src:WHO-PNC"]);
  });

  it("표 순서대로 첫 일치가 아니다 — iOS의 부분일치 특성은 따르지 않는다", () => {
    // "생선회"는 별칭 그대로인 생선회 행이 이긴다(긴 별칭이 이긴다) — 예전에는 표 순서대로 앞 행(생선, 수은)에 먼저 걸렸다
    expect(lookupSubstance("생선회").evidenceChips).toEqual(["위생 주의", "src:식약처 2017"]);
    // 다른 낱말 안의 별칭은 맞지 않는다 — 예전에는 회복 → 회 행, 파티 → 티 행, 커피우유 → 커피 행
    for (const q of ["회복", "파티", "커피우유"]) {
      expect(lookupSubstance(q).verdict, q).toBe("unknown");
    }
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

describe("2026-11-18 문구(전문의 검토) — 결론 먼저, 쉬운 해요체, 일반 정보로, 사실·수치는 그대로", () => {
  const detailOf = (q: string) => lookupSubstance(q).detail;
  const sentences = (text: string) => text.split(/(?<=\.)\s+/);

  it("모든 설명은 해요체 문장으로만 — '~습니다'·'권장.' 같은 딱딱한 끝이 없다", () => {
    for (const text of [...content.substances.map((r) => r.detail), content.substance_unknown.detail]) {
      for (const s of sentences(text)) expect(s, text).toMatch(/요\.$/);
      expect(text).not.toMatch(/니다/);
    }
  });

  it("개인에게 허락·안전을 판정하는 말투가 없다(법률 자체 검토 — 일반 정보)", () => {
    for (const row of content.substances) {
      for (const phrase of ["드셔도 돼요", "먹어도 돼요", "안전합니다", "안전해요", "안전한 것으로"]) {
        expect(row.detail, row.aliases[0]).not.toContain(phrase);
      }
    }
    // "수유 중 가능" 행은 첫 문장이 일반 정보로 결론을 말한다
    for (const row of content.substances.filter((r) => r.verdict === "safe")) {
      expect(sentences(row.detail)[0], row.aliases[0]).toContain("알려져 있어요");
    }
  });

  it("전문의가 든 예시 그대로 — 타이레놀·홍삼", () => {
    expect(detailOf("타이레놀")).toBe("수유 중에도 먹을 수 있는 약으로 알려져 있어요. 정해진 용량을 지켜 주세요.");
    expect(detailOf("홍삼")).toBe("수유 중 안전성 근거가 충분하지 않아요. 전문가와 상의해 신중하게 사용하세요.");
  });

  it("'피하세요' 행은 첫 문장에서 권하지 않음을 말한다", () => {
    for (const row of content.substances.filter((r) => r.verdict === "avoid")) {
      expect(sentences(row.detail)[0], row.aliases[0]).toMatch(/권장되지 않|피하는 것을 권해요/);
    }
  });

  it("사실·수치는 그대로 남았다", () => {
    const babySigns = "아기가 평소보다 많이 자거나, 젖을 잘 못 빨거나, 숨쉬기 힘들어하거나, 축 늘어지면 바로 의사에게 연락하세요.";
    expect(detailOf("코데인")).toContain(babySigns);
    expect(detailOf("트라마돌")).toContain(babySigns);
    expect(detailOf("트라마돌")).toContain("미국 FDA는 수유 중에는 트라마돌을 권하지 않아요.");
    expect(detailOf("아스피린")).toContain("처방받아 먹고 있는 약이라면 임의로 끊지 말고 처방 의사와 상의하세요.");
    expect(detailOf("아스피린")).toContain("멍이나 출혈");
    expect(detailOf("리벨서스")).toContain("먹는 세마글루타이드(리벨서스 등)에는 흡수를 돕는 성분이 들어 있어 아기에게 쌓일 수 있어요.");
    expect(detailOf("참치")).toContain("참다랑어·새치류·상어류처럼 수은이 많은 생선은 일주일에 100g 이하(주 1회 정도)");
    expect(detailOf("참치")).toContain("고등어·갈치·멸치·참치통조림 같은 일반 생선은 일주일에 400g 이하");
    expect(detailOf("생선회")).toContain("참치회(참다랑어 등)는 수은이 많아 일주일에 100g 이하");
    expect(detailOf("생선회")).toContain("식중독");
    for (const q of ["카페인", "녹차", "콜라"]) expect(detailOf(q), q).toContain("200–300mg 이하");
    expect(detailOf("카페인")).toContain("아기 잠");
    expect(detailOf("감기약")).toContain("슈도에페드린 성분은 모유량을 줄일 수 있어");
    expect(detailOf("감기약")).toContain("약사와 상담하세요");
    expect(detailOf("나프록센")).toContain("반감기");
    expect(detailOf("나프록센")).toContain("이부프로펜");
    expect(detailOf("세티리진")).toContain("2세대 항히스타민");
    expect(detailOf("아목시실린")).toContain("페니실린계");
    expect(detailOf("설트랄린")).toContain("반드시 의료진과 상의해 결정하세요");
    expect(detailOf("한약")).toContain("한의사·의료진과 상담하세요");
    expect(detailOf("초콜릿")).toContain("카페인·테오브로민");
    expect(detailOf("담배")).toContain("모유량");
    expect(detailOf("철분")).toContain("일반적인 용량");
    expect(detailOf("이부프로펜")).toContain("짧은 기간");
    expect(detailOf("매운음식")).toContain("아기가 보채면");
  });

  it("정보 부족 설명은 쉬운 말로 — '큐레이션' 같은 낯선 말 없이, 상담 안내는 그대로", () => {
    expect(UNKNOWN_DETAIL).not.toContain("큐레이션");
    expect(UNKNOWN_DETAIL).toContain("의료진·약사와 상담하세요");
  });
});

describe("묶음 낱말·뜻이 넓은 낱말은 표가 답하지 않는다(임상 사전 검토 B4 — 보수적으로만)", () => {
  // 예전에는 "수유 중 가능"이 나왔다(영양제·항생제·비타민) — 표의 행은 특정 성분의 근거일 뿐, 그 묶음 전체의 근거가 아니다.
  // 비타민은 비타민 A처럼 일괄 권고되지 않는 것도 묶이므로(임상 사전 검토 S9, WHO R21) 함께 뺐다.
  const UNLISTED = [
    "영양제",
    "영양제 먹어도 되나요?",
    "산후 영양제",
    "철분 영양제",
    "항생제",
    "수유 중 항생제",
    "항생제 먹어도 돼요?",
    "비타민",
    "비타민C",
    "비타민 D",
    "비타민A",
    "티",
    "티 한 잔",
    "tea",
    "회",
    "회 먹어도 되나요",
  ];

  it.each(UNLISTED)("%s → 정보 부족(의사·약사와 상담)", (q) => {
    const r = lookupSubstance(q);
    expect(r.verdict, q).toBe("unknown");
    expect(r.detail).toBe(UNKNOWN_DETAIL);
    expect(r.detail).toContain("의료진·약사와 상담");
  });

  it("'수유 중 가능' 행의 별칭에 묶음 낱말이 없다", () => {
    const safeAliases = content.substances.filter((row) => row.verdict === "safe").flatMap((row) => row.aliases);
    for (const word of ["영양제", "항생제", "비타민", "진통제", "해열제", "소염제", "감기약", "한약"]) expect(safeAliases, word).not.toContain(word);
  });

  it("지운 별칭 말고 그 행의 품목은 그대로 답한다", () => {
    for (const q of ["아목시실린", "철분", "철분제", "엽산", "녹차", "홍차", "생선회", "초밥"]) {
      expect(lookupSubstance(q).source, q).toBe("table");
      expect(lookupSubstance(q).verdict, q).not.toBe("unknown");
    }
    // 2026-11-13: 근거 없는 "종합비타민" 별칭을 뺐다(임상 자체 검토 S9) — 정보 부족 → 의사·약사 상담
    expect(lookupSubstance("종합비타민").verdict).toBe("unknown");
  });

  it("이미 있는 행에만 한글 별칭을 더했다 — 세티리진은 항히스타민 행, 말차·보이차·우롱차는 녹차·홍차 행(둘 다 주의)", () => {
    expect(content.substances).toHaveLength(23);
    expect(lookupSubstance("세티리진").detail).toBe(lookupSubstance("cetirizine").detail);
    expect(lookupSubstance("세티리진 먹어도 되나요?").verdict).toBe("caution");
    for (const q of ["말차", "보이차", "우롱차"]) {
      expect(lookupSubstance(q).detail, q).toBe(lookupSubstance("녹차").detail);
      expect(lookupSubstance(q).verdict, q).toBe("caution");
    }
    // 카페인이 없을 수 있는 차는 여전히 답하지 않는다
    for (const q of ["허브티", "캐모마일티", "루이보스티", "보리차"]) expect(lookupSubstance(q).verdict, q).toBe("unknown");
  });

  it("표의 설명이 '안전합니다'라고 단정하지 않는다 — 칩도 판정 글자와 같은 '수유 가능'(법률 사전 검토 4-3)", () => {
    for (const row of content.substances) {
      expect(row.detail, row.aliases[0]).not.toContain("안전합니다");
      expect(row.chips, row.aliases[0]).not.toContain("수유 안전");
    }
    expect(lookupSubstance("철분").detail).not.toContain("영양제");
  });
});

describe("별칭이 다른 낱말 안에 숨어 엉뚱한 행으로 가지 않는다(임상 사전 검토 §0-1 순위 4, §4-6)", () => {
  // 예전 결과(부분 문자열·표 순서 첫 일치): 술 행 "피하세요", 철분 행 "수유 중 가능", 페니실린계 문구 "수유 중 가능",
  // 녹차·티 행(카페인), 에너지드링크·콜라 행(카페인), 회 행(식중독). 맞는 행이 없으면 추측하지 않고 "정보 부족"으로 간다.
  const REPORTED = [
    "수술 후 진통제", // 술 ⊂ 수술
    "제왕절개 수술 후 먹는 약",
    "다이어트 영양제", // 영양제는 이제 별칭이 아니다(묶음 낱말)
    "퀴놀론계 항생제", // 항생제는 이제 별칭이 아니다(표의 문구는 페니실린계)
    "레보티록신",
    "아티반",
    "케티아핀",
    "콜라겐", // 콜라 ⊂ 콜라겐
    "회음부 연고", // 회 ⊂ 회음부
    "회복에 좋은 차",
    "회충약",
    "루이보스티",
    "허브티",
    "캐모마일티",
  ];

  it.each(REPORTED)("%s → 표에 없음(정보 부족)", (q) => {
    expect(lookupSubstance(q)).toEqual({
      query: q,
      verdict: "unknown",
      detail: UNKNOWN_DETAIL,
      evidenceChips: ["확인된 정보 없음"],
      source: "table",
    });
  });

  it("서로 다른 행의 품목이 함께 있으면 한 판정을 고르지 않는다 — 예전에는 타이레놀 행 '수유 중 가능'", () => {
    for (const q of ["타이레놀이랑 술", "술 마신 후 타이레놀", "아스피린 말고 타이레놀", "커피랑 초콜릿"]) {
      expect(lookupSubstance(q).verdict, q).toBe("unknown");
    }
  });

  it("복합제·다른 제품이 이름 바로 앞뒤에 붙으면 표가 답하지 않는다 — 예전에는 타이레놀 행 '수유 중 가능' 등", () => {
    // 울트라셋(트라마돌/아세트아미노펜)·타이레놀 콜드(복합 감기약)는 타이레놀 행의 품목이 아니다
    for (const q of ["아세트아미노펜 트라마돌", "아세트아미노펜/트라마돌", "트라마돌 아세트아미노펜", "타이레놀 콜드", "맥주 효모", "마늘 주사"]) {
      expect(lookupSubstance(q).verdict, q).toBe("unknown");
    }
  });

  it("AI가 켜져 있으면 표에 없는 이 항목들을 AI에 묻는다(입력어 그대로)", async () => {
    for (const q of ["수술 후 진통제", "다이어트 영양제", "퀴놀론계 항생제", "콜라겐"]) {
      const llmLookup = vi.fn(async () => answer({ verdict: "caution" }));
      const r = await resolveSubstance(q, { llmLookup });
      expect(llmLookup).toHaveBeenCalledTimes(1);
      expect(llmLookup).toHaveBeenCalledWith(q);
      expect(r.source).toBe("llm");
    }
  });
});

describe("표 우선, 미등재만 LLM (SubstanceCheckView.swift:97-102, 검수 #1)", () => {
  it("코데인: LLM이 safe라 해도 표의 avoid 그대로, LLM 호출 0회", async () => {
    const llmLookup = vi.fn(async () => answer({ verdict: "safe" }));
    const r = await resolveSubstance("코데인", { llmLookup });
    expect(llmLookup).not.toHaveBeenCalled();
    expect(r.verdict).toBe("avoid");
    expect(r.evidenceChips).toEqual(["회피", "src:FDA", "src:LactMed"]);
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
  it("입력어 1개 · preset substance · 512토큰 — 산모 정보(수유 여부·산후 주차)는 화면이 따로 붙인다(substanceLlmContext)", () => {
    expect(buildSubstanceLlmRequest({ query: "없는약" })).toEqual({
      messages: [{ role: "user", content: "없는약" }],
      preset: "substance",
      maxTokens: 512,
    });
  });
});

describe("화면 안내 (SubstanceCheckView.swift:18-27, 검수 #32)", () => {
  it("수유 중이면 수유 안내만", () => {
    expect(substanceHeader(true)).toEqual({ lead: "수유 중 약·음식을 입력하면 일반 정보를 보여 드려요.", note: null });
  });
  it("수유 안 하면 다른 안내 + 프로필 안내 전문", () => {
    expect(substanceHeader(false)).toEqual({
      lead: "약·음식을 입력하면 산후 일반 정보를 보여 드려요.",
      note: "프로필이 '모유수유 안 함'으로 되어 있어요. 수유 중이라면 프로필 편집에서 바꿔주세요 - 분류 기준이 달라져요.",
    });
  });
});

// ── content.json 표 전체 — 지금 맞는 별칭은 계속 자기 행으로 간다 ─────────────────────────────

const ROW_RESULTS = content.substances.map((row) => ({ verdict: row.verdict, detail: row.detail, evidenceChips: row.chips }));
const tableResult = (q: string) => {
  const r = lookupSubstance(q);
  return { verdict: r.verdict, detail: r.detail, evidenceChips: r.evidenceChips };
};

/** 별칭 뒤에 붙여 보는 토씨·어미(한 글자 별칭도 받는 것만) */
const PARTICLES = ["이", "가", "은", "는", "을", "를", "도", "만", "랑", "이랑", "하고", "과", "와", "요", "예요", "이에요", "인가요", "는요", "도요"];
const ATTACHED_ENDINGS = ["먹어도", "마셔도", "써도", "발라도", "먹어도되나요", "마셔도돼요", "괜찮나요", "한잔"];
const SPACED_ENDINGS = [" 먹어도 되나요?", " 마셔도 돼요", " 써도 되나요", " 발라도 괜찮나요", " 괜찮나요?", " 한 잔", " 500mg", " 하루 두 번"];
const CONTEXT_PREFIXES = ["수유 중 ", "수유중에 ", "출산 후 ", "제왕절개 후 ", "산후 ", "혹시 "];
const IDEOGRAPHIC_SPACE = String.fromCharCode(0x3000);
const WRAPPERS: [string, string][] = [["(", ")"], ["'", "'"], ["", "?"], ["", "!!"], ["", "~"], ["", "ㅠㅠ"], [IDEOGRAPHIC_SPACE, IDEOGRAPHIC_SPACE]];

describe("content.json 표 — 모든 별칭이 자기 행을 찾는다(회귀)", () => {
  it("행마다 판정·설명·칩이 달라 결과로 행을 가려낼 수 있다", () => {
    expect(new Set(content.substances.map((row) => row.detail)).size).toBe(content.substances.length);
  });

  it("별칭 그대로 · 대문자 · NFD", () => {
    content.substances.forEach((row, i) => {
      for (const alias of row.aliases) {
        expect(tableResult(alias), alias).toEqual(ROW_RESULTS[i]);
        expect(tableResult(alias.toUpperCase()), alias.toUpperCase()).toEqual(ROW_RESULTS[i]);
        expect(tableResult(alias.normalize("NFD")), `${alias} (NFD)`).toEqual(ROW_RESULTS[i]);
      }
    });
  });

  it("토씨·붙여 쓴 어미 · 띄어 쓴 어미 · 상황 앞말 · 문장부호", () => {
    let checked = 0;
    content.substances.forEach((row, i) => {
      for (const alias of row.aliases) {
        const queries = [
          ...PARTICLES.map((p) => alias + p),
          ...ATTACHED_ENDINGS.map((e) => alias + e),
          ...SPACED_ENDINGS.map((e) => alias + e),
          ...CONTEXT_PREFIXES.map((c) => c + alias),
          ...CONTEXT_PREFIXES.map((c) => `${c}${alias}는 괜찮나요?`),
          ...WRAPPERS.map(([a, b]) => a + alias + b),
        ];
        for (const q of queries) {
          expect(tableResult(q), q).toEqual(ROW_RESULTS[i]);
          checked++;
        }
      }
    });
    expect(checked).toBeGreaterThan(3000);
  });

  it("다른 낱말 안에 붙은 별칭은 맞지 않는다 — 앞에 한글이 붙거나, 뒤에 꼬리가 아닌 한글이 붙으면", () => {
    for (const row of content.substances) {
      for (const alias of row.aliases) {
        // "뷁"은 어떤 별칭·꼬리와도 낱말을 이루지 않는 글자
        expect(lookupSubstance(`뷁${alias}`).verdict, `뷁${alias}`).toBe("unknown");
        expect(lookupSubstance(`${alias}뷁`).verdict, `${alias}뷁`).toBe("unknown");
      }
    }
  });

  it("한 글자 별칭은 술뿐이다(회·티는 뜻이 넓어 뺐다 — 임상 사전 검토 B4) — 새 한 글자 별칭은 꼬리가 다른 낱말을 만들지 확인한 뒤 이 목록에 더한다", () => {
    const short = content.substances.flatMap((row) => row.aliases).filter((a) => [...a.normalize("NFC")].length === 1);
    expect(short.sort()).toEqual(["술"]);
  });

  it("두 글자 별칭이 흔한 합성어 안에서 맞지 않는다(꼬리가 아닌 낱말이 붙음)", () => {
    for (const q of ["콜라겐", "커피우유", "맥주효모", "전자담배", "김치찌개", "참치김밥", "녹차라떼", "마늘주사", "인삼주", "생맥주", "레드와인", "흑마늘", "보약재", "니코틴패치"]) {
      expect(lookupSubstance(q).verdict, q).toBe("unknown");
    }
    // 꼬리(들·이)만 붙으면 같은 품목
    expect(lookupSubstance("날것들이").evidenceChips).toEqual(["위생 주의", "src:식약처 2017"]);
  });
});
