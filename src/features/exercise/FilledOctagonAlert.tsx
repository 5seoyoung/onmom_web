import { cx } from "@/components/ui";

// SF Symbol exclamationmark.octagon.fill — 채운 팔각형 + 느낌표.
// lucide OctagonAlert에 fill을 주면 느낌표 선이 팔각형보다 먼저 그려져 가려진다(아이콘 경로 순서) — 그래서 직접 그린다.
// 팔각형 경로는 lucide octagon-alert와 같다.
const OCTAGON =
  "M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z";

export interface FilledOctagonAlertProps {
  className?: string;
  /** 팔각형 색(fill-*) */
  shapeClassName: string;
  /** 느낌표 색(stroke-*) */
  markClassName: string;
}

export function FilledOctagonAlert({ className, shapeClassName, markClassName }: FilledOctagonAlertProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={cx("shrink-0", className)}>
      <path d={OCTAGON} className={shapeClassName} />
      <path d="M12 7.5v5M12 16.5h.01" fill="none" strokeWidth={2.25} strokeLinecap="round" className={markClassName} />
    </svg>
  );
}
