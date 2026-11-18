// 회복 가이드 화면의 보기 모델 — iOS GuideView.swift.
// 위험 신호(15줄 — rules-1.3)·카드 8장은 content.json(guide_red_flags · guide_cards)에서 읽는다(재입력 금지).
// 웹 신규 문구 — CPO 확인 필요 (content.json guide_cards "산후 정신건강"의 넷째 요점 — 임상 사전 검토 B3: 109·1577-0199·119. 출처에 CDC Hear Her 2024 더함)
// 웹 신규 문구 — CPO 확인 필요 (2026-11-13 임상 자체 검토 G1~G9: guide_red_flags를 기록 탭 신호와 같은 15줄로, guide_cards의 오로 양 기준·
// 상처 감염·제왕절개 상처 관리·골반저근 운동·젖몸살 열(출처 없는 "4~16시간" 삭제)·수유 열량(출처 없는 숫자 삭제)·우울감 수치(질병관리청)·
// 산후 혈압·혈당 안내 문장과 카드 출처. 아래 redFlagSource·footnote도 함께 바꿈)
// 화면 문구 중 content.json에 없는 것만 Swift 원문을 글자 그대로 옮긴다.
import content from "@/content";
import { SOURCE_PREFIX } from "@/components/ui/evidence";

export const GUIDE_TEXT = {
  title: "회복 가이드", // 원문: GuideView.swift:97
  subtitle: "2023 임산부수첩·ACOG 지침 기반 산후 회복 안내", // 원문: GuideView.swift:99
  redFlagTitle: "즉시 병원에 가야 할 신호", // 원문: GuideView.swift:112
  // 웹 신규 문구 — CPO 확인 필요 (iOS 원문 "산욕기 이상소견 · 임산부수첩 2023"(GuideView.swift:122)에 rules-1.3 신호의 출처를 더함)
  redFlagSource: "산욕기 이상소견 · 임산부수첩 2023 · CDC Hear Her 2024 · AWHONN 2018 · NICE NG194",
  // 웹 신규 문구 — CPO 확인 필요 (iOS 원문(GuideView.swift:158, 검수 #29)의 출처 목록을 카드 출처에 맞게 넓힘. "…본 안내는 정보 제공이며 진단이 아닙니다."는 그대로)
  footnote:
    "출처: 2023 임산부수첩(보건복지부·인구보건복지협회), ACOG, CDC Hear Her, AWHONN, NICE(영국), 질병관리청, 식약처. 본 안내는 정보 제공이며 진단이 아닙니다.",
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

// ─── 주제별 보기(2026-11-15 산부인과 전문의 화면 검토) ───
// 카드 8장을 한 줄로 길게 내리면 의료인이 아닌 사람이 읽기 어렵다 → 위에 주제 목록(큰 아이콘 타일), 고른 주제의 카드 하나만 아래에.
// 고른 주제는 주소의 해시(#lochia)에 남겨 링크·다른 화면에서 [뒤로] 왔을 때 같은 주제가 열린다(GuideTopics.tsx).

/** 화면 낭독용 이름 — 주제 목록(tablist)의 이름 */
export const GUIDE_TOPIC_TEXT = {
  // 웹 신규 문구 — CPO 확인 필요 (주제 목록의 화면 낭독용 이름. 화면에는 보이지 않는다)
  topicsLabel: "회복 가이드 주제",
} as const;

/**
 * 카드 제목 → 주소 해시. 글자는 화면에 나오지 않는다(주소에만). content.json 제목이 바뀌면 guide.test가 알린다 —
 * 매핑에 없는 제목은 "topic-{순번}"으로 대신해 주제가 사라지지는 않는다.
 */
const TOPIC_SLUGS: Readonly<Record<string, string>> = {
  "산후 회복 단계 (산욕기)": "stages",
  "오로(분비물) 변화": "lochia",
  "회음부·절개부 관리": "wound-care",
  "산후 운동 복귀": "exercise",
  "수유·유방 관리": "breastfeeding",
  "산후 영양": "nutrition",
  "산후 정신건강": "mental-health",
  "산후 검진·피임": "checkup",
};

/** 오로 주제의 해시 — 이 주제에만 변화 그림(LochiaTimeline)이 붙는다 */
export const LOCHIA_TOPIC_SLUG = "lochia";

export interface GuideTopic {
  /** 주소 해시(#없이) — 주제마다 다르다 */
  slug: string;
  card: GuideCardView;
}

/** 주제 목록 — 카드 순서 그대로. 해시가 겹치거나 매핑에 없으면 "topic-{순번}". */
export function guideTopics(cards: readonly GuideCardView[] = guideCardViews()): GuideTopic[] {
  const used = new Set<string>();
  return cards.map((card, index) => {
    const mapped = Object.prototype.hasOwnProperty.call(TOPIC_SLUGS, card.title) ? TOPIC_SLUGS[card.title] : null;
    const slug = mapped !== null && !used.has(mapped) ? mapped : `topic-${index + 1}`;
    used.add(slug);
    return { slug, card };
  });
}

/** 주소 해시("#lochia" · "lochia" · "") → 고를 주제의 순번. 비었거나 모르는 해시면 첫 주제(0). */
export function topicIndexFromHash(hash: string, topics: readonly GuideTopic[]): number {
  let slug = hash.startsWith("#") ? hash.slice(1) : hash;
  try {
    slug = decodeURIComponent(slug);
  } catch {
    // 깨진 %-표기는 그대로 비교한다(맞는 주제가 없으면 첫 주제)
  }
  const index = topics.findIndex((topic) => topic.slug === slug);
  return index === -1 ? 0 : index;
}

/**
 * 주제 탭의 화살표 키 — 가로 탭 목록(WAI-ARIA APG Tabs): ←·→는 앞뒤 주제(끝에서 처음으로 돌아감), Home·End는 처음·끝.
 * ↑·↓는 쓰지 않는다 — 화면 스크롤 그대로. 다른 키는 null(그대로 둔다).
 */
export function nextTopicIndex(key: string, index: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowRight":
      return (index + 1) % count;
    case "ArrowLeft":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/** 주제 탭·패널의 id — 해시와 같은 id를 쓰지 않는다(해시를 바꿀 때 브라우저가 그 요소로 스크롤하지 않게). */
export const topicTabId = (slug: string) => `guide-tab-${slug}`;
export const topicPanelId = (slug: string) => `guide-panel-${slug}`;

/** 오로 변화 그림의 색 표시(장식 — 뜻은 글자가 전한다) */
export type LochiaPhaseMark = "blood" | "less" | "yellow";

/**
 * 오로 변화 그림(LochiaTimeline) — content.json guide_cards "오로(분비물) 변화"의 첫째·둘째 요점을 짧게 옮긴 것뿐이다.
 * 새 의학 정보를 더하지 않는다: 둘째 단계(3~4일 후)는 원문에 색이 없어 색을 칠하지 않고 "양이 준다"만 그린다.
 * 각 글자의 근거 문구가 원문에 그대로 있는지는 guide.test가 확인한다. 요점 원문은 그림 아래에 그대로 나온다.
 */
export const LOCHIA_TIMELINE = {
  // 웹 신규 문구 — CPO 확인 필요 (2026-11-15 산부인과 전문의 화면 검토: 오로 카드의 그림 제목)
  caption: "한눈에 보는 오로 변화",
  // 웹 신규 문구 — CPO 확인 필요 (오로 카드 첫째 요점 "처음 며칠은 혈액 같은 오로가 나오다가 3~4일 후 양이 줄고, 10일 후부터 노란색으로 바뀌어 3~4주간 이어져요."를 세 단계로)
  phases: [
    { when: "처음 며칠", what: "혈액 같은 오로", mark: "blood" },
    { when: "3~4일 후", what: "양이 줄어요", mark: "less" },
    { when: "10일 후부터", what: "노란색으로 바뀌어 3~4주간 이어져요", mark: "yellow" },
  ],
  // 웹 신규 문구 — CPO 확인 필요 (오로 카드 둘째 요점 "10일이 지나도 선홍색이 계속되거나, 양이 다시 늘거나, 악취가 나면 진료가 필요해요."를 짧게)
  warningTitle: "10일이 지나도 이러면 진료가 필요해요",
  // 웹 신규 문구 — CPO 확인 필요 (위 둘째 요점의 세 경우)
  warningSigns: ["선홍색이 계속돼요", "양이 다시 늘어요", "악취가 나요"],
} as const;

// 문장 속 전화번호 — 화면이 한 덩어리로 묶어 tel: 링크를 건다(PhoneLinks.tsx). 글자는 그대로.
// - 하이픈이 든 번호(1577-0199 · 02-2276-2276): 자릿수 형태로 찾는다.
// - 하이픈 없는 짧은 번호는 안전 연계 번호 목록(web/07 §5 — 자살예방상담 109 · 응급 119 · 고용노동부 1350, 2026-11-04 위기 안내의 경찰 112)만 —
//   앞뒤에 숫자·하이픈이 없을 때만 맞아, "10~20%"·"1190"·"400~500kcal" 같은 수치는 번호로 보지 않는다. 그 밖의 숫자 나열은 전화번호로 지어내지 않는다.
export const SAFETY_SHORT_NUMBERS: readonly string[] = ["109", "112", "119", "1350"];
const PHONE_RE = new RegExp(`\\d{2,4}-\\d{3,4}(?:-\\d{4})?|(?<![\\d-])(?:${SAFETY_SHORT_NUMBERS.join("|")})(?![\\d-])`, "g");

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

/** 전화 링크의 접근성 이름 — 원문 패턴: NearbyClinicsView.swift:128 `"\(clinic.name)에 전화 걸기"` (이름 자리에 번호) */
export const phoneCallLabel = (number: string) => `${number}에 전화 걸기`;
