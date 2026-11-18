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
  /**
   * 양 끝 0·10의 뜻(웹 추가) — 슬라이더 바로 아래 왼쪽·오른쪽 끝에 숫자와 함께 보이고, 슬라이더의 aria-describedby라 스크린리더도
   * 처음 갈 때 듣는다. 없으면 그리지 않는다.
   */
  scaleLabels?: { min: string; max: string };
}

// 통증 NRS 0~10 — RecordFlowView.swift:202-215.
// 라벨 15 semibold textSecondary + 오른쪽 값 "n/10" 15 bold primary, 아래 슬라이더(step 1).
// 웹 추가: 슬라이더 아래 양 끝에 0·10과 그 뜻(scaleLabels) 13 textSecondary — 2026-11-15 산부인과 전문의 의견(척도 이름 대신 끝값의 뜻을 보인다).
export function NrsSlider({ label, value, defaultValue = 0, onValueChange, disabled, id: idProp, scaleLabels }: NrsSliderProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const minId = `${id}-min`;
  const maxId = `${id}-max`;
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
            (<output>은 live region이라 값이 바뀔 때마다 두 번 읽힌다.) Swift도 슬라이더 옆 평범한 Text.
            글자색은 AA 글자 전용 토큰(primary-text) — 원색 코랄은 흰 배경 위 2.76:1(DEV_NOTES §3 CPO 12). */}
        <span aria-hidden="true" className="text-[0.9375rem] font-bold text-primary-text">
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
        aria-describedby={scaleLabels ? `${minId} ${maxId}` : undefined}
        onChange={(e) => handleChange(e.target.value)}
        className={styles.range}
        style={{ "--nrs-fraction": current / NRS_MAX } as CSSProperties}
      />
      {/* 끝값의 뜻 — 슬라이더 아래 바로 붙인다(-mt-2: 위 gap-2를 상쇄 — 슬라이더의 누르는 영역 44와는 겹치지 않는다).
          숫자와 뜻이 두 줄이라 좁은 폰에서도 양 끝이 서로 밀리지 않는다. 스크린리더는 슬라이더의 설명으로 "0 하나도 … 10 …"을 듣는다. */}
      {scaleLabels ? (
        <div className="-mt-2 flex justify-between gap-4 text-[0.8125rem] text-text-secondary">
          <p id={minId} className="flex flex-col items-start">
            <span>{NRS_MIN}</span>
            <span>{scaleLabels.min}</span>
          </p>
          <p id={maxId} className="flex flex-col items-end text-end">
            <span>{NRS_MAX}</span>
            <span>{scaleLabels.max}</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
