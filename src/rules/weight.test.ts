import { afterEach, describe, expect, it, vi } from "vitest";
import { bmi, formatOneDecimal, retainedWeightKg, weightPlan } from "./weight";

// 기대값은 Models.swift 로직을 Swift 6.2로 직접 실행해 얻은 값이다(문서 표기가 아니라).
const p = (heightCm: number, currentWeightKg: number, prePregnancyWeightKg = 0) => ({
  heightCm,
  currentWeightKg,
  prePregnancyWeightKg,
});

const LOSS_TAIL = ["주당 0.5kg", "유산소(걷기)", "6개월 5~10% 감량"];
const LOSS_TITLE = "체중 감량 목표";
const RECOVERY_TITLE = "체중 회복 목표";

describe("bmi · retainedWeightKg", () => {
  it("키·현재 체중이 있어야 BMI", () => {
    expect(bmi(p(162, 64))).toBeCloseTo(24.3865, 4);
    expect(bmi(p(160, 0))).toBeNull();
    expect(bmi(p(0, 60))).toBeNull();
  });
  it("현재·임신 전 체중이 있어야 남은 체중", () => {
    expect(retainedWeightKg(p(160, 64, 56))).toBe(8);
    expect(retainedWeightKg(p(160, 64, 0))).toBeNull();
  });
});

describe("weightPlan — 02 §11 벡터", () => {
  it("162cm 64kg 임신 전 56 → BMI 24.4 · 감량 목표", () => {
    const plan = weightPlan(p(162, 64, 56))!;
    expect(plan.kind).toBe("loss");
    expect(plan.title).toBe(LOSS_TITLE);
    expect(plan.detail).toBe(
      "주당 0.5kg 감량을 목표로 걷기 등 유산소 운동을 권해요. 6개월에 걸쳐 체중의 5~10%를 줄이는 걸 목표로 해요.",
    );
    expect(plan.chips).toEqual(["BMI 24.4", ...LOSS_TAIL]);
  });

  it("160cm 52kg 임신 전 50 → BMI 20.3 · 회복 목표(+2.0kg은 칩에 없다)", () => {
    const plan = weightPlan(p(160, 52, 50))!;
    expect(plan.kind).toBe("recovery");
    expect(plan.title).toBe(RECOVERY_TITLE);
    expect(plan.detail).toBe(
      "출산 후 12개월에 걸쳐 임신 전 체중으로 돌아가는 걸 목표로, 회복 단계에 맞는 운동을 이어가요.",
    );
    expect(plan.chips).toEqual(["BMI 20.3", "12개월 복귀"]);
  });

  it("키만 입력 → 카드 없음", () => {
    expect(weightPlan(p(160, 0, 0))).toBeNull();
    expect(weightPlan(p(0, 60, 50))).toBeNull();
  });
});

describe("weightPlan — 경계", () => {
  it("160cm 58.8kg → BMI 22.97이라 회복 목표, 칩은 반올림한 'BMI 23.0'", () => {
    expect(weightPlan(p(160, 58.8))).toMatchObject({ kind: "recovery", chips: ["BMI 23.0", "12개월 복귀"] });
  });

  it("BMI 정확히 23 → 감량 목표", () => {
    expect(weightPlan(p(200, 92))).toMatchObject({ kind: "loss", chips: ["BMI 23.0", ...LOSS_TAIL] });
    expect(weightPlan(p(150, 51.75))).toMatchObject({ kind: "loss", chips: ["BMI 23.0", ...LOSS_TAIL] });
  });

  it("남은 체중 정확히 4.5kg → 감량 목표, 칩 첫 항목은 '임신 전 +4.5kg'", () => {
    expect(weightPlan(p(160, 54.5, 50))).toMatchObject({ kind: "loss", chips: ["임신 전 +4.5kg", ...LOSS_TAIL] });
    // 58.8 − 54.3 도 부동소수 계산으로 4.5 이상(Swift와 같다)
    expect(weightPlan(p(160, 58.8, 54.3))).toMatchObject({ kind: "loss", chips: ["임신 전 +4.5kg", ...LOSS_TAIL] });
  });

  it("남은 체중 4.4kg → 회복 목표", () => {
    expect(weightPlan(p(160, 54.4, 50))).toMatchObject({ kind: "recovery", chips: ["BMI 21.2", "12개월 복귀"] });
  });

  it("BMI ≥ 23과 남은 체중 ≥ 4.5가 함께면 BMI 칩", () => {
    expect(weightPlan(p(162, 64, 56))!.chips[0]).toBe("BMI 24.4");
  });

  it("칩 반올림은 iOS printf와 같다(정확히 절반은 짝수 쪽)", () => {
    expect(weightPlan(p(170, 60.25, 55))!.chips[0]).toBe("임신 전 +5.2kg");
    expect(weightPlan(p(100, 22.25))!.chips[0]).toBe("BMI 22.2");
  });
});

describe("formatOneDecimal — String(format: \"%.1f\")", () => {
  it("Swift 실측값과 같다", () => {
    const cases: [number, string][] = [
      [22.25, "22.2"],
      [22.75, "22.8"],
      [5.25, "5.2"],
      [4.75, "4.8"],
      [0.25, "0.2"],
      [0.35, "0.3"],
      [23.05, "23.1"],
      [22.95, "22.9"],
      [24.386526444139612, "24.4"],
      [22.968749999999993, "23.0"],
      [-0.25, "-0.2"],
    ];
    for (const [x, s] of cases) expect(formatOneDecimal(x)).toBe(s);
  });
});

// 감사 #53으로 content.json 칩 자리표시가 바뀌어도 고정 칩("주당 0.5kg", "12개월 복귀")이 조용히 잘려 나가지 않는지 본다.
describe("content.json 칩 형식 방어", () => {
  afterEach(() => {
    vi.doUnmock("@/content");
    vi.resetModules();
  });

  type WP = (typeof import("@/content"))["default"]["weight_plan"];
  async function loadWith(edit: (wp: WP) => WP) {
    vi.resetModules();
    const real = (await vi.importActual<typeof import("@/content")>("@/content")).default;
    vi.doMock("@/content", () => ({ default: { ...real, weight_plan: edit(real.weight_plan) } }));
    return import("./weight");
  }

  it("자리표시가 빠진 감량 칩이면 로드 때 실패", async () => {
    await expect(
      loadWith((wp) => ({ ...wp, loss: { ...wp.loss, chips: wp.loss.chips.slice(1) } })),
    ).rejects.toThrow(/weight_plan\.loss\.chips/);
  });

  it("자리표시가 빠진 회복 칩이면 로드 때 실패", async () => {
    await expect(
      loadWith((wp) => ({ ...wp, recovery: { ...wp.recovery, chips: wp.recovery.chips.slice(1) } })),
    ).rejects.toThrow(/weight_plan\.recovery\.chips/);
  });

  it("자리표시가 첫 칩이 아니면 로드 때 실패", async () => {
    await expect(
      loadWith((wp) => ({ ...wp, loss: { ...wp.loss, chips: [...wp.loss.chips.slice(1), wp.loss.chips[0]] } })),
    ).rejects.toThrow(/weight_plan\.loss\.chips/);
  });
});
