// 규칙 판(RULES_VERSION·MOOD_VERSION)과 판정 기준값을 묶어 둔다 — 기준값만 바꾸고 판을 올리지 않으면 여기서 멈춘다.
// 결과·기록·내려받기 파일·리포트에 실린 판으로 "그때 어떤 기준으로 판정했는가"를 되짚을 수 있어야 한다(감사 추적).
//
// 기준값을 바꿀 때(임상 자문 회신 등):
//   1) src/rules/version.ts의 RULES_VERSION을 올린다(예: rules-1.2)
//   2) 아래 RULES_FINGERPRINTS에 새 판의 줄을 더한다(옛 판의 줄은 지우지 않는다 — 옛 기록이 그 판을 싣고 있다)
// 기분 문항·기준은 content.json mood_check에 있고 판도 그 안(config_version)에 있다 — JSON을 바꾸면 config_version을 올리고
// 아래 MOOD_FINGERPRINTS에 새 판의 줄을 더한다.

import { describe, expect, it } from "vitest";
import content from "@/content";
import { MOOD_CONSECUTIVE_THRESHOLD, MOOD_QUESTIONS, MOOD_SIGNAL_THRESHOLD, MOOD_WINDOW_DAYS } from "./mood";
import { showsLochiaInputs } from "./record";
import { checkRedFlags, LOCHIA_GATE_DAYS, metrics, PAIN_WATCH_NRS, RED_FLAG_CODES, SEVERE_PAIN_NRS, type SymptomInput } from "./redflag";
import { MOOD_VERSION, RULES_VERSION } from "./version";
import { LOSS_PLAN_BMI, LOSS_PLAN_RETAINED_KG, weightPlan } from "./weight";

/** 판정을 정하는 값 — 기준값 + 레드플래그 평가 순서·심각도(대표 신호를 바꾼다) */
function rulesFingerprint() {
  return {
    LOCHIA_GATE_DAYS,
    SEVERE_PAIN_NRS,
    PAIN_WATCH_NRS,
    LOSS_PLAN_BMI,
    LOSS_PLAN_RETAINED_KG,
    redFlags: RED_FLAG_CODES.map((code) => `${code}:${content.red_flags.find((r) => r.code === code)?.severity}`),
  };
}

/** 판별로 기록해 둔 값 — 판을 올릴 때 줄을 더한다(지우지 않는다) */
const RULES_FINGERPRINTS: Record<string, ReturnType<typeof rulesFingerprint>> = {
  "rules-1.1": {
    LOCHIA_GATE_DAYS: 10,
    SEVERE_PAIN_NRS: 8,
    PAIN_WATCH_NRS: 4,
    LOSS_PLAN_BMI: 23,
    LOSS_PLAN_RETAINED_KG: 4.5,
    redFlags: [
      "pph_suspect:immediate",
      "severe_pain:immediate",
      "fever_infection:immediate",
      "neuro_flag:immediate",
      "cardioresp_flag:immediate",
      "dvt_suspect:immediate",
    ],
  },
};

function moodFingerprint() {
  return {
    windowDays: MOOD_WINDOW_DAYS,
    signalThreshold: MOOD_SIGNAL_THRESHOLD,
    consecutiveThreshold: MOOD_CONSECUTIVE_THRESHOLD,
    questions: MOOD_QUESTIONS.map((q) => `${q.id}:${q.text}`),
  };
}

const MOOD_FINGERPRINTS: Record<string, ReturnType<typeof moodFingerprint>> = {
  "mood-draft-0.1": {
    windowDays: 14,
    signalThreshold: 5,
    consecutiveThreshold: 3,
    questions: [
      "1:아이가 요즘 예뻐 보이나요?",
      "2:오늘 웃은 순간이 있었나요?",
      "3:아기가 잘 때 나도 잠들 수 있었나요?",
      "4:요즘 기다려지는 일이 하나라도 있나요?",
      "5:힘들 때 얘기할 사람이 떠오르나요?",
      "6:오늘 끼니를 챙겨 먹었나요?",
      "7:아기 말고 나를 위한 시간이 잠깐이라도 있었나요?",
    ],
  },
};

