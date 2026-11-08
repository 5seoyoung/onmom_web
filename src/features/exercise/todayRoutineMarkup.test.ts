// 오늘의 체조 카드 마크업 검사(서버 렌더) — 제목에 이름이 붙은 구역, 단계순 목록, 단계 제목·요약 그대로.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MaternityRecord } from "@/domain/types";
import { STAGE_BUCKETS } from "@/rules/exercise";
import { TodayRoutineCard } from "./TodayRoutineCard";
import { TODAY_ROUTINE_TEXT, todayRoutine } from "./todayRoutine";

const count = (html: string, needle: string) => html.split(needle).length - 1;

function maternity(patch: Partial<MaternityRecord> = {}): MaternityRecord {
  return { isPrimiparous: true, gdm: false, anemia: false, heavyBleeding: false, preeclampsia: false, pelvicPain: false, diastasisRecti: false, ...patch };
}

function render(delivery: "vaginal" | "cesarean", week: number, m: MaternityRecord, today: Date): string {
  const routine = todayRoutine("plan", delivery, week, m, today);
  if (routine.kind !== "routine") throw new Error(`routine이 아님: ${routine.kind}`);
  return renderToStaticMarkup(h(TodayRoutineCard, { routine }));
}

describe("오늘의 체조 카드", () => {
  const html = render("vaginal", 12, maternity(), new Date(2026, 10, 8, 9, 0));

  it("제목(h2)이 이름인 구역 — aria-labelledby가 제목 id를 가리킨다", () => {
    const section = /<section [^>]*aria-labelledby="([^"]+)"/.exec(html);
    expect(section).not.toBeNull();
    expect(html).toContain(`<h2 id="${section?.[1]}"`);
    expect(html).toMatch(new RegExp(`<h2 [^>]*>.*${TODAY_ROUTINE_TEXT.heading}</h2>`));
    // 아이콘은 읽지 않는다
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
  });

  it("번호 목록(ol)에 3개 — 각 항목은 단계 제목과 요약 그대로", () => {
    expect(count(html, "<ol")).toBe(1);
    expect(count(html, "<li")).toBe(3);
    expect(html).toContain(TODAY_ROUTINE_TEXT.introRotating);
    const shown = STAGE_BUCKETS.filter((b) => html.includes(`>${b.title}<`));
    expect(shown).toHaveLength(3);
    for (const b of shown) expect(html).toContain(`>${b.summary}<`);
    // 지금 단계(12주 = 코어 강화)는 늘 있다
    expect(html).toContain(">코어 강화<");
  });

  it("막힌 단계는 그리지 않는다 — 골반통이면 기능 강화 없음", () => {
    for (let d = 1; d <= 7; d++) {
      const blocked = render("vaginal", 12, maternity({ pelvicPain: true }), new Date(2026, 10, d));
      expect(blocked).not.toContain(">기능 강화<");
    }
  });

  it("버튼·링크가 없다(읽기 전용 카드)", () => {
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<a ");
  });
});
