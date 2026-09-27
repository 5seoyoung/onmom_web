"use client";

// 온보딩 동의 단계 — 서버 저장 빌드(Supabase 설정 있음). 설정이 없는 빌드는 OnboardingSteps.tsx의 ConsentStep(iOS 원문).
// 머리(iOS 제목 + 서버 저장 부제) · 안내 3줄 · 필수 동의 셋(토글 + 요약 + "자세히") · AI 국외 이전 안내(토글 없음) ·
// 처리방침 전문 링크 · [동의하지 않고 나가기] · 면책. 필수 셋을 모두 켜야 아래 버튼이 켜진다(onboardingModel.ts canProceed).
// 문구는 consentText.ts(웹 신규 문구 — CPO 확인 필요). 다시 동의(mode "reconsent")는 부제 아래 안내 한 줄이 더 붙는다.
// [동의하지 않고 나가기]는 두 모드 모두 — 누르면 부모(OnboardingFlow)가 계정 삭제 확인 창을 연다(동의하지 않은 채 이용할 수는 없으므로,
// 나가는 길은 계정과 모든 데이터를 지우는 것). 전문 중 법이 "명확히 표시"하라는 줄(emphasis)은 크게·굵게·밑줄로 그린다.

import { useId, type ReactNode, type Ref } from "react";
import { BriefcaseMedical, ChevronDown, CircleArrowOutUpRight, ShieldLock, type LucideIcon } from "lucide-react";
import content from "@/content";
import { Toggle } from "@/components/ui";
import { cx } from "@/components/ui/cx";
import { SERVER_ACCOUNT_TEXT } from "@/features/settings/settingsView";
import { AI_TRANSFER_NOTICE, REQUIRED_CONSENTS, SERVER_CONSENT_TEXT as S, type ConsentItemText } from "./consentText";
import { ONBOARDING_TEXT as T, type OnboardingDraft, type OnboardingMode } from "./onboardingModel";
import { StepHeader } from "./OnboardingSteps";

// iOS 동의 안내와 같은 아이콘 자리(OnboardingFlowView.swift:308-312)
const LINE_ICONS: readonly LucideIcon[] = [ShieldLock, CircleArrowOutUpRight, BriefcaseMedical];

export interface ServerConsentStepProps {
  draft: OnboardingDraft;
  onChange: (patch: Partial<OnboardingDraft>) => void;
  headingRef: Ref<HTMLHeadingElement>;
  onOpenPolicy: () => void;
  mode: OnboardingMode;
  /** [동의하지 않고 나가기] — 부모가 계정 삭제 확인 창을 연다 */
  onDecline: () => void;
  /** 계정을 지우는 중 — 버튼을 잠그고 진행 문구를 보인다 */
  declineBusy?: boolean;
  /** 계정 삭제 실패 안내(아무것도 지우지 않았다) — 없으면 null */
  declineError?: string | null;
}

