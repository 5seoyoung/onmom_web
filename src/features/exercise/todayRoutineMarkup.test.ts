// 오늘의 체조 카드 마크업 검사(서버 렌더) — 제목에 이름이 붙은 구역, 단계순 목록, 단계 제목·요약 그대로,
// 멈춤 안내, 주의 사항 링크(있을 때만), [오늘 했어요](aria-pressed·44px)와 "이번 주 n일"(live region)·이 브라우저 저장 안내.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import content from "@/content";
import type { MaternityRecord } from "@/domain/types";
import { STAGE_BUCKETS } from "@/rules/exercise";
import { TodayRoutineCard } from "./TodayRoutineCard";
import { TODAY_ROUTINE_TEXT, routineCheckModel, todayRoutine, type RoutineCheckModel } from "./todayRoutine";

const count = (html: string, needle: string) => html.split(needle).length - 1;
const SUNDAY = new Date(2026, 10, 8, 9, 0);

function maternity(patch: Partial<MaternityRecord> = {}): MaternityRecord {
  return { isPrimiparous: true, gdm: false, anemia: false, heavyBleeding: false, preeclampsia: false, pelvicPain: false, diastasisRecti: false, ...patch };
}

function render(
  delivery: "vaginal" | "cesarean",
  week: number,
  m: MaternityRecord,
  today: Date,
  check: RoutineCheckModel | null = routineCheckModel([], today),
): string {
  const routine = todayRoutine("plan", delivery, week, m, today);
  if (routine.kind !== "routine") throw new Error(`routine이 아님: ${routine.kind}`);
  return renderToStaticMarkup(h(TodayRoutineCard, { routine, check, onToggleCheck: () => {} }));
}

describe("오늘의 체조 카드", () => {
  const html = render("vaginal", 12, maternity(), SUNDAY);

  it("제목(h2)이 이름인 구역 — aria-labelledby가 제목 id를 가리킨다", () => {
    const section = /<section [^>]*aria-labelledby="([^"]+)"/.exec(html);
    expect(section).not.toBeNull();
    expect(html).toContain(`<h2 id="${section?.[1]}"`);
    expect(html).toMatch(new RegExp(`<h2 [^>]*>.*${TODAY_ROUTINE_TEXT.heading}</h2>`));
    // 아이콘은 읽지 않는다
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
  });

  it("번호 목록(ol)에 3개 — 각 항목은 단계 제목과 요약 그대로, 회복 우선기는 없다(12주)", () => {
    expect(count(html, "<ol")).toBe(1);
    expect(count(html, "<li")).toBe(3);
    expect(html).toContain(TODAY_ROUTINE_TEXT.introRotating);
    const shown = STAGE_BUCKETS.filter((b) => html.includes(`>${b.title}<`));
    expect(shown).toHaveLength(3);
    for (const b of shown) expect(html).toContain(`>${b.summary}<`);
    // 지금 단계(12주 = 코어 강화)는 늘 있다
    expect(html).toContain(">코어 강화<");
    expect(html).not.toContain(">회복 우선기<");
  });

  it("목록 다음에 멈춤 안내", () => {
    expect(html).toContain(TODAY_ROUTINE_TEXT.stopNote);
    expect(html.indexOf(TODAY_ROUTINE_TEXT.stopNote)).toBeGreaterThan(html.indexOf("</ol>"));
  });

  it("막힌 단계는 그리지 않는다 — 골반통이면 기능 강화 없음", () => {
    for (let d = 1; d <= 7; d++) {
      const blocked = render("vaginal", 12, maternity({ pelvicPain: true }), new Date(2026, 10, d));
      expect(blocked).not.toContain(">기능 강화<");
    }
  });
});

describe("주의 사항 줄", () => {
  it("소견이 없으면 없다", () => {
    const html = render("vaginal", 12, maternity(), SUNDAY);
    expect(html).not.toContain(TODAY_ROUTINE_TEXT.cautionNote);
    expect(html).not.toContain("<a ");
  });

  it("빈혈이면 한 줄 + 회복 단계 분석 링크(44px) — 주의 문구 자체는 싣지 않는다", () => {
    const html = render("vaginal", 12, maternity({ anemia: true }), SUNDAY);
    expect(html).toContain(TODAY_ROUTINE_TEXT.cautionNote);
    // 끝 슬래시는 빌드(trailingSlash)가 붙인다 — 서버 렌더 테스트에서는 없을 수 있다
    const link = /<a [^>]*href="\/analyze\/?"[^>]*>(.*?)<\/a>/.exec(html);
    expect(link).not.toBeNull();
    expect(link?.[0]).toContain("min-h-11");
    expect(link?.[1]).toContain(TODAY_ROUTINE_TEXT.cautionLink);
    for (const o of content.caution_overlays) expect(html).not.toContain(o.label);
  });
});

describe("[오늘 했어요]", () => {
  it("오늘 안 했으면 aria-pressed=false, 이번 주 수는 비어 있지만 live region은 늘 있다", () => {
    const html = render("vaginal", 12, maternity(), SUNDAY);
    const button = /<button [^>]*>.*?<\/button>/.exec(html)?.[0] ?? "";
    expect(button).toContain('type="button"');
    expect(button).toContain('aria-pressed="false"');
    expect(button).toContain("min-h-11");
    expect(button).toContain(TODAY_ROUTINE_TEXT.checkLabel);
    expect(html).toMatch(/<p aria-live="polite"[^>]*><\/p>/);
    expect(html).toContain(TODAY_ROUTINE_TEXT.deviceNote);
  });

  it("오늘 했으면 aria-pressed=true, '이번 주 n일'이 live region 안에", () => {
    const html = render("vaginal", 12, maternity(), SUNDAY, routineCheckModel(["2026-11-08", "2026-11-04"], SUNDAY));
    expect(html).toMatch(/<button [^>]*aria-pressed="true"/);
    expect(html).toMatch(/<p aria-live="polite"[^>]*>이번 주 2일<\/p>/);
  });

  it("저장소를 쓸 수 없으면(check = null) 버튼·수·저장 안내를 그리지 않는다", () => {
    const html = render("vaginal", 12, maternity(), SUNDAY, null);
    expect(html).not.toContain("<button");
    expect(html).not.toContain("aria-live");
    expect(html).not.toContain(TODAY_ROUTINE_TEXT.deviceNote);
    // 목록·멈춤 안내는 그대로
    expect(count(html, "<li")).toBe(3);
    expect(html).toContain(TODAY_ROUTINE_TEXT.stopNote);
  });
});
