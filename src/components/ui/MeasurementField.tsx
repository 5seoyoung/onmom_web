"use client";

import { useId, useState } from "react";
import { formatMeasurement, parseMeasurement, sanitizeDecimalInput } from "./numbers";

const DEFAULT_PLACEHOLDER = "입력"; // 원문: Components.swift:122

export interface MeasurementFieldProps {
  /** 예: 키(cm) — 단위는 라벨에 넣는다(iOS와 같음) */
  label: string;
  /** 제어 모드. 0 = 미입력. 쓰면 onValueChange도 함께 준다. */
  value?: number;
  /** 비제어 모드 초기값(0 = 미입력) */
  defaultValue?: number;
  /** 입력할 때마다 숫자로 알린다. 비우면 0. */
  onValueChange?: (value: number) => void;
  placeholder?: string;
  id?: string;
}

// 선택 입력 숫자 필드(키·체중) — Components.swift:115-143.
// 0을 "미입력"으로 쓰는 필드라 값이 0이면 숫자 대신 placeholder를 보여 준다.
// 라벨 16 textSecondary 왼쪽, 입력 15 semibold 오른쪽 정렬 폭 90.
export function MeasurementField({
  label,
  value,
  defaultValue = 0,
  onValueChange,
  placeholder = DEFAULT_PLACEHOLDER,
  id: idProp,
}: MeasurementFieldProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  // 입력 중인 글자("58." 같은 중간 상태)를 따로 들고 있는다.
  const [draft, setDraft] = useState(() => formatMeasurement(value ?? defaultValue));
  const [lastValue, setLastValue] = useState(value);

  // 바깥에서 값이 바뀌면(불러오기·초기화) 글자를 맞춘다. 입력 중인 글자가 같은 수를 가리키면 그대로 둔다.
  if (value !== lastValue) {
    setLastValue(value);
    if (value !== undefined && parseMeasurement(draft) !== value) {
      setDraft(formatMeasurement(value));
    }
  }

  function handleChange(raw: string) {
    const next = sanitizeDecimalInput(raw);
    setDraft(next);
    onValueChange?.(parseMeasurement(next));
  }

  return (
    <div className="flex w-full items-center justify-between gap-4">
      <label htmlFor={id} className="min-w-0 text-base text-text-secondary">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="done"
        placeholder={placeholder}
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={() => setDraft(formatMeasurement(parseMeasurement(draft)))}
        className="min-h-11 w-22.5 shrink-0 bg-transparent text-right text-[0.9375rem] font-semibold text-text-primary placeholder:text-text-subtle-aa"
      />
    </div>
  );
}
