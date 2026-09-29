"use client";

// 되돌리기 어려운 동작(로그아웃·계정 삭제)의 확인 창 — iOS .confirmationDialog(MoreView.swift:95-110)를 네이티브 <dialog>로.
// showModal()이라 바깥은 비활성(inert)·Esc로 닫힘·포커스가 창 안에 갇힌다. 열리면 [취소]에 포커스를 둔다(실수로 확정하지 않게).
// 배경(창 바깥)을 누르면 iOS처럼 닫힌다. 확정 버튼이 위, [취소]가 아래(iOS 액션 시트 순서).

import { useEffect, useId, useRef } from "react";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  /** 취소·Esc·바깥 누름 — 부모가 open을 false로 바꾼다 */
  onClose: () => void;
}

export function ConfirmDialog({ open, title, message, confirmLabel, cancelLabel, onConfirm, onClose }: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      cancelRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={messageId}
      // Esc·close() 모두 close 이벤트로 온다 — 부모 상태를 맞춘다
      onClose={onClose}
      onClick={(e) => {
        // 창 안쪽은 아래 div가 받으므로, 대상이 <dialog> 자신이면 배경을 누른 것
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-[26rem] rounded-card bg-surface p-0 text-text-primary shadow-[0_0.5rem_2rem_rgb(0_0_0/0.16)] backdrop:bg-black/40"
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-2 text-center">
          <h2 id={titleId} className="text-base font-semibold text-neutral">
            {title}
          </h2>
          <p id={messageId} className="text-[0.8125rem] whitespace-pre-line text-text-secondary">
            {message}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className="flex min-h-11 w-full items-center justify-center rounded-button bg-coral-tint px-4 py-3 text-base font-semibold text-state-alert-text"
          >
            {confirmLabel}
          </button>
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            // SecondaryButton 모양(divider 1.5 테두리 · neutral 글씨) — ref가 필요해 같은 모양을 직접 쓴다
            className="flex min-h-11 w-full items-center justify-center rounded-button border-[1.5px] border-divider bg-transparent px-4 py-3 text-base font-semibold text-neutral"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
