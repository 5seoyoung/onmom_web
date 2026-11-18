// 회복 가이드 — 보기 모델과 서버 렌더 마크업(문구가 Swift·content.json 그대로, 순서, 주제 탭, 출처 보기).
// 누르기·키보드·해시는 guideTopics.test.ts(jsdom).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";
import content from "@/content";
import { GuideScreen } from "./GuideScreen";
import { splitEvidenceTokens } from "@/components/ui";
import {
  GUIDE_TEXT,
  GUIDE_TOPIC_TEXT,
  LOCHIA_TIMELINE,
  guideCardViews,
  guideRedFlags,
  guideTopics,
  nextTopicIndex,
  phoneCallLabel,
  SAFETY_SHORT_NUMBERS,
  sourceToken,
  splitPhoneNumbers,
  topicIndexFromHash,
  topicPanelId,
  topicTabId,
} from "./guideContent";
import { PhoneLinks } from "./PhoneLinks";
import { SF_ICON_FALLBACK, hasSfIcon, sfIcon } from "./sfIcons";

// next.config의 trailingSlash: true를 흉내 낸다(빌드 때 주입되는 값 — 없으면 Link가 끝 슬래시를 뗀다).
vi.stubEnv("__NEXT_TRAILING_SLASH", "true");
afterAll(() => {
  vi.unstubAllEnvs();
});

const html = renderToStaticMarkup(h(GuideScreen));
const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
const indexOf = (text: string) => {
  const i = html.indexOf(text);
  expect(i, text).toBeGreaterThanOrEqual(0);
  return i;
};
/** 전화번호 하나가 그려지는 모양 — tel: 링크(숫자만) · "{번호}에 전화 걸기" · 한 줄로 묶임 · 글자는 그대로 */
const phoneAnchor = (number: string, color = "text-primary-text") =>
  `<a href="tel:${number.replace(/\D/g, "")}" aria-label="${escapeHtml(phoneCallLabel(number))}" class="whitespace-nowrap rounded-xs underline underline-offset-2 ${color}">${escapeHtml(number)}</a>`;
/** 글자 그대로의 문구 찾기(React가 이스케이프한 형태로). 전화번호는 tel: 링크 안에 들어간다. */
const textAt = (text: string, color?: string) =>
  indexOf(
    splitPhoneNumbers(text)
      .map((seg) => (seg.phone ? phoneAnchor(seg.text, color) : escapeHtml(seg.text)))
      .join(""),
  );
/** 위험 신호 카드(어두운 배경)의 줄 — 전화번호 링크가 흰 글자 */
const redFlagAt = (text: string) => textAt(text, "text-white");

describe("guideContent (GuideView.swift)", () => {
  it("Swift 원문 문구 — 위험 신호 출처·각주는 2026-11-13 임상 자체 검토에서 출처를 넓힘", () => {
    expect(GUIDE_TEXT).toEqual({
      title: "회복 가이드",
      subtitle: "2023 임산부수첩·ACOG 지침 기반 산후 회복 안내",
      redFlagTitle: "즉시 병원에 가야 할 신호",
      redFlagSource: "산욕기 이상소견 · 임산부수첩 2023 · CDC Hear Her 2024 · AWHONN 2018 · NICE NG194",
      footnote:
        "출처: 2023 임산부수첩(보건복지부·인구보건복지협회), ACOG, CDC Hear Her, AWHONN, NICE(영국), 질병관리청, 식약처. 본 안내는 정보 제공이며 진단이 아닙니다.",
    });
  });

  it("즉시 내원 신호 15줄 — 기록 탭 rules-1.3 신호와 같은 목록, content.json 순서 그대로(임상 자체 검토 G1)", () => {
    expect(guideRedFlags()).toEqual(content.guide_red_flags);
    expect(guideRedFlags()).toHaveLength(15);
    expect(guideRedFlags()[0]).toBe("다량의 질출혈(1시간 안에 패드 1장 이상이 흠뻑 젖거나 달걀만 한 핏덩이)");
    expect(guideRedFlags().at(-1)).toBe("나 자신이나 아기를 해칠 것 같은 생각(109·1577-0199, 위급하면 119)");
    expect(guideRedFlags(["a", " ", ""])).toEqual(["a"]);
  });

  it("카드 8장 — 순서·요점·출처 칩 토큰", () => {
    const cards = guideCardViews();
    expect(cards.map((c) => c.title)).toEqual([
      "산후 회복 단계 (산욕기)",
      "오로(분비물) 변화",
      "회음부·절개부 관리",
      "산후 운동 복귀",
      "수유·유방 관리",
      "산후 영양",
      "산후 정신건강",
      "산후 검진·피임",
    ]);
    expect(cards.map((c) => c.sourceToken)).toEqual([
      "src:임산부수첩 2023 · Merck Manual",
      "src:임산부수첩 2023 · AWHONN 2018 · NICE NG194",
      "src:임산부수첩 2023 · NICE NG194 · NICE NG192",
      "src:ACOG FAQ131 · 임산부수첩 2023 · NICE NG210",
      "src:임산부수첩 2023 · NICE NG194 · CDC Hear Her 2024",
      "src:임산부수첩 2023",
      "src:임산부수첩 2023(EPDS) · 질병관리청 · NICE NG194 · CDC Hear Her 2024",
      "src:임산부수첩 2023 · ACOG-736 · NICE NG133 · NICE NG3",
    ]);
    expect(cards.map((c) => c.points)).toEqual(content.guide_cards.map((c) => c.points));
    expect(new Set(cards.map((c) => c.key)).size).toBe(8);
  });

  it("출처가 비면 칩을 지어내지 않는다", () => {
    expect(sourceToken("")).toBeNull();
    expect(sourceToken("  ")).toBeNull();
    expect(sourceToken(null)).toBeNull();
    expect(sourceToken("src:ACOG-736")).toBe("src:ACOG-736");
    expect(guideCardViews([{ icon_sf: "x", title: "t", points: ["p", ""], source: "" }])[0]).toMatchObject({
      points: ["p"],
      sourceToken: null,
    });
  });
});

