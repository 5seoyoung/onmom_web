import { describe, expect, it } from "vitest";
import { compileTemplate, plainText } from "./template";

describe("compileTemplate — content.json 문구 틀", () => {
  it("자리에 값을 넣는다(숫자는 그대로 글자로, '$' 같은 글자도 그대로)", () => {
    expect(compileTemplate("t", "통증 NRS {nrs}/10", ["nrs"])({ nrs: 7 })).toBe("통증 NRS 7/10");
    expect(compileTemplate("t", "{a}·{b}", ["a", "b"])({ a: "$&", b: "$1" })).toBe("$&·$1");
  });

  it("이름마다 자리가 꼭 하나, 모르는 자리는 없어야 한다 — 어긋나면 위치를 담아 실패", () => {
    expect(() => compileTemplate("ui.x", "BMI", ["bmi"])).toThrow(/content\.json ui\.x 형식/);
    expect(() => compileTemplate("ui.x", "{bmi} {bmi}", ["bmi"])).toThrow(/ui\.x/);
    expect(() => compileTemplate("ui.x", "{bmi} {kg}", ["bmi"])).toThrow(/ui\.x/);
    expect(() => compileTemplate("ui.x", undefined, ["bmi"])).toThrow(/ui\.x/);
  });

  it("plainText — 자리표시가 없는 글자만 그대로", () => {
    expect(plainText("t", "12개월 복귀")).toBe("12개월 복귀");
    expect(() => plainText("ui.y", "BMI {bmi}")).toThrow(/ui\.y/);
  });
});
