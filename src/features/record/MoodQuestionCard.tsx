"use client";

import { useId, useRef } from "react";
import { CircleCheck } from "lucide-react";
import { Card, SectionTitle } from "@/components/ui";
import type { MoodAnswer } from "@/domain/types";
import { RECORD_TEXT, type MoodCardModel } from "./recordView";

// 오늘의 한 가지 질문 — RecordFlowView.swift:57-104.
// 답하지 않았으면 문항 17 semibold + 답 버튼 3개(네/글쎄요/아니요, background 칩) + 안내 12 textSubtle(각주는 model.note —
// 저장 위치에 맞는 문구, recordView moodNoteFor).
// 답했으면 체크 아이콘(stateNormal) + "오늘은 「{답}」라고 답했어요. 내일 또 물어볼게요." 15 textSecondary.
// 점수·등급은 보이지 않는다(원칙 1).

export interface MoodQuestionCardProps {
  model: MoodCardModel;
  onAnswer: (questionID: number, answer: MoodAnswer) => void;
}

export function MoodQuestionCard({ model, onAnswer }: MoodQuestionCardProps) {
  const titleId = useId();
  const questionId = useId();
  const answeredRef = useRef<HTMLParagraphElement>(null);

  function answer(questionID: number, value: MoodAnswer) {
    onAnswer(questionID, value);
    // 누른 버튼이 사라지므로 포커스를 답 문구로 옮긴다(키보드·스크린리더가 결과를 바로 듣게)
    requestAnimationFrame(() => answeredRef.current?.focus());
  }

  return (
    <Card as="section" aria-labelledby={titleId} className="flex flex-col gap-2">
      <SectionTitle id={titleId}>{RECORD_TEXT.moodTitle}</SectionTitle>
      {model.kind === "answered" ? (
        <div className="flex items-center gap-2">
          <CircleCheck aria-hidden className="size-[1.0625rem] shrink-0 fill-state-normal text-surface" />
          <p ref={answeredRef} tabIndex={-1} className="text-[0.9375rem] text-text-secondary focus:outline-none">
            {model.text}
          </p>
        </div>
      ) : (
        <>
          <p id={questionId} className="text-[1.0625rem] font-semibold text-text-primary">
            {model.question.text}
          </p>
          <div role="group" aria-labelledby={questionId} className="flex gap-2">
            {model.answers.map((a) => (
              <button
                key={a.answer}
                type="button"
                onClick={() => answer(model.question.id, a.answer)}
                className="min-h-11 flex-1 rounded-chip bg-background px-2 py-2.5 text-[0.9375rem] font-semibold text-neutral forced-colors:border forced-colors:border-[ButtonText]"
              >
                {a.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-text-subtle-aa">{model.note}</p>
        </>
      )}
    </Card>
  );
}
