// 홈 히어로 카드 마크업 검사 — 칩 목록의 스크린리더 이름(서버 렌더로 확인).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { HomeStageCard } from "@/rules/exercise";
import { HeroCard, MoodSupportCard, RecoveryStateCard, StageCard } from "./HomeCards";
import { HOME_TEXT, RECOVERY_CRISIS_DESCRIPTOR, type RecoveryStateCard as RecoveryStateCardModel } from "./homeViewModel";

describe("HeroCard — 칩 목록", () => {
  const html = renderToStaticMarkup(h(HeroCard, { dayCount: 40, chips: ["자연분만", "전업"] }));

  it("칩 목록에 이름(분만 방식·목표)이 있고 칩은 목록 항목", () => {
    expect(HOME_TEXT.heroChipsLabel).toBe("분만 방식·목표");
    expect(html).toContain('<ul aria-label="분만 방식·목표"');
    expect(html.match(/<li [^>]*>자연분만<\/li>/g)).toHaveLength(1);
    expect(html.match(/<li [^>]*>전업<\/li>/g)).toHaveLength(1);
  });

  it("카드 영역 이름은 그대로 제목(산후 회복)", () => {
    expect(html).toContain('aria-labelledby="home-hero-title"');
    expect(html).toMatch(/<h2 id="home-hero-title"[^>]*>산후 회복<\/h2>/);
  });
});

describe("RecoveryStateCard — 오늘의 회복 기록", () => {
  const render = (model: RecoveryStateCardModel) => renderToStaticMarkup(h(RecoveryStateCard, { model }));

  it("3단계 줄의 글자는 지표 배지와 같고, 해당 없음에 인증 도장 아이콘을 쓰지 않는다", () => {
    const html = render({ kind: "filled", title: "오늘의 회복 기록", label: "해당 없음", tone: "normal", descriptor: "설명" });
    for (const label of ["해당 없음", "살펴볼 신호", "병원 확인 신호"]) expect(html, label).toContain(label);
    expect(html).toContain("lucide-clipboard-list");
    expect(html).not.toContain("lucide-badge-check");
  });

  it("위기 상담 설명의 전화번호는 눌러서 걸 수 있다(tel:) — 번호가 없는 설명에는 링크가 없다", () => {
    const crisis = render({ kind: "filled", title: "t", label: "병원 확인 신호", tone: "alert", descriptor: RECOVERY_CRISIS_DESCRIPTOR });
    for (const tel of ["tel:109", "tel:15770199", "tel:119", "tel:112"]) expect(crisis, tel).toContain(`href="${tel}"`);
    expect(render({ kind: "filled", title: "t", label: "해당 없음", tone: "normal", descriptor: "설명" })).not.toContain("href=");
  });
});

describe("MoodSupportCard — 위기 연락처(임상 사전 검토 B3)", () => {
  it("1577-0199·02-2276-2276에 더해 자살예방상담전화 109와 위급할 때 119가 눌러서 걸 수 있는 줄로 나온다", () => {
    const html = renderToStaticMarkup(h(MoodSupportCard, { onSnooze: () => {} }));
    for (const tel of ["tel:15770199", "tel:109", "tel:0222762276", "tel:119"]) expect(html, tel).toContain(`href="${tel}"`);
    expect(html).toContain("자살예방상담전화 (24시간)");
  });
});

describe("StageCard — 레드플래그면 채운 팔각형 경고 아이콘(운동·분석 화면과 같은 컴포넌트)", () => {
  it("빨간 팔각형 + 흰 느낌표, 장식(aria-hidden)", () => {
    const html = renderToStaticMarkup(h(StageCard, { card: { kind: "redFlag", title: "운동 안내를 멈췄어요", body: "본문" } as HomeStageCard }));
    expect(html).toMatch(/<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="shrink-0 mt-0.5 size-5">/);
    expect(html).toContain('class="fill-state-alert"');
    expect(html).toContain('class="stroke-white"');
  });

  it("홈에 따로 그린 아이콘이 없다 — features/exercise/FilledOctagonAlert 하나", () => {
    const src = readFileSync(fileURLToPath(new URL("./HomeCards.tsx", import.meta.url)), "utf8");
    expect(src).toContain('import { FilledOctagonAlert } from "@/features/exercise/FilledOctagonAlert";');
    expect(src).not.toMatch(/function FilledOctagonAlert/);
  });
});
