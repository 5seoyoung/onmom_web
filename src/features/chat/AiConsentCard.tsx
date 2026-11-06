"use client";

// AI 답변 사용 동의 카드 — AI 상담이 서버(LLM)에 처음 묻기 전에 보인다(aiConsent.ts). 시범 동안 카카오 계정에만 뜬다 — 게스트에게는 그리지 않는다(aiMode "login").
// 동의를 받는 자리다: 민감정보 처리(법 §23①1)와 국외 이전(법 §28의8①1)을 구분해 각각 받는다 — 토글 둘, 둘 다 켜야 [동의하고 계속하기]가 켜진다.
// 휴대폰 화면에 맞게(STATUS D17 — 402×874에서 버튼 위까지 화면의 절반쯤): 각 동의의 요약은 늘 보이고, 전문은 "자세히" 하나에 접는다.
// 요약에 법정 고지 항목(항목·국가·시기와 방법·받는 자와 연락처·목적·보유 기간)이 들어 있고, 거부 방법과 효과는 첫 문장에 있다 — 접은 전문을 펴지 않아도 알 수 있다.
// 요약은 온보딩의 강조 요약과 같은 모양(SUMMARY_EMPHASIS_CLASS — 굵게·밑줄), 전문의 중요한 줄은 같은 모양(DETAIL_EMPHASIS_CLASS)으로 그린다.
// [동의하고 계속하기] → 이 계정의 동의를 남기고 AI에 묻는다. [동의하지 않기] → 이번에는 앱에 담긴 안내로만 답한다.
// 이 카드의 글자(제목·첫 문장·두 동의)를 바꾸면 AI_CONSENT_VERSION을 올린다 — aiConsent.test.ts가 글자의 지문을 판에 묶어 둔다.

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card, PrimaryButton, SecondaryButton, Toggle } from "@/components/ui";
import { AI_CONSENT_ITEMS, SERVER_CONSENT_TEXT } from "@/features/onboarding/consentText";
import { DETAIL_EMPHASIS_CLASS, DETAIL_TEXT_CLASS, SUMMARY_EMPHASIS_CLASS } from "@/features/onboarding/ServerConsentStep";

export const AI_CONSENT_TEXT = {
  // 웹 신규 문구 — CPO 확인 필요 (AI 답변 동의 카드의 제목 — 사전 검토 제안 (c-5))
  title: "AI 답변 사용 동의(선택)",
  // 웹 신규 문구 — CPO 확인 필요 (AI 답변 동의 카드의 첫 문장 — 사전 검토 제안 (c-5). 거부해도 앱 안내로 답한다는 효과를 늘 보이게 둔다)
  lead: "AI 답변을 받으려면 아래 두 가지에 각각 동의가 필요해요. 동의하지 않아도 온맘에 담긴 안내로 답해요.",
  /** 온보딩 다시 동의 버튼(SERVER_CONSENT_TEXT.reconsentButton)과 같은 말 */
  accept: SERVER_CONSENT_TEXT.reconsentButton,
  // 웹 신규 문구 — CPO 확인 필요 (AI 답변 동의 카드의 거절 버튼)
  decline: "동의하지 않기",
  /** 전문을 펴는 줄 — 온보딩 동의의 "자세히"와 같은 말 */
  more: SERVER_CONSENT_TEXT.more,
} as const;

export interface AiConsentCardProps {
  onAccept: () => void;
  onDecline: () => void;
  /** 나타날 때 제목으로 초점을 옮긴다(보내기 뒤에 뜨는 AI 상담 — 화면 낭독기가 바로 읽게) */
  focusOnMount?: boolean;
}

export function AiConsentCard({ onAccept, onDecline, focusOnMount = false }: AiConsentCardProps) {
  const titleId = useId();
  const leadId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  /** 켠 동의 — 한꺼번에 켜는 버튼을 두지 않는다(각각 받는 동의라서) */
  const [agreed, setAgreed] = useState<ReadonlySet<string>>(new Set());
  const allAgreed = AI_CONSENT_ITEMS.every((item) => agreed.has(item.id));

  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus({ preventScroll: true });
  }, [focusOnMount]);

  function setItem(id: string, on: boolean) {
    setAgreed((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <Card as="section" aria-labelledby={titleId} aria-describedby={leadId} className="flex flex-col gap-2">
      <h2 id={titleId} ref={headingRef} tabIndex={-1} className="text-[0.9375rem] font-semibold text-text-primary">
        {AI_CONSENT_TEXT.title}
      </h2>
      <p id={leadId} className="text-[0.8125rem] text-text-secondary">
        {AI_CONSENT_TEXT.lead}
      </p>
      <ul className="flex flex-col gap-2">
        {AI_CONSENT_ITEMS.map((item) => (
          <li key={item.id}>
            <Toggle
              label={<span className="text-[0.9375rem] font-semibold">{item.title}</span>}
              description={<span className={SUMMARY_EMPHASIS_CLASS}>{item.summary}</span>}
              checked={agreed.has(item.id)}
              onCheckedChange={(on) => setItem(item.id, on)}
            />
          </li>
        ))}
      </ul>
      {/* 전문 — 브라우저 기본 <details>라 스크립트 없이도 열리고 닫힌다. 펴면 대화 스크롤 안에서 카드가 늘어난다 */}
      <details className="group">
        <summary className="-my-1 inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-button text-[0.8125rem] font-semibold text-text-secondary [&::-webkit-details-marker]:hidden">
          {AI_CONSENT_TEXT.more}
          <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
        <div className="flex flex-col gap-2">
          {AI_CONSENT_ITEMS.map((item) => (
            <div key={item.id} className="flex flex-col gap-2.5 rounded-chip bg-background p-3.5 text-[0.8125rem] leading-relaxed">
              <p className="text-[0.9375rem] font-semibold text-text-primary">{item.title}</p>
              <dl className="flex flex-col gap-2.5">
                {item.details.map((row) => (
                  <div key={row.term}>
                    <dt className="font-semibold text-text-primary">{row.term}</dt>
                    <dd className={row.emphasis === true ? DETAIL_EMPHASIS_CLASS : DETAIL_TEXT_CLASS}>{row.text}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </details>
      <div className="flex flex-col gap-2 pt-1">
        <PrimaryButton onClick={onAccept} disabled={!allAgreed}>
          {AI_CONSENT_TEXT.accept}
        </PrimaryButton>
        <SecondaryButton onClick={onDecline}>{AI_CONSENT_TEXT.decline}</SecondaryButton>
      </div>
    </Card>
  );
}
