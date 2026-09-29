import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { MoodCheckRecord, SymptomRecord } from "@/domain/types";
import { questionForDay } from "@/rules/mood";
import { RECORD_NORMAL_RESULT } from "@/rules/record";
import {
  INITIAL_SYMPTOM_FORM,
  RECENT_RECORDS_LIMIT,
  RECORD_SERVER_TEXT,
  RECORD_TEXT,
  RISK_TOGGLES,
  answeredMoodText,
  firedRiskLabels,
  formatRecordDateTime,
  moodCardModel,
  moodNoteFor,
  recentRecordRows,
  recordColumns,
  recordLayout,
  recordShowsLochia,
  recordSubtitle,
  riskFlagsFromForm,
  submitSymptomCheck,
} from "./recordView";

const kst = (local: string) => new Date(`${local}:00+09:00`);
const NOW = kst("2026-09-23T12:00");
const swiftPath = (file: string) => fileURLToPath(new URL(`../../../web/reference/swift/${file}`, import.meta.url));
// iOS 원본(web/)은 공개 저장소에 없다 — 로컬에 있을 때만 Swift 원문과 대조하고, CI에서는 건너뛴다.
const HAS_SWIFT = existsSync(swiftPath("RecordFlowView.swift"));

describe.skipIf(!HAS_SWIFT)("문구는 Swift 원문 그대로(원칙 5)", () => {
  const source = HAS_SWIFT ? readFileSync(swiftPath("RecordFlowView.swift"), "utf8") : "";

  it.each(Object.entries(RECORD_TEXT))("%s", (_key, text) => {
    expect(source).toContain(`"${text}"`);
  });

  it("답한 뒤 문구 틀은 RecordFlowView.swift:70과 같다", () => {
    expect(source).toContain(`"${answeredMoodText("\\(answered.answer.label)")}"`);
  });

  it("위험 신호 없음 카드는 Swift 두 줄과 같다(content.json record_normal)", () => {
    expect(source).toContain(`"${RECORD_NORMAL_RESULT.title}"`);
    expect(source).toContain(`"${RECORD_NORMAL_RESULT.body}"`);
  });
});

it("발열 제목은 ℃(U+2103) 한 글자", () => {
  expect(RECORD_TEXT.feverTitle).toBe("발열 (38.0℃ 이상)");
});

describe("오늘의 질문 각주 — 저장 위치에 맞게(03 §8 웹 수정)", () => {
  it("설정 없는 빌드(브라우저 전용)는 iOS 원문 그대로이고, 기본 모델도 그것을 싣는다", () => {
    expect(moodNoteFor(false)).toBe("매일 한 가지씩 물어요. 답은 이 기기에만 남고, 진단이 아니에요.");
    const model = moodCardModel([], NOW);
    if (model.kind !== "ask") throw new Error("ask");
    expect(model.note).toBe(RECORD_TEXT.moodNote);
  });

  it("서버 저장 빌드는 '이 기기'라고 하지 않고, 동의 뒤 서버(서울) 저장과 진단 아님을 말한다", () => {
    const text = moodNoteFor(true);
    expect(text).toBe(RECORD_SERVER_TEXT.moodNote);
    expect(text).not.toContain("이 기기");
    expect(text).not.toContain("서버에만"); // 답은 이 브라우저에도 남는다
    expect(text).toContain("동의를 받은 뒤");
    expect(text).toContain("온맘 서버(대한민국 서울)");
    expect(text).toContain("진단이 아니에요");
    const model = moodCardModel([], NOW, { serverStorage: true });
    if (model.kind !== "ask") throw new Error("ask");
    expect(model.note).toBe(text);
  });
});

describe("폼 초기값 · 위험 증상 순서", () => {
  it("전부 꺼짐, 통증 0(손대지 않으면 통증 없음으로 기록)", () => {
    expect(INITIAL_SYMPTOM_FORM).toEqual({
      lochiaIncreased: false,
      lochiaRed: false,
      feverEvent: false,
      painNrs: 0,
      woundPainWorsening: false,
      dizzinessFainting: false,
      chestPainBreathing: false,
      calfPainSwelling: false,
    });
  });

  it("위험 증상 4개는 Swift 순서", () => {
    expect(RISK_TOGGLES.map((t) => t.label)).toEqual([
      "수술부위·회음부 통증 급격 악화",
      "어지러움·실신·균형장애",
      "흉통·가슴 압박·호흡곤란",
      "한쪽 종아리 통증·부종",
    ]);
  });
});

