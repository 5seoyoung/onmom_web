import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { LLMRequest, LLMResult } from "@/api/llm";
import content from "@/content";
import { substanceHeader } from "@/rules/substance";
import {
  canCheckSubstance,
  checkSubstance,
  createLatestOnly,
  makeSubstanceLlmLookup,
  shouldOfferAiConsent,
  substanceDeps,
  substanceLlmContext,
  substanceResultChips,
  VERDICT_BADGE_CLASS,
  verdictBadge,
} from "./substanceModel";

const okText = (text: string) => vi.fn(async (): Promise<LLMResult> => ({ ok: true, text }));
const failed = () =>
  vi.fn(async (): Promise<LLMResult> => ({ ok: false, kind: "network", message: "AI 서버에 연결할 수 없어요." }));

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

describe("substanceDeps — LLM은 서버가 설정됐을 때만", () => {
  it("미설정이면 llmLookup이 없다 → 표만 본다, 서버 호출 없음", async () => {
    const complete = okText('{"verdict":"safe","detail":"x","sources":[]}');
    const deps = substanceDeps({ llmConfigured: false, complete, context: null });
    expect(deps.llmLookup).toBeUndefined();
    const r = await checkSubstance("모르는약", deps);
    expect(r).toMatchObject({ verdict: "unknown", source: "table", query: "모르는약" });
    expect(r.detail).toBe(content.substance_unknown.detail);
    expect(r.evidenceChips).toEqual(content.substance_unknown.chips);
    expect(complete).not.toHaveBeenCalled();
  });

  it("설정돼 있어도 표에 있는 항목은 LLM에 묻지 않는다(검수 #1)", async () => {
    const complete = okText('{"verdict":"safe","detail":"x","sources":[]}');
    const deps = substanceDeps({ llmConfigured: true, complete, context: null });
    const r = await checkSubstance("아스피린", deps);
    expect(r).toMatchObject({ verdict: "avoid", source: "table" });
    expect(complete).not.toHaveBeenCalled();
  });

  it("표에 없으면 LLM 답 — AI 답변 칩과 병기 문구", async () => {
    const complete = okText('```json\n{"verdict":"caution","detail":"근거가 제한적이에요.","sources":["LactMed"]}\n```');
    const deps = substanceDeps({ llmConfigured: true, complete, context: null });
    const r = await checkSubstance(" 모르는약 ", deps);
    expect(r).toMatchObject({ verdict: "caution", source: "llm", query: "모르는약" });
    expect(r.evidenceChips).toEqual(["src:LactMed", "AI 답변"]);
    expect(r.detail).toBe("근거가 제한적이에요. (AI 답변이며 진단·처방이 아닙니다. 복용 전 의료진·약사와 상담하세요.)");
  });

  it("LLM 실패·형식 오류면 표의 정보 부족을 그대로 둔다", async () => {
    for (const complete of [failed(), okText("모르겠어요"), okText('{"verdict":"maybe","detail":"x","sources":[]}')]) {
      const deps = substanceDeps({ llmConfigured: true, complete, context: null });
      const r = await checkSubstance("모르는약", deps);
      expect(r).toMatchObject({ verdict: "unknown", source: "table" });
      expect(complete).toHaveBeenCalledTimes(1);
    }
  });
});

describe("별칭이 다른 낱말 안에 숨던 입력 — 이제 표에 없는 항목과 같은 길(임상 사전 검토 §4-6)", () => {
  // 예전에는 술 행 "피하세요", 철분·페니실린계 행 "수유 중 가능", 카페인·식중독 행으로 갔다(rules/substanceMatch.ts)
  const NOW_UNLISTED = ["수술 후 진통제", "다이어트 영양제", "퀴놀론계 항생제", "세티리진", "레보티록신", "아티반", "콜라겐", "회음부 연고"];

  it("AI 꺼짐: 표의 '정보 부족' 문구·칩 그대로, 서버 호출 없음", async () => {
    const complete = okText('{"verdict":"safe","detail":"x","sources":[]}');
    const deps = substanceDeps({ llmConfigured: false, complete, context: null });
    for (const q of NOW_UNLISTED) {
      const r = await checkSubstance(q, deps);
      expect(r, q).toEqual({
        query: q,
        verdict: "unknown",
        detail: content.substance_unknown.detail,
        evidenceChips: content.substance_unknown.chips,
        source: "table",
      });
      expect(verdictBadge(r.verdict).label).toBe("정보 부족");
    }
    expect(complete).not.toHaveBeenCalled();
  });

  it("AI 켜짐: 같은 입력어로 AI에 묻고 'AI 답변' 표시를 단다", async () => {
    for (const q of NOW_UNLISTED) {
      const complete = okText('{"verdict":"caution","detail":"의료진과 상의하세요.","sources":["LactMed"]}');
      const deps = substanceDeps({ llmConfigured: true, complete, context: { breastfeeding: true } });
      const r = await checkSubstance(q, deps);
      expect(complete, q).toHaveBeenCalledTimes(1);
      const [req] = complete.mock.calls[0] as unknown as [LLMRequest];
      expect(req.messages).toEqual([{ role: "user", content: q }]);
      expect(r).toMatchObject({ query: q, verdict: "caution", source: "llm" });
      expect(r.evidenceChips).toContain("AI 답변");
    }
  });

  it("동의를 묻는 중(ask)이면 다른 미등재 항목처럼 동의 카드를 띄운다", async () => {
    for (const q of NOW_UNLISTED) {
      expect(shouldOfferAiConsent(await checkSubstance(q, {}), "ask"), q).toBe(true);
    }
  });
});

