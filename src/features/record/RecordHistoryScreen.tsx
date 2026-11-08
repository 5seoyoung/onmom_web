"use client";

// 전체 기록 — 기록 탭 > [전체 기록 보기](/record/history/). 웹 전용(iOS는 최근 5건만 — LAUNCH_CHECKLIST 7-4).
// 증상 기록 전부(최신순)와 오늘의 질문 답 전부(최신순). 기록마다 [수정]·[삭제]:
// - 증상 기록 [수정] → 기록 수정 화면(/record/edit/?id=) — 고친 답으로 안내를 다시 확인한다(RecordEditScreen).
// - 답 [수정] → 답 수정 창(MoodAnswerDialog) — 네·글쎄요·아니요.
// - [삭제] → 확인 창(features/settings/ConfirmDialog — [취소]에 포커스) → 삭제. 지운 기록은 삭제 표시(id·시각만)를 남겨
//   다른 탭·서버 사본이 되살리지 않는다(store/tombstones). 지운 뒤 그 줄이 사라지므로 포커스를 묶음 제목으로 옮기고,
//   화면 낭독기에 "기록을 삭제했어요."를 알린다(role="status").
// 저장소를 읽기 전(hydrated=false)에는 제목만 — 빈 목록이 번쩍이지 않게. 저장 실패 안내는 머리 아래(막지 않는다).

import Link from "next/link";
import { useId, useRef, useState, type RefObject } from "react";
import { PAGE_FRAME } from "@/components/shell/pageFrame";
import { Card, DisclaimerBanner, SubPageHeader, cx } from "@/components/ui";
import type { MoodAnswer } from "@/domain/types";
import { StorageWarning } from "@/features/home/StorageWarning";
import { ConfirmDialog } from "@/features/settings/ConfirmDialog";
import { ROUTES } from "@/routes";
import { useAppStore } from "@/store/useAppStore";
import { MoodAnswerDialog } from "./MoodAnswerDialog";
import {
  RECORD_HISTORY_TEXT,
  historyMoodRows,
  historyRecordRows,
  moodActionLabel,
  recordActionLabel,
  type HistoryMoodRow,
  type HistoryRecordRow,
} from "./recordHistoryView";
import { RECORD_TEXT } from "./recordView";

/** 줄마다의 작은 버튼 — 보이는 글자는 짧고, 누르는 영역은 44px */
const ROW_ACTION = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-button px-3 text-[0.9375rem] font-semibold";
const EDIT_ACTION = cx(ROW_ACTION, "text-text-secondary");
const DELETE_ACTION = cx(ROW_ACTION, "text-state-alert-text");
/** 묶음 제목 — 카드 소제목(SectionTitle)과 같은 모양. 지운 뒤 포커스를 받는다(링 없이 — 초점 이동용) */
const HEADING = "block w-full text-[0.9375rem] font-semibold text-text-secondary focus:outline-none";

export function RecordHistoryScreen() {
  const { hydrated } = useAppStore();
  return (
    // PC 틀은 pageFrame(읽기 화면 — 최대 48rem, 왼쪽 정렬). 기록 탭 아래 화면이라 PC에서도 [뒤로]가 맨 위 줄에 있다.
    <main className={cx("flex flex-1 flex-col gap-4 px-6 pt-2 pb-6", PAGE_FRAME.reading)}>
      <SubPageHeader title={RECORD_HISTORY_TEXT.title} subtitle={RECORD_HISTORY_TEXT.subtitle} backHref={ROUTES.record} />
      <StorageWarning />
      {hydrated ? <HistoryBody /> : null}
      <DisclaimerBanner />
    </main>
  );
}

type PendingDelete = { kind: "record" | "mood"; id: string };

