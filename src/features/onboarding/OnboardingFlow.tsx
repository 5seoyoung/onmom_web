"use client";

// 온보딩 4단계 — OnboardingFlowView.swift. 시작 → 출산 정보 → 목표 → 동의.
// 위: [이전 단계](첫 단계 제외) · 단계 표시 · 균형용 빈칸 / 가운데: 단계 화면 / 아래: 주 버튼(화면 아래에 붙음).
//
// iOS와 다른 점: 입력값을 단계마다 저장하지 않고 [온맘 시작하기] 때 한 번에 저장한다(감사 #15 — 동의 전 건강 정보 저장 금지).
// 저장(updateProfile) → 완료(completeOnboarding) 순. 완료되면 앱 관문이 홈으로 보낸다.
// 개인정보처리방침 전문은 주소를 옮기지 않는 시트로 띄운다 — 떠나면 저장 전 입력이 사라지므로.
//
// 동의 단계는 빌드에 따라 다르다(onboardingModel.ts ConsentKind): Supabase 설정이 있으면 필수 동의 셋(ServerConsentStep),
// 없으면 iOS 원문 토글 하나(ConsentStep). 다시 동의(온보딩을 마친 사람 — 관문이 /onboarding/?consent=1로 보냄)는
// 동의 단계만 보이고, 동의하면 동의 칸만 저장한 뒤 앱 홈으로 간다.
//
// 동의하지 않기(서버 저장 빌드만): 동의 단계의 [동의하지 않고 나가기] → 계정 삭제 확인 창(설정의 삭제와 같은 문구) → 서버의 계정·기록을
// 먼저 지우고 이 브라우저를 비운다(settingsView performDeleteAccount — 실패하면 아무것도 지우지 않고 이유를 알린다). 계정이 없어지면
// 관문이 로그인 화면으로 보낸다. 관문은 온보딩·다시 동의 중에는 설정 화면도 온보딩으로 돌려보내므로, 동의하지 않는 사람(처음 가입한
// 카카오 이용자, 예전 판에 동의해 서버에 기록이 있는 이용자, 브라우저 게스트에서 옮겨진 익명 계정)이 지울 수 있는 곳은 여기뿐이다.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PrimaryButton, StepIndicator } from "@/components/ui";
import { useAccountSession, type DeleteAccountResult } from "@/auth";
import { isSupabaseConfigured } from "@/config";
import type { UserProfile } from "@/domain/types";
import { useAppStore } from "@/store/useAppStore";
import type { AppActions } from "@/store/appStore";
import { PrivacyPolicyDialog } from "@/features/privacy/PrivacyPolicyDialog";
import { ConfirmDialog } from "@/features/settings/ConfirmDialog";
import { deleteConfirmMessage, performDeleteAccount, SETTINGS_TEXT } from "@/features/settings/settingsView";
import {
  bottomButtonTitle,
  canProceed,
  completionPatch,
  consentKindFor,
  firstStepFor,
  initialDraft,
  nextStep,
  ONBOARDING_LAST_STEP,
  ONBOARDING_TEXT as T,
  ONBOARDING_TOTAL_STEPS,
  onboardingModeFor,
  previousStep,
  RECONSENT_DONE_HREF,
  reconsentPatch,
  type OnboardingDraft,
  type OnboardingMode,
  type OnboardingStep,
} from "./onboardingModel";
import { ConsentStep, DeliveryStep, GoalStep, WelcomeStep } from "./OnboardingSteps";
import { ServerConsentStep } from "./ServerConsentStep";
import { useLocalToday } from "./useLocalToday";

export function OnboardingFlow() {
  const { hydrated, state, actions } = useAppStore();
  const session = useAccountSession();
  const today = useLocalToday();
  // 저장소를 읽기 전에는 그리지 않는다 — 시작값(저장된 프로필)이 정해진 뒤에 입력 상태를 만든다.
  if (!hydrated) return null;
  return (
    <Flow
      profile={state.profile}
      hasOnboarded={state.hasOnboarded}
      today={today}
      actions={actions}
      deleteAccountEverywhere={session.deleteAccount}
    />
  );
}

interface FlowProps {
  profile: UserProfile;
  hasOnboarded: boolean;
  today: string;
  actions: AppActions;
  /** 서버 계정(카카오·익명 게스트)은 서버를 먼저 지우는 계정 삭제(src/auth) — 설정 화면과 같은 것 */
  deleteAccountEverywhere: () => Promise<DeleteAccountResult>;
}

/** [동의하지 않고 나가기]의 상태 — 확인 창 / 지우는 중 */
type DeclineState = "idle" | "confirming" | "deleting";

