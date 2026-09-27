// 약물·음식 체크 화면의 순수 로직 — SubstanceCheckView.swift.
// 판정은 rules/substance가 한다(표 먼저, 표에 없을 때만 LLM — 검수 #1). 여기서는
// "LLM을 붙일지", "어떤 결과를 화면에 둘지(늦게 온 이전 조회 버리기)", "배지 모양"만 정한다.

import type { LLMOptions, LLMRequest, LLMResult } from "@/api/llm";
import {
  buildSubstanceLlmRequest,
  normalizeSubstanceQuery,
  parseSubstanceAnswer,
  resolveSubstance,
  verdictLabel,
  type LlmSubstanceAnswer,
  type SubstanceDeps,
  type SubstanceResult,
  type SubstanceVerdict,
} from "@/rules/substance";

/** src/api/llm.ts `llmComplete`와 같은 모양 — 테스트에서 가짜로 바꿔 넣는다. */
export type LlmCompleteFn = (req: LLMRequest, opts?: LLMOptions) => Promise<LLMResult>;

/** [확인하기] 활성 조건 — 공백·탭만 있으면 조회하지 않는다(SubstanceCheckView.swift:41, :91-92). */
export function canCheckSubstance(query: string): boolean {
  return normalizeSubstanceQuery(query).length > 0;
}

/**
 * 판정 배지 색 — safe 정상 · caution 관찰 · avoid 이상 · unknown textSecondary, 배경은 같은 색 15%
 * (SubstanceCheckView.swift:60-67, :75-78). 글자(verdict_labels)가 항상 함께 나와 색만으로 전하지 않는다.
 */
export const VERDICT_BADGE_CLASS: Record<SubstanceVerdict, string> = {
  safe: "bg-state-normal/15 text-state-normal",
  caution: "bg-state-watch/15 text-state-watch",
  avoid: "bg-state-alert/15 text-state-alert",
  unknown: "bg-text-secondary/15 text-text-secondary",
};

export function verdictBadge(verdict: SubstanceVerdict): { label: string; className: string } {
  return { label: verdictLabel(verdict), className: VERDICT_BADGE_CLASS[verdict] };
}

/**
 * LLM 조회 함수(SubstanceCheckView.swift:117-141). 요청 본문은 rules의 buildSubstanceLlmRequest,
 * 답 해석은 parseSubstanceAnswer — 실패·빈 응답·형식 오류는 전부 null(→ 표의 "정보 부족" 유지).
 */
export function makeSubstanceLlmLookup(input: {
  complete: LlmCompleteFn;
  isBreastfeeding: boolean;
  dayCount: number;
  signal?: AbortSignal;
}): (query: string) => Promise<LlmSubstanceAnswer | null> {
  return async (query) => {
    const request = buildSubstanceLlmRequest({
      query,
      isBreastfeeding: input.isBreastfeeding,
      dayCount: input.dayCount,
    });
    const res = await input.complete(request, { signal: input.signal });
    return res.ok ? parseSubstanceAnswer(res.text) : null;
  };
}

/** LLM 서버가 설정돼 있을 때만 llmLookup을 붙인다. 아니면 표만 본다(원칙 2·3). */
export function substanceDeps(input: {
  llmConfigured: boolean;
  complete: LlmCompleteFn;
  isBreastfeeding: boolean;
  dayCount: number;
  signal?: AbortSignal;
}): SubstanceDeps {
  if (!input.llmConfigured) return {};
  return { llmLookup: makeSubstanceLlmLookup(input) };
}

/** 한 번의 조회 — 표 우선, 미등재만 LLM. */
export function checkSubstance(query: string, deps: SubstanceDeps): Promise<SubstanceResult> {
  return resolveSubstance(query, deps);
}

/**
 * 마지막 조회만 화면에 둔다 — 느린 이전 응답이 새 결과를 덮지 않게(SubstanceCheckView.swift:94-95, :103).
 * begin()이 준 번호가 isCurrent()일 때만 결과를 반영한다. cancel()은 진행 중인 조회를 모두 무효로 만든다(화면을 떠날 때).
 */
export function createLatestOnly(): {
  begin(): number;
  isCurrent(token: number): boolean;
  cancel(): void;
} {
  let current = 0;
  return {
    begin: () => ++current,
    isCurrent: (token) => token === current,
    cancel: () => {
      current++;
    },
  };
}
