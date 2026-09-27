"use client";

// 기록장 글쓰기 — iOS PostComposeView(CommunityView.swift:113-162)의 시트를 웹에서는 하위 화면으로.
// [취소] = 시트를 닫듯 떠남(앱 안에서 왔으면 뒤로), [등록] = 제목이 있을 때만(앞뒤 공백 제외). 본문은 선택.
// 등록은 머리의 [등록] 버튼으로만 한다 — iOS 제목 TextField에는 onSubmit이 없어 Return으로 올라가지 않는다(:127).
// 그래서 <form>을 쓰지 않고(암묵적 제출 없음), 제목 칸의 Enter는 내용 칸으로 넘어간다.
// 저장 규칙(trim·작성자 스냅샷·최신순)은 store가 한다 — 여기서는 넘기기만.

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { PAGE_FRAME } from "@/components/shell/pageFrame";
import { Card, cx } from "@/components/ui";
import { LeaveSubPageHeader, useLeaveSubPage } from "@/features/profile/LeaveSubPage";
import { canSubmitPost } from "@/store/state";
import { useAppStore } from "@/store/useAppStore";
import { JOURNAL_HREF, JOURNAL_TEXT } from "./journalView";

export function JournalWriteScreen() {
  const { actions } = useAppStore();
  const exit = useLeaveSubPage(JOURNAL_HREF);
  const titleId = useId();
  const bodyId = useId();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  // 한 번만 등록 — 목록으로 이동이 끝나기 전에 다시 눌러도 같은 글이 둘 생기지 않게(iOS는 첫 탭에 시트가 닫힌다, :155).
  // 막는 기준은 exit.isLeaving()(같은 이벤트 안에서 바로 바뀐다), submitted는 버튼을 비활성으로 보이게 하는 용도.
  const [submitted, setSubmitted] = useState(false);
  const canSubmit = canSubmitPost(title) && !submitted;

  function handleSubmit() {
    if (exit.isLeaving() || !canSubmitPost(title)) return;
    if (actions.addPost({ title, body }) === null) return;
    setSubmitted(true);
    exit.leave();
  }

  function handleTitleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // 한글 조합 중의 Enter는 글자 확정 — 건드리지 않는다(Safari는 keyCode 229로 알린다)
    if (e.key !== "Enter" || e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    bodyRef.current?.focus();
  }

  return (
    // VStack(spacing: md) · 좌우 lg · 위 md — CommunityView.swift:122-141
    // PC 틀은 pageFrame(읽기 화면 — 최대 48rem, 왼쪽 정렬), 내용 칸은 더 길게. 더 깊은 화면이라 PC에서도 [취소]가 맨 위 줄에 있다.
    // 폰 기둥(30rem)에서는 그대로.
    <main className={cx("@container flex flex-1 flex-col gap-4 px-6 pt-2 pb-10", PAGE_FRAME.reading)}>
      <LeaveSubPageHeader
        title={JOURNAL_TEXT.composeTitle}
        backHref={JOURNAL_HREF}
        backLabel={JOURNAL_TEXT.cancel}
        onLeave={exit.leave}
        action={
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            // PC: 제목 줄(32px) 가운데에 맞추고 머리 높이를 다른 화면과 같게(-my-1.5 — 누르는 영역 44px는 그대로)
            className="flex min-h-11 items-center rounded-button px-2 text-base font-semibold text-primary disabled:cursor-not-allowed disabled:text-text-subtle lg:-my-1.5"
          >
            {JOURNAL_TEXT.submit}
          </button>
        }
      />

      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-2">
          <label htmlFor={titleId} className="block text-[0.9375rem] font-semibold text-text-secondary">
            {JOURNAL_TEXT.titleLabel}
          </label>
          <input
            id={titleId}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleTitleKeyDown}
            placeholder={JOURNAL_TEXT.titlePlaceholder}
            autoComplete="off"
            enterKeyHint="next"
            required
            className="min-h-11 w-full bg-transparent text-base text-text-primary placeholder:text-text-subtle"
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
            onChange={(e) => setBody(e.target.value)}
            className="min-h-40 w-full resize-y rounded-button bg-background p-1 text-base text-text-primary @xl:min-h-72"
          />
        </Card>
      </div>
    </main>
  );
}