function Flow({ profile, hasOnboarded, today, actions, deleteAccountEverywhere }: FlowProps) {
  const router = useRouter();
  // 빌드 때 정해지는 값(NEXT_PUBLIC_*) — 서버 HTML과 브라우저가 같다
  const kind = consentKindFor(isSupabaseConfigured());
  // 처음 열 때 한 번만 정한다 — 온보딩을 마치는 순간 hasOnboarded가 바뀌어도 다시 동의 화면으로 바뀌지 않게
  const [mode] = useState<OnboardingMode>(() => onboardingModeFor(hasOnboarded));
  const [step, setStep] = useState<OnboardingStep>(() => firstStepFor(mode));
  const [draft, setDraft] = useState<OnboardingDraft>(() => initialDraft(profile));
  const [policyOpen, setPolicyOpen] = useState(false);
  const [decline, setDecline] = useState<DeclineState>("idle");
  const [declineError, setDeclineError] = useState<string | null>(null);
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

  const deleting = decline === "deleting";
  const enabled = canProceed(step, draft, today, kind) && !deleting;

  /**
   * 동의하지 않고 나가기 — 확인 창의 [계정과 모든 데이터 삭제]. 서버 저장 빌드에서만 불린다(버튼이 ServerConsentStep에만 있다).
   * 끝나면(done) 계정이 없어져 관문이 로그인 화면으로 보낸다 — 그동안 버튼을 잠근 채 둔다. 실패하면 아무것도 지우지 않았다고 알린다.
   */
  async function declineAndDelete() {
    setDecline("deleting");
    setDeclineError(null);
    const outcome = await performDeleteAccount({
      supabaseConfigured: kind === "server",
      deleteLocal: actions.deleteAccount,
      deleteAccountEverywhere,
    });
    if (outcome.kind === "failed") {
      setDecline("idle");
      setDeclineError(outcome.message);
    }
  }

  function handlePrimary() {
    if (deleting || !canProceed(step, draft, today, kind)) return;
    const nowIso = new Date().toISOString();
    if (mode === "reconsent") {
      // 동의 칸만 저장 — 출산 정보·목표 등 다른 프로필 값은 그대로 둔다
      const patch = reconsentPatch(draft, kind, nowIso);
      if (patch === null) return;
      actions.updateProfile(patch);
      router.replace(RECONSENT_DONE_HREF);
      return;
    }
    if (step < ONBOARDING_LAST_STEP) {
      goTo(nextStep(step));
      return;
    }
    const patch = completionPatch(draft, today, kind, nowIso);
    if (patch === null) return;
    actions.updateProfile(patch);
    actions.completeOnboarding();
  }

  // 다시 동의는 동의 단계 하나뿐 — [이전 단계]·단계 표시가 없다
  const back = mode === "reconsent" ? null : previousStep(step);

  return (
    <main className="mx-auto flex w-full max-w-[30rem] flex-1 flex-col">
      {/* 다시 동의는 [이전 단계]·단계 표시가 없어 이 줄을 통째로 뺀다(빈 머리 줄을 남기지 않게) */}
      {mode === "full" ? (
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
      ) : null}

      <div className="flex flex-1 flex-col">
        {step === 0 ? <WelcomeStep headingRef={headingRef} /> : null}
        {step === 1 ? <DeliveryStep draft={draft} onChange={update} headingRef={headingRef} today={today} /> : null}
        {step === 2 ? <GoalStep draft={draft} onChange={update} headingRef={headingRef} /> : null}
        {step === 3 && kind === "server" ? (
          <ServerConsentStep
            draft={draft}
            onChange={update}
            headingRef={headingRef}
            onOpenPolicy={() => setPolicyOpen(true)}
            mode={mode}
            onDecline={() => {
              setDeclineError(null);
              setDecline("confirming");
            }}
            declineBusy={deleting}
            declineError={declineError}
          />
        ) : null}
        {step === 3 && kind === "local" ? (
          <ConsentStep draft={draft} onChange={update} headingRef={headingRef} onOpenPolicy={() => setPolicyOpen(true)} />
        ) : null}
      </div>

      <div className="sticky bottom-0 bg-background px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <PrimaryButton disabled={!enabled} onClick={handlePrimary}>
          {bottomButtonTitle(step, mode)}
        </PrimaryButton>
      </div>

      <PrivacyPolicyDialog open={policyOpen} onClose={() => setPolicyOpen(false)} />
      {/* 동의하지 않고 나가기 — 설정의 계정 삭제 확인 창과 같은 문구(서버 계정: 서버·이 브라우저 모두 삭제) */}
      <ConfirmDialog
        open={decline === "confirming"}
        title={SETTINGS_TEXT.deleteConfirmTitle}
        message={deleteConfirmMessage(true)}
        confirmLabel={SETTINGS_TEXT.deleteConfirm}
        cancelLabel={SETTINGS_TEXT.cancel}
        onConfirm={() => void declineAndDelete()}
        // 확정 뒤 창이 닫히며 오는 close 이벤트가 "지우는 중"을 되돌리지 않게 — 확인 창일 때만 idle로
        onClose={() => setDecline((d) => (d === "confirming" ? "idle" : d))}
      />
    </main>
  );
}
