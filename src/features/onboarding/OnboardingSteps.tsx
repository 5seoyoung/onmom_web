"use client";

// 온보딩 단계별 화면 — OnboardingFlowView.swift의 WelcomeStep·DeliveryMethodStep·GoalStep·ConsentStep.
// 입력값은 부모(OnboardingFlow)가 화면에만 들고 있다가 [온맘 시작하기] 때 저장한다(동의 전 저장 금지, 감사 #15).
// 단계 제목(h1)은 tabIndex=-1 — 단계를 넘기면 부모가 제목으로 초점을 옮겨 스크린리더가 새 단계를 읽는다.

import { useId, type Ref } from "react";
import { Bandage, BriefcaseBusiness, BriefcaseMedical, CircleArrowOutUpRight, Heart, House, ShieldLock, type LucideIcon } from "lucide-react";
import content from "@/content";
import { Card, MeasurementField, SelectableGroup, SelectableRow, Toggle } from "@/components/ui";
import { cx } from "@/components/ui/cx";
import type { DeliveryMethod, RecoveryGoal } from "@/domain/types";
import { weightPlan } from "@/rules/weight";
import { BrandLogo } from "@/features/flow/BrandLogo";
import {
  DELIVERY_OPTIONS,
  deliveryDateHint,
  GOAL_OPTIONS,
  isDeliveryDatePicked,
  ONBOARDING_TEXT as T,
  returnDateHint,
  showsReturnDateCard,
  type OnboardingDraft,
} from "./onboardingModel";

type HeadingRef = Ref<HTMLHeadingElement>;

interface StepProps {
  draft: OnboardingDraft;
  onChange: (patch: Partial<OnboardingDraft>) => void;
  headingRef: HeadingRef;
}

// 분만 방식 아이콘 heart.fill / bandage.fill(Models.swift:18-21), 목표 house.fill / briefcase.fill(OnboardingFlowView.swift:214)
const DELIVERY_ICON: Record<DeliveryMethod, LucideIcon> = { vaginal: Heart, cesarean: Bandage };
const GOAL_ICON: Record<RecoveryGoal, LucideIcon> = { homemaker: House, returningToWork: BriefcaseBusiness };

// 웹 신규 문구 — CPO 확인 필요 (분만 방식 선택지 묶음의 스크린리더 이름. 화면에는 보이지 않는다)
const DELIVERY_GROUP_LABEL = "분만 방식";

/** 날짜 입력 — 오른쪽 정렬 칩 모양(iOS 압축형 DatePicker 자리). 표시 형식은 브라우저가 정한다. */
const DATE_INPUT_CLASS =
  "min-h-11 min-w-32 shrink-0 rounded-[0.5rem] bg-background px-3 text-[0.9375rem] font-medium text-text-primary";

/** 단계 머리 — 제목 20 bold neutral, 부제 14 medium textSecondary, 간격 sm(OnboardingFlowView.swift:362-376). */
function StepHeader({ title, subtitle, headingRef, headingId }: { title: string; subtitle: string; headingRef: HeadingRef; headingId?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 ref={headingRef} id={headingId} tabIndex={-1} className="text-xl font-bold text-neutral">
        {title}
      </h1>
      <p className="text-sm font-medium text-text-secondary">{subtitle}</p>
    </div>
  );
}

// MARK: - 0 시작

export function WelcomeStep({ headingRef }: { headingRef: HeadingRef }) {
  return (
    <div className="flex flex-1 flex-col items-center px-6 text-center">
      <div aria-hidden className="min-h-6 flex-1" />
      <div className="flex flex-col items-center gap-6">
        <BrandLogo size="welcome" />
        <div className="flex flex-col gap-2">
          <h1 ref={headingRef} tabIndex={-1} className="text-[2.125rem] leading-tight font-bold text-neutral">
            {T.welcomeTitle}
          </h1>
          <p className="text-base text-text-secondary">{T.welcomeSubtitle}</p>
        </div>
        <p className="pt-2 text-[0.9375rem] whitespace-pre-line text-text-secondary">{T.welcomeBody}</p>
      </div>
      <div aria-hidden className="min-h-6 flex-[2]" />
    </div>
  );
}

