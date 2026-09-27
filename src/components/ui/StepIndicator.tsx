import { cx } from "./cx";

export interface StepIndicatorProps {
  /** 0부터 시작하는 현재 단계(iOS와 같음) */
  current: number;
  total: number;
  /** 접근성 이름 — progressbar는 이름이 있어야 한다 */
  label: string;
}

// 온보딩 단계 표시 — OnboardingFlowView.swift:85-97.
// 현재 단계는 primary 20×7 캡슐, 나머지는 divider 7×7, 간격 6. 현재 단계는 색뿐 아니라 길이로도 구분된다.
// 고대비(강제 색) 모드에서는 배경이 지워지므로 현재 단계는 CanvasText로 채우고 나머지는 테두리만 그린다.
export function StepIndicator({ current, total, label }: StepIndicatorProps) {
  const count = Math.max(1, Math.floor(total));
  const index = Math.min(count - 1, Math.max(0, Math.floor(current)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={1}
      aria-valuemax={count}
      aria-valuenow={index + 1}
      aria-valuetext={`${index + 1}/${count}`}
      className="flex items-center gap-1.5"
    >
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className={cx(
            "h-1.75 rounded-full transition-all duration-300 ease-in-out motion-reduce:transition-none",
            i === index
              ? "w-5 bg-primary forced-colors:bg-[CanvasText]"
              : "w-1.75 bg-divider forced-colors:border forced-colors:border-[CanvasText]",
          )}
        />
      ))}
    </div>
  );
}
