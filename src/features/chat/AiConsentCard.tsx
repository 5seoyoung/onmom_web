"use client";

// AI 답변의 국외 이전 동의 카드 — AI 상담·약물 체크가 서버(LLM)에 처음 묻기 전에 보인다(aiConsent.ts).
// 동의를 받는 자리다(개인정보보호법 §28의8 ②): 알릴 것(이전 항목·국가·시기와 방법·받는 자·이용 목적·보유 기간·거부 방법과 효과)을
// 모두 접지 않고 펼친 채로 보인다. 전문은 온보딩 안내와 같은 글자(features/onboarding/consentText.ts AI_TRANSFER_NOTICE)이고,
// 법이 명확히 표시하라는 줄(emphasis)은 온보딩 동의 화면과 같은 모양(ServerConsentStep DETAIL_EMPHASIS_CLASS — 크게·굵게·밑줄)으로 그린다.
// 제목·첫 문장은 이 카드가 "안내"가 아니라 "동의 요청"임을 밝힌다(온보딩의 요약 "처음 쓸 때 따로 동의를 받아요"는 여기서 쓰지 않는다).
// [동의하고 계속하기] → 이 계정의 동의를 남기고 AI에 묻는다. [동의하지 않기] → 이번에는 앱에 담긴 안내로만 답한다.
// 이 카드의 글자(제목·첫 문장·전문)를 바꾸면 AI_CONSENT_VERSION을 올린다 — aiConsent.test.ts가 글자의 지문을 판에 묶어 둔다.

import { useEffect, useId, useRef } from "react";
import { Card, PrimaryButton, SecondaryButton } from "@/components/ui";
import { AI_TRANSFER_NOTICE, SERVER_CONSENT_TEXT } from "@/features/onboarding/consentText";
import { DETAIL_EMPHASIS_CLASS, DETAIL_TEXT_CLASS } from "@/features/onboarding/ServerConsentStep";

export const AI_CONSENT_TEXT = {
  // 웹 신규 문구 — CPO 확인 필요 (AI 국외 이전 동의 카드의 제목 — 온보딩의 "…국외 이전 안내"와 달리 동의를 묻는 자리)
  title: "AI 답변 국외 이전 동의",
  // 웹 신규 문구 — CPO 확인 필요 (AI 국외 이전 동의 카드의 첫 문장. 항목은 처리방침 AI_TRANSFER_ITEMS와 같다.
  // 둘째 문장은 온보딩 안내 AI_TRANSFER_NOTICE.summary의 둘째 문장 그대로)
  lead: "AI 답변을 받으려면 질문 내용과 산후 주차·분만 방식·수유 여부가 미국 Anthropic으로 전송되는 데 동의가 필요해요. 동의하지 않아도 온맘에 담긴 안내로 답해요.",
  /** 온보딩 다시 동의 버튼(SERVER_CONSENT_TEXT.reconsentButton)과 같은 말 */
  accept: SERVER_CONSENT_TEXT.reconsentButton,
  // 웹 신규 문구 — CPO 확인 필요 (AI 국외 이전 동의 카드의 거절 버튼)
  decline: "동의하지 않기",
} as const;

/** 카드가 보이는 동의 전문 — 온보딩 안내의 전문 전부(접지 않는다) */
export const AI_CONSENT_ROWS = AI_TRANSFER_NOTICE.details;

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

  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus({ preventScroll: true });
  }, [focusOnMount]);

  return (
    <Card as="section" aria-labelledby={titleId} aria-describedby={leadId} className="flex flex-col gap-2">
      <h2 id={titleId} ref={headingRef} tabIndex={-1} className="text-[0.9375rem] font-semibold text-text-primary">
        {AI_CONSENT_TEXT.title}
      </h2>
      <p id={leadId} className="text-[0.8125rem] text-text-secondary">
        {AI_CONSENT_TEXT.lead}
      </p>
      {/* 이전받는 자·항목·국가·시기와 방법·목적·보유 기간·거부 방법 — 동의 전에 모두 보이게 펼쳐 둔다 */}
      <dl className="flex flex-col gap-2.5 rounded-chip bg-background p-3.5 text-[0.8125rem] leading-relaxed">
        {AI_CONSENT_ROWS.map((row) => (
          <div key={row.term}>
            <dt className="font-semibold text-text-primary">{row.term}</dt>
            <dd className={row.emphasis === true ? DETAIL_EMPHASIS_CLASS : DETAIL_TEXT_CLASS}>{row.text}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-2 pt-1">
        <PrimaryButton onClick={onAccept}>{AI_CONSENT_TEXT.accept}</PrimaryButton>
        <SecondaryButton onClick={onDecline}>{AI_CONSENT_TEXT.decline}</SecondaryButton>
      </div>
    </Card>
  );
}
