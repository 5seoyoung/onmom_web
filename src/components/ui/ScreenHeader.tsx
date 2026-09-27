import type { ReactNode } from "react";

export interface ScreenHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** caption = 13(대부분의 화면), body = 16(회복 단계 분석 폼 안내문, AnalyzeFlowView.swift:72-74) */
  subtitleSize?: "caption" | "body";
  /** 제목 오른쪽 버튼 자리(닫기·글쓰기 등) */
  action?: ReactNode;
}

// 화면 제목 — 24 bold neutral + 13 textSecondary 부제, 간격 xs, 위아래 sm
// (RecordFlowView.swift:146-158, ExerciseView.swift:105-115, GuideView.swift:95-103).
export function ScreenHeader({ title, subtitle, subtitleSize = "caption", action }: ScreenHeaderProps) {
  return (
    <header className="flex w-full items-start justify-between gap-3 py-2">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-2xl font-bold text-neutral">{title}</h1>
        {subtitle ? (
          <p className={subtitleSize === "body" ? "text-base text-text-secondary" : "text-[0.8125rem] text-text-secondary"}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
