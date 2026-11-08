// 기록 고치기 — 고친 답으로 지금 규칙을 다시 돌리고, 기록 시점의 산후 일수는 그대로(rules/record rebuildSymptomRecord).
import { describe, expect, it } from "vitest";
import { RISK_SYMPTOM_KEYS, type SymptomRecord } from "@/domain/types";
import { buildSymptomRecord, formFromRecord, rebuildSymptomRecord, recordAsksLochia, type SymptomForm } from "./record";
import { RULES_VERSION } from "./version";

const OFF: SymptomForm = {
  lochiaIncreased: false,
  lochiaRed: false,
  feverEvent: false,
  painNrs: 0,
  ...(Object.fromEntries(RISK_SYMPTOM_KEYS.map((k) => [k, false])) as Record<(typeof RISK_SYMPTOM_KEYS)[number], boolean>),
};

function record(over: Partial<SymptomRecord> = {}): SymptomRecord {
  return { id: "r", date: "2026-11-01T01:00:00.000Z", lochiaIncreased: false, lochiaRed: false, feverEvent: false, painNrs: 1, redFlagCode: null, postpartumDays: 20, rulesVersion: "rules-1.0", ...over };
}

describe("rebuildSymptomRecord", () => {
  it("고친 답으로 결과·규칙 버전을 다시 낸다 — 산후 일수는 그 기록의 것", () => {
    const { values, result } = rebuildSymptomRecord(record({ postpartumDays: 20 }), { ...OFF, feverEvent: true });
    expect(values.redFlagCode).toBe("fever_infection");
    expect(values.rulesVersion).toBe(RULES_VERSION);
    expect(values.postpartumDays).toBe(20);
    expect(result.hospitalSignal?.code).toBe("fever_infection");
  });

  it("새 기록과 같은 규칙 — 같은 일수·같은 답이면 같은 값", () => {
    const form = { ...OFF, lochiaIncreased: true, lochiaRed: true, painNrs: 4 };
    const fresh = buildSymptomRecord(form, "2026-10-12", new Date("2026-11-01T10:00:00+09:00")).record;
    const { values } = rebuildSymptomRecord({ postpartumDays: fresh.postpartumDays }, form);
    const { date: _date, ...freshValues } = fresh;
    void _date;
    expect(values).toEqual(freshValues);
  });

  it("산후 10일 전의 기록 — 오로 답은 남기지 않는다(묻지 않는 질문)", () => {
    const { values } = rebuildSymptomRecord(record({ postpartumDays: 5 }), { ...OFF, lochiaIncreased: true, lochiaRed: true });
    expect(values.lochiaIncreased).toBe(false);
    expect(values.lochiaRed).toBe(false);
    expect(values.redFlagCode).toBeNull();
  });

  it("산후 일수를 모르는 옛 기록 — 오로 답은 그대로 두고 판정에서만 뺀다(홈 지표의 판정 보류와 같다)", () => {
    const { values } = rebuildSymptomRecord(record({ postpartumDays: null }), { ...OFF, lochiaIncreased: true, lochiaRed: true });
    expect(values.lochiaIncreased).toBe(true);
    expect(values.lochiaRed).toBe(true);
    expect(values.postpartumDays).toBeNull();
    expect(values.redFlagCode).toBeNull();
  });

  it("위험 증상 토글은 판정에 쓴 값 그대로 남는다(rules-1.2)", () => {
    const { values } = rebuildSymptomRecord(record(), { ...OFF, chestPainBreathing: true });
    expect(values.chestPainBreathing).toBe(true);
    expect(values.redFlagCode).not.toBeNull();
    for (const k of RISK_SYMPTOM_KEYS) expect(typeof values[k]).toBe("boolean");
  });
});

describe("formFromRecord·recordAsksLochia", () => {
  it("기록의 답이 폼의 처음 값 — 칸이 없는 위험 증상(옛 기록)은 꺼짐", () => {
    const form = formFromRecord(record({ feverEvent: true, painNrs: 6, seizure: true }));
    expect(form).toMatchObject({ feverEvent: true, painNrs: 6, seizure: true, harmThoughts: false, bleedingHeavy: false });
  });

  it("오로 질문 — 10일 이상이거나 일수를 모르는 옛 기록", () => {
    expect(recordAsksLochia({ postpartumDays: 9 })).toBe(false);
    expect(recordAsksLochia({ postpartumDays: 10 })).toBe(true);
    expect(recordAsksLochia({ postpartumDays: null })).toBe(true);
  });
});
