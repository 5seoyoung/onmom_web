"use client";

// 글의 제목·내용 칸 — 글쓰기(JournalWriteScreen)와 글 수정(JournalEditScreen)이 같이 쓴다. iOS PostComposeView(CommunityView.swift:122-141).
// <form>이 아니다(암묵적 제출 없음) — 등록·저장은 머리의 버튼으로만 한다(iOS 제목 TextField에는 onSubmit이 없다, :127).
// 제목 칸의 Enter는 내용 칸으로 넘어간다(한글 조합 중의 Enter는 글자 확정이라 건드리지 않는다).

import { useId, useRef, type KeyboardEvent } from "react";
import { Card } from "@/components/ui";
import { JOURNAL_LIMITS, JOURNAL_TEXT } from "./journalView";

export interface PostFieldsProps {
  title: string;
  body: string;
  onTitleChange(value: string): void;
  onBodyChange(value: string): void;
}

export function PostFields({ title, body, onTitleChange, onBodyChange }: PostFieldsProps) {
  const titleId = useId();
  const bodyId = useId();
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  function handleTitleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // 한글 조합 중의 Enter는 글자 확정 — 건드리지 않는다(Safari는 keyCode 229로 알린다)
    if (e.key !== "Enter" || e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    bodyRef.current?.focus();
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-2">
        <label htmlFor={titleId} className="block text-[0.9375rem] font-semibold text-text-secondary">
          {JOURNAL_TEXT.titleLabel}
        </label>
        <input
          id={titleId}
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          onKeyDown={handleTitleKeyDown}
          placeholder={JOURNAL_TEXT.titlePlaceholder}
          maxLength={JOURNAL_LIMITS.title}
          autoComplete="off"
          enterKeyHint="next"
          required
          className="min-h-11 w-full bg-transparent text-base text-text-primary placeholder:text-text-subtle-aa"
        />
      </Card>
      <Card className="flex flex-col gap-2">
        <label htmlFor={bodyId} className="block text-[0.9375rem] font-semibold text-text-secondary">
          {JOURNAL_TEXT.bodyLabel}
        </label>
        {/* TextEditor 최소 높이 160 · 안쪽 4 · background 라운드 14 (CommunityView.swift:134-137) */}
        <textarea
          ref={bodyRef}
          id={bodyId}
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          maxLength={JOURNAL_LIMITS.body}
          className="min-h-40 w-full resize-y rounded-button bg-background p-1 text-base text-text-primary @xl:min-h-72"
        />
      </Card>
    </div>
  );
}

/** 머리의 등록·저장 버튼 — PC에서 제목 줄(32px) 가운데에 맞추고 머리 높이를 다른 화면과 같게(-my-1.5 — 누르는 영역 44px는 그대로) */
export const POST_HEADER_ACTION_CLASS =
  "flex min-h-11 items-center rounded-button px-2 text-base font-semibold text-primary-text disabled:cursor-not-allowed disabled:text-text-subtle lg:-my-1.5";
