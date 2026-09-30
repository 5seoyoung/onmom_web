import { describe, expect, it } from "vitest";
import { CURRENT_CONSENT_VERSION, hasCurrentConsent } from "@/domain/consent";
import type { PersistedState } from "@/domain/types";
import { gateDecision, SCREEN_PATH } from "@/features/flow/gate";
import { ROUTES } from "@/routes";
import { rootScreenFor, type AppSnapshot } from "@/store/appStore";
import { defaultProfile, initialState } from "@/store/defaults";
import * as S from "@/store/state";
import { DELIVERY_OPTIONS } from "@/rules/exercise";
import { weightPlan } from "@/rules/weight";
import { REQUIRED_CONSENT_IDS } from "./consentText";
import {
  bottomButtonTitle,
  canProceed,
  completionPatch,
  consentGiven,
  consentKindFor,
  consentPatch,
  deliveryDateHint,
  firstStepFor,
  GOAL_OPTIONS,
  initialDraft,
  isDeliveryDateInvalid,
  isDeliveryDatePicked,
  isReturnDatePicked,
  nextStep,
  ONBOARDING_LAST_STEP,
  ONBOARDING_TEXT,
  onboardingModeFor,
  previousStep,
  RECONSENT_DONE_HREF,
  RECONSENT_HREF,
  reconsentPatch,
  returnDateHint,
  showsReturnDateCard,
  type OnboardingDraft,
} from "./onboardingModel";

