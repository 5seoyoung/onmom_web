import { describe, expect, it } from "vitest";
import { SYMPTOM_HISTORY_LIMIT, type SymptomRecord } from "@/domain/types";
import { metrics } from "./redflag";
import {
  RECORD_NORMAL_RESULT,
  addSymptomRecord,
  buildSymptomRecord,
  isRedFlagActive,
  latestRecord,
  recoveryStateLabel,
  recoveryStateTitle,
  relativeRecordTime,
  showsLochiaInputs,
  type SymptomForm,
} from "./record";

// vitest.config.ts가 TZ=Asia/Seoul로 고정한다.
const at = (iso: string) => new Date(iso);

const form = (over: Partial<SymptomForm> = {}): SymptomForm => ({
  lochiaIncreased: false,
  lochiaRed: false,
  feverEvent: false,
  painNrs: 0,
  woundPainWorsening: false,
  dizzinessFainting: false,
  chestPainBreathing: false,
  calfPainSwelling: false,
  ...over,
});

const record = (over: Partial<SymptomRecord> = {}): SymptomRecord => ({
  id: "r",
  date: "2026-09-23T01:00:00.000Z",
  lochiaIncreased: false,
  lochiaRed: false,
  feverEvent: false,
  painNrs: 0,
  redFlagCode: null,
  postpartumDays: 20,
  ...over,
});

describe("buildSymptomRecord", () => {
  const DELIVERY = "2026-09-13";

  it("산후 10일(D+10 00:01) · 증가+붉음 → pph_suspect, 그때의 일수를 함께 저장", () => {
    const now = at("2026-09-23T00:01:00+09:00");
    const { record: r, result } = buildSymptomRecord(form({ lochiaIncreased: true, lochiaRed: true }), DELIVERY, now);
    expect(result.hospitalSignal?.code).toBe("pph_suspect");
    expect(r).toEqual({
      date: now.toISOString(),
      lochiaIncreased: true,
      lochiaRed: true,
      feverEvent: false,
      painNrs: 0,
      redFlagCode: "pph_suspect",
      postpartumDays: 10,
    });
  });

  it("산후 9일(D+9 23:59)에는 오로를 묻지 않는다 — 폼 값이 남아 있어도 저장·판정하지 않음", () => {
    const { record: r, result } = buildSymptomRecord(
      form({ lochiaIncreased: true, lochiaRed: true }),
      DELIVERY,
      at("2026-09-22T23:59:00+09:00"),
    );
    expect(result.hospitalSignal).toBeNull();
    expect(result.trace.firedRules).toEqual(["redflag:none"]);
    expect(r).toMatchObject({ postpartumDays: 9, lochiaIncreased: false, lochiaRed: false, redFlagCode: null });
    expect(showsLochiaInputs(9)).toBe(false);
    expect(showsLochiaInputs(10)).toBe(true);
  });

  it("위험 증상 토글은 판정에만 쓰고 저장하지 않는다 → 지표는 정상인데 상태는 '확인 필요'(감사 #42)", () => {
    const { record: r } = buildSymptomRecord(form({ dizzinessFainting: true }), DELIVERY, at("2026-09-30T09:00:00+09:00"));
    expect(Object.keys(r).sort()).toEqual(
      ["date", "feverEvent", "lochiaIncreased", "lochiaRed", "painNrs", "postpartumDays", "redFlagCode"].sort(),
    );
    expect(r.redFlagCode).toBe("neuro_flag");
    const stored = { ...r, id: "x" }; // 스토어가 id를 붙여 저장한 기록
    expect(metrics(stored).every((m) => m.status === "normal")).toBe(true);
    expect(recoveryStateLabel(stored)).toBe("확인 필요");
  });

  it("통증은 0~10 정수(iOS Int(pain))", () => {
    const pain = (n: number) => buildSymptomRecord(form({ painNrs: n }), DELIVERY, at("2026-09-30T09:00:00+09:00"));
    expect(pain(8.7).record).toMatchObject({ painNrs: 8, redFlagCode: "severe_pain" });
    expect(pain(7.9).record).toMatchObject({ painNrs: 7, redFlagCode: null });
    expect(pain(11).record.painNrs).toBe(10);
    expect(pain(-1).record.painNrs).toBe(0);
  });

  it("출산일이 없으면 0일차로 판정", () => {
    const { record: r } = buildSymptomRecord(form(), null, at("2026-09-30T09:00:00+09:00"));
    expect(r.postpartumDays).toBe(0);
  });

  it("대표 신호가 기록의 redFlagCode가 된다", () => {
    const { record: r, result } = buildSymptomRecord(
      form({ painNrs: 9, feverEvent: true, calfPainSwelling: true }),
      DELIVERY,
      at("2026-09-30T09:00:00+09:00"),
    );
    expect(r.redFlagCode).toBe("severe_pain");
    expect(result.trace.firedRules).toEqual(["redflag:severe_pain", "redflag:fever_infection", "redflag:dvt_suspect"]);
  });
});

