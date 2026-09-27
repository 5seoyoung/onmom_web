"use client";

// 분석 1단계 — 정보 확인·입력 폼(AnalyzeFlowView.swift:64-132)과 로딩(:231-251).

import { useId, useState } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { Card, MeasurementField, PrimaryButton, SectionTitle, Toggle, cx } from "@/components/ui";
import type { MaternityRecord } from "@/domain/types";
import {
  ANALYZE_TEXT,
  CLINICAL_TOGGLES,
  DELIVERY_OPTIONS,
  canStartAnalysis,
  todayInputValue,
  type AnalyzeFormValues,
} from "./analyzeModel";

export interface AnalyzeFormProps {
  /** 저장된 프로필·산모수첩으로 채운 값 — 마운트할 때 한 번만 읽는다(다시 채우려면 key를 바꾼다) */
  initial: AnalyzeFormValues;
  /** 직전 분석이 끝나지 못한 이유(iOS 알림 "분석을 마치지 못했어요") */
  error: string | null;
  onSubmit: (values: AnalyzeFormValues) => void | Promise<void>;
}

export function AnalyzeForm({ initial, error, onSubmit }: AnalyzeFormProps) {
  // 날짜 제한(오늘까지)은 브라우저 시각으로 — 이 컴포넌트는 hydrated 뒤에만 마운트된다
  const [now] = useState(() => new Date());
  const [values, setValues] = useState(initial);
  const today = todayInputValue(now);
  const canStart = canStartAnalysis(values, now);

  const deliveryTitleId = useId();
  const dateId = useId();

  function setMaternity(key: keyof MaternityRecord, on: boolean) {
    setValues((v) => ({ ...v, maternity: { ...v.maternity, [key]: on } }));
  }

  return (
    // 항목 간격 lg(24) — AnalyzeFlowView.swift:66
    <div className="flex flex-col gap-6">
      {error !== null ? (
        <Card role="alert" className="flex items-start gap-3">
          <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0 fill-state-alert text-surface" />
          <div className="flex flex-col gap-1">
            <p className="text-base font-semibold text-text-primary">{ANALYZE_TEXT.errorTitle}</p>
            <p className="text-[0.8125rem] text-text-secondary">{error}</p>
          </div>
        </Card>
      ) : null}

      <Card className="flex flex-col gap-4">
        <SectionTitle id={deliveryTitleId}>{ANALYZE_TEXT.deliverySection}</SectionTitle>
        <div role="radiogroup" aria-labelledby={deliveryTitleId} className="flex gap-2">
          {DELIVERY_OPTIONS.map((opt) => {
            const selected = values.deliveryMethod === opt.value;
            return (
              <label
                key={opt.value}
                className={cx(
                  "flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-button border px-4 py-2.5 text-center text-[0.9375rem] font-semibold has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary",
                  selected
                    ? "border-primary bg-primary text-white forced-colors:border-[3px] forced-colors:border-[Highlight]"
                    : "border-divider bg-surface text-text-primary forced-colors:border-[CanvasText]",
                )}
              >
                <input
                  type="radio"
                  name="analyze-delivery-method"
                  value={opt.value}
                  checked={selected}
                  onChange={() => setValues((v) => ({ ...v, deliveryMethod: opt.value }))}
                  className="sr-only"
                />
                {opt.title}
              </label>
            );
          })}
        </div>
      </Card>

      <Card className="flex items-center justify-between gap-4">
        <label htmlFor={dateId} className="text-base text-text-secondary">
          {ANALYZE_TEXT.deliveryDate}
        </label>
        <input
          id={dateId}
          type="date"
          required
          max={today}
          value={values.deliveryDate}
          onChange={(e) => setValues((v) => ({ ...v, deliveryDate: e.target.value }))}
          className="min-h-11 min-w-0 rounded-full bg-divider px-3 text-base text-text-primary"
        />
      </Card>

      <Card className="flex flex-col gap-4">
        <SectionTitle>{ANALYZE_TEXT.historySection}</SectionTitle>
        {CLINICAL_TOGGLES.map((t) => (
          <Toggle
            key={t.key}
            label={<span className="text-[0.9375rem] font-semibold">{t.title}</span>}
            description={t.subtitle}
            checked={values.maternity[t.key]}
            onCheckedChange={(on) => setMaternity(t.key, on)}
          />
        ))}
      </Card>

      <Card className="flex flex-col gap-4">
        <SectionTitle>{ANALYZE_TEXT.weightSection}</SectionTitle>
        <MeasurementField
          label={ANALYZE_TEXT.height}
          value={values.heightCm}
          onValueChange={(n) => setValues((v) => ({ ...v, heightCm: n }))}
        />
        <MeasurementField
          label={ANALYZE_TEXT.preWeight}
          value={values.prePregnancyWeightKg}
          onValueChange={(n) => setValues((v) => ({ ...v, prePregnancyWeightKg: n }))}
        />
        <MeasurementField
          label={ANALYZE_TEXT.currentWeight}
          value={values.currentWeightKg}
          onValueChange={(n) => setValues((v) => ({ ...v, currentWeightKg: n }))}
        />
      </Card>

      <p className="text-[0.6875rem] text-text-subtle">{ANALYZE_TEXT.lochiaNote}</p>

      <PrimaryButton className="mt-2" disabled={!canStart} onClick={() => void onSubmit(values)}>
        {ANALYZE_TEXT.start}
      </PrimaryButton>
    </div>
  );
}

export function AnalyzeLoading() {
  return (
    <div role="status" className="flex flex-1 flex-col items-center justify-center gap-6 px-8 py-16 text-center">
      <LoaderCircle aria-hidden className="size-9 animate-spin text-primary motion-reduce:animate-none" />
      <div className="flex flex-col gap-1">
        <p className="text-lg font-bold text-neutral">{ANALYZE_TEXT.loadingTitle}</p>
        <p className="text-base text-text-secondary">{ANALYZE_TEXT.loadingBody}</p>
      </div>
    </div>
  );
}
