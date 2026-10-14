// PDF 리포트 마크업 검사 — 제목 단계·표 머리(scope)·빈 섹션·인쇄 숨김·진짜 버튼/링크(브라우저 없이 서버 렌더로 확인).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SubPageHeader } from "@/components/ui";
import type { PersistedState, SymptomRecord } from "@/domain/types";
import { DataRightsCard } from "@/features/settings/DataRightsCard";
import { DATA_RIGHTS_TEXT } from "@/features/settings/settingsView";
import { ROUTES } from "@/routes";
import type { Account } from "@/store/account";
import { initialState } from "@/store/defaults";
import { addComment, addMoodCheck, addPost, addSymptomRecord, updateMaternity, updateProfile } from "@/store/state";
import { ReportDocument } from "./ReportDocument";
import { buildReport } from "./reportModel";
import { ReportControls, ReportScreen } from "./ReportScreen";
import { REPORT_HREF, REPORT_TEXT } from "./reportText";

const NOW = new Date(2026, 9, 14, 21, 30);
const GUEST: Account = { id: "guest-abc", name: null, provider: "guest" };
const count = (html: string, needle: string | RegExp) =>
  typeof needle === "string" ? html.split(needle).length - 1 : (html.match(new RegExp(needle, "g")) ?? []).length;
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
/** 주석을 뺀 소스 — 주석에 적힌 말이 검사에 걸리지 않게(a11y.test.ts와 같은 규칙. 시험 파일을 가져오면 그 시험까지 돌아서 따로 둔다) */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/.*$/gm, "");
const noop = () => {};

function symptom(id: string, date: string, patch: Partial<SymptomRecord> = {}): SymptomRecord {
  return { id, date, lochiaIncreased: false, lochiaRed: false, feverEvent: false, painNrs: 2, redFlagCode: null, postpartumDays: 40, ...patch };
}

function fullState(): PersistedState {
  let s = updateProfile(initialState(), {
    deliveryDate: "2026-09-04",
    deliveryMethod: "vaginal",
    goal: "homemaker",
    consentAccepted: true,
    heightCm: 160,
    currentWeightKg: 64,
    prePregnancyWeightKg: 55,
  });
  s = updateMaternity(s, { gdm: true });
  s = addSymptomRecord(s, symptom("early", "2026-09-07T01:00:00.000Z", { postpartumDays: 3 }));
  s = addSymptomRecord(s, symptom("flag", "2026-10-14T01:00:00.000Z", { feverEvent: true, redFlagCode: "fever_infection" }));
  s = addMoodCheck(s, { id: "m1", date: "2026-10-14T00:30:00.000Z", questionID: 2, answer: "yes" });
  s = addMoodCheck(s, { id: "m2", date: "2026-10-13T00:30:00.000Z", questionID: 999, answer: "no" });
  s = addPost(s, { title: "둘째 주", body: "산책 10분" }, { id: "p1", authorName: "게스트", now: new Date("2026-10-10T03:00:00.000Z") });
  s = addComment(s, "p1", "내일도 걷기", { id: "c1", authorName: "게스트", now: new Date("2026-10-11T03:00:00.000Z") });
  return s;
}

const render = (state: PersistedState, includeJournal: boolean) =>
  renderToStaticMarkup(h(ReportDocument, { report: buildReport(state, GUEST, NOW, { includeJournal }) }));

describe("저장소를 읽기 전(정적 HTML)", () => {
  it("제목(h1)과 [뒤로]만 — 사용자 데이터·조작 요소·시각에 따른 값이 박히지 않는다", () => {
    const html = renderToStaticMarkup(h(ReportScreen));
    expect(count(html, "<h1")).toBe(1);
    expect(html).toContain(`>${REPORT_TEXT.title}</h1>`);
    expect(html).toMatch(/<main /);
    expect(html).not.toContain(REPORT_TEXT.print);
    expect(html).not.toContain(REPORT_TEXT.createdAt);
    expect(html).not.toContain("<table");
  });
});

