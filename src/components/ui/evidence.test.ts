import { describe, expect, it } from "vitest";
import content from "@/content";
import { parseEvidenceToken, splitEvidenceTokens } from "./evidence";

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
      { text: "오로 증가 또는 선홍색(10일 후)", isSource: false },
      { text: "임산부수첩 2023", isSource: true },
      { text: "NICE NG194", isSource: true },
    ]);
  });
});

describe("splitEvidenceTokens — 설명 칩은 보이고, 출처는 한곳에 모은다(2026-11-15 산부인과 전문의 화면 검토)", () => {
  it("설명 칩은 순서·글자 그대로, 출처는 접두를 뗀 이름", () => {
    expect(splitEvidenceTokens(["오로 증가", "src:임산부수첩 2023", "수유 가능", "src:NICE NG194"])).toEqual({
      notes: ["오로 증가", "수유 가능"],
      sources: ["임산부수첩 2023", "NICE NG194"],
    });
  });

  it("여러 신호의 출처를 합치면 중복 없이 처음 나온 순서로", () => {
    const tokens = ["a", "src:CDC Hear Her 2024", "src:AWHONN 2018", "b", "src:AWHONN 2018", "src:CDC Hear Her 2024", "src:NICE NG194"];
    expect(splitEvidenceTokens(tokens).sources).toEqual(["CDC Hear Her 2024", "AWHONN 2018", "NICE NG194"]);
  });

  it("' · '로 묶인 출처(회복 가이드 카드)는 하나씩 나눈다 — 빈 조각은 뺀다", () => {
    expect(splitEvidenceTokens(["src:임산부수첩 2023 · NICE NG194", "src:NICE NG194 ·  · CDC"]).sources).toEqual([
      "임산부수첩 2023",
      "NICE NG194",
      "CDC",
    ]);
    expect(splitEvidenceTokens(["src:", "src:  "])).toEqual({ notes: [], sources: [] });
  });

  it("설명 칩은 겹쳐도 그대로 둔다(화면에 보이던 칩을 바꾸지 않는다)", () => {
    expect(splitEvidenceTokens(["회피", "회피"]).notes).toEqual(["회피", "회피"]);
  });

  it("content.json 레드플래그 전체의 출처 합집합 — 문헌 이름만, 겹침 없음", () => {
    const { notes, sources } = splitEvidenceTokens(content.red_flags.flatMap((flag) => flag.chips));
    expect(new Set(sources).size).toBe(sources.length);
    expect(sources).toEqual(expect.arrayContaining(["임산부수첩 2023", "NICE NG194", "CDC Hear Her 2024", "AWHONN 2018"]));
    for (const note of notes) expect(note.startsWith("src:"), note).toBe(false);
  });
});
