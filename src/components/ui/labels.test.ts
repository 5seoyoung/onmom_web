import { describe, expect, it } from "vitest";
import content from "@/content";
import { METRIC_STATUS_LABEL, severityLabel, splitFirstSentence } from "./labels";

describe("METRIC_STATUS_LABEL", () => {
  it("Models.swift:57-63 원문과 같다", () => {
    expect(METRIC_STATUS_LABEL).toEqual({ normal: "정상", watch: "관찰", alert: "확인 필요" });
  });
});

describe("severityLabel", () => {
  it("EngineLabel.severity 원문", () => {
    expect(severityLabel("immediate")).toBe("즉시 내원");
    expect(severityLabel("urgent")).toBe("당일 진료");
  });

  it("모르는 코드는 null — 원시 코드를 화면에 내지 않는다(iOS는 코드를 그대로 냈다)", () => {
    expect(severityLabel("other")).toBeNull();
  });

  it("content.json 레드플래그 severity는 모두 라벨이 있다", () => {
    for (const flag of content.red_flags) {
      expect(severityLabel(flag.severity)).not.toBeNull();
    }
  });
});

describe("splitFirstSentence", () => {
  it("home_footer를 나누면 DisclaimerBanner 두 줄 원문(AnalyzeComponents.swift:124·127)과 글자까지 같다", () => {
    expect(splitFirstSentence(content.disclaimers.home_footer)).toEqual([
      "온맘은 의료기기가 아니며, 제공되는 정보는 참고용입니다.",
      "진단·치료에 관한 판단은 반드시 의료진과 상담하세요.",
    ]);
  });

  it("문장이 하나면 한 줄 그대로", () => {
    expect(splitFirstSentence("한 문장입니다.")).toEqual(["한 문장입니다."]);
    expect(splitFirstSentence("  마침표 없음 ")).toEqual(["마침표 없음"]);
  });

  it("첫 문장에서만 나눈다", () => {
    expect(splitFirstSentence("가. 나. 다.")).toEqual(["가.", "나. 다."]);
  });

  it("숫자 소수점에서는 나누지 않는다", () => {
    expect(splitFirstSentence("38.0℃ 이상이에요. 병원에 가세요.")).toEqual(["38.0℃ 이상이에요.", "병원에 가세요."]);
  });
});
