"use client";

// CSV 내려받기 사유 확인 창 — 안전성 확보조치 기준 제8조②(내려받은 것은 그 사유를 확인)를 위해 사유를 받아 접근 기록(admin_audit)에 함께 남긴다
// (supabase/migrations/0014_admin_hardening.sql admin_log_users_export). 사유 없이는 내려받지 않는다.
// 계정 삭제 확인 창(DeleteUserDialog)과 같은 네이티브 <dialog>: 바깥 비활성·Esc 닫기·포커스 갇힘. 열리면 사유 칸에 포커스.
// 부모가 열 때만 그린다 — 열 때마다 사유가 비어 있다. 확정하면 부모가 창을 닫고 내려받기를 시작한다.

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { cx } from "@/components/ui/cx";
import { ADMIN_TEXT, CSV_REASON_MAX, csvReasonProblem, normalizeCsvReason } from "./adminModel";

export interface CsvReasonDialogProps {
  onConfirm(reason: string): void;
  onClose(): void;
}

const FIELD_CLASS = "min-h-11 w-full rounded-button bg-background px-3 py-2 text-base text-text-primary placeholder:text-text-subtle-aa";

export function CsvReasonDialog({ onConfirm, onClose }: CsvReasonDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  const noteId = useId();
  const reasonId = useId();
  const errorId = useId();
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
      reasonRef.current?.focus();
    }
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    const normalized = normalizeCsvReason(reason);
    const p = csvReasonProblem(normalized);
    if (p !== null) {
      setProblem(p);
      reasonRef.current?.focus();
      return;
    }
    onConfirm(normalized);
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={noteId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-[26rem] rounded-card bg-surface p-0 text-text-primary shadow-[0_0.5rem_2rem_rgb(0_0_0/0.16)] backdrop:bg-black/40"
    >
      <form onSubmit={submit} className="flex flex-col gap-4 p-5" noValidate>
        <div className="flex flex-col gap-2 text-center">
          <h2 id={titleId} className="text-base font-semibold text-neutral">
            {ADMIN_TEXT.csvReasonTitle}
          </h2>
          <p id={noteId} className="text-[0.8125rem] text-text-secondary">
            {ADMIN_TEXT.csvNote} {ADMIN_TEXT.csvKeepNote}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={reasonId} className="text-[0.9375rem] font-semibold text-text-secondary">
            {ADMIN_TEXT.csvReasonLabel}
          </label>
          <textarea
            ref={reasonRef}
            id={reasonId}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setProblem(null);
            }}
            maxLength={CSV_REASON_MAX}
            rows={2}
            required
            aria-invalid={problem !== null || undefined}
            aria-describedby={problem !== null ? errorId : undefined}
            className={cx(FIELD_CLASS, "resize-y")}
          />
        </div>

        <div id={errorId} role="alert" className="empty:hidden text-[0.8125rem] font-semibold text-state-alert-text">
          {problem}
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="submit"
            className="flex min-h-11 w-full items-center justify-center rounded-button bg-neutral px-4 py-3 text-base font-semibold text-white"
          >
            {ADMIN_TEXT.csvReasonConfirm}
          </button>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="flex min-h-11 w-full items-center justify-center rounded-button border-[1.5px] border-divider bg-transparent px-4 py-3 text-base font-semibold text-neutral"
          >
            {ADMIN_TEXT.cancel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