const TODAY = "2026-09-27";
const NOW = "2026-09-27T03:04:05.000Z";
const ALL_REQUIRED = { personal: true, sensitive: true, age14: true } as const;

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
      requiredConsents: { personal: false, sensitive: false, age14: false },
    });
  });

  it("필수 동의 셋은 저장된 동의가 있어도 꺼진 채 시작한다(다시 동의 때 미리 켜 두지 않는다)", () => {
    const d = initialDraft({ ...defaultProfile(), consentAccepted: true, consentVersion: CURRENT_CONSENT_VERSION, consentAcceptedAt: NOW });
    expect(d.requiredConsents).toEqual({ personal: false, sensitive: false, age14: false });
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

  it("잘못된 값 표시(aria-invalid) — 적혀 있는데 고른 것으로 볼 수 없을 때만", () => {
    expect(isDeliveryDateInvalid("2026-09-28", TODAY)).toBe(true); // 내일(직접 입력)
    expect(isDeliveryDateInvalid("2026-02-31", TODAY)).toBe(true);
    expect(isDeliveryDateInvalid("2026-09-27", TODAY)).toBe(false);
    expect(isDeliveryDateInvalid("", TODAY)).toBe(false); // 아직 안 고름 — 오류가 아니다
    expect(isDeliveryDateInvalid("2026-09-28", "")).toBe(false); // 오늘을 모르면 판단하지 않는다
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

  it("다시 동의 버튼", () => {
    expect(bottomButtonTitle(3, "reconsent")).toBe("동의하고 계속하기");
    expect(bottomButtonTitle(3, "full")).toBe("온맘 시작하기");
  });

  it("0단계는 늘 켜짐", () => {
    expect(canProceed(0, draft(), TODAY, "local")).toBe(true);
  });

  it("1단계: 분만 방식과 출산일을 모두 골라야", () => {
    expect(canProceed(1, draft(), TODAY, "local")).toBe(false);
    expect(canProceed(1, draft({ deliveryMethod: "vaginal" }), TODAY, "local")).toBe(false);
    expect(canProceed(1, draft({ deliveryDate: "2026-09-20" }), TODAY, "local")).toBe(false);
    expect(canProceed(1, draft({ deliveryMethod: "vaginal", deliveryDate: "2026-09-20" }), TODAY, "local")).toBe(true);
    expect(canProceed(1, draft({ deliveryMethod: "vaginal", deliveryDate: "2026-10-01" }), TODAY, "local")).toBe(false);
  });

  it("2단계: 목표를 골라야(복직 예정일·체중은 선택)", () => {
    expect(canProceed(2, draft(), TODAY, "local")).toBe(false);
    expect(canProceed(2, draft({ goal: "returningToWork" }), TODAY, "local")).toBe(true);
  });

  it("3단계(설정 없는 빌드): iOS 동의 토글 하나를 켜야", () => {
    expect(canProceed(3, draft(), TODAY, "local")).toBe(false);
    expect(canProceed(3, draft({ consentAccepted: true }), TODAY, "local")).toBe(true);
    // 서버 저장 빌드의 필수 동의만 켜서는 안 된다(다른 동의)
    expect(canProceed(3, draft({ requiredConsents: ALL_REQUIRED }), TODAY, "local")).toBe(false);
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
    expect(completionPatch({ ...complete, consentAccepted: false }, TODAY, "local", NOW)).toBeNull();
    expect(completionPatch({ ...complete, deliveryDate: "" }, TODAY, "local", NOW)).toBeNull();
    expect(completionPatch({ ...complete, deliveryMethod: null }, TODAY, "local", NOW)).toBeNull();
    expect(completionPatch({ ...complete, goal: null }, TODAY, "local", NOW)).toBeNull();
  });

  it("모든 입력을 프로필로 — 설정 없는 빌드는 판 없이(서버 저장 동의가 아니다) 동의 시각만", () => {
    expect(completionPatch(complete, TODAY, "local", NOW)).toEqual({
      deliveryDate: "2026-09-01",
      deliveryMethod: "cesarean",
      isBreastfeeding: false,
      goal: "returningToWork",
      returnToWorkDate: "2027-03-02",
      heightCm: 160,
      currentWeightKg: 62.5,
      prePregnancyWeightKg: 55,
      consentAccepted: true,
      consentVersion: null,
      consentAcceptedAt: NOW,
    });
  });

  it("복직 예정일을 고르지 않았으면 null", () => {
    expect(completionPatch({ ...complete, returnToWorkDate: "" }, TODAY, "local", NOW)?.returnToWorkDate).toBeNull();
  });

  it("스토어에 넣으면 온보딩 완료 상태가 된다(저장 → 완료 순)", () => {
    const patch = completionPatch(complete, TODAY, "local", NOW);
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

describe("서버 저장 빌드 — 필수 동의 셋", () => {
  it("빌드 설정 → 동의 종류", () => {
    expect(consentKindFor(true)).toBe("server");
    expect(consentKindFor(false)).toBe("local");
  });

  it("필수 셋을 모두 켜야 [온맘 시작하기]가 켜진다 — 하나라도 빠지면 꺼짐", () => {
    expect(canProceed(3, draft(), TODAY, "server")).toBe(false);
    expect(canProceed(3, draft({ requiredConsents: ALL_REQUIRED }), TODAY, "server")).toBe(true);
    for (const missing of REQUIRED_CONSENT_IDS) {
      const partial = { ...ALL_REQUIRED, [missing]: false };
      expect(canProceed(3, draft({ requiredConsents: partial }), TODAY, "server"), missing).toBe(false);
    }
    // iOS 토글(local 동의)만으로는 켜지지 않는다 — 서버 저장 동의가 아니다
    expect(canProceed(3, draft({ consentAccepted: true }), TODAY, "server")).toBe(false);
  });

  it("필수 동의는 개인정보 수집·이용 · 민감정보 · 만 14세 이상, 셋", () => {
    expect([...REQUIRED_CONSENT_IDS]).toEqual(["personal", "sensitive", "age14"]);
    expect(consentGiven({ consentAccepted: false, requiredConsents: ALL_REQUIRED }, "server")).toBe(true);
  });

  it("완료 저장값 — 지금 판·동의 시각을 남기고, 그 프로필은 지금 판의 동의로 인정된다(서버 동기화 조건)", () => {
    const complete = draft({ deliveryDate: "2026-09-01", deliveryMethod: "vaginal", goal: "homemaker", requiredConsents: ALL_REQUIRED });
    const patch = completionPatch(complete, TODAY, "server", NOW);
    expect(patch).toMatchObject({ consentAccepted: true, consentVersion: CURRENT_CONSENT_VERSION, consentAcceptedAt: NOW });
    const s = S.completeOnboarding(S.updateProfile(initialState(), patch!));
    expect(hasCurrentConsent(s.profile)).toBe(true);
    // 필수 하나가 빠지면 아무것도 저장하지 않는다
    expect(completionPatch({ ...complete, requiredConsents: { ...ALL_REQUIRED, sensitive: false } }, TODAY, "server", NOW)).toBeNull();
  });

  it("설정 없는 빌드의 동의는 지금 판의 동의가 아니다 — Supabase를 켜면 관문이 다시 묻는다", () => {
    const complete = draft({ deliveryDate: "2026-09-01", deliveryMethod: "vaginal", goal: "homemaker", consentAccepted: true });
    const s = S.updateProfile(initialState(), completionPatch(complete, TODAY, "local", NOW)!);
    expect(s.profile.consentAccepted).toBe(true);
    expect(hasCurrentConsent(s.profile)).toBe(false);
  });

  it("consentPatch", () => {
    expect(consentPatch("server", NOW)).toEqual({ consentAccepted: true, consentVersion: CURRENT_CONSENT_VERSION, consentAcceptedAt: NOW });
    expect(consentPatch("local", NOW)).toEqual({ consentAccepted: true, consentVersion: null, consentAcceptedAt: NOW });
  });
});

/** 로그인·온보딩을 마친 스냅샷 — 동의 칸만 바꿔 본다 */
function signedInSnapshot(state: PersistedState): AppSnapshot {
  return { hydrated: true, storageAvailable: true, state, account: { id: "kakao-1", name: null, provider: "kakao" } };
}

describe("다시 동의(?consent=1)", () => {
  it("관문이 보내는 주소는 온보딩 + ?consent=1(끝 슬래시 뒤 쿼리) — 관문이 따로 적은 주소(SCREEN_PATH.consent)와 같다", () => {
    expect(RECONSENT_HREF).toBe(`${ROUTES.onboarding}?consent=1`);
    expect(SCREEN_PATH.consent).toBe(RECONSENT_HREF);
    const url = new URL(RECONSENT_HREF, "https://example.invalid");
    expect(url.pathname).toBe(ROUTES.onboarding);
    expect(url.searchParams.get("consent")).toBe("1");
  });

  it("관문 전체 흐름 — 예전 동의 → 다시 동의 화면(설정 등 다른 주소도 여기로) → 동의하면 앱 홈", () => {
    const oldConsent = S.completeOnboarding(
      S.updateProfile(initialState(), {
        deliveryDate: "2026-08-01",
        deliveryMethod: "vaginal",
        goal: "homemaker",
        consentAccepted: true,
        consentVersion: null, // 설정 없는 빌드의 동의(iOS 원문 토글) 또는 예전 판
        consentAcceptedAt: "2026-08-02T00:00:00.000Z",
      }),
    );

    // 서버 저장 빌드(requireCurrentConsent = true): 지금 판의 동의가 없으면 "consent"
    expect(rootScreenFor(signedInSnapshot(oldConsent), true)).toBe("consent");
    // 설정 없는 빌드는 그대로 앱(지금 배포와 같음)
    expect(rootScreenFor(signedInSnapshot(oldConsent), false)).toBe("main");

    // 앱의 어느 주소로 와도(설정·홈·로그인) 다시 동의 주소로 — 온보딩 주소에서만 그린다(쿼리 없이 와도)
    for (const path of [ROUTES.settings, ROUTES.home, ROUTES.login]) {
      expect(gateDecision("consent", path), path).toEqual({ kind: "redirect", to: RECONSENT_HREF });
    }
    expect(gateDecision("consent", ROUTES.onboarding)).toEqual({ kind: "render" });
    // 공개 주소(처리방침)는 다시 동의 중에도 연다
    expect(gateDecision("consent", ROUTES.privacy)).toEqual({ kind: "render" });

    // 화면은 온보딩을 마친 사람이라 동의 단계만(다시 동의)
    expect(onboardingModeFor(oldConsent.hasOnboarded)).toBe("reconsent");

    // 필수 셋에 동의 → 동의 칸만 저장 → 앱으로, 온보딩 주소는 앱 홈으로 보낸다
    const patch = reconsentPatch({ ...initialDraft(oldConsent.profile), requiredConsents: ALL_REQUIRED }, "server", NOW);
    const after = S.updateProfile(oldConsent, patch!);
    expect(rootScreenFor(signedInSnapshot(after), true)).toBe("main");
    expect(gateDecision("main", ROUTES.onboarding)).toEqual({ kind: "redirect", to: RECONSENT_DONE_HREF });
    expect(gateDecision("main", RECONSENT_DONE_HREF)).toEqual({ kind: "render" });
  });

  it("동의하지 않고 나가기(계정 삭제)로 계정이 없어지면 관문은 로그인 화면으로", () => {
    const snap: AppSnapshot = { hydrated: true, storageAvailable: true, state: initialState(), account: null };
    expect(rootScreenFor(snap, true)).toBe("login");
    expect(gateDecision("login", ROUTES.onboarding)).toEqual({ kind: "redirect", to: ROUTES.login });
  });

  it("온보딩을 마친 사람은 늘 다시 동의(동의 단계만) — 쿼리가 빠져도 4단계를 다시 보여 프로필을 덮어쓰지 않는다", () => {
    expect(onboardingModeFor(true)).toBe("reconsent");
    expect(onboardingModeFor(false)).toBe("full");
    expect(firstStepFor("reconsent")).toBe(ONBOARDING_LAST_STEP);
    expect(firstStepFor("full")).toBe(0);
  });

  it("동의 칸만 저장하고 앱 홈으로 — 출산 정보 등 다른 프로필 값은 그대로", () => {
    const onboarded = S.completeOnboarding(
      S.updateProfile(initialState(), {
        deliveryDate: "2026-08-01",
        deliveryMethod: "cesarean",
        goal: "homemaker",
        heightCm: 162,
        consentAccepted: true,
        consentVersion: null,
        consentAcceptedAt: "2026-08-02T00:00:00.000Z",
      }),
    );
    expect(hasCurrentConsent(onboarded.profile)).toBe(false);

    // 필수 동의가 빠지면 저장 안 함
    expect(reconsentPatch(initialDraft(onboarded.profile), "server", NOW)).toBeNull();

    const patch = reconsentPatch({ ...initialDraft(onboarded.profile), requiredConsents: ALL_REQUIRED }, "server", NOW);
    expect(patch).toEqual({ consentAccepted: true, consentVersion: CURRENT_CONSENT_VERSION, consentAcceptedAt: NOW });
    const after = S.updateProfile(onboarded, patch!);
    expect(hasCurrentConsent(after.profile)).toBe(true);
    expect(after.profile).toMatchObject({ deliveryDate: "2026-08-01", deliveryMethod: "cesarean", goal: "homemaker", heightCm: 162 });
    expect(after.hasOnboarded).toBe(true);
    expect(RECONSENT_DONE_HREF).toBe(ROUTES.home);
  });

  it("다시 동의 버튼은 필수 셋을 모두 켜야 켜진다(동의 단계 규칙 그대로)", () => {
    const step = firstStepFor("reconsent");
    expect(canProceed(step, draft(), TODAY, "server")).toBe(false);
    expect(canProceed(step, draft({ requiredConsents: ALL_REQUIRED }), TODAY, "server")).toBe(true);
  });
});