describe("makeSubstanceLlmLookup — 요청 본문(SubstanceCheckView.swift:118-126)", () => {
  it("preset substance · 512토큰(예전 경로용) · 산모 정보는 넘긴 컨텍스트 그대로 · signal 전달", async () => {
    const complete = okText('{"verdict":"safe","detail":"d","sources":["FDA"]}');
    const signal = new AbortController().signal;
    const context = { week: 6, breastfeeding: true };
    const lookup = makeSubstanceLlmLookup({ complete, context, signal });
    await expect(lookup("모르는약")).resolves.toEqual({ verdict: "safe", detail: "d", sources: ["FDA"] });
    const [req, opts] = complete.mock.calls[0] as unknown as [LLMRequest, { signal?: AbortSignal }];
    // iOS의 컨텍스트 문자열("모유수유 중, 산후 N일차")은 만들지도 보내지도 않는다 — 산모 정보는 넘긴 컨텍스트 두 항목뿐
    expect(req).toEqual({
      messages: [{ role: "user", content: "모르는약" }],
      preset: "substance",
      context,
      maxTokens: 512,
    });
    expect(opts.signal).toBe(signal);
  });

  it("실패 결과는 null", async () => {
    await expect(
      makeSubstanceLlmLookup({ complete: failed(), context: null })("x"),
    ).resolves.toBeNull();
  });
});

describe("substanceLlmContext — 수유 여부와 산후 주차만(분만 방식은 보내지 않는다)", () => {
  const now = new Date(2026, 8, 27, 10);
  it("출산일이 있으면 주차", () => {
    expect(substanceLlmContext({ deliveryDate: "2026-08-16", isBreastfeeding: false }, now)).toEqual({ week: 6, breastfeeding: false });
  });
  it("출산일이 없으면 주차를 빼고 보낸다", () => {
    expect(substanceLlmContext({ deliveryDate: null, isBreastfeeding: true }, now)).toEqual({ breastfeeding: true });
  });
});

describe("shouldOfferAiConsent — AI 국외 이전 동의 카드", () => {
  const unknownFromTable = { query: "모르는약", verdict: "unknown" as const, detail: "d", evidenceChips: [], source: "table" as const };
  it("동의를 묻는 중(ask)이고 표에 없는 항목일 때만", () => {
    expect(shouldOfferAiConsent(unknownFromTable, "ask")).toBe(true);
    expect(shouldOfferAiConsent(unknownFromTable, "on")).toBe(false);
    expect(shouldOfferAiConsent(unknownFromTable, "off")).toBe(false);
    expect(shouldOfferAiConsent(null, "ask")).toBe(false);
  });
  it("표에 있는 항목·AI 답에는 묻지 않는다", () => {
    expect(shouldOfferAiConsent({ ...unknownFromTable, verdict: "avoid" }, "ask")).toBe(false);
    expect(shouldOfferAiConsent({ ...unknownFromTable, source: "llm" }, "ask")).toBe(false);
  });
});

describe("서버에 AI 동의 기록이 없다(403 ai_consent_required) — 동의를 지우면 '정보 부족' 아래에 동의 카드가 다시", () => {
  const consentRequired = () =>
    vi.fn(async (): Promise<LLMResult> => ({ ok: false, kind: "server", message: "", status: 403, code: "ai_consent_required" }));

  it("onConsentRequired를 한 번 부르고, 결과는 표의 '정보 부족' — 동의를 지운 뒤(ask) 카드 조건이 맞는다", async () => {
    const onConsentRequired = vi.fn();
    const deps = substanceDeps({ llmConfigured: true, complete: consentRequired(), context: null, onConsentRequired });
    const r = await checkSubstance("모르는약", deps);
    expect(onConsentRequired).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ verdict: "unknown", source: "table" });
    expect(shouldOfferAiConsent(r, "ask")).toBe(true);
  });

  it("다른 실패·성공에는 부르지 않는다", async () => {
    for (const complete of [
      failed(),
      vi.fn(async (): Promise<LLMResult> => ({ ok: false, kind: "server", message: "", status: 429, code: "rate_limited" })),
      okText('{"verdict":"safe","detail":"x","sources":[]}'),
    ]) {
      const onConsentRequired = vi.fn();
      await makeSubstanceLlmLookup({ complete, context: null, onConsentRequired })("모르는약");
      expect(onConsentRequired).not.toHaveBeenCalled();
    }
  });

  it("화면 — 요청은 동의 기록 뒤에(afterAiConsentRecord), 403이면 이 계정의 동의를 지운다(revoke)", () => {
    const src = readFileSync(fileURLToPath(new URL("./SubstanceCheckScreen.tsx", import.meta.url)), "utf8");
    const chain = src.slice(src.indexOf("void Promise.resolve()"), src.indexOf("function focusResult"));
    expect(chain).toContain("complete: afterAiConsentRecord(accountId, llmComplete),");
    expect(chain).toContain("onConsentRequired: revoke,");
    expect(src).toContain("const { consented, accept, revoke } = useAiConsent(accountId);");
  });
});

