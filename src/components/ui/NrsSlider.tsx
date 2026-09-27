"use client";

import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { clampNrs, formatNrs, NRS_MAX, NRS_MIN } from "./numbers";
import styles from "./NrsSlider.module.css";

export interface NrsSliderProps {
  /** 라벨(SectionTitle 모양) — 예: 기록 화면의 통증 정도 제목 */
  label: ReactNode;
  /** 제어 모드. 쓰면 onValueChange도 함께 준다. */
  value?: number;
  /** 비제어 모드 초기값 */
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  disabled?: boolean;
  id?: string;
}

// 통증 NRS 0~10 — RecordFlowView.swift:202-215.
// 라벨 15 semibold textSecondary + 오른쪽 값 "n/10" 15 bold primary, 아래 슬라이더(step 1).
export function NrsSlider({ label, value, defaultValue = 0, onValueChange, disabled, id: idProp }: NrsSliderProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const [uncontrolled, setUncontrolled] = useState(() => clampNrs(defaultValue));
  const current = clampNrs(value ?? uncontrolled);
  const text = formatNrs(current);

  function handleChange(raw: string) {
    const next = clampNrs(Number(raw));
    if (value === undefined) setUncontrolled(next);
    onValueChange?.(next);
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-[0.9375rem] font-semibold text-text-secondary">
          {label}
        </label>
        {/* 보이는 값은 눈으로만 — 스크린리더는 슬라이더의 aria-valuetext로 같은 값을 한 번만 듣는다.
            (<output>은 live region이라 값이 바뀔 때마다 두 번 읽힌다.) Swift도 슬라이더 옆 평범한 Text. */}
        <span aria-hidden="true" className="text-[0.9375rem] font-bold text-primary">
          {text}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={NRS_MIN}
        max={NRS_MAX}
        step={1}
        value={current}
        disabled={disabled}
        aria-valuetext={text}
        onChange={(e) => handleChange(e.target.value)}
        className={styles.range}
        style={{ "--nrs-fraction": current / NRS_MAX } as CSSProperties}
      />
    </div>
  );
}
