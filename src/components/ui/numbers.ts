// 숫자 입력 컴포넌트(NRS 슬라이더·키/체중 필드)의 순수 변환 함수.

import { clampNrs } from "@/rules/record";

export const NRS_MIN = 0;
export const NRS_MAX = 10;

/**
 * 통증 NRS — 0~10 정수로 맞춘다(iOS Slider step 1). 숫자가 아니면 0.
 * 소수는 반올림이 아니라 버린다: Swift `Int(pain)`(RecordFlowView.swift:207·308)과 같아야
 * 보이는 숫자와 저장·판정(painNrs)에 쓰이는 숫자가 어긋나지 않는다(예: 7.5 → 7).
 * 그래서 판정 쪽(rules/record.ts)과 같은 함수 하나를 쓴다.
 */
export { clampNrs };

/** "3/10" — RecordFlowView.swift:207 `"\(Int(pain))/10"` */
export function formatNrs(value: number): string {
  return `${clampNrs(value)}/${NRS_MAX}`;
}

/**
 * 키·체중 입력 중인 글자를 소수 형태로 거른다: 숫자와 첫 소수점만 남긴다.
 * 쉼표 소수점(일부 키보드)은 점으로 바꾼다. "58." 같은 입력 중간 상태는 그대로 둔다.
 */
export function sanitizeDecimalInput(text: string): string {
  let seenDot = false;
  let out = "";
  for (const ch of text.replace(/,/g, ".")) {
    if (ch >= "0" && ch <= "9") {
      out += ch;
    } else if (ch === "." && !seenDot) {
      seenDot = true;
      out += ch;
    }
  }
  return out;
}

/** 입력 글자 → 저장값. 0을 "미입력"으로 쓰는 필드라(Components.swift:117), 비었거나 읽을 수 없으면 0. */
export function parseMeasurement(text: string): number {
  const cleaned = sanitizeDecimalInput(text);
  if (cleaned === "" || cleaned === ".") return 0;
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** 저장값 → 입력 칸 글자. 0(미입력)이면 빈칸이라 placeholder가 보인다. */
export function formatMeasurement(value: number): string {
  return Number.isFinite(value) && value > 0 ? String(value) : "";
}
