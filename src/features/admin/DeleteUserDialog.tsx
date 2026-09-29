"use client";

// 계정 삭제(관리자 — 이용자의 삭제 요청 처리) 확인 창. 되돌릴 수 없어 계정 ID 앞 8자리를 직접 입력해야 확정된다.
// 설정의 확인 창(features/settings/ConfirmDialog)과 같은 네이티브 <dialog>: 바깥 비활성·Esc 닫기·포커스 갇힘. 열리면 입력 칸에 포커스.
// 삭제 중에는 Esc·바깥 누름으로 닫히지 않는다(요청이 가는 동안 상태를 잃지 않게). 서버가 지우고 admin_audit에 남긴다(0005_admin_tools.sql).
// 부모가 대상이 있을 때만 그린다 — 열 때마다 입력이 비어 있다.

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { cx } from "@/components/ui/cx";
import { ADMIN_TEXT, DELETE_REASON_MAX, deleteConfirmMatches, deleteReasonProblem, normalizeDeleteReason, type UserRowView } from "./adminModel";

export interface DeleteUserDialogProps {
  target: UserRowView;
  busy: boolean;
  /** 서버가 거절한 이유(문장) — 없으면 null */
  error: string | null;
  onConfirm(reason: string | null): void;
  onClose(): void;
}

const FIELD_CLASS = "min-h-11 w-full rounded-button bg-background px-3 text-base text-text-primary placeholder:text-text-subtle-aa";

export function DeleteUserDialog({ target, busy, error, onConfirm, onClose }: DeleteUserDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  const messageId = useId();
  const inputId = useId();
  const reasonId = useId();
  const errorId = useId();
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const [mismatch, setMismatch] = useState(false);
  // 사유에 이메일 주소가 있으면(감사 기록에 남으면 안 된다) 보내지 않고 문장으로 — adminModel deleteReasonProblem
  const [reasonProblem, setReasonProblem] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
      inputRef.current?.focus();
    }
  }, []);

  // 서버가 거절하면(삭제 중 단추·입력이 잠겨 포커스가 창 밖 body로 떨어진다) 확인 입력으로 되돌린다 — 입력은 오류 문장을 aria-describedby로 읽는다
  useEffect(() => {
    if (!busy && error !== null) inputRef.current?.focus();
  }, [busy, error]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!deleteConfirmMatches(typed, target.id)) {
      setMismatch(true);
      inputRef.current?.focus();
      return;
    }
    setMismatch(false);
    const normalized = normalizeDeleteReason(reason);
    const problem = deleteReasonProblem(normalized);
    if (problem !== null) {
      setReasonProblem(problem);
      reasonRef.current?.focus();
      return;
    }
    setReasonProblem(null);
    onConfirm(normalized);
  }

  const shownError = mismatch ? ADMIN_TEXT.deleteMismatch : (reasonProblem ?? error);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={messageId}
      // Esc — 삭제 중에는 막는다
      onCancel={(e) => {
        if (busy) e.preventDefault();
      }}
      onClose={onClose}
      onClick={(e) => {
        if (busy) return;
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-[26rem] rounded-card bg-surface p-0 text-text-primary shadow-[0_0.5rem_2rem_rgb(0_0_0/0.16)] backdrop:bg-black/40"
    >
      <form onSubmit={submit} className="flex flex-col gap-4 p-5" aria-busy={busy}>
        <div className="flex flex-col gap-2 text-center">
          <h2 id={titleId} className="text-base font-semibold text-neutral">
            {ADMIN_TEXT.deleteTitle}
          </h2>
          <p id={messageId} className="text-[0.8125rem] text-text-secondary">
            {ADMIN_TEXT.deleteMessage}
          </p>
        </div>

        {/* 대상 — 계정 ID 전체(앞 8자리 굵게)·유형·가입일. 건강 기록은 없다. */}
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-chip bg-background px-3 py-2 text-[0.8125rem]">
          <dt className="text-text-secondary">{ADMIN_TEXT.colAccountId}</dt>
          <dd className="break-all font-mono text-text-primary">
            <strong className="font-bold">{target.shortId}</strong>
            {target.id.slice(target.shortId.length)}
          </dd>
          <dt className="text-text-secondary">{ADMIN_TEXT.colKind}</dt>
          <dd className="text-text-primary">{target.kindLabel}</dd>
          <dt className="text-text-secondary">{ADMIN_TEXT.colCreated}</dt>
          <dd className="text-text-primary tabular-nums">{target.created}</dd>
        </dl>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={inputId} className="text-[0.9375rem] font-semibold text-text-secondary">
            {ADMIN_TEXT.deleteInputLabel}
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value);
              setMismatch(false);
            }}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={8}
            inputMode="text"
            aria-invalid={mismatch || undefined}
            aria-describedby={shownError !== null ? errorId : undefined}
            disabled={busy}
            className={cx(FIELD_CLASS, "font-mono tracking-wider")}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={reasonId} className="text-[0.9375rem] font-semibold text-text-secondary">
            {ADMIN_TEXT.deleteReasonLabel}
          </label>
          <textarea
            ref={reasonRef}
            id={reasonId}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setReasonProblem(null);
            }}
            maxLength={DELETE_REASON_MAX}
            rows={2}
            disabled={busy}
            aria-invalid={reasonProblem !== null || undefined}
            aria-describedby={reasonProblem !== null ? errorId : undefined}
            className={cx(FIELD_CLASS, "resize-y py-2")}
          />
        </div>

        <div id={errorId} role="alert" className="empty:hidden text-[0.8125rem] font-semibold text-state-alert-text">
          {shownError}
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="submit"
            disabled={busy}
            className="flex min-h-11 w-full items-center justify-center rounded-button bg-coral-tint px-4 py-3 text-base font-semibold text-state-alert-text disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? ADMIN_TEXT.deleting : ADMIN_TEXT.deleteUser}
          </button>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            disabled={busy}
            className="flex min-h-11 w-full items-center justify-center rounded-button border-[1.5px] border-divider bg-transparent px-4 py-3 text-base font-semibold text-neutral disabled:cursor-not-allowed disabled:opacity-50"
          >
            {ADMIN_TEXT.cancel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
