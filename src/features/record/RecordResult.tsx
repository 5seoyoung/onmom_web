"use client";

import { ShieldCheck } from "lucide-react";
import { Card, RedFlagCard } from "@/components/ui";
import { RECORD_NORMAL_RESULT } from "@/rules/record";
import type { RedFlag } from "@/rules/redflag";
import { NearbyClinics } from "@/features/clinics/NearbyClinics";

// 판정 결과 — RecordFlowView.swift:267-301.
// 병원 신호가 있으면 레드플래그 카드(라벨·문구·출처 칩은 규칙 결과 그대로) + 가까운 산부인과,
// 없으면 "즉시 내원이 필요한 위험 신호는 없어요" 카드(content.json disclaimers.record_normal).

export interface RecordResultProps {
  redFlag: RedFlag | null;
  neighborhood: string;
  onNeighborhoodChange: (value: string) => void;
}

export function RecordResult({ redFlag, neighborhood, onNeighborhoodChange }: RecordResultProps) {
  if (redFlag) {
    return (
      <div className="flex flex-col gap-4">
        <RedFlagCard severity={redFlag.severity} message={redFlag.messagePatient} chips={redFlag.evidenceChips} announce />
        <NearbyClinics address={neighborhood} onAddressChange={onNeighborhoodChange} />
      </div>
    );
  }
  return <NormalResultCard />;
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
