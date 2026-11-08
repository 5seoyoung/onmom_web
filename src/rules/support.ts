// 지원사업 추천 — iOS `SupportProgramView.swift`(심리·사회 체크리스트 6영역·16문항 → 영역별 해결책)를 옮긴 것.
//
// 체크한 문항이 속한 영역의 전국 공통 정부·지자체 사업을 결정론적으로 보여준다(표 순서 그대로).
// 모든 산모에게는 체크와 무관하게 '정부24 행복출산 원스톱'을 안내한다.
// 링크는 공식 URL이 확인된 항목에만 있다(content.json의 url) — 검색 결과 링크로 대체하지 않는다.

import content from "@/content";

export interface SupportSolution {
  name: string;
  note: string;
  /** 공식 페이지/전화 링크. null이면 링크 없이 안내만 표시한다. */
  url: string | null;
}

export interface SupportQuestion {
  id: number;
  text: string;
}

export interface SupportDomain {
  id: number;
  title: string;
  questions: SupportQuestion[];
  solutions: SupportSolution[];
}

/** 모든 산모 공통 안내(체크 답과 무관) */
export const SUPPORT_UNIVERSAL: SupportSolution = content.support_universal;
export const SUPPORT_DOMAINS: readonly SupportDomain[] = content.support_domains;

/** 화면 문구 — Swift 원문을 content.json ui.support로 옮겼다(원문 위치는 각 줄) */
export const SUPPORT_TEXT = {
  title: content.ui.support.title, // 원문: SupportProgramView.swift:152
  intro: content.ui.support.intro, // 원문: SupportProgramView.swift:110
  universalTitle: content.ui.support.universal_title, // 원문: SupportProgramView.swift:116
  recommendButton: content.ui.support.recommend_button, // 원문: SupportProgramView.swift:128
  nothingChecked: content.ui.support.nothing_checked, // 원문: SupportProgramView.swift:134
  footer: content.ui.support.footer, // 원문: SupportProgramView.swift:143
} as const;

/** [추천 받기]는 한 문항 이상 체크했을 때만 누를 수 있다(SupportProgramView.swift:102). */
export function canRecommendSupport(checked: ReadonlySet<number>): boolean {
  return checked.size > 0;
}

/** 문항 체크를 켜고 끈다 — 원래 Set은 건드리지 않고 새 Set을 돌려준다. */
export function toggleSupportQuestion(checked: ReadonlySet<number>, questionId: number): Set<number> {
  const next = new Set(checked);
  if (next.has(questionId)) next.delete(questionId);
  else next.add(questionId);
  return next;
}

/**
 * 추천 결과 — 체크한 문항이 하나라도 있는 영역을 표 순서대로(SupportProgramView.swift:103-105).
 * 추천을 받은 뒤 체크를 모두 풀면 빈 배열이 되고, 화면은 SUPPORT_TEXT.nothingChecked를 보여준다.
 */
export function checkedSupportDomains(checked: ReadonlySet<number>): SupportDomain[] {
  return SUPPORT_DOMAINS.filter((domain) => domain.questions.some((q) => checked.has(q.id)));
}