describe("머리 부제 — 산후 n일차 · {분만}", () => {
  it("출산일 63일 전 · 제왕절개 → 스크린샷과 같은 모양", () => {
    expect(recordSubtitle({ deliveryDate: "2026-07-22", deliveryMethod: "cesarean" }, NOW)).toBe("산후 63일차 · 제왕절개");
  });

  it("분만 방식이 없으면 '분만'", () => {
    expect(recordSubtitle({ deliveryDate: "2026-09-18", deliveryMethod: null }, NOW)).toBe("산후 5일차 · 분만");
  });

  it("출산일이 없으면 일차를 지어내지 않는다 — 분만 방식만, 둘 다 없으면 부제 없음", () => {
    expect(recordSubtitle({ deliveryDate: null, deliveryMethod: "vaginal" }, NOW)).toBe("자연분만");
    expect(recordSubtitle({ deliveryDate: null, deliveryMethod: null }, NOW)).toBeNull();
  });
});

describe("오로 질문은 산후 10일부터", () => {
  it("9일 → 안내문, 10일 → 토글", () => {
    expect(recordShowsLochia("2026-09-14", NOW)).toBe(false);
    expect(recordShowsLochia("2026-09-13", NOW)).toBe(true);
  });

  it("출산일이 없으면(0일로 봄) 묻지 않는다", () => {
    expect(recordShowsLochia(null, NOW)).toBe(false);
  });
});

describe("[확인하기] — 판정 + 저장할 기록", () => {
  it("아무것도 켜지 않으면 신호 없음, 기록은 그래도 저장(판정 시각·산후 일수 포함, id 없음)", () => {
    const { newRecord, result } = submitSymptomCheck(INITIAL_SYMPTOM_FORM, "2026-09-13", NOW);
    expect(result.hospitalSignal).toBeNull();
    expect(newRecord).toEqual({
      date: NOW.toISOString(),
      lochiaIncreased: false,
      lochiaRed: false,
      feverEvent: false,
      painNrs: 0,
      redFlagCode: null,
      postpartumDays: 10,
      woundPainWorsening: false,
      dizzinessFainting: false,
      chestPainBreathing: false,
      calfPainSwelling: false,
    });
    expect("id" in newRecord).toBe(false);
  });

  it("10일 전: 화면에 없는 오로 값은 켜져 있어도 저장·판정하지 않는다", () => {
    const form = { ...INITIAL_SYMPTOM_FORM, lochiaIncreased: true, lochiaRed: true };
    const { newRecord, result } = submitSymptomCheck(form, "2026-09-18", NOW);
    expect(result.hospitalSignal).toBeNull();
    expect(newRecord.lochiaIncreased).toBe(false);
    expect(newRecord.lochiaRed).toBe(false);
  });

  it("10일 이후 오로 증가 + 선홍색 → pph_suspect", () => {
    const form = { ...INITIAL_SYMPTOM_FORM, lochiaIncreased: true, lochiaRed: true };
    const { newRecord, result } = submitSymptomCheck(form, "2026-09-11", NOW);
    expect(result.hospitalSignal?.code).toBe("pph_suspect");
    expect(result.hospitalSignal?.evidenceChips).toContain("src:임산부수첩 2023");
    expect(newRecord.redFlagCode).toBe("pph_suspect");
  });

  it("위험 증상 토글 4개는 판정에 쓰고, 어떤 신호였는지 되짚을 수 있게 기록에도 싣는다(04 §1 저장 권장, 검수 #46)", () => {
    const { newRecord, result } = submitSymptomCheck({ ...INITIAL_SYMPTOM_FORM, dizzinessFainting: true }, "2026-09-01", NOW);
    expect(result.hospitalSignal?.code).toBe("neuro_flag");
    expect(newRecord.redFlagCode).toBe("neuro_flag");
    // 필드명은 SymptomInput(RedFlagEngine.swift:18-21) 그대로 — 폼 값이 boolean으로 들어간다(null은 옛 기록 몫)
    expect(riskFlagsFromForm({ ...INITIAL_SYMPTOM_FORM, dizzinessFainting: true })).toEqual({
      woundPainWorsening: false,
      dizzinessFainting: true,
      chestPainBreathing: false,
      calfPainSwelling: false,
    });
    expect(newRecord).toMatchObject({ dizzinessFainting: true, woundPainWorsening: false, chestPainBreathing: false, calfPainSwelling: false });
    // 판정 규칙은 그대로다 — 토글을 기록에 실어도 결과가 달라지지 않는다
    expect(newRecord.painNrs).toBe(0);
  });

  it("firedRiskLabels — 켜진 토글의 라벨만 화면 순서로. 필드가 없거나 null인 옛 기록은 빈 배열(지어내지 않음)", () => {
    const base: SymptomRecord = {
      id: "r",
      date: NOW.toISOString(),
      lochiaIncreased: false,
      lochiaRed: false,
      feverEvent: false,
      painNrs: 0,
      redFlagCode: "neuro_flag",
      postpartumDays: 10,
    };
    expect(firedRiskLabels(base)).toEqual([]);
    expect(
      firedRiskLabels({ ...base, woundPainWorsening: null, dizzinessFainting: null, chestPainBreathing: null, calfPainSwelling: null }),
    ).toEqual([]);
    expect(
      firedRiskLabels({ ...base, woundPainWorsening: false, dizzinessFainting: true, chestPainBreathing: false, calfPainSwelling: false }),
    ).toEqual([RECORD_TEXT.dizziness]);
    expect(
      firedRiskLabels({ ...base, woundPainWorsening: true, dizzinessFainting: false, chestPainBreathing: true, calfPainSwelling: true }),
    ).toEqual([RECORD_TEXT.woundPain, RECORD_TEXT.chestBreath, RECORD_TEXT.calfSwelling]);
    // 라벨은 RISK_TOGGLES(RECORD_TEXT 원문)와 같다 — 새 문구 없음
    expect(RISK_TOGGLES.map((t) => t.label)).toEqual([RECORD_TEXT.woundPain, RECORD_TEXT.dizziness, RECORD_TEXT.chestBreath, RECORD_TEXT.calfSwelling]);
  });

  it("통증 8 이상 → severe_pain", () => {
    const { result } = submitSymptomCheck({ ...INITIAL_SYMPTOM_FORM, painNrs: 8 }, "2026-09-01", NOW);
    expect(result.hospitalSignal?.code).toBe("severe_pain");
  });
});