describe("리포트 본문", () => {
  const html = render(fullState(), true);

  it("섹션마다 h2(이름 있는 section) — 프로필 · 재활 고려사항 · 증상 기록 · 오늘의 한 가지 질문 · 기록장, 글 제목은 h3", () => {
    const h2 = [...html.matchAll(/<h2 [^>]*id="([^"]+)"[^>]*>([^<]+)<\/h2>/g)].map((m) => [m[1], m[2]]);
    expect(h2).toEqual([
      ["report-profile", "프로필"],
      ["report-maternity", "재활 고려사항"],
      ["report-symptoms", "증상 기록"],
      ["report-moods", "오늘의 한 가지 질문"],
      ["report-journal", "기록장"],
    ]);
    for (const [id] of h2) expect(html).toMatch(new RegExp(`<section [^>]*aria-labelledby="${id}"`));
    expect(html).toMatch(/<h3[^>]*>둘째 주<\/h3>/);
    expect(html).not.toContain("<h1"); // h1은 화면 머리(SubPageHeader)
  });

  it("머리: 만든 날짜 · 계정 종류", () => {
    expect(html).toMatch(/<dt[^>]*>만든 날짜<\/dt><dd[^>]*>2026-10-14<\/dd>/);
    expect(html).toMatch(/<dt[^>]*>계정<\/dt><dd[^>]*>게스트<\/dd>/);
  });

  it("표: 열 머리는 th scope=col, 행 머리(기록 시각·날짜)는 th scope=row + <time>", () => {
    expect(count(html, '<th scope="col"')).toBe(7 + 3);
    expect(count(html, '<th scope="row"')).toBe(2 + 2);
    expect(html).toContain('<time dateTime="2026-10-14T01:00:00.000Z">10월 14일 오전 10:00</time>');
    // 표는 섹션 제목으로 이름이 붙는다. 가로 스크롤 묶음(초점 정류장)은 없다
    expect(count(html, /<table aria-labelledby="report-(symptoms|moods)"/)).toBe(2);
    expect(html).not.toContain('tabindex="0"');
  });

  it("증상 기록: 넓은 폭(카드 안 36rem 이상)·인쇄는 표, 좁은 폭은 기록마다 덩어리 — 결과 열이 화면 밖에 숨지 않게", () => {
    expect(html).toMatch(/<div class="@container"><div class="hidden @xl:block print:block"><table aria-labelledby="report-symptoms"/);
    const blocks = /<div class="@xl:hidden print:hidden"><ul [^>]*>([\s\S]*?)<\/ul><\/div>/.exec(html)?.[1] ?? "";
    // 기록 2건, 최신순, 시각·결과 + 표의 나머지 열 이름(산후 일수·오로 늘어남·붉은 오로·발열·통증)
    expect(count(blocks, /<li /)).toBe(2);
    expect(blocks.indexOf("병원 신호")).toBeLessThan(blocks.indexOf("위험신호 없음"));
    for (const label of ["산후 일수", "오로 늘어남", "붉은 오로", "발열 (38.0℃ 이상)", "통증 정도 (NRS)"]) {
      expect(count(blocks, `<dt class="text-text-secondary">${label}</dt>`)).toBe(2);
    }
    expect(blocks).toContain('<time dateTime="2026-10-14T01:00:00.000Z"');
  });

  it("표의 한 줄은 쪽 사이에서 갈라지지 않고(break-inside-avoid), 인쇄에서는 카드 모양을 걷는다", () => {
    for (const tr of html.match(/<tbody><tr [^>]*>/g) ?? []) expect(tr).toContain("break-inside-avoid");
    expect(count(html, /<tr class="group break-inside-avoid"/)).toBe(4);
    // 칸마다 구분선(border-separate) — 반투명 선이 열 경계에서 겹치지 않게
    expect(count(html, /<table [^>]*class="[^"]*border-separate border-spacing-0/)).toBe(2);
    expect(count(html, /<section [^>]*class="[^"]*print:shadow-none/)).toBe(5);
  });

  it("결과는 글자로(색만이 아님), 값 없는 칸은 '-'(낭독 제외) + 범례", () => {
    expect(html).toContain("병원 신호");
    expect(html).toContain("위험신호 없음");
    expect(html).toContain('<span aria-hidden="true">-</span>');
    expect(html).toContain(REPORT_TEXT.noValueNote);
  });

  it("모르는 기분 문항은 빈 칸, 답은 그대로", () => {
    expect(html).toMatch(/<time dateTime="2026-10-13T00:30:00.000Z">2026-10-13<\/time><\/th><td [^>]*><\/td><td [^>]*>아니요<\/td>/);
  });

  it("BMI 등 계산값 없음 — 키·체중은 입력값 그대로", () => {
    expect(html).not.toMatch(/BMI/i);
    expect(html).not.toContain("25.0");
    expect(html).toMatch(/<dt[^>]*>키 \(cm\)<\/dt><dd[^>]*>160<\/dd>/);
  });

  it("바닥글: 면책 원문 · 만든 곳 · 판정 규칙 버전(작은 글씨)", () => {
    expect(html).toMatch(/<footer /);
    expect(html).toContain("온맘은 의료기기가 아니며");
    expect(html).toContain(REPORT_TEXT.origin);
    expect(html).toMatch(/<p class="text-xs[^"]*">판정 규칙 버전 rules-/);
  });

  it("기록장 꺼짐: 기록장 제목도 글도 없다", () => {
    const off = render(fullState(), false);
    expect(off).not.toContain("report-journal");
    expect(off).not.toContain("둘째 주");
    expect(off).not.toContain("내일도 걷기");
  });
});