describe("createLatestOnly — 늦게 온 이전 조회는 버린다(SubstanceCheckView.swift:94-95)", () => {
  it("새 조회가 시작되면 이전 번호는 무효", () => {
    const seq = createLatestOnly();
    const a = seq.begin();
    const b = seq.begin();
    expect(seq.isCurrent(a)).toBe(false);
    expect(seq.isCurrent(b)).toBe(true);
  });
  it("cancel() 뒤에는 진행 중인 조회 모두 무효", () => {
    const seq = createLatestOnly();
    const a = seq.begin();
    seq.cancel();
    expect(seq.isCurrent(a)).toBe(false);
  });
  it("느린 첫 조회가 나중에 끝나도 두 번째 결과만 남는다", async () => {
    const seq = createLatestOnly();
    let shown: string | null = null;
    let releaseSlow!: () => void;
    const slow = new Promise<void>((r) => (releaseSlow = r));
    const t1 = seq.begin();
    const p1 = slow.then(() => {
      if (seq.isCurrent(t1)) shown = "첫 조회";
    });
    const t2 = seq.begin();
    await Promise.resolve().then(() => {
      if (seq.isCurrent(t2)) shown = "두 번째 조회";
    });
    releaseSlow();
    await p1;
    expect(shown).toBe("두 번째 조회");
  });
});

describe("substanceResultChips — AI가 제시한 출처는 확인된 출처 칩과 다른 모양(원칙 4, DEV_NOTES §3 CPO 7)", () => {
  it("표 결과의 칩은 토큰 그대로 공용 칩(src: = 확인된 출처 칩)", () => {
    expect(substanceResultChips({ source: "table", evidenceChips: ["회피", "src:FDA"] })).toEqual([
      { kind: "evidence", token: "회피" },
      { kind: "evidence", token: "src:FDA" },
    ]);
  });

  it("AI 답의 src: 토큰은 aiSource(접두 제거) — 'AI 답변' 칩은 공용 칩 그대로", () => {
    expect(substanceResultChips({ source: "llm", evidenceChips: ["src:LactMed", "src: NHS ", "AI 답변"] })).toEqual([
      { kind: "aiSource", text: "LactMed" },
      { kind: "aiSource", text: "NHS" },
      { kind: "evidence", token: "AI 답변" },
    ]);
  });

  it("빈 칩은 그리지 않는다(AI가 빈 출처를 주어도 칩을 지어내지 않는다)", () => {
    expect(substanceResultChips({ source: "llm", evidenceChips: ["src:", "  ", "AI 답변"] })).toEqual([{ kind: "evidence", token: "AI 답변" }]);
  });

  it("AI 답 전체 흐름: 표에 없는 항목 → LLM 출처는 aiSource 셋", async () => {
    const complete = okText('{"verdict":"caution","detail":"d","sources":["LactMed","FDA"]}');
    const deps = substanceDeps({ llmConfigured: true, complete, context: null });
    const r = await checkSubstance("모르는약", deps);
    expect(substanceResultChips(r).map((c) => c.kind)).toEqual(["aiSource", "aiSource", "evidence"]);
  });
});

describe("예상하지 못한 오류 — '조회 중'이 남지 않고 표의 결과로 마무리(L6)", () => {
  it("의존성 없이(표만) 조회하면 표에 없는 항목은 '정보 부족' — 오류 때 화면이 쓰는 결과", async () => {
    const r = await checkSubstance("없는약", {});
    expect(r).toMatchObject({ verdict: "unknown", source: "table", detail: content.substance_unknown.detail });
  });

  it("화면의 조회 사슬에 catch·finally가 있다 — 요청 준비부터 약속 안에서", () => {
    const src = readFileSync(fileURLToPath(new URL("./SubstanceCheckScreen.tsx", import.meta.url)), "utf8");
    const chain = src.slice(src.indexOf("void Promise.resolve()"), src.indexOf("function focusResult"));
    expect(chain).toContain("return checkSubstance(text, deps);");
    expect(chain).toContain(".catch(() => checkSubstance(text, {}))");
    expect(chain).toMatch(/\.finally\(\(\) => \{[\s\S]*setLoading\(false\);/);
  });
});
