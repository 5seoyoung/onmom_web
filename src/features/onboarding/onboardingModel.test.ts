import { describe, expect, it } from "vitest";
import { defaultProfile, initialState } from "@/store/defaults";
import * as S from "@/store/state";
import { weightPlan } from "@/rules/weight";
import {
  bottomButtonTitle,
  canProceed,
  completionPatch,
  deliveryDateHint,
  DELIVERY_OPTIONS,
  GOAL_OPTIONS,
  initialDraft,
  isDeliveryDatePicked,
  isReturnDatePicked,
  nextStep,
  ONBOARDING_TEXT,
  previousStep,
  returnDateHint,
  showsReturnDateCard,
  type OnboardingDraft,
} from "./onboardingModel";

const TODAY = "2026-09-27";

function draft(over: Partial<OnboardingDraft> = {}): OnboardingDraft {
  return { ...initialDraft(defaultProfile()), ...over };
}

describe("initialDraft", () => {
  it("기본 프로필 → 아무것도 고르지 않은 상태(모유수유만 켬)", () => {
    expect(initialDraft(defaultProfile())).toEqual({
      deliveryDate: "",
      deliveryMethod: null,
      isBreastfeeding: true,
      goal: null,
      returnToWorkDate: "",
      heightCm: 0,
      currentWeightKg: 0,
      prePregnancyWeightKg: 0,
      consentAccepted: false,
    });
  });

  it("저장된 값이 있으면 이어서 보여준다", () => {
    const d = initialDraft({ ...defaultProfile(), deliveryDate: "2026-09-01", deliveryMethod: "cesarean", heightCm: 160 });
    expect(d.deliveryDate).toBe("2026-09-01");
    expect(d.deliveryMethod).toBe("cesarean");
    expect(d.heightCm).toBe(160);
  });
});

describe("출산일", () => {
  it("비었거나 형식이 틀리면 고르지 않은 것", () => {
    expect(isDeliveryDatePicked("", TODAY)).toBe(false);
    expect(isDeliveryDatePicked("2026-02-31", TODAY)).toBe(false);
    expect(isDeliveryDatePicked("2026/09/01", TODAY)).toBe(false);
  });

  it("오늘까지 고를 수 있고 내일은 안 된다(in: ...Date())", () => {
    expect(isDeliveryDatePicked("2026-09-27", TODAY)).toBe(true);
    expect(isDeliveryDatePicked("2025-12-31", TODAY)).toBe(true);
    expect(isDeliveryDatePicked("2026-09-28", TODAY)).toBe(false);
  });

  it("오늘을 아직 모르면(서버 렌더) 고르지 않은 것", () => {
    expect(isDeliveryDatePicked("2026-09-01", "")).toBe(false);
  });

  it("안내 문구 — 고르기 전에는 강조", () => {
    expect(deliveryDateHint(false)).toEqual({ text: "날짜를 눌러 선택해주세요", emphasized: true });
    expect(deliveryDateHint(true)).toEqual({ text: "회복 주차 계산에 사용돼요", emphasized: false });
  });
});

describe("복직 예정일", () => {
  it("'복직 예정'일 때만 카드", () => {
    expect(showsReturnDateCard({ goal: null })).toBe(false);
    expect(showsReturnDateCard({ goal: "homemaker" })).toBe(false);
    expect(showsReturnDateCard({ goal: "returningToWork" })).toBe(true);
  });

  it("날짜 범위 제한 없음 — 형식만 본다", () => {
    expect(isReturnDatePicked("")).toBe(false);
    expect(isReturnDatePicked("2027-01-02")).toBe(true);
    expect(isReturnDatePicked("2020-01-02")).toBe(true);
  });

  it("안내 문구", () => {
    expect(returnDateHint("")).toBe("고르면 홈에 남은 기간이 표시돼요");
    expect(returnDateHint("2027-01-02")).toBe("홈 화면에 남은 기간을 표시해요");
  });
});

