"use client";

// 기록장 글 수정 — 글 상세 > [수정](/journal/edit/?id=…). 웹 전용(iOS 기록장에는 없다 — LAUNCH_CHECKLIST 7-4).
// 글쓰기와 같은 칸(PostFields)·같은 머리([취소]·오른쪽 [저장]). 제목이 비었거나 바뀐 것이 없으면 [저장]을 잠근다(journalView canSavePostEdit).
// [저장] → 제목·본문을 trim해 바꾸고 고친 시각을 찍는다(store/state updatePost — 작성자·쓴 시각·댓글은 그대로) → 글 상세로 돌아간다.
// 주소에 글 id가 있어 머리까지 Suspense 안에서 그린다(useSearchParams) — 돌아갈 곳(그 글의 상세)도 id로 정해진다.
// 글이 없으면(다른 탭·기기에서 지움, 주소가 틀림) "삭제된 글이에요."(iOS 원문).

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PAGE_FRAME } from "@/components/shell/pageFrame";
import { cx } from "@/components/ui";
import type { CommunityPost } from "@/domain/types";
import { StorageWarning } from "@/features/home/StorageWarning";
import { LeaveSubPageHeader, useLeaveSubPage } from "@/features/profile/LeaveSubPage";
import { ROUTES } from "@/routes";
import { useAppStore } from "@/store/useAppStore";
import { JOURNAL_EDIT_TEXT, JOURNAL_HREF, JOURNAL_TEXT, canSavePostEdit, findPost, postHref } from "./journalView";
import { POST_HEADER_ACTION_CLASS, PostFields } from "./PostFields";

/** 앞 기록이 글 상세면 back()으로 돌아간다(주소의 쿼리는 비교하지 않는다) — 아니면 그 글의 상세로 replace */
const BACK_FROM: readonly string[] = [ROUTES.journalPost];

export function JournalEditScreen() {
  return (
    // PC 틀은 pageFrame(읽기 화면 — 최대 48rem, 왼쪽 정렬). 더 깊은 화면이라 PC에서도 [취소]가 맨 위 줄에 있다.
    <main className={cx("@container flex flex-1 flex-col gap-4 px-6 pt-2 pb-10", PAGE_FRAME.reading)}>
      <Suspense fallback={null}>
        <EditFromQuery />
      </Suspense>
    </main>
  );
}

function EditFromQuery() {
  const id = useSearchParams().get("id");
  const { hydrated, state } = useAppStore();
  const post = hydrated ? findPost(state.communityPosts, id) : null;
  // 돌아갈 곳 — 그 글의 상세(없는 글이면 목록)
  const parent = id ? postHref(id) : JOURNAL_HREF;
  return <EditBody key={post?.id ?? "none"} post={post} hydrated={hydrated} parent={parent} />;
}

function EditBody({ post, hydrated, parent }: { post: CommunityPost | null; hydrated: boolean; parent: string }) {
  const { actions } = useAppStore();
  const exit = useLeaveSubPage(parent, BACK_FROM);
  const [title, setTitle] = useState(post?.title ?? "");
  const [body, setBody] = useState(post?.body ?? "");
  const canSave = post !== null && canSavePostEdit(post, title, body);

  function save() {
    if (post === null || exit.isLeaving() || !canSavePostEdit(post, title, body)) return;
    if (!actions.updatePost(post.id, { title, body })) return;
    exit.leave();
  }

  return (
    <>
      <LeaveSubPageHeader
        title={JOURNAL_EDIT_TEXT.editTitle}
        backHref={parent}
        backLabel={JOURNAL_TEXT.cancel}
        onLeave={exit.leave}
        action={
          post !== null ? (
            <button type="button" onClick={save} disabled={!canSave} className={POST_HEADER_ACTION_CLASS}>
              {JOURNAL_EDIT_TEXT.save}
            </button>
          ) : undefined
        }
      />
      <StorageWarning />
      {!hydrated ? null : post === null ? (
        <p className="p-8 text-base text-text-secondary">{JOURNAL_TEXT.deleted}</p>
      ) : (
        <PostFields title={title} body={body} onTitleChange={setTitle} onBodyChange={setBody} />
      )}
    </>
  );
}
