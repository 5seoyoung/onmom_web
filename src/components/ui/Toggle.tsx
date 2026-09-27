"use client";

import { useId, useState, type ReactNode } from "react";
import { cx } from "./cx";

export interface ToggleProps {
  /** 보이는 라벨(스위치의 접근성 이름). 굵기·크기를 바꾸려면 <span className>으로 감싸 넘긴다. */
  label: ReactNode;
  /** 라벨 아래 보조 설명 13 textSecondary — 스위치의 aria-describedby */
  description?: ReactNode;
  /** 제어 모드. 쓰면 onCheckedChange도 함께 준다. */
  checked?: boolean;
  /** 비제어 모드 초기값 */
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  /** alert = 위험 증상 토글, 켜짐 색 stateAlert(RecordFlowView.swift:246-254) */
  variant?: "default" | "alert";
  disabled?: boolean;
  id?: string;
}

// iOS Toggle(.tint primary) — 라벨 왼쪽, 스위치 오른쪽.
// 스위치는 button role="switch"; <label for>로 이름을 붙여 라벨을 눌러도 켜지고 꺼진다.
// 트랙 51×31, 손잡이 27(iOS 기본 크기). 누르는 영역은 높이 44.
// 켜짐/꺼짐은 색과 함께 손잡이 위치로도 보인다. 고대비(강제 색) 모드에서는 배경·그림자가 지워지므로
// 트랙은 시스템 색 윤곽선(outline — 크기를 바꾸지 않는다), 손잡이는 CanvasText로 채워 위치가 보이게 한다.
export function Toggle({
  label,
  description,
  checked,
  defaultChecked = false,
  onCheckedChange,
  variant = "default",
  disabled,
  id: idProp,
}: ToggleProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const descriptionId = description ? `${id}-description` : undefined;
  const [uncontrolled, setUncontrolled] = useState(defaultChecked);
  const on = checked ?? uncontrolled;

  function handleClick() {
    const next = !on;
    if (checked === undefined) setUncontrolled(next);
    onCheckedChange?.(next);
  }

  const onColor = variant === "alert" ? "bg-state-alert" : "bg-primary";

  return (
    <div className="flex w-full items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className={cx("block text-base text-text-primary", !disabled && "cursor-pointer")}>
          {label}
        </label>
        {description ? (
          <p id={descriptionId} className="mt-0.5 text-[0.8125rem] text-text-secondary">
            {description}
          </p>
        ) : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={on}
        aria-describedby={descriptionId}
        disabled={disabled}
        onClick={handleClick}
        className="flex min-h-11 shrink-0 items-center rounded-full disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span
          aria-hidden
          className={cx(
            "flex h-7.75 w-12.75 items-center rounded-full p-0.5 transition-colors duration-200 motion-reduce:transition-none forced-colors:outline forced-colors:outline-[CanvasText]",
            on ? onColor : "bg-text-subtle/50",
          )}
        >
          <span
            className={cx(
              "size-6.75 rounded-full bg-surface shadow-[0_0.1875rem_0.5rem_rgb(0_0_0/0.15)] transition-transform duration-200 motion-reduce:transition-none forced-colors:bg-[CanvasText]",
              on && "translate-x-5",
            )}
          />
        </span>
      </button>
    </div>
  );
}