// MARK: - 1 출산일 + 분만 방식

export function DeliveryStep({ draft, onChange, headingRef, today }: StepProps & { today: string }) {
  const dateId = useId();
  const hintId = useId();
  const hint = deliveryDateHint(isDeliveryDatePicked(draft.deliveryDate, today));
  return (
    <div className="flex flex-col gap-6 px-6 pt-6">
      <StepHeader title={T.deliveryTitle} subtitle={T.deliverySubtitle} headingRef={headingRef} />

      {/* 출산일은 앱의 기준점 — 산후 일차·주차 게이팅이 모두 여기서 나온다. 직접 골라야 다음으로 넘어간다. */}
      <Card>
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <label htmlFor={dateId} className="text-sm font-medium text-text-secondary">
              {T.deliveryDateLabel}
            </label>
            <p id={hintId} className={cx("text-[0.8125rem]", hint.emphasized ? "text-primary" : "text-text-secondary")}>
              {hint.text}
            </p>
          </div>
          <input
            id={dateId}
            type="date"
            required
            max={today || undefined}
            value={draft.deliveryDate}
            onChange={(e) => onChange({ deliveryDate: e.target.value })}
            aria-describedby={hintId}
            className={DATE_INPUT_CLASS}
          />
        </div>
      </Card>

      <SelectableGroup label={DELIVERY_GROUP_LABEL}>
        {DELIVERY_OPTIONS.map((o) => (
          <SelectableRow
            key={o.value}
            icon={DELIVERY_ICON[o.value]}
            title={o.title}
            name="onboarding-delivery-method"
            value={o.value}
            checked={draft.deliveryMethod === o.value}
            onSelect={() => onChange({ deliveryMethod: o.value })}
          />
        ))}
      </SelectableGroup>

      {/* 수유 여부는 약물·음식 체크가 "수유 중 기준"으로 판정하는 근거라 여기서 묻는다(기본 켬). */}
      <Card>
        <Toggle
          label={<span className="font-semibold">{T.breastfeedingLabel}</span>}
          description={T.breastfeedingDescription}
          checked={draft.isBreastfeeding}
          onCheckedChange={(v) => onChange({ isBreastfeeding: v })}
        />
      </Card>
    </div>
  );
}

// MARK: - 2 목표 + 복직 예정일 + 체중 관리