describe("주제별 보기 — 해시·키보드·오로 그림 문구(2026-11-15 산부인과 전문의 화면 검토)", () => {
  const topics = guideTopics();

  it("카드 8장 = 주제 8개, 순서 그대로 · 해시는 영문 짧은 이름(content.json 제목이 바뀌면 여기서 알린다)", () => {
    expect(topics.map((t) => t.card)).toEqual(guideCardViews());
    expect(topics.map((t) => t.slug)).toEqual(["stages", "lochia", "wound-care", "exercise", "breastfeeding", "nutrition", "mental-health", "checkup"]);
  });

  it("매핑에 없는 제목·겹치는 해시는 topic-{순번} — 주제가 사라지지 않는다", () => {
    const [a, b] = guideCardViews();
    const views = [{ ...a, title: "새 제목" }, b, { ...b, key: "dup" }];
    expect(guideTopics(views).map((t) => t.slug)).toEqual(["topic-1", "lochia", "topic-3"]);
    expect(guideTopics([{ ...a, title: "toString" }]).map((t) => t.slug)).toEqual(["topic-1"]);
  });

  it("해시 → 주제 순번: '#' 있든 없든, %-표기 풀어서, 모르면·깨졌으면 첫 주제", () => {
    expect(topicIndexFromHash("#lochia", topics)).toBe(1);
    expect(topicIndexFromHash("checkup", topics)).toBe(7);
    expect(topicIndexFromHash("#mental%2Dhealth", topics)).toBe(6);
    for (const hash of ["", "#", "#nope", "#%E0%A4%A", "#Lochia"]) expect(topicIndexFromHash(hash, topics), hash).toBe(0);
  });

  it("탭 키: →·← 돌아감, Home·End, 나머지(↑·↓ 포함)는 null", () => {
    expect(nextTopicIndex("ArrowRight", 0, 8)).toBe(1);
    expect(nextTopicIndex("ArrowRight", 7, 8)).toBe(0);
    expect(nextTopicIndex("ArrowLeft", 0, 8)).toBe(7);
    expect(nextTopicIndex("Home", 5, 8)).toBe(0);
    expect(nextTopicIndex("End", 2, 8)).toBe(7);
    for (const key of ["ArrowDown", "ArrowUp", "Tab", "Enter", " "]) expect(nextTopicIndex(key, 3, 8), key).toBeNull();
    expect(nextTopicIndex("ArrowRight", 0, 0)).toBeNull();
  });

  it("탭·패널 id는 해시와 다르다(해시를 바꿔도 그 요소로 튀지 않게)", () => {
    for (const t of topics) {
      expect(topicTabId(t.slug)).not.toBe(t.slug);
      expect(topicPanelId(t.slug)).not.toBe(t.slug);
    }
  });

  it("오로 그림의 글자는 오로 카드 요점(content.json)을 짧게 옮긴 것뿐 — 근거 문구가 원문에 그대로 있다", () => {
    const lochia = content.guide_cards.find((c) => c.title === "오로(분비물) 변화");
    expect(lochia).toBeDefined();
    const [course, warning] = lochia!.points;
    // 첫째 요점: 처음 며칠 혈액 같은 오로 → 3~4일 후 양이 줄고 → 10일 후부터 노란색으로 바뀌어 3~4주간
    expect(LOCHIA_TIMELINE.phases.map((p) => [p.when, p.what, p.mark])).toEqual([
      ["처음 며칠", "혈액 같은 오로", "blood"],
      ["3~4일 후", "양이 줄어요", "less"],
      ["10일 후부터", "노란색으로 바뀌어 3~4주간 이어져요", "yellow"],
    ]);
    for (const quote of ["처음 며칠", "혈액 같은 오로", "3~4일 후 양이 줄", "10일 후부터 노란색으로 바뀌어 3~4주간 이어져요"]) {
      expect(course, quote).toContain(quote);
    }
    // 둘째 요점: 10일이 지나도 선홍색이 계속되거나, 양이 다시 늘거나, 악취가 나면 진료가 필요해요
    expect(LOCHIA_TIMELINE.warningSigns).toEqual(["선홍색이 계속돼요", "양이 다시 늘어요", "악취가 나요"]);
    for (const quote of ["10일이 지나도", "선홍색이 계속", "양이 다시 늘", "악취가 나", "진료가 필요해요"]) expect(warning, quote).toContain(quote);
  });

  it("새 문구는 CPO 확인 표시가 있다", () => {
    const src = readFileSync(fileURLToPath(new URL("./guideContent.ts", import.meta.url)), "utf8");
    const block = (name: string) => src.slice(src.indexOf(`export const ${name}`), src.indexOf("} as const;", src.indexOf(`export const ${name}`)));
    expect(block("GUIDE_TOPIC_TEXT")).toMatch(/웹 신규 문구 — CPO 확인 필요[^\n]*\n\s*topicsLabel:/);
    for (const field of ["caption", "phases", "warningTitle", "warningSigns"]) {
      expect(block("LOCHIA_TIMELINE"), field).toMatch(new RegExp(`웹 신규 문구 — CPO 확인 필요[^\\n]*\\n\\s*${field}:`));
    }
    expect(GUIDE_TOPIC_TEXT.topicsLabel).toBe("회복 가이드 주제");
  });
});

