"use client";

import { Phone, ShieldCheck } from "lucide-react";
import { Card, RedFlagCard } from "@/components/ui";
import { telHref } from "@/domain/phone";
import { RECORD_NORMAL_RESULT } from "@/rules/record";
import type { RedFlag } from "@/rules/redflag";
import { NearbyClinics } from "@/features/clinics/NearbyClinics";
import { CRISIS_CALLS, RECORD_WEB_TEXT } from "./recordView";

// 판정 결과 — RecordFlowView.swift:267-301.
// 신호가 있으면 안내 카드(라벨·문구·출처 칩은 규칙 결과 그대로 — recordView resultCards가 고른 것) + 병원 신호면 가까운 산부인과,
// 없으면 "즉시 내원이 필요한 위험 신호는 없어요" 카드(content.json disclaimers.record_normal).
// rules-1.2(웹 추가): 119 등급 카드에는 119 전화 버튼, 위기 상담(나·아기를 해칠 것 같은 생각) 카드에는 병원 찾기 대신 상담 전화 목록.
// 버튼을 누른 뒤 나타나는 첫 카드만 role="alert"(스크린리더가 바로 읽는다) — 나머지는 결과로 옮긴 초점에서 이어 읽는다.

export interface RecordResultProps {
  /** 결과 안내 카드로 그릴 신호(recordView resultCards — 등급 높은 순). 비면 신호 없음 카드 */
  cards: readonly RedFlag[];
  /** 가까운 산부인과 — 병원 신호가 있을 때만(recordView recordLayout) */
  showsClinics: boolean;
  neighborhood: string;
  onNeighborhoodChange: (value: string) => void;
}

export function RecordResult({ cards, showsClinics, neighborhood, onNeighborhoodChange }: RecordResultProps) {
  if (cards.length === 0) return <NormalResultCard />;
  return (
    <div className="flex flex-col gap-4">
      {cards.map((signal, i) =>
        signal.severity === "crisis" ? (
          <CrisisSignalCard key={signal.code} signal={signal} announce={i === 0} />
        ) : (
          <HospitalSignalCard key={signal.code} signal={signal} announce={i === 0} />
        ),
      )}
      {showsClinics ? <NearbyClinics address={neighborhood} onAddressChange={onNeighborhoodChange} /> : null}
    </div>
  );
}

/** 코랄 카드 안의 흰 전화 줄 — 이름(왼쪽)·번호(오른쪽). 접근성 이름은 보이는 글자 그대로("자살예방상담전화 (24시간) 109") */
function CallRow({ name, number }: { name: string; number: string }) {
  // 걸 수 없는 번호(숫자 없음)면 줄을 그리지 않는다 — "tel:"만 있는 링크를 만들지 않는다
  const href = telHref(number);
  if (href === null) return null;
  return (
    <a href={href} className="flex min-h-11 items-center gap-2 rounded-chip bg-white px-4 py-2 text-neutral">
      <Phone aria-hidden className="size-3.5 shrink-0 fill-state-alert-strong text-state-alert-strong" />
      <span className="min-w-0 flex-1 text-[0.9375rem] font-medium">{name}</span>
      <span className="shrink-0 whitespace-nowrap text-[0.9375rem] font-bold text-state-alert-text">{number}</span>
    </a>
  );
}

/** 병원 신호(즉시 내원·119) — 119 등급이면 카드 안에 119 전화 버튼 */
function HospitalSignalCard({ signal, announce }: { signal: RedFlag; announce: boolean }) {
  return (
    <RedFlagCard severity={signal.severity} message={signal.messagePatient} chips={signal.evidenceChips} announce={announce}>
      {signal.severity === "emergency" ? <CallRow name={RECORD_WEB_TEXT.call119} number="119" /> : null}
    </RedFlagCard>
  );
}

/** 위기 상담 — 병원 찾기 대신 바로 걸 수 있는 상담 전화(109·1577-0199)와 지금 위험할 때(119·112) */
function CrisisSignalCard({ signal, announce }: { signal: RedFlag; announce: boolean }) {
  return (
    <RedFlagCard severity={signal.severity} message={signal.messagePatient} chips={signal.evidenceChips} announce={announce}>
      <ul className="flex flex-col gap-2">
        {CRISIS_CALLS.map((call) => (
          <li key={call.number}>
            <CallRow name={call.name} number={call.number} />
          </li>
        ))}
      </ul>
    </RedFlagCard>
  );
}

/** 위험 신호 없음 — 방패 체크 22 stateNormal + 제목 17 bold neutral + 본문 13 textSecondary(RecordFlowView.swift:283-301) */
export function NormalResultCard() {
  return (
    <Card role="status" className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <ShieldCheck aria-hidden className="size-[1.375rem] shrink-0 fill-state-normal text-surface" />
        <p className="text-[1.0625rem] font-bold text-neutral">{RECORD_NORMAL_RESULT.title}</p>
      </div>
      <p className="text-[0.8125rem] text-text-secondary">{RECORD_NORMAL_RESULT.body}</p>
    </Card>
  );
}
