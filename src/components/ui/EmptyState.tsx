import type { ReactNode } from "react";
import { Card } from "./Card";

export interface EmptyStateProps {
  /** 데이터가 없다는 사실을 말하는 문장. 예시 데이터로 채우지 않는다(원칙 3). */
  message: string;
  /**
   * card = 카드 안 13 textSecondary(CommunityView.swift:69-75)
   * plain = 카드 없이 16 textSecondary, 위아래 lg(ExerciseView.swift:59-62)
   */
  variant?: "card" | "plain";
  /** 빈 상태에서 할 수 있는 다음 행동(버튼 등) */
  children?: ReactNode;
}

export function EmptyState({ message, variant = "card", children }: EmptyStateProps) {
  if (variant === "plain") {
    return (
      <div className="flex w-full flex-col gap-3 py-6">
        <p className="text-base text-text-secondary">{message}</p>
        {children}
      </div>
    );
  }
  return (
    <Card className="flex flex-col gap-3">
      <p className="text-[0.8125rem] text-text-secondary">{message}</p>
      {children}
    </Card>
  );
}
