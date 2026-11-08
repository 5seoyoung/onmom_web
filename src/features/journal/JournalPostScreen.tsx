"use client";

// 기록장 글 상세 + 댓글(본인 메모) — iOS PostDetailView(CommunityView.swift:166-236).
// 주소: /journal/post/?id=… (정적 export라 글마다 경로를 만들 수 없다). 글이 없으면 "삭제된 글이에요."
// useSearchParams는 Suspense 안에서만 — 머리는 정적 HTML에 들어가고, 본문은 브라우저에서 그린다.
// 웹 추가(LAUNCH_CHECKLIST 7-4): 글 [수정](/journal/edit/?id=)·[삭제], 댓글마다 [삭제]. 삭제는 확인 창(features/settings/ConfirmDialog —
// [취소]에 포커스) 뒤에만. 글을 지우면 목록으로 떠나고, 댓글을 지우면 그 줄이 사라지므로 포커스를 댓글 제목으로 옮기고 낭독기에 알린다.
// 지운 글·댓글은 삭제 표시(id·시각만)를 남겨 다른 탭·서버 사본이 되살리지 않는다(store/tombstones). 고친 글은 시각 옆에 "수정됨".

import Link from "next/link";
import { Suspense, useId, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { CircleArrowUp, CircleUserRound, Clock, Trash2 } from "lucide-react";
import { formatMonthDayTime } from "@/domain/date";
import type { CommunityPost } from "@/domain/types";
import { PAGE_FRAME } from "@/components/shell/pageFrame";
import { cx } from "@/components/ui";
import { StorageWarning } from "@/features/home/StorageWarning";
import { LeaveSubPageHeader, useLeaveSubPage, type SubPageExit } from "@/features/profile/LeaveSubPage";
import { ConfirmDialog } from "@/features/settings/ConfirmDialog";
import { canSubmitComment } from "@/store/state";
import { useAppStore } from "@/store/useAppStore";
import {
  JOURNAL_EDIT_TEXT,
  JOURNAL_HREF,
  JOURNAL_LIMITS,
  JOURNAL_TEXT,
  commentCountLabel,
  commentMetaLine,
  findPost,
  postEditHref,
} from "./journalView";

/** 글의 [수정]·[삭제] — 보이는 글자는 짧고, 누르는 영역은 44px */
const POST_ACTION = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-button px-3 text-[0.9375rem] font-semibold";

export function JournalPostScreen() {
  // iOS 내비게이션 pop처럼 — 목록에서 들어왔으면 뒤로(목록이 방문 기록에 두 번 쌓이지 않게)
  const exit = useLeaveSubPage(JOURNAL_HREF);
  return (
    // PC 틀은 pageFrame(읽기 화면 — 최대 48rem, 왼쪽 정렬). 더 깊은 화면이라 PC에서도 [뒤로]가 맨 위 줄에 있다. 폰 기둥(30rem)에서는 그대로.
    <main className={cx("flex flex-1 flex-col gap-4 px-6 pt-2 pb-6", PAGE_FRAME.reading)}>
      <LeaveSubPageHeader title={JOURNAL_TEXT.detailTitle} backHref={JOURNAL_HREF} onLeave={exit.leave} />
      {/* 저장 실패 안내 — 댓글도 입력이라 글쓰기와 같은 자리에 둔다(막지 않는다) */}
      <StorageWarning />
      <Suspense fallback={null}>
        <PostFromQuery exit={exit} />
      </Suspense>
    </main>
  );
}

function PostFromQuery({ exit }: { exit: SubPageExit }) {
  const id = useSearchParams().get("id");
  const { hydrated, state, actions } = useAppStore();
  if (!hydrated) return null;

  const post = findPost(state.communityPosts, id);
  if (!post) {
    // 16 textSecondary · 패딩 xl — CommunityView.swift:205-207
    return <p className="p-8 text-base text-text-secondary">{JOURNAL_TEXT.deleted}</p>;
  }
  // 글이 바뀌면(다른 글로 이동) 댓글 입력을 비운다
  return (
    <PostDetail
      key={post.id}
      post={post}
      onComment={(text) => actions.addComment(post.id, text)}
      onDeletePost={() => {
        if (actions.deletePost(post.id)) exit.leave();
      }}
      onDeleteComment={(commentId) => actions.deleteComment(post.id, commentId)}
    />
  );
}

type PendingDelete = { kind: "post" } | { kind: "comment"; id: string };

export interface PostDetailProps {
  post: CommunityPost;
  onComment: (text: string) => boolean;
  onDeletePost: () => void;
  onDeleteComment: (commentId: string) => boolean;
}

export function PostDetail({ post, onComment, onDeletePost, onDeleteComment }: PostDetailProps) {
  const when = formatMonthDayTime(post.date);
  const commentsHeadingId = useId();
  const commentsHeadingRef = useRef<HTMLHeadingElement>(null);
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const [announcement, setAnnouncement] = useState("");

  function confirmDelete() {
    if (pending === null) return;
    setPending(null);
    if (pending.kind === "post") {
      onDeletePost();
      return;
    }
    if (!onDeleteComment(pending.id)) return;
    // 지운 줄이 사라져 포커스가 갈 곳이 없다 — 댓글 제목으로 옮기고 알린다(같은 말이어도 다시 들리게 비운 뒤 채움)
    setAnnouncement("");
    requestAnimationFrame(() => {
      setAnnouncement(JOURNAL_EDIT_TEXT.commentDeleted);
      commentsHeadingRef.current?.focus();
    });
  }

  return (
    <>
      {/* VStack(spacing: md) — CommunityView.swift:176-202 */}
      <article className="flex flex-col gap-4">
        <header className="flex flex-col gap-2">
          <h2 className="text-xl font-bold whitespace-pre-wrap wrap-break-word text-neutral">{post.title}</h2>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.6875rem] text-text-secondary">
            <span className="inline-flex items-center gap-1">
              <CircleUserRound aria-hidden className="size-3.5 shrink-0" />
              {post.authorName}
            </span>
            {when ? (
              <span className="inline-flex items-center gap-1">
                <Clock aria-hidden className="size-3.5 shrink-0" />
                <time dateTime={post.date}>{when}</time>
              </span>
            ) : null}
            {post.updatedAt !== undefined ? <span>{JOURNAL_EDIT_TEXT.edited}</span> : null}
          </p>
          {/* 글 [수정]·[삭제] — 인쇄에서는 뺀다(누를 수 없다) */}
          <div className="-ml-3 flex print:hidden">
            <Link href={postEditHref(post.id)} className={cx(POST_ACTION, "text-text-secondary")}>
              {JOURNAL_EDIT_TEXT.edit}
            </Link>
            <button
              type="button"
              onClick={() => setPending({ kind: "post" })}
              aria-haspopup="dialog"
              className={cx(POST_ACTION, "text-state-alert-text")}
            >
              {JOURNAL_EDIT_TEXT.delete}
            </button>
          </div>
        </header>
        {/* 쓴 그대로(공백·줄바꿈 유지) — Swift Text는 저장된 문자열을 바꾸지 않는다 */}
        {post.body ? (
          <p className="text-base whitespace-pre-wrap wrap-break-word text-text-primary">{post.body}</p>
        ) : null}
        <hr className="border-divider" />
        <section aria-labelledby={commentsHeadingId} className="flex flex-col gap-4">
          <h3
            id={commentsHeadingId}
            ref={commentsHeadingRef}
            tabIndex={-1}
            className="text-[0.9375rem] font-semibold text-text-secondary focus:outline-none"
          >
            {commentCountLabel(post.comments.length)}
          </h3>
          <p role="status" className="sr-only">
            {announcement}
          </p>
          {post.comments.length > 0 ? (
            <ul className="flex flex-col gap-4">
              {post.comments.map((c) => (
                <CommentItem key={c.id} comment={c} onDelete={() => setPending({ kind: "comment", id: c.id })} />
              ))}
            </ul>
          ) : null}
        </section>
      </article>
      <CommentBar onSubmit={onComment} />
      <ConfirmDialog
        open={pending !== null}
        title={pending?.kind === "comment" ? JOURNAL_EDIT_TEXT.deleteCommentTitle : JOURNAL_EDIT_TEXT.deletePostTitle}
        message={pending?.kind === "comment" ? JOURNAL_EDIT_TEXT.deleteCommentMessage : JOURNAL_EDIT_TEXT.deletePostMessage}
        confirmLabel={JOURNAL_EDIT_TEXT.delete}
        cancelLabel={JOURNAL_TEXT.cancel}
        onConfirm={confirmDelete}
        onClose={() => setPending(null)}
      />
    </>
  );
}

