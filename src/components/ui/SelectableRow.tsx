import type { ReactNode } from "react";
import { Circle, CircleCheck, type LucideIcon } from "lucide-react";

export interface SelectableRowProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  /** 같은 선택지 묶음은 같은 name — 브라우저가 라디오 묶음(화살표 키 이동)으로 다룬다 */
  name: string;
  value: string;
  /** 제어 모드. 쓰면 onSelect도 함께 준다. */
  checked?: boolean;
  /** 비제어 모드 초기값 */
  defaultChecked?: boolean;
  onSelect?: (value: string) => void;
  disabled?: boolean;
}

// 한 가지를 고르는 행(분만 방식·목표) — Components.swift:43-86.
// 아이콘 원 44(선택 시 primary 15% + primary 아이콘) + 제목 16 semibold / 부제 13 + 오른쪽 체크 원 22.
// 카드 배경은 선택과 무관하게 surface, 선택 시 테두리만 primary 1.5(06 §4의 "틴트 배경"은 오기, 검수 #62).
// 실제 라디오 입력을 쓰므로 스크린리더·키보드가 선택 상태를 그대로 안다.
// 선택 모양은 이 행의 라디오만 본다: 이름 붙은 그룹(group/selectable-row)이라, 바깥에 `group` 클래스가 있어도
// 다른 행·다른 입력의 선택이 번지지 않는다(Swift도 행마다 isSelected).
// 테두리(ring)는 box-shadow라 고대비 모드에서 사라지므로, 그때만 시스템 색 테두리를 그린다.
export function SelectableRow({
  icon: Icon,
  title,
  subtitle,
  name,
  value,
  checked,
  defaultChecked,
  onSelect,
  disabled,
}: SelectableRowProps) {
  return (
    <label className="group/selectable-row relative flex min-h-11 w-full cursor-pointer items-center gap-4 rounded-card bg-surface p-4 text-left ring-1 ring-divider has-checked:ring-[1.5px] has-checked:ring-primary has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus-ring has-disabled:cursor-not-allowed has-disabled:opacity-50 forced-colors:border forced-colors:border-[CanvasText]">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        defaultChecked={defaultChecked}
        disabled={disabled}
        onChange={onSelect ? () => onSelect(value) : undefined}
        readOnly={checked !== undefined && !onSelect}
        className="sr-only"
      />
      <span
        aria-hidden
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-background text-text-secondary group-has-checked/selectable-row:bg-primary/15 group-has-checked/selectable-row:text-primary"
      >
        <Icon className="size-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-base font-semibold text-text-primary">{title}</span>
        {subtitle ? <span className="text-[0.8125rem] text-text-secondary">{subtitle}</span> : null}
      </span>
      <Circle aria-hidden className="size-5.5 shrink-0 text-divider group-has-checked/selectable-row:hidden" />
      <CircleCheck aria-hidden className="hidden size-5.5 shrink-0 fill-primary text-surface group-has-checked/selectable-row:block" />
    </label>
  );
}

/**
 * 묶음의 접근성 이름은 필수(radiogroup은 이름이 있어야 한다) — label 또는 labelledBy 중 하나만.
 * 화면에 보이는 제목이 있으면 labelledBy로 그 id를 준다.
 */
export type SelectableGroupProps = { children: ReactNode } & (
  | { label: string; labelledBy?: never }
  | { labelledBy: string; label?: never }
);

/** SelectableRow 묶음 — 간격 md(OnboardingFlowView.swift:167, 205). */
export function SelectableGroup({ children, label, labelledBy }: SelectableGroupProps) {
  return (
    <div role="radiogroup" aria-label={label} aria-labelledby={labelledBy} className="flex w-full flex-col gap-4">
      {children}
    </div>
  );
}