function HistoryBody() {
  const { state, actions } = useAppStore();
  const recordHeadingRef = useRef<HTMLHeadingElement>(null);
  const moodHeadingRef = useRef<HTMLHeadingElement>(null);
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const [editing, setEditing] = useState<HistoryMoodRow | null>(null);
  const [announcement, setAnnouncement] = useState("");

  /** 낭독 알림 — 같은 말을 두 번 해도 다시 들리게 비운 뒤 채운다 */
  function announce(text: string, focusTarget?: RefObject<HTMLElement | null>) {
    setAnnouncement("");
    requestAnimationFrame(() => {
      setAnnouncement(text);
      focusTarget?.current?.focus();
    });
  }

  function confirmDelete() {
    if (pending === null) return;
    const done = pending.kind === "record" ? actions.deleteSymptomRecord(pending.id) : actions.deleteMoodCheck(pending.id);
    setPending(null);
    if (done) announce(RECORD_HISTORY_TEXT.deleted, pending.kind === "record" ? recordHeadingRef : moodHeadingRef);
  }

  function saveMood(answer: MoodAnswer) {
    if (editing !== null && actions.updateMoodAnswer(editing.id, answer)) announce(RECORD_HISTORY_TEXT.moodEdited);
  }

  return (
    <>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <SymptomHistorySection
        rows={historyRecordRows(state.symptomHistory)}
        headingRef={recordHeadingRef}
        onDelete={(id) => setPending({ kind: "record", id })}
      />
      <MoodHistorySection
        rows={historyMoodRows(state.moodChecks)}
        headingRef={moodHeadingRef}
        onEdit={setEditing}
        onDelete={(id) => setPending({ kind: "mood", id })}
      />
      <ConfirmDialog
        open={pending !== null}
        title={pending?.kind === "mood" ? RECORD_HISTORY_TEXT.deleteMoodTitle : RECORD_HISTORY_TEXT.deleteRecordTitle}
        message={RECORD_HISTORY_TEXT.deleteMessage}
        confirmLabel={RECORD_HISTORY_TEXT.delete}
        cancelLabel={RECORD_HISTORY_TEXT.cancel}
        onConfirm={confirmDelete}
        onClose={() => setPending(null)}
      />
      {editing !== null ? <MoodAnswerDialog key={editing.id} row={editing} onSave={saveMood} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function EditedMark() {
  return <span className="shrink-0 text-xs text-text-secondary">· {RECORD_HISTORY_TEXT.edited}</span>;
}

export interface SymptomHistorySectionProps {
  rows: readonly HistoryRecordRow[];
  headingRef?: RefObject<HTMLHeadingElement | null>;
  onDelete(id: string): void;
}

/** 증상 기록 전부 — 점(8)·날짜·결과 글자(최근 기록과 같은 모양) + 살펴볼 값 + [수정]·[삭제] */
export function SymptomHistorySection({ rows, headingRef, onDelete }: SymptomHistorySectionProps) {
  const titleId = useId();
  return (
    <Card as="section" aria-labelledby={titleId} className="flex flex-col gap-2">
      <h2 id={titleId} ref={headingRef} tabIndex={-1} className={HEADING}>
        {RECORD_HISTORY_TEXT.symptomSection}
      </h2>
      {rows.length === 0 ? (
        <p className="text-[0.8125rem] text-text-secondary">{RECORD_HISTORY_TEXT.symptomEmpty}</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 border-t border-divider py-2 first:border-t-0 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span aria-hidden className={`size-2 shrink-0 rounded-full ${r.flagged ? "bg-state-alert" : "bg-state-normal"}`} />
                <time dateTime={r.iso} className="text-[0.8125rem] text-text-secondary">
                  {r.dateText}
                </time>
                {r.edited ? <EditedMark /> : null}
                <span className={`ml-auto text-[0.8125rem] font-semibold ${r.flagged ? "text-state-alert-text" : "text-state-normal-text"}`}>
                  {r.label}
                </span>
              </div>
              {r.signals.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5 pl-4">
                  {r.signals.map((label) => (
                    <li key={label} className="rounded-full bg-state-alert/12 px-2.5 py-1 text-xs font-medium text-state-alert-text">
                      {label}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="-mr-3 flex justify-end">
                <Link href={r.editHref} aria-label={recordActionLabel(r.dateText, RECORD_HISTORY_TEXT.edit)} className={EDIT_ACTION}>
                  {RECORD_HISTORY_TEXT.edit}
                </Link>
                <button
                  type="button"
                  onClick={() => onDelete(r.id)}
                  aria-label={recordActionLabel(r.dateText, RECORD_HISTORY_TEXT.delete)}
                  aria-haspopup="dialog"
                  className={DELETE_ACTION}
                >
                  {RECORD_HISTORY_TEXT.delete}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export interface MoodHistorySectionProps {
  rows: readonly HistoryMoodRow[];
  headingRef?: RefObject<HTMLHeadingElement | null>;
  onEdit(row: HistoryMoodRow): void;
  onDelete(id: string): void;
}

/** 오늘의 질문 답 전부 — 날짜·문항(알 수 있을 때)·답 + [수정]·[삭제]. 점수·등급은 보이지 않는다(원칙 1). */
export function MoodHistorySection({ rows, headingRef, onEdit, onDelete }: MoodHistorySectionProps) {
  const titleId = useId();
  return (
    <Card as="section" aria-labelledby={titleId} className="flex flex-col gap-2">
      <h2 id={titleId} ref={headingRef} tabIndex={-1} className={HEADING}>
        {RECORD_TEXT.moodTitle}
      </h2>
      {rows.length === 0 ? (
        <p className="text-[0.8125rem] text-text-secondary">{RECORD_HISTORY_TEXT.moodEmpty}</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((m) => (
            <li key={m.id} className="flex flex-col gap-1 border-t border-divider py-2 first:border-t-0 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <time dateTime={m.iso} className="text-[0.8125rem] text-text-secondary">
                  {m.dateText}
                </time>
                {m.edited ? <EditedMark /> : null}
                <span className="ml-auto text-[0.8125rem] font-semibold text-text-primary">{m.answerLabel}</span>
              </div>
              {m.question !== null ? <p className="text-[0.9375rem] text-text-primary">{m.question}</p> : null}
              <div className="-mr-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => onEdit(m)}
                  aria-label={moodActionLabel(m.dateText, RECORD_HISTORY_TEXT.edit)}
                  aria-haspopup="dialog"
                  className={EDIT_ACTION}
                >
                  {RECORD_HISTORY_TEXT.edit}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(m.id)}
                  aria-label={moodActionLabel(m.dateText, RECORD_HISTORY_TEXT.delete)}
                  aria-haspopup="dialog"
                  className={DELETE_ACTION}
                >
                  {RECORD_HISTORY_TEXT.delete}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