describe("하단 버튼", () => {
  it("글자", () => {
    expect(bottomButtonTitle(0)).toBe("시작하기");
    expect(bottomButtonTitle(1)).toBe("다음");
    expect(bottomButtonTitle(2)).toBe("다음");
    expect(bottomButtonTitle(3)).toBe("온맘 시작하기");
  });

  it("0단계는 늘 켜짐", () => {
    expect(canProceed(0, draft(), TODAY)).toBe(true);
  });

  it("1단계: 분만 방식과 출산일을 모두 골라야", () => {
    expect(canProceed(1, draft(), TODAY)).toBe(false);
    expect(canProceed(1, draft({ deliveryMethod: "vaginal" }), TODAY)).toBe(false);
    expect(canProceed(1, draft({ deliveryDate: "2026-09-20" }), TODAY)).toBe(false);
    expect(canProceed(1, draft({ deliveryMethod: "vaginal", deliveryDate: "2026-09-20" }), TODAY)).toBe(true);
    expect(canProceed(1, draft({ deliveryMethod: "vaginal", deliveryDate: "2026-10-01" }), TODAY)).toBe(false);
  });

  it("2단계: 목표를 골라야(복직 예정일·체중은 선택)", () => {
    expect(canProceed(2, draft(), TODAY)).toBe(false);
    expect(canProceed(2, draft({ goal: "returningToWork" }), TODAY)).toBe(true);
  });

  it("3단계: 동의를 켜야", () => {
    expect(canProceed(3, draft(), TODAY)).toBe(false);
    expect(canProceed(3, draft({ consentAccepted: true }), TODAY)).toBe(true);
  });

  it("단계 이동 — 첫 단계에는 이전이 없다", () => {
    expect(nextStep(0)).toBe(1);
    expect(nextStep(3)).toBe(3);
    expect(previousStep(0)).toBeNull();
    expect(previousStep(1)).toBe(0);
    expect(previousStep(3)).toBe(2);
  });
});

describe("completionPatch — [온맘 시작하기] 때 한 번에 저장", () => {
  const complete = draft({
    deliveryDate: "2026-09-01",
    deliveryMethod: "cesarean",
    isBreastfeeding: false,
    goal: "returningToWork",
    returnToWorkDate: "2027-03-02",
    heightCm: 160,
    currentWeightKg: 62.5,
    prePregnancyWeightKg: 55,
    consentAccepted: true,
  });

  it("동의 전·필수값 없으면 저장하지 않는다", () => {
    expect(completionPatch({ ...complete, consentAccepted: false }, TODAY)).toBeNull();
    expect(completionPatch({ ...complete, deliveryDate: "" }, TODAY)).toBeNull();
    expect(completionPatch({ ...complete, deliveryMethod: null }, TODAY)).toBeNull();
    expect(completionPatch({ ...complete, goal: null }, TODAY)).toBeNull();
  });

  it("모든 입력을 프로필로", () => {
    expect(completionPatch(complete, TODAY)).toEqual({
      deliveryDate: "2026-09-01",
      deliveryMethod: "cesarean",
      isBreastfeeding: false,
      goal: "returningToWork",
      returnToWorkDate: "2027-03-02",
      heightCm: 160,
      currentWeightKg: 62.5,
      prePregnancyWeightKg: 55,
      consentAccepted: true,
    });
  });

  it("복직 예정일을 고르지 않았으면 null", () => {
    expect(completionPatch({ ...complete, returnToWorkDate: "" }, TODAY)?.returnToWorkDate).toBeNull();
  });

  it("스토어에 넣으면 온보딩 완료 상태가 된다(저장 → 완료 순)", () => {
    const patch = completionPatch(complete, TODAY);
    expect(patch).not.toBeNull();
    const s = S.completeOnboarding(S.updateProfile(initialState(), patch!));
    expect(s.hasOnboarded).toBe(true);
    expect(s.profile).toMatchObject({
      deliveryDate: "2026-09-01",
      deliveryMethod: "cesarean",
      isBreastfeeding: false,
      goal: "returningToWork",
      returnToWorkDate: "2027-03-02",
      heightCm: 160,
      currentWeightKg: 62.5,
      prePregnancyWeightKg: 55,
      consentAccepted: true,
    });
  });
});

describe("체중 관리 카드 미리보기(감사 #36)", () => {
  it("키·현재 체중이 없으면 계획 없음", () => {
    expect(weightPlan(draft({ heightCm: 160 }))).toBeNull();
  });

  it("입력하면 계획 제목·설명", () => {
    const plan = weightPlan(draft({ heightCm: 160, currentWeightKg: 62.5, prePregnancyWeightKg: 55 }));
    expect(plan?.kind).toBe("loss");
    expect(plan?.title).toBeTruthy();
    expect(plan?.detail).toBeTruthy();
  });
});

describe("Swift 원문", () => {
  it("선택지 순서·글자", () => {
    // 온보딩 분만 방식 행은 제목만(OnboardingFlowView.swift:169-175) — 부제를 싣지 않는다
    expect(DELIVERY_OPTIONS).toEqual([
      { value: "vaginal", title: "자연분만" },
      { value: "cesarean", title: "제왕절개" },
    ]);
    expect(DELIVERY_OPTIONS.every((o) => !("subtitle" in o))).toBe(true);
    expect(GOAL_OPTIONS.map((o) => [o.title, o.subtitle])).toEqual([
      ["전업", "복직 일정 없이 회복에 집중해요"],
      ["복직 예정", "복직 예정일까지 남은 기간을 홈에서 확인해요"],
    ]);
  });

  it("동의 안내 3줄", () => {
    expect(ONBOARDING_TEXT.consentLines).toHaveLength(3);
  });
});
