// 전체 기록·기록 수정 화면 — 줄 만들기(recordHistoryView)와 마크업·접근성 속성(브라우저 없이 서버 렌더로 확인).
import { readFileSync } from "node:fs";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MoodCheckRecord, SymptomRecord } from "@/domain/types";
import { MOOD_QUESTIONS, moodAnswerLabel } from "@/rules/mood";
import { MOOD_VERSION, RULES_VERSION } from "@/rules/version";
import { ROUTES } from "@/routes";
import { MoodAnswerDialog } from "./MoodAnswerDialog";
import { MoodHistorySection, RecordHistoryScreen, SymptomHistorySection } from "./RecordHistoryScreen";
import {
  RECORD_HISTORY_TEXT,
  historyMoodRows,
  historyRecordRows,
  moodActionLabel,
  recordActionLabel,
  recordEditHref,
  recordEditModel,
  sameSymptomForm,
  showsHistoryLink,
} from "./recordHistoryView";
import { INITIAL_SYMPTOM_FORM, RECORD_TEXT, RECORD_WEB_TEXT } from "./recordView";
import { SymptomFormCards } from "./SymptomFormCards";

const noop = () => {};
const count = (html: string, needle: string) => html.split(needle).length - 1;
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

function rec(id: string, over: Partial<SymptomRecord> = {}): SymptomRecord {
  return { id, date: "2026-11-01T06:05:00.000Z", lochiaIncreased: false, lochiaRed: false, feverEvent: false, painNrs: 1, redFlagCode: null, postpartumDays: 30, rulesVersion: RULES_VERSION, ...over };
}
function mood(id: string, over: Partial<MoodCheckRecord> = {}): MoodCheckRecord {
  return { id, date: "2026-11-02T01:00:00.000Z", questionID: MOOD_QUESTIONS[0].id, answer: "no", moodVersion: MOOD_VERSION, ...over };
}

describe("줄 만들기", () => {
  it("증상 기록 — 순서 그대로(최신순), 결과 글자·살펴볼 값·수정 표시·수정 주소", () => {
    const rows = historyRecordRows([
      rec("new", { feverEvent: true, redFlagCode: "fever_infection", updatedAt: "2026-11-03T00:00:00.000Z", dizzinessFainting: true }),
      rec("old"),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["new", "old"]);
    expect(rows[0]).toMatchObject({ flagged: true, label: RECORD_WEB_TEXT.recentFlagged, edited: true, editHref: recordEditHref("new") });
    expect(rows[0].signals).toEqual(["발열", RECORD_TEXT.dizziness]);
    expect(rows[1]).toMatchObject({ flagged: false, label: RECORD_WEB_TEXT.recentNormal, edited: false, signals: [] });
    expect(rows[0].dateText).toBe("11월 1일 오후 3:05");
  });

  it("수정 주소는 쿼리로 — 기록 탭 아래 /record/edit/", () => {
    expect(recordEditHref("a b")).toBe(`${ROUTES.recordEdit}?id=a%20b`);
    expect(ROUTES.recordEdit.startsWith(ROUTES.record)).toBe(true);
    expect(ROUTES.recordHistory.startsWith(ROUTES.record)).toBe(true);
  });

  it("오늘의 질문 답 — 지금 문항표의 답이면 문항, 다른 버전이면 문항 없음, 모르는 답 값은 글쎄요", () => {
    const rows = historyMoodRows([
      mood("now", { answer: "yes", updatedAt: "2026-11-03T00:00:00.000Z" }),
      mood("other", { moodVersion: "mood-0.0" }),
      mood("weird", { answer: "maybe" as MoodCheckRecord["answer"], moodVersion: null }),
    ]);
    expect(rows[0]).toMatchObject({ question: MOOD_QUESTIONS[0].text, answer: "yes", answerLabel: moodAnswerLabel("yes"), edited: true });
    expect(rows[1].question).toBeNull();
    expect(rows[2]).toMatchObject({ answer: "unsure", question: MOOD_QUESTIONS[0].text });
  });

  it("전체 기록 버튼은 증상 기록이나 답이 하나라도 있을 때", () => {
    expect(showsHistoryLink({ symptomHistory: [], moodChecks: [] })).toBe(false);
    expect(showsHistoryLink({ symptomHistory: [], moodChecks: [mood("m")] })).toBe(true);
    expect(showsHistoryLink({ symptomHistory: [rec("a")], moodChecks: [] })).toBe(true);
  });

  it("낭독 이름에 보이는 글자가 그대로 들어 있다(WCAG 2.5.3)", () => {
    expect(recordActionLabel("11월 1일 오후 3:05", RECORD_HISTORY_TEXT.edit)).toBe("11월 1일 오후 3:05 기록 수정");
    expect(moodActionLabel("11월 2일 오전 10:00", RECORD_HISTORY_TEXT.delete)).toBe("11월 2일 오전 10:00 답 삭제");
    expect(recordActionLabel("", RECORD_HISTORY_TEXT.delete)).toBe("기록 삭제");
  });
});

describe("증상 기록 묶음", () => {
  const rows = historyRecordRows([rec("a", { painNrs: 7, redFlagCode: "severe_pain", updatedAt: "2026-11-03T00:00:00.000Z" }), rec("b")]);
  const html = renderToStaticMarkup(h(SymptomHistorySection, { rows, onDelete: noop }));

  it("기록마다 [수정] 링크와 [삭제] 버튼 — 누르는 영역 44px, 낭독 이름에 날짜, 삭제는 확인 창을 연다", () => {
    expect(count(html, `>${RECORD_HISTORY_TEXT.edit}</a>`)).toBe(2);
    expect(count(html, `>${RECORD_HISTORY_TEXT.delete}</button>`)).toBe(2);
    expect(html).toContain(`aria-label="${recordActionLabel(rows[0].dateText, RECORD_HISTORY_TEXT.edit)}"`);
    expect(html).toContain(`aria-label="${recordActionLabel(rows[0].dateText, RECORD_HISTORY_TEXT.delete)}"`);
    expect(count(html, 'aria-haspopup="dialog"')).toBe(2);
    expect(count(html, "min-h-11 min-w-11")).toBe(4);
    expect(html).toMatch(/href="\/record\/edit\/?\?id=a"/);
  });

  it("고친 기록은 날짜 옆에 수정됨, 결과는 색과 글자로", () => {
    expect(count(html, RECORD_HISTORY_TEXT.edited)).toBe(1);
    expect(html).toContain(RECORD_WEB_TEXT.recentFlagged);
    expect(html).toContain(RECORD_WEB_TEXT.recentNormal);
    expect(html).toContain("통증 NRS 7/10");
  });

  it("묶음 제목은 포커스를 받을 수 있다(지운 뒤 초점이 갈 곳 — 링 없음)", () => {
    expect(html).toMatch(/<h2 id="[^"]+" tabindex="-1" class="[^"]*focus:outline-none[^"]*">증상 기록<\/h2>/);
    expect(html).toMatch(/<section [^>]*aria-labelledby="([^"]+)"[\s\S]*<h2 id="\1"/);
  });

  it("비었으면 안내 한 줄 — 버튼 없음", () => {
    const empty = renderToStaticMarkup(h(SymptomHistorySection, { rows: [], onDelete: noop }));
    expect(empty).toContain(RECORD_HISTORY_TEXT.symptomEmpty);
    expect(empty).not.toContain("<button");
  });
});