export function ServerConsentStep({
  draft,
  onChange,
  headingRef,
  onOpenPolicy,
  mode,
  onDecline,
  declineBusy = false,
  declineError = null,
}: ServerConsentStepProps) {
  const aiTitleId = useId();
  return (
    <div className="flex flex-col gap-6 px-6 pt-6">
      <StepHeader title={T.consentTitle} subtitle={S.subtitle} headingRef={headingRef} />

      {mode === "reconsent" ? (
        <p className="-mt-2 rounded-chip bg-coral-tint px-4 py-3 text-sm font-medium text-text-primary">{S.reconsentNote}</p>
      ) : null}

      <ul className="flex flex-col gap-4">
        {S.lines.map((text, i) => {
          const Icon = LINE_ICONS[i];
          return (
            <li key={text} className="flex items-center gap-4">
              <span aria-hidden className="flex w-7 shrink-0 justify-center text-primary">
                <Icon className="size-5" />
              </span>
              <span className="text-[0.9375rem] text-text-primary">{text}</span>
            </li>
          );
        })}
      </ul>

      {/* 필수 동의 셋 — 하나씩 따로 켠다(한꺼번에 켜는 버튼을 두지 않는다: 민감정보는 따로 받는 동의라서) */}
      <div role="group" aria-label={S.requiredGroupLabel} className="rounded-card bg-surface px-4 py-2">
        <ul className="flex flex-col divide-y divide-divider">
          {REQUIRED_CONSENTS.map((item) => (
            <li key={item.id} className="py-3">
              <Toggle
                label={
                  <span className="text-[0.9375rem] font-semibold">
                    <Badge>{S.requiredBadge}</Badge>
                    {item.title}
                  </span>
                }
                description={item.summary}
                checked={draft.requiredConsents[item.id]}
                onCheckedChange={(v) => onChange({ requiredConsents: { ...draft.requiredConsents, [item.id]: v } })}
              />
              <ConsentDetails item={item} />
            </li>
          ))}
        </ul>
      </div>

      {/* AI 답변의 국외 이전 — 알리기만 한다. 동의는 AI 기능을 처음 쓸 때 그 화면이 따로 받는다. */}
      <section aria-labelledby={aiTitleId} className="rounded-card bg-surface px-4 pt-4 pb-2">
        <h2 id={aiTitleId} className="text-[0.9375rem] font-semibold text-text-primary">
          <Badge tone="notice">{S.noticeBadge}</Badge>
          {AI_TRANSFER_NOTICE.title}
        </h2>
        <p className="mt-0.5 text-[0.8125rem] text-text-secondary">{AI_TRANSFER_NOTICE.summary}</p>
        <ConsentDetails item={AI_TRANSFER_NOTICE} />
      </section>

      {/* 누르는 영역은 44 이상, 겉보기 간격은 iOS 동의 화면과 같게 음수 여백으로 맞춘다 */}
      <button
        type="button"
        onClick={onOpenPolicy}
        aria-haspopup="dialog"
        className="-my-3.5 inline-flex min-h-11 items-center self-start rounded-button text-[0.8125rem] font-semibold text-primary"
      >
        {T.consentPolicyLink}
      </button>

      {/* 동의하지 않기 — 주 버튼과 헷갈리지 않게 보조 글자 버튼. 처리방침 링크 바로 아래(누르는 영역 44는 겹치지 않게, 겉보기 간격만 음수 여백으로) */}
      <div className="-mt-2.5 -mb-3 flex flex-col items-start gap-1">
        <button
          type="button"
          onClick={onDecline}
          disabled={declineBusy}
          aria-haspopup="dialog"
          className="inline-flex min-h-11 items-center rounded-button text-[0.8125rem] font-semibold text-text-secondary underline underline-offset-2 disabled:opacity-60"
        >
          {declineBusy ? SERVER_ACCOUNT_TEXT.deleting : S.decline}
        </button>
        {declineError !== null ? (
          <p role="alert" className="text-[0.8125rem] font-medium text-state-alert">
            {declineError}
          </p>
        ) : null}
      </div>

      <p className="text-[0.8125rem] text-text-secondary">{content.disclaimers.onboarding_consent}</p>
    </div>
  );
}

/** [필수]·[안내] 표시 — 라벨 글자의 일부라 스크린리더도 "필수 개인정보 수집·이용 동의"로 읽는다 */
function Badge({ children, tone = "required" }: { children: ReactNode; tone?: "required" | "notice" }) {
  return (
    <span
      className={cx(
        "mr-1.5 inline-flex items-center rounded-md px-1.5 py-px align-[0.0625rem] text-[0.75rem] font-bold",
        tone === "required" ? "bg-coral-tint text-neutral" : "bg-background text-text-secondary ring-1 ring-divider",
      )}
    >
      {children}
    </span>
  );
}

/** 전문의 보통 줄(13px, 부모 dl) / 중요한 내용 줄(16px = 13px의 123% · 굵게 · 밑줄 · 본문색) — consentText.ts 머리말 */
export const DETAIL_TEXT_CLASS = "text-text-secondary";
export const DETAIL_EMPHASIS_CLASS = "text-base font-semibold text-text-primary underline underline-offset-2";

/**
 * "자세히" — 펼치면 항목·목적·보유 기간·거부 권리 전문. 브라우저 기본 <details>라 스크립트 없이도 열리고 닫힌다.
 * AI 첫 사용 동의(features/chat/AiConsentCard)는 같은 전문(AI_TRANSFER_NOTICE)을 접지 않고 펼쳐 보이며, 줄 모양만
 * DETAIL_TEXT_CLASS·DETAIL_EMPHASIS_CLASS로 이 컴포넌트와 맞춘다.
 */
export function ConsentDetails({ item }: { item: ConsentItemText }) {
  return (
    <details className="group">
      <summary className="-mb-1 inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-button text-[0.8125rem] font-semibold text-text-secondary [&::-webkit-details-marker]:hidden">
        {S.more}
        {/* 여러 "자세히"를 목록으로 들을 때 무엇의 자세히인지 */}
        <span className="sr-only"> — {item.title}</span>
        <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <dl className="mb-2 flex flex-col gap-2.5 rounded-chip bg-background p-3.5 text-[0.8125rem] leading-relaxed">
        {item.details.map((row) => (
          <div key={row.term}>
            <dt className="font-semibold text-text-primary">{row.term}</dt>
            <dd className={row.emphasis === true ? DETAIL_EMPHASIS_CLASS : DETAIL_TEXT_CLASS}>{row.text}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