describe("빈 상태", () => {
  it("제목은 남기고 '기록이 없어요.'·'확인된 항목이 없어요.' 한 줄 — 표·범례 없음", () => {
    const html = renderToStaticMarkup(h(ReportDocument, { report: buildReport(initialState(), GUEST, NOW, { includeJournal: true }) }));
    expect(count(html, "<h2")).toBe(5);
    expect(count(html, `>${REPORT_TEXT.empty}</p>`)).toBe(3); // 증상 기록 · 기분 · 기록장
    expect(html).toContain(`>${REPORT_TEXT.maternityEmpty}</p>`);
    expect(html).not.toContain("<table");
    expect(html).not.toContain(REPORT_TEXT.noValueNote);
  });
});

describe("화면 조작(인쇄되지 않음)", () => {
  it("[PDF로 저장]은 진짜 버튼, [기록장 글 포함]은 라벨이 붙은 체크박스(기본 꺼짐), 묶음 전체가 print:hidden", () => {
    const html = renderToStaticMarkup(h(ReportControls, { includeJournal: false, onIncludeJournalChange: noop, onPrint: noop, failed: false }));
    expect(html).toMatch(/^<div class="[^"]*\bprint:hidden\b/);
    const button = /<button type="button"[^>]*>([\s\S]*?)<\/button>/.exec(html);
    expect(button?.[1]).toContain(REPORT_TEXT.print);
    expect(button?.[1]).toMatch(/<svg[^>]*aria-hidden="true"/); // 아이콘은 장식
    const describedBy = /<button [^>]*aria-describedby="([^"]+)"/.exec(html)?.[1];
    expect(html).toContain(`<p id="${describedBy}" class="text-[0.8125rem] text-text-secondary">${REPORT_TEXT.printHint}</p>`);
    expect(html).toMatch(new RegExp(`<label [^>]*><input type="checkbox"[^>]*/>${REPORT_TEXT.includeJournal}</label>`));
    expect(html).not.toMatch(/<input type="checkbox"[^>]*checked/);
    expect(html).not.toContain(DATA_RIGHTS_TEXT.exportFailed);
  });

  it("켜져 있으면 checked, 인쇄 창을 못 열면 문장으로(role=alert)", () => {
    const html = renderToStaticMarkup(h(ReportControls, { includeJournal: true, onIncludeJournalChange: noop, onPrint: noop, failed: true }));
    expect(html).toMatch(/<input type="checkbox"[^>]*checked/);
    expect(html).toMatch(new RegExp(`<div role="alert"[^>]*><p [^>]*>${DATA_RIGHTS_TEXT.exportFailed}</p></div>`));
  });

  it("인쇄는 보통의 클릭 처리에서 window.print — 인라인 스크립트를 더하지 않는다(CSP 해시 단계)", () => {
    const src = stripComments(read("./ReportScreen.tsx")) + stripComments(read("./ReportDocument.tsx"));
    expect(src).toContain("window.print()");
    expect(src).not.toMatch(/<script|dangerouslySetInnerHTML|next\/script/);
    // 네트워크 요청 없음 — 스토어 스냅샷만
    expect(src).not.toMatch(/fetch\(|XMLHttpRequest|supabase/i);
    expect(stripComments(read("./reportModel.ts"))).not.toMatch(/fetch\(|XMLHttpRequest|supabase|window\.|document\./i);
  });
});