describe("오늘의 질문 답 묶음", () => {
  const rows = historyMoodRows([mood("m", { updatedAt: "2026-11-03T00:00:00.000Z" }), mood("x", { moodVersion: "mood-0.0" })]);
  const html = renderToStaticMarkup(h(MoodHistorySection, { rows, onEdit: noop, onDelete: noop }));

  it("답마다 문항(알 때)·답·[수정]·[삭제](둘 다 창을 연다)", () => {
    expect(html).toContain(RECORD_TEXT.moodTitle);
    expect(count(html, MOOD_QUESTIONS[0].text)).toBe(1); // 다른 버전의 답은 문항을 그리지 않는다
    expect(count(html, `>${moodAnswerLabel("no")}</span>`)).toBe(2);
    expect(count(html, 'aria-haspopup="dialog"')).toBe(4);
    expect(html).toContain(`aria-label="${moodActionLabel(rows[0].dateText, RECORD_HISTORY_TEXT.edit)}"`);
    expect(count(html, RECORD_HISTORY_TEXT.edited)).toBe(1);
  });

  it("비었으면 안내 한 줄", () => {
    expect(renderToStaticMarkup(h(MoodHistorySection, { rows: [], onEdit: noop, onDelete: noop }))).toContain(RECORD_HISTORY_TEXT.moodEmpty);
  });
});

