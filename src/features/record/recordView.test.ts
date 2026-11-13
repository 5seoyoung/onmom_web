import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import content from "@/content";
import { formatMonthDayTime } from "@/domain/date";
import { RISK_SYMPTOM_KEYS, type MoodCheckRecord, type SymptomRecord } from "@/domain/types";
import { questionForDay } from "@/rules/mood";
import { RECORD_NORMAL_RESULT } from "@/rules/record";
import { RED_FLAG_CODES } from "@/rules/redflag";
import { RULES_VERSION } from "@/rules/version";
import {
  CRISIS_CALLS,
  INITIAL_SYMPTOM_FORM,
  RECENT_RECORDS_LIMIT,
  RECORD_SERVER_TEXT,
  RECORD_TEXT,
  RECORD_WEB_TEXT,
  RISK_TOGGLES,
  answeredMoodText,
  firedRiskLabels,
  moodCardModel,
  moodNoteFor,
  recentRecordRows,
  recordColumns,
  recordLayout,
  recordShowsLochia,
  recordSubtitle,
  resultCards,
  riskFlagsFromForm,
  submitSymptomCheck,
  warningSignGroups,
} from "./recordView";

/** 위험 증상 토글이 모두 꺼진 기록 칸(rules-1.2부터 기록에 남는다) */
const NO_RISK = Object.fromEntries(RISK_SYMPTOM_KEYS.map((k) => [k, false])) as Record<(typeof RISK_SYMPTOM_KEYS)[number], boolean>;

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

  it("걸린 신호가 없을 때의 카드는 iOS 문구를 쓰지 않는다 — 웹 신규 문구로 바꿨다(content.json record_normal, 법률 사전 검토 H5)", () => {
    expect(source).not.toContain(`"${RECORD_NORMAL_RESULT.title}"`);
    expect(source).not.toContain(`"${RECORD_NORMAL_RESULT.body}"`);
  });
});

it("발열 제목은 ℃(U+2103) 한 글자 — rules-1.3에서 오한을 합친 웹 문구", () => {
  expect(RECORD_WEB_TEXT.feverTitle).toBe("열·오한 (38.0℃ 이상)");
  expect(RECORD_WEB_TEXT.feverDescription).toContain("38.0℃");
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
      ...NO_RISK,
    });
  });

  it("위험 증상 — 다량 출혈이 맨 앞, 위기 생각이 맨 뒤(rules-1.3 — 임상 자체 검토 §2의 화면 순서)", () => {
    expect(RISK_TOGGLES.map((t) => t.label)).toEqual([
      "피가 많이 나요",
      "오로(분비물)에서 심한 냄새가 나요",
      "수술·회음부 상처가 심해졌어요",
      "어지러움·실신·균형장애",
      "가슴이 아프거나 숨이 차요",
      "한쪽 다리나 팔이 붓고 아파요",
      "두통이 심하거나 눈이 잘 안 보여요",
      "얼굴이나 손이 갑자기 심하게 부었어요",
      "명치나 오른쪽 윗배가 심하게 아파요",
      "계속 토해서 물도 넘기지 못해요",
      "유방이 붉게 붓고 아픈 게 하루 넘게 이어져요",
      "갑자기 몹시 지치고 힘이 없어요",
      "경련(발작)을 했어요",
      "나 자신이나 아기를 해칠 것 같은 생각이 들어요",
    ]);
    // 기록 필드(domain/types RISK_SYMPTOM_KEYS)마다 토글이 하나씩
    expect([...RISK_TOGGLES.map((t) => t.key)].sort()).toEqual([...RISK_SYMPTOM_KEYS].sort());
  });

  it("기준이 필요한 토글은 설명 줄을 둔다 — 다량 출혈의 양 기준(임상 사전 검토 §3-2 T1)", () => {
    const desc = Object.fromEntries(RISK_TOGGLES.map((t) => [t.key, t.description ?? null]));
    expect(desc.bleedingHeavy).toBe("1시간 안에 패드 1장 이상이 흠뻑 젖거나, 달걀만 한 핏덩이가 나와요");
    expect(desc.headacheVision).toBe(RECORD_WEB_TEXT.headacheVisionHint);
    expect(desc.harmThoughts).toBe(RECORD_WEB_TEXT.harmThoughtsHint);
    expect(desc.dizzinessFainting).toBeNull();
    // rules-1.3 — 넓힌 토글은 넓어진 기준을, 새 토글은 공식 문장의 기준(8시간·하루·평소 피로와 다름)을 설명 줄에
    expect(desc.woundPainWorsening).toBe("점점 더 아프거나, 붉게 붓거나, 고름·냄새 나는 진물이 나오거나, 벌어졌어요");
    expect(desc.chestPainBreathing).toContain("가만히 있어도 심장이 빨리 뛰어요");
    expect(desc.calfPainSwelling).toContain("팔");
    expect(desc.severeVomiting).toContain("8시간");
    expect(desc.breastRedSwollen).not.toBeNull();
    expect(desc.extremeTiredness).toContain("평소 피곤함과 달리");
    expect(desc.lochiaOdor).toBeNull();
  });

  it("산후 10일 전 오로 안내는 '정상'이라고 말하지 않고, 날짜와 상관없는 다량 출혈 체크를 가리킨다", () => {
    expect(RECORD_WEB_TEXT.lochiaEarly).not.toContain("정상");
    expect(RECORD_WEB_TEXT.lochiaEarly).toContain("날짜와 상관없이");
    expect(RECORD_WEB_TEXT.lochiaEarly).toContain("위험 증상");
  });

  it("RECORD_TEXT에는 Swift 원문만 — 바꾼 문구(10일 전 오로 안내·최근 기록 결과 글자, rules-1.3의 발열·위험 증상 제목·상처·가슴·다리 토글)는 RECORD_WEB_TEXT로 옮겼다", () => {
    for (const key of ["lochiaEarly", "recentNormal", "recentFlagged", "feverTitle", "feverDescription", "riskTitle", "woundPain", "chestBreath"]) {
      expect(Object.keys(RECORD_TEXT)).not.toContain(key);
    }
    expect(Object.keys(RECORD_TEXT)).not.toContain("calfSwelling");
  });
});