describe("화면 배치", () => {
  const signal = submitSymptomCheck({ ...INITIAL_SYMPTOM_FORM, feverEvent: true }, "2026-09-01", NOW).result;
  const normal = submitSymptomCheck(INITIAL_SYMPTOM_FORM, "2026-09-01", NOW).result;

  it("입력 단계: 최근 기록은 기록이 있을 때만", () => {
    expect(recordLayout(null, 0)).toEqual({ phase: "form", showsRecent: false });
    expect(recordLayout(null, 3)).toEqual({ phase: "form", showsRecent: true });
  });

  it("병원 신호 → 레드플래그 카드 + 가까운 산부인과(질문·최근 기록은 숨김)", () => {
    const layout = recordLayout(signal, 3);
    expect(layout.phase).toBe("result");
    expect(layout).toMatchObject({ showsClinics: true, redFlag: { code: "fever_infection" } });
  });

  it("신호 없음 → 위험 신호 없음 카드만", () => {
    expect(recordLayout(normal, 3)).toEqual({ phase: "result", redFlag: null, showsClinics: false, showsRecent: true });
  });

  it("결과 단계에도 최근 기록 여부를 준다(PC 두 열에서 결과 옆에 보임)", () => {
    expect(recordLayout(normal, 0)).toMatchObject({ phase: "result", showsRecent: false });
    expect(recordLayout(signal, 1)).toMatchObject({ phase: "result", showsRecent: true });
  });
});

describe("열 배치 — 폰은 iOS처럼 결과가 폼 자리를, PC(lg)는 폼 옆에 결과", () => {
  const shownOnPhone = (cls: string) => /(^|\s)flex(\s|$)/.test(cls) && !/(^|\s)hidden(\s|$)/.test(cls);
  const shownOnPc = (cls: string) => shownOnPhone(cls) || /(^|\s)lg:flex(\s|$)/.test(cls);

  it("입력 단계: 폼·질문·최근 기록이 폰과 PC 모두에 보인다", () => {
    const c = recordColumns("form");
    for (const cls of [c.form, c.side, c.sideExtras]) {
      expect(shownOnPhone(cls)).toBe(true);
      expect(shownOnPc(cls)).toBe(true);
    }
  });

  it("결과 단계: 폰은 폼·질문·최근 기록을 숨기고(display:none), PC는 그대로 둔다", () => {
    const c = recordColumns("result");
    for (const cls of [c.form, c.sideExtras]) {
      expect(shownOnPhone(cls)).toBe(false);
      expect(shownOnPc(cls)).toBe(true);
    }
    expect(shownOnPhone(c.side)).toBe(true); // 결과 자리
  });

  it("입력 단계: 폼은 열려 있고 [확인하기]가 있다", () => {
    expect(recordColumns("form")).toMatchObject({ formLocked: false, showsSubmit: true });
  });

  it("결과 단계: 폼은 잠기고 [확인하기]는 없다 — PC에서 답과 결과가 어긋나거나 같은 기록이 겹쳐 저장되지 않게", () => {
    expect(recordColumns("result")).toMatchObject({ formLocked: true, showsSubmit: false });
  });

  it("PC(lg)에서 두 열, 폰에서는 세로 한 줄", () => {
    const { body } = recordColumns("form");
    expect(body).toMatch(/(^|\s)flex-col(\s|$)/);
    expect(body).toMatch(/(^|\s)lg:grid-cols-2(\s|$)/);
  });
});