describe("답 수정 창", () => {
  const [row] = historyMoodRows([mood("m", { answer: "unsure" })]);
  const html = renderToStaticMarkup(h(MoodAnswerDialog, { row, onSave: noop, onClose: noop }));

  it("네이티브 dialog — 제목으로 이름, 문항이 묶음 이름(legend), 라디오 셋 중 지금 답이 골라져 있다", () => {
    expect(html).toMatch(/<dialog aria-labelledby="([^"]+)"[\s\S]*<h2 id="\1"[^>]*>답 수정<\/h2>/);
    expect(html).toContain(`<legend class="mb-2 text-[0.9375rem] font-semibold text-text-primary">${MOOD_QUESTIONS[0].text}</legend>`);
    expect(count(html, 'type="radio"')).toBe(3);
    expect(count(html, "checked")).toBeGreaterThanOrEqual(1);
    expect(html).toContain('checked="" value="unsure"');
    for (const a of ["yes", "unsure", "no"] as const) expect(html).toContain(moodAnswerLabel(a));
  });

  it("같은 답이면 [저장]이 잠긴다, [취소]가 있다, 고른 칸은 44px", () => {
    expect(html).toMatch(/<button type="submit" disabled=""[^>]*>저장<\/button>/);
    expect(html).toContain(`>${RECORD_HISTORY_TEXT.cancel}</button>`);
    expect(count(html, "min-h-11 flex-1")).toBe(3);
  });

  it("다른 버전의 답(문항을 모름)은 묶음 이름이 창 제목 — 비지 않는다", () => {
    const [other] = historyMoodRows([mood("x", { moodVersion: "mood-0.0" })]);
    const otherHtml = renderToStaticMarkup(h(MoodAnswerDialog, { row: other, onSave: noop, onClose: noop }));
    expect(otherHtml).toContain(`>${RECORD_HISTORY_TEXT.moodEditTitle}</legend>`);
  });
});

describe("저장소를 읽기 전(정적 HTML)", () => {
  it("전체 기록 — 제목·부제·[뒤로](기록 탭)만, 기록·버튼 없음", () => {
    const html = renderToStaticMarkup(h(RecordHistoryScreen));
    expect(html).toContain(`>${RECORD_HISTORY_TEXT.title}</h1>`);
    expect(html).toContain(RECORD_HISTORY_TEXT.subtitle);
    expect(html).toMatch(/href="\/record\/?"/);
    expect(html).not.toContain(RECORD_HISTORY_TEXT.symptomSection);
    expect(html).not.toContain("<button");
  });

  // 기록 수정 화면은 앱 라우터(useRouter — [취소]·떠나기)가 있어야 그린다 — 소스로 확인한다(아래 "소스 — 연결")
});

describe("기록 수정 폼", () => {
  it("처음 값은 기록의 답, 오로 질문은 그 기록의 산후 일수로", () => {
    const m = recordEditModel(rec("a", { feverEvent: true, painNrs: 5, postpartumDays: 7 }));
    expect(m.initialForm).toMatchObject({ feverEvent: true, painNrs: 5, lochiaIncreased: false });
    expect(m.showsLochia).toBe(false);
    expect(recordEditModel(rec("b", { postpartumDays: 12 })).showsLochia).toBe(true);
    expect(sameSymptomForm(m.initialForm, { ...m.initialForm })).toBe(true);
    expect(sameSymptomForm(m.initialForm, { ...m.initialForm, painNrs: 6 })).toBe(false);
  });

  it("내 동네 칸은 뺄 수 있다(기록 수정 — 프로필 값이라)", () => {
    const html = renderToStaticMarkup(h(SymptomFormCards, { form: INITIAL_SYMPTOM_FORM, onChange: noop, showsLochia: true, showsNeighborhood: false }));
    expect(html).not.toContain(RECORD_TEXT.neighborhoodTitle);
    expect(html).toContain(RECORD_TEXT.riskTitle);
    expect(count(html, 'role="switch"')).toBe(13);
  });

  it("기록 탭의 폼은 그대로 내 동네 칸이 있다", () => {
    const html = renderToStaticMarkup(
      h(SymptomFormCards, { form: INITIAL_SYMPTOM_FORM, onChange: noop, showsLochia: false, neighborhood: "역삼동", onNeighborhoodChange: noop }),
    );
    expect(html).toContain(RECORD_TEXT.neighborhoodTitle);
  });
});

describe("소스 — 연결", () => {
  it("기록 탭에 [전체 기록 보기](기록이나 답이 있을 때), 수정은 고친 답으로 규칙을 다시 돌린다", () => {
    const screen = read("./RecordScreen.tsx");
    expect(screen).toMatch(/showsHistoryLink\(state\) \?[\s\S]*href=\{ROUTES\.recordHistory\}[\s\S]*RECORD_HISTORY_TEXT\.openHistory/);
    const edit = read("./RecordEditScreen.tsx");
    expect(edit).toContain("rebuildSymptomRecord(record, form)");
    expect(edit).toContain("actions.updateSymptomRecord(record.id, rebuilt.values)");
    expect(edit).toContain("<RecordResult ");
  });

  it("삭제는 확인 창 뒤에만 — 확인 창의 [확인]에서만 store의 삭제를 부른다", () => {
    const src = read("./RecordHistoryScreen.tsx");
    expect(src).toContain("<ConfirmDialog");
    const deletes = [...src.matchAll(/actions\.delete\w+\(/g)].map((m) => m.index!);
    const confirm = src.indexOf("function confirmDelete()");
    const confirmEnd = src.indexOf("\n  }\n", confirm);
    expect(deletes.length).toBe(2);
    for (const i of deletes) expect(i > confirm && i < confirmEnd).toBe(true);
  });
});
