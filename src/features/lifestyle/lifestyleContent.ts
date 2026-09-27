// 생활 권고 화면의 보기 모델 — iOS LifestyleView.swift + OnmomEngine.lifestyleTips()(OnmomEngine.swift:59-80).
// 항목 5개는 content.json(lifestyle_tips)에서 읽는다(재입력 금지). 단계별로 나누지 않는다(Swift 주석: 임상 근거 필요).
import content from "@/content";

export const LIFESTYLE_TEXT = {
  title: "생활 권고", // 원문: LifestyleView.swift:48
} as const;

export interface LifestyleTipSource {
  icon_sf: string;
  category: string;
  title: string;
  detail: string;
  chips: readonly string[];
}

export interface LifestyleTipView {
  key: string;
  icon: string;
  category: string;
  title: string;
  detail: string;
  /** 근거·출처 칩 토큰 그대로("src:" 접두 = 출처 칩). 빈 토큰은 뺀다. */
  chips: readonly string[];
}

/** 생활 권고 카드 — 표 순서 그대로. */
export function lifestyleTipViews(tips: readonly LifestyleTipSource[] = content.lifestyle_tips): LifestyleTipView[] {
  return tips.map((tip, index) => ({
    key: `${index}-${tip.title}`,
    icon: tip.icon_sf,
    category: tip.category,
    title: tip.title,
    detail: tip.detail,
    chips: tip.chips.filter((chip) => chip.trim() !== ""),
  }));
}
