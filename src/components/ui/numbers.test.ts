import { describe, expect, it } from "vitest";
import { clampNrs, formatMeasurement, formatNrs, parseMeasurement, sanitizeDecimalInput } from "./numbers";

describe("clampNrs / formatNrs", () => {
  it("0~10 정수로 맞춘다", () => {
    expect(clampNrs(0)).toBe(0);
    expect(clampNrs(10)).toBe(10);
    expect(clampNrs(-3)).toBe(0);
    expect(clampNrs(12)).toBe(10);
    expect(clampNrs(Number.NaN)).toBe(0);
  });

  it("소수는 버린다 — Swift Int(pain)과 같게(반올림 아님)", () => {
    expect(clampNrs(3.6)).toBe(3);
    expect(clampNrs(7.5)).toBe(7);
    expect(clampNrs(9.99)).toBe(9);
    expect(clampNrs(-0.5)).toBe(0);
    expect(formatNrs(7.5)).toBe("7/10");
  });

  it('"n/10" 표기', () => {
    expect(formatNrs(0)).toBe("0/10");
    expect(formatNrs(7)).toBe("7/10");
  });
});

describe("sanitizeDecimalInput", () => {
  it("숫자와 첫 소수점만 남긴다", () => {
    expect(sanitizeDecimalInput("58.5")).toBe("58.5");
    expect(sanitizeDecimalInput("58.")).toBe("58.");
    expect(sanitizeDecimalInput("5a8.5.1kg")).toBe("58.51");
    expect(sanitizeDecimalInput("-12")).toBe("12");
  });

  it("쉼표 소수점은 점으로", () => {
    expect(sanitizeDecimalInput("58,5")).toBe("58.5");
  });
});

describe("parseMeasurement / formatMeasurement — 0은 미입력", () => {
  it("빈칸·읽을 수 없는 입력은 0", () => {
    expect(parseMeasurement("")).toBe(0);
    expect(parseMeasurement(".")).toBe(0);
    expect(parseMeasurement("abc")).toBe(0);
    expect(parseMeasurement("0")).toBe(0);
  });

  it("숫자로 읽는다", () => {
    expect(parseMeasurement("160")).toBe(160);
    expect(parseMeasurement("58.")).toBe(58);
    expect(parseMeasurement("058.5")).toBe(58.5);
  });

  it("0이면 빈칸이라 placeholder가 보인다", () => {
    expect(formatMeasurement(0)).toBe("");
    expect(formatMeasurement(Number.NaN)).toBe("");
    expect(formatMeasurement(-1)).toBe("");
    expect(formatMeasurement(58.5)).toBe("58.5");
  });

  it("왕복해도 값이 같다", () => {
    for (const v of [0, 1, 58.5, 160, 72.25]) {
      expect(parseMeasurement(formatMeasurement(v))).toBe(v);
    }
  });
});