export function GoalStep({ draft, onChange, headingRef }: StepProps) {
  const headingId = useId();
  const returnDateId = useId();
  const returnHintId = useId();
  const weightTitleId = useId();
  const plan = weightPlan(draft);
  return (
    <div className="flex flex-col gap-6 px-6 pt-6">
      <StepHeader title={T.goalTitle} subtitle={T.goalSubtitle} headingRef={headingRef} headingId={headingId} />

      <SelectableGroup labelledBy={headingId}>
        {GOAL_OPTIONS.map((o) => (
          <SelectableRow
            key={o.value}
            icon={GOAL_ICON[o.value]}
            title={o.title}
            subtitle={o.subtitle}
            name="onboarding-goal"
            value={o.value}
            checked={draft.goal === o.value}
            onSelect={() => onChange({ goal: o.value })}
          />
        ))}
      </SelectableGroup>

      {/* 복직 예정일은 사용자가 직접 고른다 — 고르지 않은 날짜를 채우지 않는다(OnboardingFlowView.swift:220-221). */}
      {showsReturnDateCard(draft) ? (
        <Card>
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-0.5">
              <label htmlFor={returnDateId} className="text-sm font-medium text-text-secondary">
                {T.returnDateLabel}
              </label>
              <p id={returnHintId} className="text-[0.8125rem] text-text-secondary">
                {returnDateHint(draft.returnToWorkDate)}
              </p>
            </div>
            <input
              id={returnDateId}
              type="date"
              value={draft.returnToWorkDate}
              onChange={(e) => onChange({ returnToWorkDate: e.target.value })}
              aria-describedby={returnHintId}
              className={DATE_INPUT_CLASS}
            />
          </div>
        </Card>
      ) : null}

      {/* 체중 관리(선택) — 키·현재/임신 전 체중으로 감량/복귀 목표를 미리 보여준다(OnboardingFlowView.swift:268-294). */}
      <Card as="section" aria-labelledby={weightTitleId}>
        <div className="flex flex-col gap-2">
          <h2 id={weightTitleId} className="text-sm font-medium text-text-secondary">
            {T.weightTitle}
          </h2>
          <MeasurementField label={T.heightLabel} value={draft.heightCm} onValueChange={(v) => onChange({ heightCm: v })} />
          <hr className="border-divider" />
          <MeasurementField label={T.currentWeightLabel} value={draft.currentWeightKg} onValueChange={(v) => onChange({ currentWeightKg: v })} />
          <hr className="border-divider" />
          <MeasurementField
            label={T.preWeightLabel}
            value={draft.prePregnancyWeightKg}
            onValueChange={(v) => onChange({ prePregnancyWeightKg: v })}
          />
        </div>
        {/* 알림 영역은 늘 두되 카드의 간격 흐름 밖에 둔다 — 계획이 없으면 높이 0이라 마지막 입력칸 아래에 빈 간격이 없다
            (Swift는 `if let plan`일 때만 구분선·제목·설명을 그린다, OnboardingFlowView.swift:281-287). */}
        <div aria-live="polite">
          {plan ? (
            <div className="flex flex-col gap-2 pt-2">
              <hr className="border-divider" />
              <p className="text-[0.9375rem] font-semibold text-primary">{plan.title}</p>
              <p className="text-[0.8125rem] text-text-secondary">{plan.detail}</p>
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

// MARK: - 3 동의

// lock.shield.fill / arrow.up.right.circle.fill / cross.case.fill(OnboardingFlowView.swift:308-312)
const CONSENT_ICONS: readonly LucideIcon[] = [ShieldLock, CircleArrowOutUpRight, BriefcaseMedical];

export function ConsentStep({ draft, onChange, headingRef, onOpenPolicy }: StepProps & { onOpenPolicy: () => void }) {
  return (
    <div className="flex flex-col gap-6 px-6 pt-6">
      <StepHeader title={T.consentTitle} subtitle={T.consentSubtitle} headingRef={headingRef} />

      <ul className="flex flex-col gap-4">
        {T.consentLines.map((text, i) => {
          const Icon = CONSENT_ICONS[i];
          return (
            <li key={text} className="flex items-center gap-4">
              <span aria-hidden className="flex w-7 shrink-0 justify-center text-primary">
                <Icon className="size-5" />
              </span>
              <span className="text-base text-text-primary">{text}</span>
            </li>
          );
        })}
      </ul>

      <div className="rounded-card bg-surface p-4">
        <Toggle
          label={<span className="text-sm font-medium">{T.consentToggle}</span>}
          checked={draft.consentAccepted}
          onCheckedChange={(v) => onChange({ consentAccepted: v })}
        />
      </div>

      {/* 누르는 영역은 44 이상, 겉보기 간격은 Swift(글자 높이)와 같게 음수 여백으로 맞춘다 */}
      <button
        type="button"
        onClick={onOpenPolicy}
        aria-haspopup="dialog"
        className="-my-3.5 inline-flex min-h-11 items-center self-start rounded-button text-[0.8125rem] font-semibold text-primary"
      >
        {T.consentPolicyLink}
      </button>

      <p className="text-[0.8125rem] text-text-secondary">{content.disclaimers.onboarding_consent}</p>
    </div>
  );
}
