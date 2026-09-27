"use client";

// 온보딩 4단계 — OnboardingFlowView.swift. 시작 → 출산 정보 → 목표 → 동의.
// 위: [이전 단계](첫 단계 제외) · 단계 표시 · 균형용 빈칸 / 가운데: 단계 화면 / 아래: 주 버튼(화면 아래에 붙음).
//
// iOS와 다른 점: 입력값을 단계마다 저장하지 않고 [온맘 시작하기] 때 한 번에 저장한다(감사 #15 — 동의 전 건강 정보 저장 금지).
// 저장(updateProfile) → 완료(completeOnboarding) 순. 완료되면 앱 관문이 홈으로 보낸다.
// 개인정보처리방침 전문은 주소를 옮기지 않는 시트로 띄운다 — 떠나면 저장 전 입력이 사라지므로.

import { useEffect, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { PrimaryButton, StepIndicator } from "@/components/ui";
import type { UserProfile } from "@/domain/types";
import { useAppStore } from "@/store/useAppStore";
import type { AppActions } from "@/store/appStore";
import { PrivacyPolicyDialog } from "@/features/privacy/PrivacyPolicyDialog";
import {
  bottomButtonTitle,
  canProceed,
  completionPatch,
  initialDraft,
  nextStep,
  ONBOARDING_LAST_STEP,
  ONBOARDING_TEXT as T,
  ONBOARDING_TOTAL_STEPS,
  previousStep,
  type OnboardingDraft,
  type OnboardingStep,
} from "./onboardingModel";
import { ConsentStep, DeliveryStep, GoalStep, WelcomeStep } from "./OnboardingSteps";
import { useLocalToday } from "./useLocalToday";

export function OnboardingFlow() {
  const { hydrated, state, actions } = useAppStore();
  const today = useLocalToday();
  // 저장소를 읽기 전에는 그리지 않는다 — 시작값(저장된 프로필)이 정해진 뒤에 입력 상태를 만든다.
  if (!hydrated) return null;
  return <Flow profile={state.profile} today={today} actions={actions} />;
}

function Flow({ profile, today, actions }: { profile: UserProfile; today: string; actions: AppActions }) {
  const [step, setStep] = useState<OnboardingStep>(0);
  const [draft, setDraft] = useState<OnboardingDraft>(() => initialDraft(profile));
  const [policyOpen, setPolicyOpen] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const movedRef = useRef(false);

  // 단계를 넘기면 맨 위로 올리고 새 제목에 초점을 둔다(처음 열었을 때는 그대로).
  useEffect(() => {
    if (!movedRef.current) return;
    window.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  function goTo(next: OnboardingStep) {
    movedRef.current = true;
    setStep(next);
  }

  function update(patch: Partial<OnboardingDraft>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  const enabled = canProceed(step, draft, today);

  function handlePrimary() {
    if (!canProceed(step, draft, today)) return;
    if (step < ONBOARDING_LAST_STEP) {
      goTo(nextStep(step));
      return;
    }
    const patch = completionPatch(draft, today);
    if (patch === null) return;
    actions.updateProfile(patch);
    actions.completeOnboarding();
  }

  const back = previousStep(step);

  return (
    <main className="mx-auto flex w-full max-w-[30rem] flex-1 flex-col">
      <div className="flex items-center px-6 pt-4">
        <div className="flex w-11 shrink-0">
          {back !== null ? (
            <button
              type="button"
              onClick={() => goTo(back)}
              aria-label={T.backLabel}
              className="-ml-3 flex size-11 items-center justify-center rounded-full text-neutral"
            >
              <ChevronLeft aria-hidden className="size-6" strokeWidth={2.5} />
            </button>
          ) : null}
        </div>
        <div className="flex min-h-11 flex-1 items-center justify-center">
          <StepIndicator current={step} total={ONBOARDING_TOTAL_STEPS} label={T.stepIndicatorLabel} />
        </div>
        <div aria-hidden className="w-11 shrink-0" />
      </div>

      <div className="flex flex-1 flex-col">
        {step === 0 ? <WelcomeStep headingRef={headingRef} /> : null}
        {step === 1 ? <DeliveryStep draft={draft} onChange={update} headingRef={headingRef} today={today} /> : null}
        {step === 2 ? <GoalStep draft={draft} onChange={update} headingRef={headingRef} /> : null}
        {step === 3 ? (
          <ConsentStep draft={draft} onChange={update} headingRef={headingRef} onOpenPolicy={() => setPolicyOpen(true)} />
        ) : null}
      </div>

      <div className="sticky bottom-0 bg-background px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <PrimaryButton disabled={!enabled} onClick={handlePrimary}>
          {bottomButtonTitle(step)}
        </PrimaryButton>
      </div>

      <PrivacyPolicyDialog open={policyOpen} onClose={() => setPolicyOpen(false)} />
    </main>
  );
}
