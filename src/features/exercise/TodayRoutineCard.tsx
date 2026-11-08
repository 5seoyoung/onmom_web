// 운동 탭 맨 위 "오늘의 체조" 카드 — 무엇을 보일지는 todayRoutine.ts가 정하고, 여기서는 그리기만 한다.
// 단계 제목(굵게)과 단계 요약(content.json 그대로)을 단계순 목록으로, 그 아래 멈춤 안내·(있으면) 주의 사항 링크·[오늘 했어요].
// 안내 블록과 같은 읽기 폭(READING_BLOCK).
//
// [오늘 했어요]는 눌림 상태가 있는 버튼(aria-pressed) — 다시 누르면 오늘 체크를 취소한다. 높이 44px 이상.
// "이번 주 n일"은 늘 있는 live region(polite) 안에서 바뀐다 — 누른 뒤 바뀐 수를 스크린리더가 읽는다.
// 저장소를 쓸 수 없으면(check = null) 버튼·"이번 주"·저장 안내를 그리지 않는다.

import { useId } from "react";
import Link from "next/link";
import { ChevronRight, Circle, CircleCheck, PersonStanding } from "lucide-react";
import { READING_BLOCK } from "@/components/shell/pageFrame";
import { Card, cx } from "@/components/ui";
import type { RoutineCheckModel, TodayRoutineModel } from "./todayRoutine";

export interface TodayRoutineCardProps {
  routine: Extract<TodayRoutineModel, { kind: "routine" }>;
  /** null이면 체크를 그리지 않는다(저장소를 쓸 수 없음) */
  check: RoutineCheckModel | null;
  onToggleCheck?: () => void;
}

export function TodayRoutineCard({ routine, check, onToggleCheck }: TodayRoutineCardProps) {
  const headingId = useId();
  return (
    <Card as="section" aria-labelledby={headingId} className={cx("flex flex-col gap-3", READING_BLOCK)}>
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="flex items-center gap-2 text-base font-bold text-neutral">
          <PersonStanding aria-hidden className="size-5 shrink-0 text-primary" />
          {routine.heading}
        </h2>
        <p className="text-[0.8125rem] text-text-secondary">{routine.intro}</p>
      </div>
      <ol className="flex flex-col gap-2">
        {routine.items.map((item) => (
          <li key={item.key} className="flex flex-col gap-0.5 rounded-button bg-background px-4 py-3">
            <span className="text-[0.9375rem] font-semibold text-text-primary">{item.title}</span>
            <span className="text-[0.8125rem] text-text-secondary">{item.summary}</span>
          </li>
        ))}
      </ol>
      <p className="text-[0.8125rem] text-text-secondary">{routine.stopNote}</p>
      {routine.caution !== null ? (
        <div className="flex flex-col">
          <p className="text-[0.8125rem] text-state-watch-text">{routine.caution.text}</p>
          <Link
            href={routine.caution.href}
            className="-mx-1 inline-flex min-h-11 w-fit items-center gap-1 rounded-button px-1 text-sm font-medium text-primary-text"
          >
            {routine.caution.linkLabel}
            <ChevronRight aria-hidden className="size-4 shrink-0" />
          </Link>
        </div>
      ) : null}
      {check !== null ? (
        <div className="flex flex-col gap-2 border-t border-divider pt-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <button
              type="button"
              aria-pressed={check.done}
              onClick={onToggleCheck}
              className={cx(
                "inline-flex min-h-11 items-center gap-2 rounded-button px-4 text-sm font-semibold ring-1",
                check.done ? "bg-primary/15 text-primary-text ring-primary" : "bg-surface text-text-primary ring-divider",
              )}
            >
              {check.done ? (
                <CircleCheck aria-hidden className="size-5 shrink-0 fill-primary text-surface" />
              ) : (
                <Circle aria-hidden className="size-5 shrink-0 text-divider" />
              )}
              {check.label}
            </button>
            {/* 비어 있어도 숨기지 않는다(display:none인 live region은 바뀐 글자를 읽지 않는 스크린리더가 있다) */}
            <p aria-live="polite" className="text-[0.8125rem] font-medium text-text-secondary">
              {check.weekText}
            </p>
          </div>
          <p className="text-xs text-text-secondary">{check.deviceNote}</p>
        </div>
      ) : null}
    </Card>
  );
}