describe("바로 병원에 가야 하는 신호 목록 — 입력과 상관없는 일반 안내(법률 사전 검토 H5 D-17)", () => {
  const groups = warningSignGroups();

  it("등급 높은 순으로 묶는다 — 119 → 위기 상담 → 즉시 내원, 모든 규칙이 한 번씩", () => {
    expect(groups.map((g) => [g.severity, g.label])).toEqual([
      ["emergency", "119 연락"],
      ["crisis", "위기 상담 연락"],
      ["immediate", "즉시 내원"],
    ]);
    expect(groups.flatMap((g) => g.signs.map((s) => s.code)).sort()).toEqual([...RED_FLAG_CODES].sort());
    expect(groups[0].signs.map((s) => s.code)).toEqual(["heavy_bleeding_dizzy", "seizure", "cardioresp_flag"]);
    expect(groups[1].signs.map((s) => s.code)).toEqual(["harm_thoughts"]);
  });

  it("신호마다 이름과 출처 칩 — 이름은 첫 칩, 출처는 'src:' 칩 그대로", () => {
    for (const sign of groups.flatMap((g) => g.signs)) {
      const flag = content.red_flags.find((f) => f.code === sign.code)!;
      expect(sign.name).toBe(flag.chips[0]);
      expect(sign.sources.length, sign.code).toBeGreaterThan(0);
      expect(sign.sources).toEqual(flag.chips.filter((c) => c.startsWith("src:")));
    }
  });

  it("등급마다 할 일 한 줄 — 위기 상담은 109·1577-0199·119·112", () => {
    for (const g of groups) expect(g.action, g.severity).not.toBe("");
    for (const n of ["109", "1577-0199", "119", "112"]) expect(groups[1].action, n).toContain(n);
  });

  it("규칙 표를 넘기면 그 표로 만든다 — 이름 칩이 없는 규칙은 빼고, 모르는 등급은 글자를 지어내지 않는다", () => {
    const made = warningSignGroups([
      { code: "a", severity: "urgent", message: "m", chips: ["당일 신호", "src:자료"] },
      { code: "b", severity: "urgent", message: "m", chips: ["src:자료"] },
      { code: "c", severity: "later", message: "m", chips: ["다른 신호"] },
    ]);
    expect(made).toEqual([
      { severity: "urgent", label: "당일 진료", action: "오늘 안에 진료를 받으세요.", signs: [{ code: "a", name: "당일 신호", sources: ["src:자료"] }] },
      { severity: "later", label: "", action: "", signs: [{ code: "c", name: "다른 신호", sources: [] }] },
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
      rulesVersion: RULES_VERSION,
      ...NO_RISK,
    });
    expect("id" in newRecord).toBe(false);
  });

  it("기록에 결과를 낸 규칙의 버전을 싣는다 — 신호가 있어도 없어도 같은 버전(result.trace와 같은 값, 감사 추적)", () => {
    const quiet = submitSymptomCheck(INITIAL_SYMPTOM_FORM, "2026-09-13", NOW);
    const flagged = submitSymptomCheck({ ...INITIAL_SYMPTOM_FORM, chestPainBreathing: true }, "2026-09-13", NOW);
    expect(flagged.newRecord.redFlagCode).toBe("cardioresp_flag");
    for (const { newRecord, result } of [quiet, flagged]) {
      expect(newRecord.rulesVersion).toBe(RULES_VERSION);
      expect(newRecord.rulesVersion).toBe(result.trace.configVersion);
    }
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

  it("위험 증상 토글은 판정에 쓰고, 어떤 신호였는지 되짚을 수 있게 기록에도 싣는다(04 §1 저장 권장, 검수 #46)", () => {
    const { newRecord, result } = submitSymptomCheck({ ...INITIAL_SYMPTOM_FORM, dizzinessFainting: true }, "2026-09-01", NOW);
    expect(result.hospitalSignal?.code).toBe("neuro_flag");
    expect(newRecord.redFlagCode).toBe("neuro_flag");
    // 필드명은 SymptomInput(RedFlagEngine.swift:18-21) 그대로 — 폼 값이 boolean으로 들어간다(null은 옛 기록 몫)
    expect(riskFlagsFromForm({ ...INITIAL_SYMPTOM_FORM, dizzinessFainting: true })).toEqual({ ...NO_RISK, dizzinessFainting: true });
    expect(newRecord).toMatchObject({ ...NO_RISK, dizzinessFainting: true });
    // 판정 규칙은 그대로다 — 토글을 기록에 실어도 결과가 달라지지 않는다
    expect(newRecord.painNrs).toBe(0);
  });

  it("다량 출혈·위기 생각 토글도 기록에 싣는다 — 산후 일수와 상관없이(rules-1.2)", () => {
    const { newRecord, result } = submitSymptomCheck({ ...INITIAL_SYMPTOM_FORM, bleedingHeavy: true, harmThoughts: true }, "2026-09-20", NOW);
    expect(newRecord.postpartumDays).toBe(3);
    expect(result.signals.map((s) => s.code)).toEqual(["harm_thoughts", "heavy_bleeding"]);
    expect(newRecord).toMatchObject({ bleedingHeavy: true, harmThoughts: true, redFlagCode: "harm_thoughts" });
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
      rulesVersion: null,
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
    ).toEqual([RECORD_WEB_TEXT.woundPain, RECORD_WEB_TEXT.chestBreath, RECORD_WEB_TEXT.limbSwelling]);
    // rules-1.2·1.3 토글도 같은 화면 순서(다량 출혈이 맨 앞) — omit의 칸은 뺀다(PDF 리포트는 다량 출혈을 따로 칸에 둔다)
    const many = { ...base, ...NO_RISK, bleedingHeavy: true, seizure: true, dizzinessFainting: true, lochiaOdor: true, extremeTiredness: true };
    expect(firedRiskLabels(many)).toEqual([
      RECORD_WEB_TEXT.bleedingHeavy,
      RECORD_WEB_TEXT.lochiaOdor,
      RECORD_TEXT.dizziness,
      RECORD_WEB_TEXT.extremeTiredness,
      RECORD_WEB_TEXT.seizure,
    ]);
    expect(firedRiskLabels(many, ["bleedingHeavy"])).toEqual([
      RECORD_WEB_TEXT.lochiaOdor,
      RECORD_TEXT.dizziness,
      RECORD_WEB_TEXT.extremeTiredness,
      RECORD_WEB_TEXT.seizure,
    ]);
    // rules-1.3 전 기록에는 새 토글 칸이 없다 — 없는 칸은 줄을 그리지 않는다
    expect(firedRiskLabels({ ...base, ...NO_RISK, lochiaOdor: undefined, dizzinessFainting: true })).toEqual([RECORD_TEXT.dizziness]);
    // iOS 넷 중 어지러움만 Swift 원문 그대로, 셋은 rules-1.3 웹 문구
    const label = (key: string) => RISK_TOGGLES.find((t) => t.key === key)?.label;
    expect(["woundPainWorsening", "dizzinessFainting", "chestPainBreathing", "calfPainSwelling"].map(label)).toEqual([
      RECORD_WEB_TEXT.woundPain,
      RECORD_TEXT.dizziness,
      RECORD_WEB_TEXT.chestBreath,
      RECORD_WEB_TEXT.limbSwelling,
    ]);
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
    expect(layout).toMatchObject({ showsClinics: true, cards: [{ code: "fever_infection" }] });
  });

  it("신호 없음 → 카드 없음(신호 없음 안내), 가까운 산부인과 없음", () => {
    expect(recordLayout(normal, 3)).toEqual({ phase: "result", cards: [], showsClinics: false, showsRecent: true });
  });

  const check = (over: Partial<typeof INITIAL_SYMPTOM_FORM>) => submitSymptomCheck({ ...INITIAL_SYMPTOM_FORM, ...over }, "2026-09-01", NOW).result;
  const codes = (over: Partial<typeof INITIAL_SYMPTOM_FORM>) => resultCards(check(over)).map((c) => c.code);

  it("같은 등급의 병원 신호는 모두 카드로(iOS는 대표 하나)", () => {
    expect(codes({ feverEvent: true, calfPainSwelling: true })).toEqual(["fever_infection", "dvt_suspect"]);
    expect(codes({ lochiaOdor: true, severeVomiting: true })).toEqual(["lochia_odor", "severe_vomiting"]);
    // rules-1.3: 흉통·호흡곤란은 119 — 즉시 내원 카드와 겹치지 않고 119 카드만
    expect(codes({ feverEvent: true, chestPainBreathing: true })).toEqual(["cardioresp_flag"]);
    expect(codes({ seizure: true, chestPainBreathing: true })).toEqual(["seizure", "cardioresp_flag"]);
  });

  it("119 신호가 있으면 즉시 내원 카드는 겹쳐 보이지 않는다 — 다량 출혈 + 어지러움 → 119 카드 하나", () => {
    expect(codes({ bleedingHeavy: true, dizzinessFainting: true })).toEqual(["heavy_bleeding_dizzy"]);
    expect(codes({ seizure: true, feverEvent: true })).toEqual(["seizure"]);
  });

  it("위기 상담 카드는 다른 신호가 있어도 늘 — 병원 신호가 함께면 가까운 산부인과도", () => {
    const alone = recordLayout(check({ harmThoughts: true }), 0);
    expect(alone).toMatchObject({ cards: [{ code: "harm_thoughts", severity: "crisis" }], showsClinics: false });
    const withFever = recordLayout(check({ harmThoughts: true, feverEvent: true }), 0);
    expect(withFever).toMatchObject({ cards: [{ code: "harm_thoughts" }, { code: "fever_infection" }], showsClinics: true });
    // 119 신호와 같은 높이 — 평가 순서대로 119 카드가 앞
    expect(codes({ harmThoughts: true, seizure: true, feverEvent: true })).toEqual(["seizure", "harm_thoughts"]);
  });

  it("위기 상담 카드의 전화 — 109(24시간)·1577-0199, 지금 위험하면 119·112", () => {
    expect(CRISIS_CALLS.map((c) => c.number)).toEqual(["109", "1577-0199", "119", "112"]);
    expect(CRISIS_CALLS[0].name).toContain("자살예방상담전화");
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

describe("최근 기록 — 최신 5건 · 날짜 · 해당 없음/병원 확인 신호", () => {
  const rec = (i: number, local: string, redFlagCode: string | null): SymptomRecord => ({
    id: `r${i}`,
    date: kst(local).toISOString(),
    lochiaIncreased: false,
    lochiaRed: false,
    feverEvent: false,
    painNrs: 0,
    redFlagCode,
    postpartumDays: 10,
    rulesVersion: null,
  });

  it("앞 5건만, 순서 그대로", () => {
    const history = Array.from({ length: 7 }, (_, i) => rec(i, `2026-09-${String(23 - i).padStart(2, "0")}T09:00`, null));
    const rows = recentRecordRows(history);
    expect(rows).toHaveLength(RECENT_RECORDS_LIMIT);
    expect(rows.map((r) => r.id)).toEqual(["r0", "r1", "r2", "r3", "r4"]);
  });

  it("글자로도 상태를 말한다", () => {
    const rows = recentRecordRows([rec(1, "2026-09-23T15:05", "fever_infection"), rec(2, "2026-09-22T00:05", null)]);
    expect(rows[0]).toMatchObject({ flagged: true, label: "병원 확인 신호", dateText: "9월 23일 오후 3:05" });
    expect(rows[1]).toMatchObject({ flagged: false, label: "해당 없음", dateText: "9월 22일 오전 12:05" });
  });

  it("켜져 있던 위험 증상 토글이 기록에 있으면 줄 아래 신호 라벨 — 없는(옛) 기록은 빈 배열", () => {
    const rows = recentRecordRows([
      { ...rec(1, "2026-09-23T15:05", "cardioresp_flag"), chestPainBreathing: true, dizzinessFainting: true, woundPainWorsening: false, calfPainSwelling: null },
      rec(2, "2026-09-22T00:05", "fever_infection"),
    ]);
    expect(rows[0].signals).toEqual([RECORD_TEXT.dizziness, RECORD_WEB_TEXT.chestBreath]);
    expect(rows[1].signals).toEqual([]);
  });

  it("읽을 수 없는 날짜는 빈 글자(지어내지 않음)", () => {
    expect(formatMonthDayTime("not-a-date")).toBe("");
  });
});

describe("오늘의 한 가지 질문", () => {
  const check = (local: string, answer: MoodCheckRecord["answer"]): MoodCheckRecord => ({
    id: local,
    date: kst(local).toISOString(),
    questionID: 1,
    answer,
    moodVersion: null,
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