describe("설정 > 내 데이터 — [PDF 리포트 만들기]", () => {
  it("JSON 내려받기 아래, 같은 모양의 링크(버튼 아님) → /settings/report/", () => {
    expect(REPORT_HREF).toBe(ROUTES.settingsReport);
    const html = renderToStaticMarkup(h(DataRightsCard, { snapshot: { state: initialState(), account: GUEST } }));
    const exportAt = html.indexOf(DATA_RIGHTS_TEXT.exportButton);
    const link = /<a [^>]*href="\/settings\/report\/?"[^>]*>([\s\S]*?)<\/a>/.exec(html);
    expect(link).not.toBeNull();
    expect(link![1]).toContain(REPORT_TEXT.entryLink);
    expect(link![1]).toContain(REPORT_TEXT.entryHint);
    expect(link!.index).toBeGreaterThan(exportAt);
    // 버튼 안에 들어 있지 않다(링크만)
    expect(html).not.toMatch(new RegExp(`<button[^>]*>(?:(?!</button>)[\\s\\S])*${REPORT_TEXT.entryLink}`));
  });
});

describe("인쇄 — 앱 껍데기는 종이에 찍히지 않는다", () => {
  it("사이드바·탭바·떠 있는 안내는 print:hidden, 본문 묶음은 종이 폭·흰 바탕", () => {
    expect(read("../../components/shell/SideNav.tsx")).toMatch(/className="sticky top-0 hidden [^"]*\bprint:hidden\b[^"]*"/);
    expect(read("../../components/TabBar.tsx")).toMatch(/<nav[\s\S]*?className="[^"]*\blg:hidden print:hidden\b[^"]*"/);
    expect(read("../flow/StaleTabNotice.tsx")).toMatch(/className="pointer-events-none fixed [^"]*\bprint:hidden\b[^"]*"/);
    const shell = read("../../components/shell/AppShell.tsx");
    expect(shell).toMatch(/id=\{APP_CONTENT_ID\}[\s\S]*?className="[^"]*\bprint:max-w-none\b[^"]*\bprint:bg-surface\b[^"]*"/);
    expect(shell).toMatch(/className="[^"]*\bprint:min-h-0\b/);
  });

  it("[뒤로]는 인쇄에서 빠지고 제목(h1)은 남는다", () => {
    const html = renderToStaticMarkup(h(SubPageHeader, { title: REPORT_TEXT.title, backHref: ROUTES.settings }));
    expect(/<a [^>]*>/.exec(html)?.[0]).toMatch(/\bprint:hidden\b/);
    expect(html).toMatch(/<h1 class="(?![^"]*print:hidden)[^"]*">/);
  });

  it("globals.css: 쪽 여백(@page)·인쇄 흰 바탕", () => {
    const css = stripComments(read("../../app/globals.css"));
    expect(css).toMatch(/@page\s*\{\s*margin:\s*\d+mm \d+mm;\s*\}/);
    expect(css).toMatch(/@media print\s*\{\s*body\s*\{\s*background:\s*var\(--color-surface\);/);
  });
});
