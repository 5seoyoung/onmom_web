// 약물·음식 체크 화면의 순수 로직 — SubstanceCheckView.swift.
// 판정은 rules/substance의 출처 있는 표가 한다. AI는 쓰지 않는다(2026-11-06 대표 결정 — 표에 없는 항목에 AI가 판정을 매기지 않게, 사전 검토 H5·D-10):
// 표에 없는 항목은 표의 "정보 부족"으로 끝난다. Edge Function chat도 preset "substance"를 거절한다. 여기서는 "어떤 배지·칩으로 그릴지"만 정한다.

import { lookupSubstance, normalizeSubstanceQuery, verdictLabel, type SubstanceResult, type SubstanceVerdict } from "@/rules/substance";

/** 화면 문구 중 페이지(src/app/(app)/substance/page.tsx — 문서 제목)와 화면이 함께 쓰는 것 */
export const SUBSTANCE_TEXT = {
  title: "약물·음식 체크", // 원문: SubstanceCheckView.swift:56
} as const;

/** [확인하기] 활성 조건 — 공백·탭만 있으면 조회하지 않는다(SubstanceCheckView.swift:41, :91-92). */
export function canCheckSubstance(query: string): boolean {
  return normalizeSubstanceQuery(query).length > 0;
}

/**
 * 판정 배지 색 — safe 정상 · caution 관찰 · avoid 이상 · unknown textSecondary, 배경은 같은 색 15%
 * (SubstanceCheckView.swift:60-67, :75-78). 글자(verdict_labels)가 항상 함께 나와 색만으로 전하지 않는다.
 * 글자는 같은 계열의 글자 전용 토큰(state-*-text) — 원색 글자는 15% 배경 위에서 AA에 못 미친다(docs/ACCESSIBILITY.md §4·§6).
 */
export const VERDICT_BADGE_CLASS: Record<SubstanceVerdict, string> = {
  safe: "bg-state-normal/15 text-state-normal-text",
  caution: "bg-state-watch/15 text-state-watch-text",
  avoid: "bg-state-alert/15 text-state-alert-text",
  unknown: "bg-text-secondary/15 text-text-secondary",
};

export function verdictBadge(verdict: SubstanceVerdict): { label: string; className: string } {
  return { label: verdictLabel(verdict), className: VERDICT_BADGE_CLASS[verdict] };
}

/** 결과 칩(공용 근거·출처 칩의 토큰) — 빈 글자 칩은 그리지 않는다. */
export function substanceResultChips(result: Pick<SubstanceResult, "evidenceChips">): string[] {
  return result.evidenceChips.filter((token) => token.trim() !== "");
}

/** 한 번의 조회 — 표만 본다(표에 없으면 "정보 부족"). 서버에 아무것도 보내지 않는다. */
export function checkSubstance(query: string): SubstanceResult {
  return lookupSubstance(query);
}
