"use client";

// 오늘의 질문 답 수정 창 — 설정의 확인 창(features/settings/ConfirmDialog)과 같은 네이티브 <dialog>: showModal()이라 바깥은 비활성·Esc로 닫힘·
// 포커스가 창 안에 갇힌다. 열리면 지금 고른 답에 포커스, 닫히면 브라우저가 연 버튼([수정])으로 포커스를 되돌린다.
// 답은 라디오 묶음(fieldset + legend = 문항) — 화살표 키로 고르고, 칸마다 누르는 영역 44px. 같은 답이면 [저장]을 잠근다.
// 부모가 대상이 있을 때만 그린다 — 열 때마다 그 답에서 시작한다.

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Check } from "lucide-react";
import type { MoodAnswer } from "@/domain/types";
import { RECORD_HISTORY_TEXT, moodAnswerChoices, type HistoryMoodRow } from "./recordHistoryView";

export interface MoodAnswerDialogProps {
  row: HistoryMoodRow;
  onSave(answer: MoodAnswer): void;
  onClose(): void;
}

export function MoodAnswerDialog({ row, onSave, onClose }: MoodAnswerDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const titleId = useId();
  const name = useId();
  const [answer, setAnswer] = useState<MoodAnswer>(row.answer);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
      formRef.current?.querySelector<HTMLInputElement>("input:checked")?.focus();
    }
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (answer === row.answer) return;
    onSave(answer);
    ref.current?.close();
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-[26rem] rounded-card bg-surface p-0 text-text-primary shadow-[0_0.5rem_2rem_rgb(0_0_0/0.16)] backdrop:bg-black/40"
    >
      <form ref={formRef} onSubmit={submit} className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1 text-center">
          <h2 id={titleId} className="text-base font-semibold text-neutral">
            {RECORD_HISTORY_TEXT.moodEditTitle}
          </h2>
          <p className="text-[0.8125rem] text-text-secondary">
            <time dateTime={row.iso}>{row.dateText}</time>
          </p>
        </div>
        <fieldset className="flex min-w-0 flex-col gap-2">
          {/* 문항을 알 수 없는 답(다른 버전)이면 legend는 창 제목과 같은 말 — 묶음 이름이 비지 않게 */}
          <legend className="mb-2 text-[0.9375rem] font-semibold text-text-primary">{row.question ?? RECORD_HISTORY_TEXT.moodEditTitle}</legend>
          <div className="flex gap-2">
            {moodAnswerChoices().map((c) => (
              // 고른 답은 색만이 아니라 체크 아이콘으로도 보인다(고대비 모드에서도)
              <label
                key={c.answer}
                className="group/mood-choice relative flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1 rounded-chip bg-background px-2 py-2.5 text-[0.9375rem] font-semibold text-neutral has-checked:bg-neutral has-checked:text-white has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus-ring forced-colors:border forced-colors:border-[ButtonText]"
              >
                <input
                  type="radio"
                  name={name}
                  value={c.answer}
                  checked={answer === c.answer}
                  onChange={() => setAnswer(c.answer)}
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                />
                <Check aria-hidden className="hidden size-4 shrink-0 group-has-checked/mood-choice:block" strokeWidth={2.5} />
                {c.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-col gap-2">
          <button
            type="submit"
            disabled={answer === row.answer}
            className="flex min-h-11 w-full items-center justify-center rounded-button bg-neutral px-4 py-3 text-base font-semibold text-white disabled:cursor-not-allowed disabled:bg-neutral/30"
          >
            {RECORD_HISTORY_TEXT.save}
          </button>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="flex min-h-11 w-full items-center justify-center rounded-button border-[1.5px] border-divider bg-transparent px-4 py-3 text-base font-semibold text-neutral"
          >
            {RECORD_HISTORY_TEXT.cancel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
