// 운동 탭 맨 위 "오늘의 체조" 카드 — 무엇을 보일지는 todayRoutine.ts가 정하고, 여기서는 그리기만 한다.
// 단계 제목(굵게)과 단계 요약(content.json 그대로)을 단계순 목록으로. 안내 블록과 같은 읽기 폭(READING_BLOCK).
// 목록은 하루 동안 바뀌지 않아(자정에만 바뀐다) live region을 두지 않는다.

import { useId } from "react";
import { PersonStanding } from "lucide-react";
import { READING_BLOCK } from "@/components/shell/pageFrame";
import { Card, cx } from "@/components/ui";
import type { TodayRoutineModel } from "./todayRoutine";

export function TodayRoutineCard({ routine }: { routine: Extract<TodayRoutineModel, { kind: "routine" }> }) {
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
    </Card>
  );
}
