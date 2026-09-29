// 기록 탭 마크업 검사 — 조건별로 무엇이 나오는지·접근성 속성(브라우저 없이 서버 렌더로 확인).
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SymptomRecord } from "@/domain/types";
import { MoodQuestionCard } from "./MoodQuestionCard";
import { RecentRecordsCard } from "./RecentRecordsCard";
import { NormalResultCard, RecordResult } from "./RecordResult";
import { RecordScreen } from "./RecordScreen";
import { INITIAL_SYMPTOM_FORM, RECORD_TEXT, moodCardModel, recentRecordRows, submitSymptomCheck } from "./recordView";
import { SymptomFormCards } from "./SymptomFormCards";

const kst = (local: string) => new Date(`${local}:00+09:00`);
const NOW = kst("2026-09-23T12:00");
const count = (html: string, needle: string) => html.split(needle).length - 1;
const noop = () => {};

describe("저장소를 읽기 전(정적 HTML)", () => {
  it("제목만 — 기본값·사용자 데이터·시각에 따른 값이 박히지 않는다", () => {
    const html = renderToStaticMarkup(h(RecordScreen));
    expect(html).toContain(`<h1 class="text-2xl font-bold text-neutral">${RECORD_TEXT.title}</h1>`);
    expect(html).not.toContain("산후");
    expect(html).not.toContain(RECORD_TEXT.submit);
    expect(html).not.toContain(RECORD_TEXT.moodTitle);
  });
});

describe("입력 폼", () => {
  const render = (showsLochia: boolean) =>
    renderToStaticMarkup(
      h(SymptomFormCards, {
        form: INITIAL_SYMPTOM_FORM,
        onChange: noop,
        showsLochia,
        neighborhood: "서울 동대문구 회기동",
        onNeighborhoodChange: noop,
      }),
    );

  it("산후 10일 전: 오로 토글 대신 안내문, 스위치는 발열 1 + 위험 증상 4", () => {
    const html = render(false);
    expect(html).toContain(RECORD_TEXT.lochiaEarly);
    expect(html).not.toContain(RECORD_TEXT.lochiaIncreased);
    expect(count(html, 'role="switch"')).toBe(5);
  });

  it("산후 10일 이후: 오로 토글 2개(+5)", () => {
    const html = render(true);
    expect(html).toContain(RECORD_TEXT.lochiaIncreased);
    expect(html).toContain(RECORD_TEXT.lochiaRed);
    expect(html).not.toContain(RECORD_TEXT.lochiaEarly);
    expect(count(html, 'role="switch"')).toBe(7);
  });

  it("발열 제목·설명, 통증 0/10, 내 동네 입력에 라벨·도움말", () => {
    const html = render(true);
    expect(html).toContain("발열 (38.0℃ 이상)");
    expect(html).toContain(RECORD_TEXT.feverDescription);
    expect(html).toContain(RECORD_TEXT.painTitle);
    expect(html).toContain('aria-valuetext="0/10"');
    const input = /<input type="text"[^>]*>/.exec(html)?.[0] ?? "";
    expect(input).toContain('value="서울 동대문구 회기동"');
    expect(input).toContain('placeholder="예: 서울 강남구 역삼동"');
    const labelledBy = /aria-labelledby="([^"]+)"/.exec(input)?.[1];
    const describedBy = /aria-describedby="([^"]+)"/.exec(input)?.[1];
    expect(html).toContain(`id="${labelledBy}">내 동네 (연계 안내용)</h2>`);
    expect(html).toContain(`<p id="${describedBy}" class="text-[0.8125rem] text-text-secondary">${RECORD_TEXT.neighborhoodHelp}</p>`);
  });

  it("위험 증상을 켜면 경고색(stateAlert), 기본 토글은 primary", () => {
    const html = renderToStaticMarkup(
      h(SymptomFormCards, {
        form: { ...INITIAL_SYMPTOM_FORM, calfPainSwelling: true, feverEvent: true },
        onChange: noop,
        showsLochia: false,
        neighborhood: "",
        onNeighborhoodChange: noop,
      }),
    );
    expect(count(html, 'bg-state-alert"')).toBe(1);
    expect(count(html, 'bg-primary"')).toBe(1);
    expect(count(html, 'aria-checked="true"')).toBe(2);
  });

  it("잠금(결과 단계 — PC에서만 보임): 스위치 7·슬라이더·내 동네 입력이 모두 비활성, 기본은 모두 활성", () => {
    const render = (disabled?: boolean) =>
      renderToStaticMarkup(
        h(SymptomFormCards, {
          form: INITIAL_SYMPTOM_FORM,
          onChange: noop,
          showsLochia: true,
          neighborhood: "",
          onNeighborhoodChange: noop,
          disabled,
        }),
      );
    const locked = render(true);
    expect(count(locked, 'disabled=""')).toBe(9);
    expect(/<input[^>]*type="range"[^>]*>/.exec(locked)?.[0]).toContain('disabled=""');
    expect(/<input[^>]*type="text"[^>]*>/.exec(locked)?.[0]).toContain('disabled=""');
    expect(count(render(), 'disabled=""')).toBe(0);
  });
});