// 댓글 — 16 본문 + 11 "작성자 · 시각", 표면 라운드 14 · 패딩 sm (CommunityView.swift:192-201). 웹 추가: 오른쪽 [삭제](휴지통 아이콘 44px —
// 낭독 이름 "댓글 삭제", 어느 댓글인지는 댓글 글자를 설명으로 잇는다)
function CommentItem({ comment, onDelete }: { comment: CommunityPost["comments"][number]; onDelete: () => void }) {
  const textId = useId();
  return (
    <li className="flex items-start gap-1 rounded-button bg-surface p-2">
      <div className="flex min-w-0 flex-1 flex-col gap-0.75">
        <p id={textId} className="text-base whitespace-pre-wrap wrap-break-word text-text-primary">
          {comment.text}
        </p>
        <p className="text-[0.6875rem] text-text-secondary">{commentMetaLine(comment)}</p>
      </div>
      <button
        type="button"
        onClick={onDelete}
        aria-label={JOURNAL_EDIT_TEXT.deleteComment}
        aria-describedby={textId}
        aria-haspopup="dialog"
        className="-my-1 -mr-1 flex size-11 shrink-0 items-center justify-center rounded-button text-text-secondary print:hidden"
      >
        <Trash2 aria-hidden className="size-4.5" />
      </button>
    </li>
  );
}

// 댓글 입력 — 캡슐 입력 16 + 원형 화살표 버튼 32, 빈 댓글이면 비활성 (CommunityView.swift:216-235)
function CommentBar({ onSubmit }: { onSubmit: (text: string) => boolean }) {
  const [comment, setComment] = useState("");
  const canSubmit = canSubmitComment(comment);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    if (onSubmit(comment)) setComment("");
  }

  return (
    <form onSubmit={handleSubmit} className="mt-auto flex items-center gap-2 pt-4">
      <input
        type="text"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={JOURNAL_TEXT.commentPlaceholder}
        aria-label={JOURNAL_TEXT.commentPlaceholder}
        maxLength={JOURNAL_LIMITS.comment}
        autoComplete="off"
        enterKeyHint="send"
        className="min-h-11 min-w-0 flex-1 rounded-full bg-surface px-4 py-2.5 text-base text-text-primary placeholder:text-text-subtle-aa"
      />
      <button
        type="submit"
        aria-label={JOURNAL_TEXT.commentSubmit}
        disabled={!canSubmit}
        className="flex size-11 shrink-0 items-center justify-center rounded-full text-primary disabled:cursor-not-allowed disabled:text-text-subtle/40"
      >
        <CircleArrowUp aria-hidden className="size-8 fill-current stroke-surface" />
      </button>
    </form>
  );
}