describe("addSymptomRecord · latestRecord · isRedFlagActive", () => {
  it("최신순 맨 앞에 넣고 50건까지만, 원본은 그대로", () => {
    const history = Array.from({ length: SYMPTOM_HISTORY_LIMIT }, (_, i) => record({ id: `old-${i}` }));
    const next = addSymptomRecord(history, record({ id: "new" }));
    expect(next).toHaveLength(50);
    expect(next[0].id).toBe("new");
    expect(next[49].id).toBe("old-48");
    expect(history).toHaveLength(50);
    expect(history[0].id).toBe("old-0");
  });

  it("최근 기록 = 맨 앞, 없으면 null", () => {
    expect(latestRecord([])).toBeNull();
    expect(latestRecord([record({ id: "a" }), record({ id: "b" })])?.id).toBe("a");
  });

  it("레드플래그 활성은 가장 최근 기록만 본다", () => {
    expect(isRedFlagActive([])).toBe(false);
    expect(isRedFlagActive([record({ redFlagCode: "fever_infection" }), record()])).toBe(true);
    expect(isRedFlagActive([record(), record({ redFlagCode: "fever_infection" })])).toBe(false);
  });
});

describe("recoveryStateLabel", () => {
  it("기록이 없으면 null", () => {
    expect(recoveryStateLabel(null)).toBeNull();
  });
  it("레드플래그 → 확인 필요 · 관찰 지표 → 관찰 · 전부 정상 → 양호", () => {
    expect(recoveryStateLabel(record({ redFlagCode: "severe_pain", painNrs: 9 }))).toBe("확인 필요");
    expect(recoveryStateLabel(record({ painNrs: 4 }))).toBe("관찰");
    expect(recoveryStateLabel(record({ painNrs: 3 }))).toBe("양호");
  });
  it("02 §11: 12일 · 증가만 · NRS 5 → 관찰 / 3일 · 증가+붉음 → 양호", () => {
    expect(recoveryStateLabel(record({ postpartumDays: 12, lochiaIncreased: true, painNrs: 5 }))).toBe("관찰");
    expect(recoveryStateLabel(record({ postpartumDays: 3, lochiaIncreased: true, lochiaRed: true }))).toBe("양호");
  });
  it("일수 없는 구버전 기록의 붉은 오로는 판정 보류라 양호", () => {
    expect(recoveryStateLabel(record({ postpartumDays: null, lochiaIncreased: true, lochiaRed: true }))).toBe("양호");
  });
});

