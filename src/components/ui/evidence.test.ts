import { describe, expect, it } from "vitest";
import content from "@/content";
import { parseEvidenceToken } from "./evidence";

describe("parseEvidenceToken", () => {
  it("src: 접두를 떼고 출처 칩으로 표시한다", () => {
    expect(parseEvidenceToken("src:임산부수첩 2023")).toEqual({ text: "임산부수첩 2023", isSource: true });
  });

  it("접두가 없으면 근거 설명 칩", () => {
    expect(parseEvidenceToken("오로 증가+선홍색(10일 후)")).toEqual({
      text: "오로 증가+선홍색(10일 후)",
      isSource: false,
    });
  });

  it("접두는 맨 앞에 있을 때만 인정한다(iOS hasPrefix)", () => {
    expect(parseEvidenceToken(" src:x").isSource).toBe(false);
    expect(parseEvidenceToken("SRC:x").isSource).toBe(false);
    expect(parseEvidenceToken("근거 src:x")).toEqual({ text: "근거 src:x", isSource: false });
  });

  it("content.json 레드플래그 칩은 설명 칩과 출처 칩으로 나뉜다", () => {
    const parsed = content.red_flags[0].chips.map(parseEvidenceToken);
    expect(parsed).toEqual([
      { text: "오로 증가+선홍색(10일 후)", isSource: false },
      { text: "임산부수첩 2023", isSource: true },
    ]);
  });
});
