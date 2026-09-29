"use client";

import { useId } from "react";
import { Card, NrsSlider, SectionTitle, Toggle } from "@/components/ui";
import type { SymptomForm } from "@/rules/record";
import { RECORD_TEXT, RISK_TOGGLES } from "./recordView";

// 입력 폼 카드 5개 — RecordFlowView.swift:161-254.
// 오로(10일 이상일 때만 토글 2개, 아니면 안내문) · 발열 · 통증 NRS · 위험 증상 4개(켜짐 색 stateAlert) · 내 동네.

export interface SymptomFormCardsProps {
  form: SymptomForm;
  onChange: (patch: Partial<SymptomForm>) => void;
  /** 산후 10일 이상 — 오로 질문을 묻는다 */
  showsLochia: boolean;
  /** 내 동네(프로필 값) */
  neighborhood: string;
  onNeighborhoodChange: (value: string) => void;
  /** 결과 단계(PC에서만 보임) — 판정에 쓴 답을 보여 주기만 한다. 고치려면 [다시 입력]. */
  disabled?: boolean;
}

/** 카드 안 토글 사이 구분선(Divider — divider 색 1px) */
function RowDivider() {
  return <div aria-hidden className="h-px w-full bg-divider" />;
}

export function SymptomFormCards({
  form,
  onChange,
  showsLochia,
  neighborhood,
  onNeighborhoodChange,
  disabled = false,
}: SymptomFormCardsProps) {
  const lochiaId = useId();
  const riskId = useId();
  const neighborhoodId = useId();
  const neighborhoodHelpId = useId();

  return (
    <>
      <Card as="section" aria-labelledby={lochiaId} className="flex flex-col gap-2">
        <SectionTitle id={lochiaId}>{RECORD_TEXT.lochiaTitle}</SectionTitle>
        {showsLochia ? (
          <>
            <Toggle
              label={RECORD_TEXT.lochiaIncreased}
              checked={form.lochiaIncreased}
              disabled={disabled}
              onCheckedChange={(v) => onChange({ lochiaIncreased: v })}
            />
            <RowDivider />
            <Toggle
              label={RECORD_TEXT.lochiaRed}
              checked={form.lochiaRed}
              disabled={disabled}
              onCheckedChange={(v) => onChange({ lochiaRed: v })}
            />
          </>
        ) : (
          <p className="text-[0.8125rem] text-text-secondary">{RECORD_TEXT.lochiaEarly}</p>
        )}
      </Card>

      <Card>
        <Toggle
          label={<span className="font-semibold">{RECORD_TEXT.feverTitle}</span>}
          description={RECORD_TEXT.feverDescription}
          checked={form.feverEvent}
          disabled={disabled}
          onCheckedChange={(v) => onChange({ feverEvent: v })}
        />
      </Card>

      <Card>
        <NrsSlider
          label={RECORD_TEXT.painTitle}
          value={form.painNrs}
          disabled={disabled}
          onValueChange={(v) => onChange({ painNrs: v })}
        />
      </Card>

      <Card as="section" aria-labelledby={riskId} className="flex flex-col gap-2">
        <SectionTitle id={riskId}>{RECORD_TEXT.riskTitle}</SectionTitle>
        {RISK_TOGGLES.map(({ key, label }, i) => (
          <div key={key} className="flex flex-col gap-2">
            {i > 0 ? <RowDivider /> : null}
            <Toggle
              variant="alert"
              label={label}
              checked={form[key]}
              disabled={disabled}
              onCheckedChange={(v) => onChange({ [key]: v })}
            />
          </div>
        ))}
      </Card>

      <Card as="section" aria-labelledby={neighborhoodId} className="flex flex-col gap-1">
        <SectionTitle id={neighborhoodId}>{RECORD_TEXT.neighborhoodTitle}</SectionTitle>
        <input
          type="text"
          value={neighborhood}
          onChange={(e) => onNeighborhoodChange(e.target.value)}
          disabled={disabled}
          placeholder={RECORD_TEXT.neighborhoodPlaceholder}
          aria-labelledby={neighborhoodId}
          aria-describedby={neighborhoodHelpId}
          autoCapitalize="none"
          className="min-h-11 w-full bg-transparent text-base text-text-primary placeholder:text-text-subtle-aa disabled:cursor-not-allowed disabled:opacity-50"
        />
        <p id={neighborhoodHelpId} className="text-[0.8125rem] text-text-secondary">
          {RECORD_TEXT.neighborhoodHelp}
        </p>
      </Card>
    </>
  );
}
