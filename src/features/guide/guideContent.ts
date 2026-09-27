// 회복 가이드 화면의 보기 모델 — iOS GuideView.swift.
// 위험 신호 5줄·카드 8장은 content.json(guide_red_flags · guide_cards)에서 읽는다(재입력 금지).
// 화면 문구 중 content.json에 없는 것만 Swift 원문을 글자 그대로 옮긴다.
import content from "@/content";
import { SOURCE_PREFIX } from "@/components/ui/evidence";

export const GUIDE_TEXT = {
  title: "회복 가이드", // 원문: GuideView.swift:97
  subtitle: "2023 임산부수첩·ACOG 지침 기반 산후 회복 안내", // 원문: GuideView.swift:99
  redFlagTitle: "즉시 병원에 가야 할 신호", // 원문: GuideView.swift:112
  redFlagSource: "산욕기 이상소견 · 임산부수첩 2023", // 원문: GuideView.swift:122
  // 원문: GuideView.swift:158 (검수 #29 — "…본 안내는 정보 제공이며 진단이 아닙니다." 그대로)
  footnote:
    "출처: 2023 임산부수첩(보건복지부·인구보건복지협회), ACOG Committee Opinion 736. 본 안내는 정보 제공이며 진단이 아닙니다.",
} as const;

export interface GuideCardSource {
  icon_sf: string;
  title: string;
  points: readonly string[];
  source: string;
}

export interface GuideCardView {
  key: string;
  icon: string;
  title: string;
  points: readonly string[];
  /** 출처 칩 토큰("src:…"). 출처가 비어 있으면 null — 칩을 지어내지 않는다(원칙 4). */
  sourceToken: string | null;
}

/** 출처 글자를 출처 칩 토큰으로. 이미 "src:"가 붙어 있으면 그대로, 비었으면 null. */
export function sourceToken(source: string | null | undefined): string | null {
  const text = source?.trim() ?? "";
  if (text === "") return null;
  return text.startsWith(SOURCE_PREFIX) ? text : `${SOURCE_PREFIX}${text}`;
}

/** 즉시 내원 신호 — 표 순서 그대로(GuideView.swift:16-22). */
export function guideRedFlags(flags: readonly string[] = content.guide_red_flags): readonly string[] {
  return flags.filter((flag) => flag.trim() !== "");
}

/** 가이드 카드 — 표 순서 그대로(GuideView.swift:24-86). */
export function guideCardViews(cards: readonly GuideCardSource[] = content.guide_cards): GuideCardView[] {
  return cards.map((card, index) => ({
    key: `${index}-${card.title}`,
    icon: card.icon_sf,
    title: card.title,
    points: card.points.filter((point) => point.trim() !== ""),
    sourceToken: sourceToken(card.source),
  }));
}

// 전화번호가 "1577-" / "0199"처럼 하이픈에서 줄바뀌지 않게 번호만 따로 떼어 준다(화면에서 한 덩어리로 묶는다).
const PHONE_RE = /\d{2,4}-\d{3,4}(?:-\d{4})?/g;

export interface TextSegment {
  text: string;
  phone: boolean;
}

export function splitPhoneNumbers(text: string): TextSegment[] {
  const out: TextSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(PHONE_RE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at), phone: false });
    out.push({ text: m[0], phone: true });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), phone: false });
  return out;
}