describe("결과", () => {
  it("병원 신호: 레드플래그 카드(바로 읽힘) + 출처 칩 + 가까운 산부인과(키 없음 → 준비 중)", () => {
    const flag = submitSymptomCheck({ ...INITIAL_SYMPTOM_FORM, feverEvent: true }, "2026-09-01", NOW).result.hospitalSignal;
    const html = renderToStaticMarkup(h(RecordResult, { redFlag: flag, neighborhood: "", onNeighborhoodChange: noop }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("즉시 내원");
    expect(html).toContain("38°C 이상의 발열은 즉시 병원 확인이 필요한 신호예요. 바로 방문하세요.");
    expect(html).toContain('<span class="sr-only">출처: </span>');
    expect(html).toContain("임산부수첩 2023");
    expect(html).toContain("가까운 산부인과 찾기는 준비 중이에요.");
  });

  it("출처가 확정되지 않은 신호는 출처 칩 없이(지어내지 않음)", () => {
    const flag = submitSymptomCheck({ ...INITIAL_SYMPTOM_FORM, chestPainBreathing: true }, "2026-09-01", NOW).result.hospitalSignal;
    const html = renderToStaticMarkup(h(RecordResult, { redFlag: flag, neighborhood: "", onNeighborhoodChange: noop }));
    expect(html).not.toContain("출처: ");
  });

  it("신호 없음: 제목·본문 두 줄, 산부인과 목록 없음", () => {
    const html = renderToStaticMarkup(h(RecordResult, { redFlag: null, neighborhood: "회기동", onNeighborhoodChange: noop }));
    expect(html).toBe(renderToStaticMarkup(h(NormalResultCard)));
    expect(html).toContain("즉시 내원이 필요한 위험 신호는 없어요");
    expect(html).toContain("증상이 계속되거나 심해지면 의료진과 상담하세요. 이 결과는 진단이 아닙니다.");
    expect(html).not.toContain("산부인과를 찾아");
  });
});

describe("오늘의 한 가지 질문 카드", () => {
  it("묻기: 문항 + 답 버튼 3개(그룹 이름 = 문항) + 안내", () => {
    const model = moodCardModel([], NOW);
    const html = renderToStaticMarkup(h(MoodQuestionCard, { model, onAnswer: noop }));
    expect(count(html, '<button type="button"')).toBe(3);
    expect(html).toMatch(/role="group" aria-labelledby="[^"]+"/);
    expect(html).toContain(RECORD_TEXT.moodNote);
    if (model.kind === "ask") expect(html).toContain(model.question.text);
  });

  it("서버 저장 빌드 모델이면 '이 기기' 문구가 그려지지 않고 서버 저장 각주가 그려진다", () => {
    const model = moodCardModel([], NOW, { serverStorage: true });
    const html = renderToStaticMarkup(h(MoodQuestionCard, { model, onAnswer: noop }));
    expect(html).not.toContain("이 기기");
    expect(html).toContain("동의를 받은 뒤 온맘 서버(대한민국 서울)에 저장되고, 진단이 아니에요.");
  });

  it("답함: 답 문구만, 버튼 없음", () => {
    const model = moodCardModel(
      [{ id: "m", date: kst("2026-09-23T08:00").toISOString(), questionID: 1, answer: "unsure" }],
      NOW,
    );
    const html = renderToStaticMarkup(h(MoodQuestionCard, { model, onAnswer: noop }));
    expect(html).toContain("오늘은 「글쎄요」라고 답했어요. 내일 또 물어볼게요.");
    expect(html).not.toContain("<button");
  });
});

describe("최근 기록 카드", () => {
  it("줄마다 <time>과 상태 글자", () => {
    const rec: SymptomRecord = {
      id: "r1",
      date: kst("2026-09-23T15:05").toISOString(),
      lochiaIncreased: false,
      lochiaRed: false,
      feverEvent: true,
      painNrs: 0,
      redFlagCode: "fever_infection",
      postpartumDays: 30,
    };
    const html = renderToStaticMarkup(h(RecentRecordsCard, { rows: recentRecordRows([rec, { ...rec, id: "r2", redFlagCode: null }]) }));
    expect(count(html, "<li")).toBe(2);
    expect(html).toContain(`<time dateTime="${rec.date}"`);
    expect(html).toContain("9월 23일 오후 3:05");
    expect(html).toContain("병원 신호");
    expect(html).toContain("위험신호 없음");
    // 위험 증상 필드가 없는 기록(옛 기록·iOS 기록)에는 신호 줄이 없다
    expect(html).not.toContain(RECORD_TEXT.dizziness);
  });

  it("위험 증상 토글이 켜져 있던 기록은 줄 아래에 그 라벨(RECORD_TEXT 원문)을 칩으로 보인다", () => {
    const rec: SymptomRecord = {
      id: "r1",
      date: kst("2026-09-23T15:05").toISOString(),
      lochiaIncreased: false,
      lochiaRed: false,
      feverEvent: false,
      painNrs: 0,
      redFlagCode: "neuro_flag",
      postpartumDays: 30,
    };
    const rows = recentRecordRows([
      { ...rec, woundPainWorsening: false, dizzinessFainting: true, chestPainBreathing: false, calfPainSwelling: false },
      { ...rec, id: "r2", redFlagCode: null, woundPainWorsening: false, dizzinessFainting: false, chestPainBreathing: false, calfPainSwelling: false },
    ]);
    const html = renderToStaticMarkup(h(RecentRecordsCard, { rows }));
    expect(count(html, RECORD_TEXT.dizziness)).toBe(1);
    expect(html).not.toContain(RECORD_TEXT.woundPain);
    expect(html).toContain("병원 신호");
    expect(html).toContain("위험신호 없음");
  });
});