describe("RULES_VERSION — 판정 기준값과 짝", () => {
  it(`지금 판(${RULES_VERSION})의 기록과 기준값이 같다 — 기준을 바꿨다면 RULES_VERSION을 올리고 새 판의 줄을 더한다`, () => {
    expect(RULES_FINGERPRINTS[RULES_VERSION], `RULES_FINGERPRINTS에 '${RULES_VERSION}' 줄이 없습니다`).toBeDefined();
    expect(rulesFingerprint()).toEqual(RULES_FINGERPRINTS[RULES_VERSION]);
  });

  it("판의 기록은 판마다 다르다 — 값이 같은 두 판은 판을 올린 까닭이 없다", () => {
    const seen = Object.values(RULES_FINGERPRINTS).map((f) => JSON.stringify(f));
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("이름 붙인 기준값이 실제 판정을 정한다(경계 바로 아래·위)", () => {
    const input = (over: Partial<SymptomInput>): SymptomInput => ({
      postpartumDays: 30,
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
    const code = (over: Partial<SymptomInput>) => checkRedFlags(input(over)).hospitalSignal?.code ?? null;
    const lochia = { lochiaIncreased: true, lochiaRed: true };
    expect(code({ ...lochia, postpartumDays: LOCHIA_GATE_DAYS - 1 })).toBeNull();
    expect(code({ ...lochia, postpartumDays: LOCHIA_GATE_DAYS })).toBe("pph_suspect");
    expect(showsLochiaInputs(LOCHIA_GATE_DAYS - 1)).toBe(false);
    expect(showsLochiaInputs(LOCHIA_GATE_DAYS)).toBe(true);
    expect(code({ painNrs: SEVERE_PAIN_NRS - 1 })).toBeNull();
    expect(code({ painNrs: SEVERE_PAIN_NRS })).toBe("severe_pain");

    const record = { id: "r", date: "2026-09-23T01:00:00.000Z", lochiaIncreased: false, lochiaRed: false, feverEvent: false, redFlagCode: null };
    const pain = (painNrs: number) => metrics({ ...record, painNrs, postpartumDays: 30 }).find((m) => m.name.startsWith("통증"))?.status;
    expect([PAIN_WATCH_NRS - 1, PAIN_WATCH_NRS, SEVERE_PAIN_NRS - 1, SEVERE_PAIN_NRS].map(pain)).toEqual(["normal", "watch", "watch", "alert"]);
    const lochiaMetric = (days: number) => metrics({ ...record, ...lochia, painNrs: 0, postpartumDays: days }).find((m) => m.name === "오로(분비물)")?.status;
    expect(lochiaMetric(LOCHIA_GATE_DAYS - 1)).toBeUndefined();
    expect(lochiaMetric(LOCHIA_GATE_DAYS)).toBe("alert");

    // 키 100cm면 BMI = 체중(kg) — 기준값 그대로 넣어 볼 수 있다
    expect(weightPlan({ heightCm: 100, currentWeightKg: LOSS_PLAN_BMI, prePregnancyWeightKg: 0 })?.kind).toBe("loss");
    expect(weightPlan({ heightCm: 100, currentWeightKg: LOSS_PLAN_BMI - 0.01, prePregnancyWeightKg: 0 })?.kind).toBe("recovery");
    expect(weightPlan({ heightCm: 100, currentWeightKg: 20, prePregnancyWeightKg: 20 - LOSS_PLAN_RETAINED_KG })?.kind).toBe("loss");
    expect(weightPlan({ heightCm: 100, currentWeightKg: 20, prePregnancyWeightKg: 20 - LOSS_PLAN_RETAINED_KG + 0.5 })?.kind).toBe("recovery");
  });

  it("content.json의 규칙 설명 글과 같은 숫자다(설명 글은 판정에 쓰이지 않는다)", () => {
    expect(content.home_metrics.pain_nrs.alert).toBe(`>= ${SEVERE_PAIN_NRS}`);
    expect(content.home_metrics.pain_nrs.watch).toBe(`${PAIN_WATCH_NRS}..${SEVERE_PAIN_NRS - 1}`);
    expect(content.home_metrics.pain_nrs.normal).toBe(`0..${PAIN_WATCH_NRS - 1}`);
    expect(content.weight_plan.rule).toContain(`bmi >= ${LOSS_PLAN_BMI} || retainedKg >= ${LOSS_PLAN_RETAINED_KG}`);
    // 숫자는 같다. 다만 이 설명 글의 "아니면 표시 안 함"은 일수가 없는 옛 기록(항목은 보이되 판정 보류)과 다르다 — 감사 #40, CPO 결정 사항
    expect(content.home_metrics.lochia.gate).toContain(`postpartumDays >= ${LOCHIA_GATE_DAYS}`);
  });
});

describe("MOOD_VERSION — content.json mood_check와 짝", () => {
  it("판은 content.json mood_check.config_version 그대로다", () => {
    expect(MOOD_VERSION).toBe(content.mood_check.config_version);
  });

  it(`지금 판(${MOOD_VERSION})의 기록과 문항·기준이 같다 — 바꿨다면 config_version을 올리고 새 판의 줄을 더한다`, () => {
    expect(MOOD_FINGERPRINTS[MOOD_VERSION], `MOOD_FINGERPRINTS에 '${MOOD_VERSION}' 줄이 없습니다`).toBeDefined();
    expect(moodFingerprint()).toEqual(MOOD_FINGERPRINTS[MOOD_VERSION]);
  });
});
