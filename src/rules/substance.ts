// 약물·음식 체크 — iOS `OnmomEngine.checkSubstance`(큐레이션 표)와 `SubstanceCheckView.run/llmLookup`을 옮긴 것.
//
// 판정 순서(SubstanceCheckView.swift:97-102, 검수 #1):
//   ① 출처가 표기된 큐레이션 표를 먼저 본다(표 순서대로 첫 일치).
//   ② 표에 없는 항목(unknown)일 때만 LLM 프록시에 묻는다. 실패하면 표의 "정보 부족"을 그대로 둔다.
// 표에 있는 항목은 LLM이 절대 덮어쓰지 않는다 — 코데인·아스피린·술의 "피하세요"는 출처 있는 규칙이다.
// "AI 답변" 칩과 병기 문구는 LLM 결과에만 붙는다. 진단·처방이 아니다.

import content from "@/content";

export type SubstanceVerdict = "safe" | "caution" | "avoid" | "unknown";

export interface SubstanceResult {
  /** 공백을 다듬은 입력어 */
  query: string;
  verdict: SubstanceVerdict;
  detail: string;
  evidenceChips: string[];
  /** 큐레이션 표("정보 부족" 포함) 결과인가, LLM 답변인가 */
  source: "table" | "llm";
}

/** LLM(preset substance)이 text 안에 돌려주는 JSON */
export interface LlmSubstanceAnswer {
  verdict: SubstanceVerdict;
  detail: string;
  sources: string[];
}

export interface SubstanceLlmRequest {
  messages: { role: "user"; content: string }[];
  preset: "substance";
  context: string;
  maxTokens: number;
}

export interface SubstanceDeps {
  /** LLM 서버가 설정돼 있을 때만 넘긴다. 실패·파싱 불가면 null(또는 throw). */
  llmLookup?: (query: string) => Promise<LlmSubstanceAnswer | null>;
}

const VERDICTS: readonly SubstanceVerdict[] = ["safe", "caution", "avoid", "unknown"];

// 원문: SubstanceCheckView.swift:137
const AI_ANSWER_CHIP = "AI 답변";
// 원문: SubstanceCheckView.swift:139
const AI_ANSWER_SUFFIX = " (AI 답변이며 진단·처방이 아닙니다. 복용 전 의료진·약사와 상담하세요.)";

export function isSubstanceVerdict(v: unknown): v is SubstanceVerdict {
  return typeof v === "string" && (VERDICTS as readonly string[]).includes(v);
}

export function verdictLabel(v: SubstanceVerdict): string {
  return content.verdict_labels[v];
}

interface SubstanceRow {
  aliases: string[];
  verdict: SubstanceVerdict;
  detail: string;
  chips: string[];
}

const TABLE: readonly SubstanceRow[] = content.substances.map((row) => {
  if (!isSubstanceVerdict(row.verdict)) {
    throw new Error(`content.json substances: 알 수 없는 verdict "${row.verdict}"`);
  }
  return { ...row, verdict: row.verdict };
});

/**
 * Swift `localizedCaseInsensitiveContains`와 같게: 대소문자 무시 포함 여부.
 * 한글 자모가 분리된(NFD) 입력도 같은 글자로 보도록 NFC로 맞춘다. 빈 문자열은 포함으로 보지 않는다.
 */
export function localizedCaseInsensitiveContains(text: string, needle: string): boolean {
  if (needle.length === 0) return false;
  return fold(text).includes(fold(needle));
}

function fold(s: string): string {
  return s.normalize("NFC").toLowerCase();
}

/** 입력어 다듬기 — Swift `.whitespaces`(공백·탭)만 앞뒤에서 지운다. 빈 문자열이면 조회하지 않는다. */
export function normalizeSubstanceQuery(query: string): string {
  return query.replace(/^[\p{Zs}\t]+|[\p{Zs}\t]+$/gu, "");
}

/** 큐레이션 표만 본다(OnmomEngine.swift:81-118). 표 순서대로 첫 일치, 없으면 "정보 부족". */
export function lookupSubstance(query: string): SubstanceResult {
  const q = normalizeSubstanceQuery(query);
  const hit = TABLE.find((row) => row.aliases.some((alias) => localizedCaseInsensitiveContains(q, alias)));
  if (hit) {
    return { query: q, verdict: hit.verdict, detail: hit.detail, evidenceChips: [...hit.chips], source: "table" };
  }
  const unknown = content.substance_unknown;
  return { query: q, verdict: "unknown", detail: unknown.detail, evidenceChips: [...unknown.chips], source: "table" };
}

