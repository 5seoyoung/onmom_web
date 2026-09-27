import type { MetricStatus } from "@/domain/types";
import { cx } from "./cx";
import { METRIC_STATUS_LABEL } from "./labels";

/**
 * metric   = 홈 회복 지표 배지: 색 12% 배경, 위아래 5(HomeView.swift:482-497)
 * exercise = 운동 영상 배지: 색 15% 배경, 위아래 4(ExerciseView.swift:197-214)
 */
export type StatusBadgeVariant = "metric" | "exercise";

export interface StatusBadgeProps {
  status: MetricStatus;
  /** 보이는 글자. 없으면 지표 라벨(정상/관찰/확인 필요). 색만으로 상태를 전하지 않도록 글자는 항상 나온다. */
  label?: string;
  variant?: StatusBadgeVariant;
}

// Tailwind가 클래스를 찾을 수 있게 조합을 전부 적어 둔다.
const TONE: Record<StatusBadgeVariant, Record<MetricStatus, string>> = {
  metric: {
    normal: "bg-state-normal/12 text-state-normal",
    watch: "bg-state-watch/12 text-state-watch",
    alert: "bg-state-alert/12 text-state-alert",
  },
  exercise: {
    normal: "bg-state-normal/15 text-state-normal",
    watch: "bg-state-watch/15 text-state-watch",
    alert: "bg-state-alert/15 text-state-alert",
  },
};

const PADDING: Record<StatusBadgeVariant, string> = {
  metric: "px-2.5 py-1.25",
  exercise: "px-2.5 py-1",
};

/** 보이는 글자. 비었거나 공백뿐이면 지표 라벨로 — 빈 색 캡슐(색만으로 상태 전달)이 되지 않게. */
function badgeText(status: MetricStatus, label?: string): string {
  const trimmed = label?.trim();
  return trimmed ? trimmed : METRIC_STATUS_LABEL[status];
}

export function StatusBadge({ status, label, variant = "metric" }: StatusBadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-full text-[0.8125rem] font-semibold",
        PADDING[variant],
        TONE[variant][status],
      )}
    >
      {badgeText(status, label)}
    </span>
  );
}
