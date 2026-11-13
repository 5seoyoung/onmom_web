import { describe, expect, it } from "vitest";
import content from "@/content";
import { METRIC_STATUS_LABEL, severityLabel, splitFirstSentence } from "./labels";

describe("METRIC_STATUS_LABEL", () => {
  it("iOS 원문(정상/관찰/확인 필요)을 바꾼 중립 라벨 — 건강 상태를 평가하는 말이 없다(법률 사전 검토 H5)", () => {
    expect(METRIC_STATUS_LABEL).toEqual({ normal: "해당 없음", watch: "살펴볼 신호", alert: "병원 확인 신호" });
    for (const label of Object.values(METRIC_STATUS_LABEL)) {
      for (const word of ["정상", "양호", "이상 없", "안전"]) expect(label).not.toContain(word);
    }
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
  it("home_footer를 나누면 DisclaimerBanner 두 줄 — 2026-11-13 식약처 웰니스 판단기준 권고 주의 문구 + 참고용 한 줄", () => {
    expect(splitFirstSentence(content.disclaimers.home_footer)).toEqual([
      "온맘은 의료기기가 아니므로 질병 유무를 판단할 수 없으며, 질병 유무 판단을 위해서는 의사의 검진이 필요합니다.",
      "제공되는 정보는 참고용입니다.",
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