describe("최근 기록 — 최신 5건 · 날짜 · 위험신호 없음/병원 신호", () => {
  const rec = (i: number, local: string, redFlagCode: string | null): SymptomRecord => ({
    id: `r${i}`,
    date: kst(local).toISOString(),
    lochiaIncreased: false,
    lochiaRed: false,
    feverEvent: false,
    painNrs: 0,
    redFlagCode,
    postpartumDays: 10,
  });

  it("앞 5건만, 순서 그대로", () => {
    const history = Array.from({ length: 7 }, (_, i) => rec(i, `2026-09-${String(23 - i).padStart(2, "0")}T09:00`, null));
    const rows = recentRecordRows(history);
    expect(rows).toHaveLength(RECENT_RECORDS_LIMIT);
    expect(rows.map((r) => r.id)).toEqual(["r0", "r1", "r2", "r3", "r4"]);
  });

  it("글자로도 상태를 말한다", () => {
    const rows = recentRecordRows([rec(1, "2026-09-23T15:05", "fever_infection"), rec(2, "2026-09-22T00:05", null)]);
    expect(rows[0]).toMatchObject({ flagged: true, label: "병원 신호", dateText: "9월 23일 오후 3:05" });
    expect(rows[1]).toMatchObject({ flagged: false, label: "위험신호 없음", dateText: "9월 22일 오전 12:05" });
  });

  it("켜져 있던 위험 증상 토글이 기록에 있으면 줄 아래 신호 라벨 — 없는(옛) 기록은 빈 배열", () => {
    const rows = recentRecordRows([
      { ...rec(1, "2026-09-23T15:05", "cardioresp_flag"), chestPainBreathing: true, dizzinessFainting: true, woundPainWorsening: false, calfPainSwelling: null },
      rec(2, "2026-09-22T00:05", "fever_infection"),
    ]);
    expect(rows[0].signals).toEqual([RECORD_TEXT.dizziness, RECORD_TEXT.chestBreath]);
    expect(rows[1].signals).toEqual([]);
  });

  it("읽을 수 없는 날짜는 빈 글자(지어내지 않음)", () => {
    expect(formatRecordDateTime("not-a-date")).toBe("");
  });
});

describe("오늘의 한 가지 질문", () => {
  const check = (local: string, answer: MoodCheckRecord["answer"]): MoodCheckRecord => ({
    id: local,
    date: kst(local).toISOString(),
    questionID: 1,
    answer,
  });

  it("오늘 답이 없으면 오늘의 문항 + 답 3개(네/글쎄요/아니요)", () => {
    const model = moodCardModel([check("2026-09-22T21:00", "yes")], NOW);
    expect(model.kind).toBe("ask");
    if (model.kind !== "ask") return;
    expect(model.question).toEqual(questionForDay(NOW));
    expect(model.answers.map((a) => a.label)).toEqual(["네", "글쎄요", "아니요"]);
  });

  it("오늘 답했으면 그 답을 말한다", () => {
    const model = moodCardModel([check("2026-09-23T08:00", "no")], NOW);
    expect(model).toEqual({ kind: "answered", text: "오늘은 「아니요」라고 답했어요. 내일 또 물어볼게요." });
  });

  it("같은 날엔 같은 문항(자정 전후로만 바뀜)", () => {
    expect(moodCardModel([], kst("2026-09-23T00:00"))).toEqual(moodCardModel([], kst("2026-09-23T23:59")));
    const a = moodCardModel([], kst("2026-09-23T23:59"));
    const b = moodCardModel([], kst("2026-09-24T00:00"));
    expect(a.kind === "ask" && b.kind === "ask" && a.question.id !== b.question.id).toBe(true);
  });
});
