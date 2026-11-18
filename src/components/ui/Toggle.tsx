"use client";

import { useId, useState, type ReactNode } from "react";
import { cx } from "./cx";

export interface ToggleProps {
  /** 보이는 라벨(스위치의 접근성 이름). 굵기·크기를 바꾸려면 <span className>으로 감싸 넘긴다. */
  label: ReactNode;
  /** 라벨 아래 보조 설명 13 textSecondary — 스위치의 aria-describedby(보일 때만) */
  description?: ReactNode;
  /**
   * 설명을 언제 보일지 — "always"(기본) 늘, "checked" 켰을 때만(웹 추가). 위험 증상 목록처럼 줄이 많은 곳에서 기준을 켠 항목에만 보인다
   * (2026-11-15 산부인과 전문의 의견). "checked"면 스위치를 라벨 첫 줄 높이에 고정해, 설명이 나타나도 누른 스위치가 움직이지 않는다.
   */
  descriptionWhen?: "always" | "checked";
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
// 트랙 51×31, 손잡이 27(iOS 기본 크기 — 꺼짐에서는 75%). 누르는 영역은 높이 44.
// 켜짐/꺼짐은 색과 함께 손잡이 위치로도 보인다. 고대비(강제 색) 모드에서는 배경·그림자가 지워지므로
// 트랙은 시스템 색 윤곽선(outline — 크기를 바꾸지 않는다), 손잡이는 CanvasText로 채워 위치가 보이게 한다.
// 색(비텍스트 3:1 — DEV_NOTES §3 CPO 12): 켬 = primary-strong·state-alert-strong 트랙 + 흰 손잡이(4.63:1),
// 꺼짐 = 흰 트랙 + control-off 1.5 테두리 + control-off 손잡이(3.36:1). iOS 꺼짐 트랙(text-subtle 50%)은 1.65:1.
// descriptionWhen="checked": 줄은 위 맞춤(items-start)이고 라벨 칸 위 여백 10(= (44 - 라벨 줄 24) / 2)이 라벨 첫 줄을 스위치 가운데에 맞춘다.
// 켜서 설명이 라벨 아래에 생겨도 줄이 아래로만 늘어 스위치·라벨 자리는 그대로다. 스위치는 같은 요소로 남아 포커스도 그대로다.
// 설명이 없을 때는 aria-describedby도 없다(가리킬 요소가 없는 id를 두지 않는다).
export function Toggle({
  label,
  description,
  descriptionWhen = "always",
  checked,
  defaultChecked = false,
  onCheckedChange,
  variant = "default",
  disabled,
  id: idProp,
}: ToggleProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const [uncontrolled, setUncontrolled] = useState(defaultChecked);
  const on = checked ?? uncontrolled;
  const revealsOnCheck = descriptionWhen === "checked";
  const showsDescription = Boolean(description) && (!revealsOnCheck || on);
  const descriptionId = showsDescription ? `${id}-description` : undefined;

  function handleClick() {
    const next = !on;
    if (checked === undefined) setUncontrolled(next);
    onCheckedChange?.(next);
  }

  const onColor = variant === "alert" ? "bg-state-alert-strong" : "bg-primary-strong";

  return (
    <div className={cx("flex w-full", revealsOnCheck ? "items-start" : "items-center", "justify-between gap-4")}>
      <div className={cx("min-w-0 flex-1", revealsOnCheck && "pt-2.5")}>
        <label htmlFor={id} className={cx("block text-base text-text-primary", !disabled && "cursor-pointer")}>
          {label}
        </label>
        {showsDescription ? (
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
            on ? onColor : "bg-surface inset-ring-[1.5px] inset-ring-control-off",
          )}
        >
          <span
            className={cx(
              "size-6.75 rounded-full transition-transform duration-200 motion-reduce:transition-none forced-colors:bg-[CanvasText]",
              on ? "translate-x-5 bg-surface shadow-[0_0.1875rem_0.5rem_rgb(0_0_0/0.15)]" : "scale-75 bg-control-off",
            )}
          />
        </span>
      </button>
    </div>
  );
}