describe("recoveryStateTitle (감사 #10)", () => {
  const now = at("2026-09-23T23:00:00+09:00");
  it("기록이 없거나 오늘 기록이면 '오늘의 회복 상태'", () => {
    expect(recoveryStateTitle(null, now)).toBe("오늘의 회복 상태");
    // 한국 00:30 = UTC 전날 15:30 — 로컬 날짜로 본다
    expect(recoveryStateTitle(record({ date: "2026-09-22T15:30:00.000Z" }), now)).toBe("오늘의 회복 상태");
  });
  it("오늘 기록이 아니면 날짜를 붙인다", () => {
    expect(recoveryStateTitle(record({ date: "2026-09-22T14:59:00.000Z" }), now)).toBe("최근 회복 상태 · 9월 22일 기록");
    expect(recoveryStateTitle(record({ date: "2025-12-31T23:00:00.000Z" }), now)).toBe("최근 회복 상태 · 1월 1일 기록");
  });
});

describe("RECORD_NORMAL_RESULT — 신호 없음 안내(RecordFlowView.swift:290, :295)", () => {
  it("제목과 본문 두 줄, ' / ' 없이", () => {
    expect(RECORD_NORMAL_RESULT).toEqual({
      title: "즉시 내원이 필요한 위험 신호는 없어요",
      body: "증상이 계속되거나 심해지면 의료진과 상담하세요. 이 결과는 진단이 아닙니다.",
    });
  });
});

// 기대값은 iOS와 같은 Foundation `Date.RelativeFormatStyle(presentation: .named)`(ko_KR, Asia/Seoul)를
// Swift 6.2에서 실행해 얻은 값이다(실제 포매터 1,663건 + 임의 기준 시각 6,000건 대조에서 전부 일치).
describe("relativeRecordTime — 지표 카드의 기록 시각", () => {
  const now = at("2026-09-23T21:50:05+09:00");
  const cases: [string, string][] = [
    ["2026-09-23T21:50:05+09:00", "지금"],
    ["2026-09-23T21:50:04+09:00", "1초 전"],
    ["2026-09-23T21:49:06+09:00", "59초 전"],
    ["2026-09-23T21:49:05+09:00", "1분 전"],
    ["2026-09-23T21:48:36+09:00", "1분 전"], // 1분 29초
    ["2026-09-23T21:48:35+09:00", "2분 전"], // 1분 30초 → 반올림
    ["2026-09-23T21:19:35+09:00", "31분 전"],
    ["2026-09-23T20:50:35+09:00", "1시간 전"], // 59분 30초 → 60분 → 1시간
    ["2026-09-23T20:20:06+09:00", "1시간 전"], // 1시간 29분 59초
    ["2026-09-23T20:20:05+09:00", "2시간 전"], // 1시간 30분
    ["2026-09-22T22:50:05+09:00", "23시간 전"],
    ["2026-09-22T22:20:06+09:00", "23시간 전"],
    ["2026-09-22T22:20:05+09:00", "어제"], // 23시간 30분 → 24시간 → 어제
    ["2026-09-21T22:50:05+09:00", "그저께"], // 47시간이지만 달력으로 이틀 전
    ["2026-09-20T23:01:06+09:00", "3일 전"],
    ["2026-09-16T23:34:07+09:00", "지난주"], // 6일 22시간 — 달력 주로 센다(일요일 시작)
    ["2026-09-10T21:50:05+09:00", "2주 전"], // 13일
    ["2026-08-26T21:50:05+09:00", "지난달"], // 28일
    ["2026-06-25T21:50:05+09:00", "3개월 전"],
    ["2025-09-23T21:50:05+09:00", "작년"],
    ["2024-07-15T21:50:05+09:00", "2년 전"],
    ["2026-09-24T21:50:05+09:00", "내일"], // 기기 시계가 어긋난 미래 기록
    ["2026-10-03T21:50:05+09:00", "다음 주"],
  ];
  it.each(cases)("%s → %s", (iso, expected) => {
    expect(relativeRecordTime(iso, now)).toBe(expected);
  });

  it("잘못된 날짜는 빈 문자열", () => {
    expect(relativeRecordTime("not-a-date", now)).toBe("");
  });
});