describe("sfIcons", () => {
  it("content.json의 가이드·생활 권고 아이콘은 모두 매핑돼 있다", () => {
    const names = [...content.guide_cards.map((c) => c.icon_sf), ...content.lifestyle_tips.map((t) => t.icon_sf)];
    for (const name of names) expect(hasSfIcon(name), name).toBe(true);
  });

  it("모르는 이름은 중립 아이콘, 프로토타입 키는 매핑으로 보지 않는다", () => {
    expect(sfIcon("no.such.symbol")).toBe(SF_ICON_FALLBACK);
    expect(hasSfIcon("toString")).toBe(false);
    expect(sfIcon("drop.fill").filled).toBe(true);
  });
});

describe("GuideScreen 마크업", () => {
  const topics = guideTopics();
  /** <details>…</details> 밖 — 접어도 늘 보이는 마크업 */
  const always = html.replace(/<details[\s\S]*?<\/details>/g, "");

  it("순서: 제목 → 부제 → 주제 탭 8개 → 주제 카드 8장(패널) → 위험 신호 카드 → 각주", () => {
    const order = [
      indexOf(`>${escapeHtml(GUIDE_TEXT.title)}</h1>`),
      textAt(GUIDE_TEXT.subtitle),
      indexOf(`role="tablist" aria-label="${GUIDE_TOPIC_TEXT.topicsLabel}"`),
      ...topics.map((t) => indexOf(`id="${topicTabId(t.slug)}"`)),
      ...topics.map((t) => indexOf(`>${escapeHtml(t.card.title)}</h2>`)),
      textAt(GUIDE_TEXT.redFlagTitle),
      // 위험 신호 카드는 어두운 배경 — 전화번호 링크가 흰 글자다
      ...guideRedFlags().map(redFlagAt),
      textAt(GUIDE_TEXT.redFlagSource),
      textAt(GUIDE_TEXT.footnote),
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("주제 탭: 이름은 카드 제목, 정적 HTML은 첫 주제를 고름(roving tabindex), 탭 ↔ 패널이 서로 가리킨다", () => {
    const tabs = [...html.matchAll(/<button type="button" role="tab" id="([^"]+)" aria-selected="(true|false)" aria-controls="([^"]+)" tabindex="(-1|0)"[^>]*>([\s\S]*?)<\/button>/g)];
    expect(tabs.map((m) => m[1])).toEqual(topics.map((t) => topicTabId(t.slug)));
    expect(tabs.map((m) => m[2])).toEqual(["true", ...Array<string>(7).fill("false")]);
    expect(tabs.map((m) => m[3])).toEqual(topics.map((t) => topicPanelId(t.slug)));
    expect(tabs.map((m) => m[4])).toEqual(["0", ...Array<string>(7).fill("-1")]);
    // 보이는 이름 = 제목(아이콘은 장식)
    expect(tabs.map((m) => m[5].replace(/<span aria-hidden="true"[\s\S]*?<\/span>/, "").replace(/<[^>]+>/g, ""))).toEqual(topics.map((t) => t.card.title));
    for (const t of topics) {
      expect(html).toContain(`role="tabpanel" id="${topicPanelId(t.slug)}" aria-labelledby="${topicTabId(t.slug)}" tabindex="0"`);
    }
  });

  it("고른 주제 카드만 보이고 나머지는 hidden — 그래도 모든 요점은 정적 HTML에 글자 그대로", () => {
    const panels = [...html.matchAll(/role="tabpanel" id="([^"]+)"[^>]*?( hidden="")?>/g)];
    expect(panels.map((m) => m[1])).toEqual(topics.map((t) => topicPanelId(t.slug)));
    expect(panels.map((m) => m[2] !== undefined)).toEqual([false, ...Array<boolean>(7).fill(true)]);
    for (const point of content.guide_cards.flatMap((c) => c.points)) textAt(point);
  });

  it("주제 카드마다 큰 머리(아이콘 원 64 + 제목 20 bold) — 오로 주제에만 변화 그림", () => {
    expect(html.match(/<span aria-hidden="true" class="flex size-16 [^"]*">/g)).toHaveLength(8);
    expect(html.match(/<h2 class="min-w-0 text-xl font-bold text-text-primary">/g)).toHaveLength(8);
    expect(html.match(/<figure/g)).toHaveLength(1);
    const lochiaPanel = html.slice(html.indexOf(`id="${topicPanelId("lochia")}"`), html.indexOf(`id="${topicPanelId("wound-care")}"`));
    expect(lochiaPanel).toContain("<figure");
    for (const p of LOCHIA_TIMELINE.phases) expect(lochiaPanel).toContain(`>${p.when}</span>`);
  });

  it("출처: 카드에 칩으로 늘어놓지 않고, 카드마다 '출처 보기' 하나 + 위험 신호 카드 하나(흰 글씨)", () => {
    expect(html.match(/<details/g)).toHaveLength(9);
    expect(always).not.toContain("sr-only\">출처: ");
    expect(always).not.toContain("bg-primary/10");
    // 카드 출처 " · "는 이름 하나씩, 위험 신호 카드 출처 줄은 원문 한 줄 그대로
    const cardSources = guideCardViews().map((c) => splitEvidenceTokens(c.sourceToken ? [c.sourceToken] : []).sources);
    expect(cardSources[0]).toEqual(["임산부수첩 2023", "Merck Manual"]);
    for (const name of cardSources.flat()) expect(html, name).toContain(`<span class="sr-only">출처: </span>${escapeHtml(name)}</li>`);
    expect(html.match(/<span class="sr-only">출처: <\/span>/g)).toHaveLength(cardSources.flat().length + 1);
    expect(html).toContain(`<span class="sr-only">출처: </span>${escapeHtml(GUIDE_TEXT.redFlagSource)}</li>`);
    expect(html).toMatch(/<section aria-labelledby="guide-red-flags"[\s\S]*<summary class="[^"]*text-white[^"]*">/);
  });

  it("뒤로 가기는 프로필로(끝 슬래시)", () => {
    expect(html).toContain('href="/profile/"');
  });

  it("위험 신호 카드는 제목으로 이름이 붙은 영역 — 주제 패널 밖(어느 주제든 늘 보인다)", () => {
    expect(html).toContain('aria-labelledby="guide-red-flags"');
    expect(html).toContain(`id="guide-red-flags"`);
    const lastPanel = html.lastIndexOf('role="tabpanel"');
    expect(html.indexOf('aria-labelledby="guide-red-flags"')).toBeGreaterThan(lastPanel);
  });
});

describe("전화번호 — 글자는 그대로, 번호만 떼어 tel: 링크(web/07 §5)", () => {
  it("하이픈 번호만 떼어 내고 글자는 그대로 둔다", () => {
    const text = "정신건강복지센터(1577-0199) 또는 02-2276-2276으로 연락하세요.";
    const segs = splitPhoneNumbers(text);
    expect(segs.map((s) => s.text).join("")).toBe(text);
    expect(segs.filter((s) => s.phone).map((s) => s.text)).toEqual(["1577-0199", "02-2276-2276"]);
  });

  it("안전 연계 짧은 번호(109 · 112 · 119 · 1350)도 번호로 본다 — 앞뒤에 숫자·하이픈이 없을 때만", () => {
    expect(SAFETY_SHORT_NUMBERS).toEqual(["109", "112", "119", "1350"]);
    expect(splitPhoneNumbers("지금 위험하다면 119나 112에 연락하세요.").filter((s) => s.phone).map((s) => s.text)).toEqual(["119", "112"]);
    expect(splitPhoneNumbers("1120원").filter((s) => s.phone)).toEqual([]);
    const crisis = content.chat_fallback.replies.self_harm;
    expect(splitPhoneNumbers(crisis).filter((s) => s.phone).map((s) => s.text)).toEqual(["1577-0199", "109", "119"]);
    expect(splitPhoneNumbers("고용노동부 — 고객상담 1350").filter((s) => s.phone).map((s) => s.text)).toEqual(["1350"]);
    // 수치·다른 번호의 일부는 전화번호로 지어내지 않는다
    for (const text of ["산모의 10~20%가 겪는", "1190원", "400~500kcal", "하루 200–300mg", "01090001350", "119-0000-0000"]) {
      const phones = splitPhoneNumbers(text).filter((s) => s.phone);
      if (text === "119-0000-0000") expect(phones.map((s) => s.text)).toEqual(["119-0000-0000"]);
      else expect(phones, text).toEqual([]);
    }
    // content.json의 가이드·생활 권고·지원사업 문장에서 번호로 잡히는 것은 이 다섯뿐(109·119는 산후 정신건강 카드의 위기 안내)
    const all = [
      ...content.guide_red_flags,
      ...content.guide_cards.flatMap((c) => c.points),
      ...content.lifestyle_tips.map((t) => t.detail),
      ...content.support_domains.flatMap((d) => d.solutions.flatMap((s) => [s.name, s.note])),
    ];
    expect(new Set(all.flatMap((t) => splitPhoneNumbers(t).filter((s) => s.phone).map((s) => s.text)))).toEqual(
      new Set(["1577-0199", "02-2276-2276", "1350", "109", "119"]),
    );
  });

  it("번호가 없으면 한 덩어리", () => {
    expect(splitPhoneNumbers("오로 변화")).toEqual([{ text: "오로 변화", phone: false }]);
  });

  it("PhoneLinks — tel: 링크(숫자만) + '{번호}에 전화 걸기', 글자는 그대로", () => {
    const markup = renderToStaticMarkup(h(PhoneLinks, { text: "위급하면 119입니다. 상담 1577-0199" }));
    expect(markup).toBe(`<span>위급하면 ${phoneAnchor("119")}입니다. 상담 ${phoneAnchor("1577-0199")}</span>`);
    expect(phoneCallLabel("109")).toBe("109에 전화 걸기");
    // 어두운 배경용 색
    expect(renderToStaticMarkup(h(PhoneLinks, { text: "119", linkClassName: "text-white" }))).toBe(`<span>${phoneAnchor("119", "text-white")}</span>`);
    // link=false — 링크 없이 한 줄로 묶기만(이미 링크인 행 안)
    expect(renderToStaticMarkup(h(PhoneLinks, { text: "상담 109", link: false }))).toBe('<span>상담 <span class="whitespace-nowrap">109</span></span>');
  });

  it("회복 가이드 화면의 전화번호는 모두 tel: 링크 — 위험 신호 카드 넷(흰 글자), 오로 카드 119, 산후 정신건강 카드 넷", () => {
    // 위험 신호 15줄 중 "(바로 119)"·"(109·1577-0199, 위급하면 119)" = 4, 오로 카드의 다량 출혈 줄 119 = 1, 정신건강 카드 1577-0199 두 곳 + 109·119 = 4
    expect(html.match(/href="tel:/g)).toHaveLength(9);
    expect(html.split(phoneAnchor("1577-0199"))).toHaveLength(3);
    expect(html).toContain(phoneAnchor("109"));
    expect(html).toContain(phoneAnchor("119"));
    for (const n of ["119", "109", "1577-0199"]) expect(html, n).toContain(phoneAnchor(n, "text-white"));
  });
});