/**
 * 표 우선, 미등재(unknown)만 LLM (SubstanceCheckView.swift:95-104).
 * LLM이 없거나 실패·비정상 응답이면 표의 "정보 부족" 결과를 그대로 돌려준다.
 * 이전 조회 취소(느린 응답이 새 결과를 덮지 않게)는 화면이 맡는다.
 */
export async function resolveSubstance(query: string, deps: SubstanceDeps = {}): Promise<SubstanceResult> {
  const fromTable = lookupSubstance(query);
  if (fromTable.verdict !== "unknown" || !deps.llmLookup) return fromTable;

  let answer: unknown = null;
  try {
    answer = await deps.llmLookup(fromTable.query);
  } catch {
    answer = null;
  }
  const valid = toSubstanceAnswer(answer);
  if (!valid) return fromTable;

  return {
    query: fromTable.query,
    verdict: valid.verdict,
    detail: valid.detail + AI_ANSWER_SUFFIX,
    evidenceChips: [...valid.sources.map((s) => `src:${s}`), AI_ANSWER_CHIP],
    source: "llm",
  };
}

/**
 * LLM text에서 답변 JSON을 꺼낸다(SubstanceCheckView.swift:128-134).
 * 코드펜스가 붙어도 첫 "{"부터 마지막 "}"까지만 읽는다. 형식이 틀리거나 verdict가 4값 밖이면 null.
 */
export function parseSubstanceAnswer(text: string): LlmSubstanceAnswer | null {
  let s = text.trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end !== -1) {
    if (end < start) return null;
    s = s.slice(start, end + 1);
  }
  try {
    return toSubstanceAnswer(JSON.parse(s));
  } catch {
    return null;
  }
}

/**
 * 약물 조회 답의 최대 토큰 — 원문: SubstanceCheckView.swift:121 `LLMClient(maxTokens: 512)`.
 * 단일 출처: src/api/llm.ts `LLM_PRESET_DEFAULTS.substance`도 이 값을 쓴다.
 */
export const SUBSTANCE_LLM_MAX_TOKENS = 512;

/**
 * 약물 조회 요청 본문 — SubstanceCheckView.swift:118-126과 같은 값(system 없음).
 * 타임아웃(25초, :125)은 전송 계층 값이라 여기 두지 않는다 — src/api/llm.ts `LLM_PRESET_DEFAULTS.substance`.
 */
export function buildSubstanceLlmRequest(input: {
  query: string;
  isBreastfeeding: boolean;
  dayCount: number;
}): SubstanceLlmRequest {
  const context = input.isBreastfeeding
    ? `모유수유 중, 산후 ${input.dayCount}일차` // 원문: SubstanceCheckView.swift:119
    : `모유수유 안 함, 산후 ${input.dayCount}일차`; // 원문: SubstanceCheckView.swift:120
  return {
    messages: [{ role: "user", content: input.query }],
    preset: "substance",
    context,
    maxTokens: SUBSTANCE_LLM_MAX_TOKENS,
  };
}

/** 화면 상단 안내 — 수유 여부에 따라 달라진다(SubstanceCheckView.swift:18-27). */
export function substanceHeader(isBreastfeeding: boolean): { lead: string; note: string | null } {
  return isBreastfeeding
    ? {
        lead: "수유 중 약·음식을 입력하면 안전 분류를 확인해요.", // 원문: SubstanceCheckView.swift:19
        note: null,
      }
    : {
        lead: "약·음식을 입력하면 산후 안전 분류를 확인해요.", // 원문: SubstanceCheckView.swift:20
        // 원문: SubstanceCheckView.swift:24
        note: "프로필이 '모유수유 안 함'으로 되어 있어요. 수유 중이라면 프로필 편집에서 바꿔주세요 — 분류 기준이 달라져요.",
      };
}

function toSubstanceAnswer(data: unknown): LlmSubstanceAnswer | null {
  if (typeof data !== "object" || data === null) return null;
  const { verdict, detail, sources } = data as Record<string, unknown>;
  if (!isSubstanceVerdict(verdict) || typeof detail !== "string") return null;
  if (!Array.isArray(sources) || !sources.every((s) => typeof s === "string")) return null;
  return { verdict, detail, sources: [...sources] };
}
