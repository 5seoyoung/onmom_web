import { describe, expect, it } from "vitest";
import { RISK_SYMPTOM_KEYS, SYMPTOM_HISTORY_LIMIT, type SymptomRecord } from "@/domain/types";
import { metrics } from "./redflag";
import { RULES_VERSION } from "./version";
import {
  RECORD_NORMAL_RESULT,
  addSymptomRecord,
  buildSymptomRecord,
  isRedFlagActive,
  latestRecord,
  recordHasCrisisSignal,
  recoveryStateLabel,
  recoveryStateTitle,
  relativeRecordTime,
  showsLochiaInputs,
  hasSignalBesidesCrisis,
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
  bleedingHeavy: false,
  headacheVision: false,
  faceHandSwelling: false,
  upperBellyPain: false,
  seizure: false,
  harmThoughts: false,
  lochiaOdor: false,
  severeVomiting: false,
  breastRedSwollen: false,
  extremeTiredness: false,
  ...over,
});

const record =(over: Partial<SymptomRecord> = {}): SymptomRecord => ({
  id: "r",
  date: "2026-09-23T01:00:00.000Z",
  lochiaIncreased: false,
  lochiaRed: false,
  feverEvent: false,
  painNrs: 0,
  redFlagCode: null,
  postpartumDays: 20,
  rulesVersion: null,
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
      rulesVersion: RULES_VERSION,
      // 위험 증상 토글 — 모두 꺼짐(판정에 쓴 값 그대로, rules-1.2)
      ...Object.fromEntries(RISK_SYMPTOM_KEYS.map((k) => [k, false])),
    });
  });

  it("결과를 낸 규칙의 버전(trace.configVersion = RULES_VERSION)을 기록에 찍는다 — 신호가 없어도", () => {
    const now = at("2026-09-30T09:00:00+09:00");
    for (const f of [form(), form({ feverEvent: true }), form({ painNrs: 9 })]) {
      const { record: r, result } = buildSymptomRecord(f, DELIVERY, now);
      expect(r.rulesVersion).toBe(RULES_VERSION);
      expect(r.rulesVersion).toBe(result.trace.configVersion);
    }
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

  it("다량 출혈은 오로 질문과 달리 산후 10일 전에도 판정한다(rules-1.2 — 임상 사전 검토 B1)", () => {
    const { record: r, result } = buildSymptomRecord(form({ bleedingHeavy: true }), DELIVERY, at("2026-09-15T09:00:00+09:00"));
    expect(r.postpartumDays).toBe(2);
    expect(result.hospitalSignal?.code).toBe("heavy_bleeding");
    expect(r.redFlagCode).toBe("heavy_bleeding");
    // 출산일이 없어도(0일로 계산) 묻고 판정한다
    expect(buildSymptomRecord(form({ bleedingHeavy: true }), null, at("2026-09-15T09:00:00+09:00")).record.redFlagCode).toBe("heavy_bleeding");
  });

  it("위험 증상 토글은 판정에 쓰고 기록에도 남긴다(rules-1.2 — 임상 사전 검토 R-STORE) → 어떤 신호였는지 기록에서 보인다(감사 #42·#46)", () => {
    const { record: r } = buildSymptomRecord(form({ dizzinessFainting: true }), DELIVERY, at("2026-09-30T09:00:00+09:00"));
    expect(Object.keys(r).sort()).toEqual(
      ["date", "feverEvent", "lochiaIncreased", "lochiaRed", "painNrs", "postpartumDays", "redFlagCode", "rulesVersion", ...RISK_SYMPTOM_KEYS].sort(),
    );
    expect(r).toMatchObject({ dizzinessFainting: true, bleedingHeavy: false, harmThoughts: false });
    expect(r.redFlagCode).toBe("neuro_flag");
    const stored = { ...r, id: "x" }; // 스토어가 id를 붙여 저장한 기록
    // 지표(오로·발열·통증)에는 어지러움 칸이 없다 — 지표는 모두 normal이고, 상태는 기록의 신호(redFlagCode)를 따른다
    expect(metrics(stored).every((m) => m.status === "normal")).toBe(true);
    expect(recoveryStateLabel(stored)).toBe("병원 확인 신호");
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
  it("레드플래그 → 병원 확인 신호 · 살펴볼 지표 → 살펴볼 신호 · 그 밖 → 해당 없음", () => {
    expect(recoveryStateLabel(record({ redFlagCode: "severe_pain", painNrs: 9 }))).toBe("병원 확인 신호");
    expect(recoveryStateLabel(record({ painNrs: 4 }))).toBe("살펴볼 신호");
    expect(recoveryStateLabel(record({ painNrs: 3 }))).toBe("해당 없음");
  });
  it("02 §11: 12일 · 증가만 · NRS 5 → 살펴볼 신호 / 3일 · 증가+붉음 → 해당 없음", () => {
    expect(recoveryStateLabel(record({ postpartumDays: 12, lochiaIncreased: true, painNrs: 5 }))).toBe("살펴볼 신호");
    expect(recoveryStateLabel(record({ postpartumDays: 3, lochiaIncreased: true, lochiaRed: true }))).toBe("해당 없음");
  });
  it("일수 없는 구버전 기록의 붉은 오로는 판정 보류라 해당 없음", () => {
    expect(recoveryStateLabel(record({ postpartumDays: null, lochiaIncreased: true, lochiaRed: true }))).toBe("해당 없음");
  });
});

describe("recoveryStateTitle (감사 #10)", () => {
  const now = at("2026-09-23T23:00:00+09:00");
  it("기록이 없거나 오늘 기록이면 '오늘의 회복 기록'", () => {
    expect(recoveryStateTitle(null, now)).toBe("오늘의 회복 기록");
    // 한국 00:30 = UTC 전날 15:30 — 로컬 날짜로 본다
    expect(recoveryStateTitle(record({ date: "2026-09-22T15:30:00.000Z" }), now)).toBe("오늘의 회복 기록");
  });
  it("오늘 기록이 아니면 날짜를 붙인다", () => {
    expect(recoveryStateTitle(record({ date: "2026-09-22T14:59:00.000Z" }), now)).toBe("최근 회복 기록 · 9월 22일");
    expect(recoveryStateTitle(record({ date: "2025-12-31T23:00:00.000Z" }), now)).toBe("최근 회복 기록 · 1월 1일");
  });
});

describe("RECORD_NORMAL_RESULT — 걸린 신호가 없을 때의 안내", () => {
  it("제목과 본문 두 줄, ' / ' 없이 — 체크한 항목이 목록과 맞지 않았다는 사실만 말한다", () => {
    expect(RECORD_NORMAL_RESULT).toEqual({
      title: "체크한 항목 중에는 '바로 병원에 가야 하는 신호'에 해당하는 것이 없었어요",
      body: "증상이 계속되거나 걱정되면 의료진과 상담하세요. 아래 목록에 없는 증상이라도 걱정되면 병원에 문의하세요. 이 안내는 진단이 아니에요.",
    });
  });

  it("위험이 없다고 판정하지 않는다(법률 사전 검토 4-3 '위험 없음을 말하지 않습니다')", () => {
    for (const text of [RECORD_NORMAL_RESULT.title, RECORD_NORMAL_RESULT.body]) {
      for (const word of ["위험 신호는 없", "위험신호 없음", "이상 없", "정상", "양호", "안전"]) expect(text, word).not.toContain(word);
    }
  });
});

describe("recordHasCrisisSignal — 가장 최근 기록의 위기 상담 신호(rules-1.2)", () => {
  it("대표 신호이거나, 대표 신호가 119여도 토글 칸이 켜져 있으면 — 옛 기록·다른 신호는 아니다", () => {
    expect(recordHasCrisisSignal(record({ redFlagCode: "harm_thoughts" }))).toBe(true);
    expect(recordHasCrisisSignal(record({ redFlagCode: "seizure", harmThoughts: true }))).toBe(true);
    expect(recordHasCrisisSignal(record({ redFlagCode: "seizure", harmThoughts: false }))).toBe(false);
    expect(recordHasCrisisSignal(record({ redFlagCode: "fever_infection" }))).toBe(false);
    expect(recordHasCrisisSignal(record())).toBe(false);
    expect(recordHasCrisisSignal(null)).toBe(false);
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

describe("hasSignalBesidesCrisis — PDF 리포트가 위기 체크를 넣지 않을 때", () => {
  const recordOf = (over: Partial<SymptomForm> = {}): SymptomRecord => ({
    ...buildSymptomRecord(form(over), "2026-09-01", new Date("2026-10-14T06:05:00.000Z")).record,
    id: "x",
  });
  const base = recordOf();

  it("신호가 없는 기록은 거짓", () => {
    expect(hasSignalBesidesCrisis(base)).toBe(false);
  });

  it("위기 상담 신호만 있으면 거짓", () => {
    const r = recordOf({ harmThoughts: true });
    expect(r.redFlagCode).toBe("harm_thoughts");
    expect(hasSignalBesidesCrisis(r)).toBe(false);
  });

  it.each<[string, Partial<SymptomForm>]>([
    // 흉통은 rules-1.3에서 119가 되어 위기 상담보다 앞 — 대표 신호가 된다(아래 "대표 신호가 119이거나"). 가려지는 토글은 즉시 내원인 것으로
    ["토글", { calfPainSwelling: true }],
    ["새 토글(rules-1.3)", { lochiaOdor: true }],
    ["많은 출혈", { bleedingHeavy: true }],
    ["고열", { feverEvent: true }],
    ["심한 통증", { painNrs: 8 }],
    ["오로", { lochiaIncreased: true, lochiaRed: true }],
  ])("대표 신호에 가려진 %s도 찾는다", (_, over) => {
    const r = recordOf({ harmThoughts: true, ...over });
    expect(r.redFlagCode).toBe("harm_thoughts");
    expect(hasSignalBesidesCrisis(r)).toBe(true);
  });

  it("대표 신호가 119이거나 다른 신호면 참", () => {
    expect(hasSignalBesidesCrisis(recordOf({ harmThoughts: true, seizure: true }))).toBe(true);
    expect(hasSignalBesidesCrisis(recordOf({ harmThoughts: true, chestPainBreathing: true }))).toBe(true);
    expect(hasSignalBesidesCrisis(recordOf({ feverEvent: true }))).toBe(true);
  });

  it("모르는 코드(다른 판의 기록)는 참 — 신호를 지우지 않는다", () => {
    expect(hasSignalBesidesCrisis({ ...base, redFlagCode: "from_the_future" })).toBe(true);
  });
});
