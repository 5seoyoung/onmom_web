// 체중 목표 — iOS `Models.swift`(bmi · retainedWeightKg · weightPlan)를 옮긴 것.
// 규칙 기반(임상 자문 기준). 허리둘레 기준은 측정이 어려워 제외했다. 문구는 content.json `weight_plan`.

import content from "@/content";
import { compileTemplate, plainText } from "@/content/template";
import type { UserProfile } from "@/domain/types";

type WeightFields = Pick<UserProfile, "heightCm" | "currentWeightKg" | "prePregnancyWeightKg">;

// 감량 목표 기준값(content.json weight_plan.rule "bmi >= 23 || retainedKg >= 4.5"). 바꾸면 RULES_VERSION을 함께 올린다
// (src/rules/version.test.ts가 판마다 기록해 둔 값과 비교한다).

/** BMI 이 값 이상이면 감량 목표 */
export const LOSS_PLAN_BMI = 23;
/** 임신 전보다 이 값(kg) 이상 남았으면 감량 목표 */
export const LOSS_PLAN_RETAINED_KG = 4.5;

/** 체질량지수 — 키·현재 체중이 둘 다 있어야(0이면 미입력). */
export function bmi(p: Pick<UserProfile, "heightCm" | "currentWeightKg">): number | null {
  if (!(p.heightCm > 0) || !(p.currentWeightKg > 0)) return null;
  const m = p.heightCm / 100;
  return p.currentWeightKg / (m * m);
}

/** 임신 전 대비 남은 체중 — 현재·임신 전 체중이 둘 다 있어야. */
export function retainedWeightKg(p: Pick<UserProfile, "currentWeightKg" | "prePregnancyWeightKg">): number | null {
  if (!(p.currentWeightKg > 0) || !(p.prePregnancyWeightKg > 0)) return null;
  return p.currentWeightKg - p.prePregnancyWeightKg;
}

/**
 * Swift `String(format: "%.1f", x)`와 같은 문자열.
 * JS `toFixed`는 정확히 절반(x.x5 — 이진수로 딱 떨어지는 .25/.75)에서 위로 올리고, C printf는 짝수 쪽으로 보낸다
 * (22.25 → iOS "22.2", toFixed "22.3"). 그 외에는 둘 다 정확한 이진값 기준 반올림이라 같다.
 */
export function formatOneDecimal(x: number): string {
  const q = x * 4; // 2의 거듭제곱 곱은 오차가 없다
  if (Number.isInteger(q) && q % 2 !== 0) {
    const lo = Math.floor(x * 10); // x*10 = lo + 0.5 (정확)
    const even = lo % 2 === 0 ? lo : lo + 1;
    return (even / 10).toFixed(1);
  }
  return x.toFixed(1);
}

export interface WeightPlan {
  kind: "loss" | "recovery";
  title: string;
  detail: string;
  chips: string[];
}

// content.json weight_plan.*.chip_templates는 계산값 칩의 틀("BMI {bmi}", "임신 전 +{kg}kg")이고 chips는 고정 칩이다. Swift는 고정 칩
// 목록 맨 앞에 계산한 칩을 넣는다(Models.swift:152-154, :163). 2026-11-08 전에는 chips[0]이 자리표시 글자("BMI x.x 또는 임신 전 +x.xkg")였고
// 여기서 잘라 냈다(감사 #53). 틀·칩 형식이 바뀌면 자리가 빠진 칩이나 옛 자리표시가 화면에 나가지 않도록 모듈 로드(정적 빌드) 때 실패시킨다.
const LEGACY_PLACEHOLDER = "x.x";

function fixedChips(chips: readonly string[], key: string): string[] {
  return chips.map((c, i) => {
    if (c.includes(LEGACY_PLACEHOLDER)) {
      throw new Error(
        `content.json weight_plan.${key}.chips 형식이 바뀌었습니다 — 고정 칩에 '${LEGACY_PLACEHOLDER}' 자리표시가 있으면 안 됩니다(계산값 칩은 chip_templates) (src/rules/weight.ts)`,
      );
    }
    return plainText(`weight_plan.${key}.chips[${i}]`, c);
  });
}

const LOSS_BMI_CHIP = compileTemplate("weight_plan.loss.chip_templates.bmi", content.weight_plan.loss.chip_templates?.bmi, ["bmi"]);
const LOSS_RETAINED_CHIP = compileTemplate("weight_plan.loss.chip_templates.retained", content.weight_plan.loss.chip_templates?.retained, ["kg"]);
const RECOVERY_BMI_CHIP = compileTemplate("weight_plan.recovery.chip_templates.bmi", content.weight_plan.recovery.chip_templates?.bmi, ["bmi"]);
const LOSS_FIXED_CHIPS = fixedChips(content.weight_plan.loss.chips, "loss");
const RECOVERY_FIXED_CHIPS = fixedChips(content.weight_plan.recovery.chips, "recovery");

/**
 * BMI ≥ 23 또는 임신 전보다 4.5kg 이상 남았으면 감량 목표, 그 외는 12개월 복귀 목표.
 * 키+현재 체중이 없으면 null(카드 없음). 비교와 칩 표기는 모두 반올림 전 값으로 한다
 * (160cm·58.8kg → BMI 22.97 → 회복 목표인데 칩은 "BMI 23.0").
 */
export function weightPlan(p: WeightFields): WeightPlan | null {
  const b = bmi(p);
  if (b == null) return null;
  const retained = retainedWeightKg(p);
  const overBMI = b >= LOSS_PLAN_BMI;
  const overRetained = (retained ?? 0) >= LOSS_PLAN_RETAINED_KG;

  if (overBMI || overRetained) {
    const { title, detail } = content.weight_plan.loss;
    const lead = overBMI
      ? [LOSS_BMI_CHIP({ bmi: formatOneDecimal(b) })] // 원문: Models.swift:153
      : retained != null
        ? [LOSS_RETAINED_CHIP({ kg: formatOneDecimal(retained) })] // 원문: Models.swift:154
        : [];
    return { kind: "loss", title, detail, chips: [...lead, ...LOSS_FIXED_CHIPS] };
  }
  const { title, detail } = content.weight_plan.recovery;
  return { kind: "recovery", title, detail, chips: [RECOVERY_BMI_CHIP({ bmi: formatOneDecimal(b) }), ...RECOVERY_FIXED_CHIPS] }; // 원문: Models.swift:163
}
