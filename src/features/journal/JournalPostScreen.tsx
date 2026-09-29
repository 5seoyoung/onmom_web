"use client";

// 기록장 글 상세 + 댓글(본인 메모) — iOS PostDetailView(CommunityView.swift:166-236).
// 주소: /journal/post/?id=… (정적 export라 글마다 경로를 만들 수 없다). 글이 없으면 "삭제된 글이에요."
// useSearchParams는 Suspense 안에서만 — 머리는 정적 HTML에 들어가고, 본문은 브라우저에서 그린다.

import { Suspense, useId, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { CircleArrowUp, CircleUserRound, Clock } from "lucide-react";
import type { CommunityPost } from "@/domain/types";
import { PAGE_FRAME } from "@/components/shell/pageFrame";
import { cx } from "@/components/ui";
import { StorageWarning } from "@/features/home/StorageWarning";
import { LeaveSubPageHeader, useLeaveSubPage } from "@/features/profile/LeaveSubPage";
import { canSubmitComment } from "@/store/state";
import { useAppStore } from "@/store/useAppStore";
import { JOURNAL_HREF, JOURNAL_TEXT, commentCountLabel, commentMetaLine, findPost, formatPostDateTime } from "./journalView";

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
        <PostFromQuery />
      </Suspense>
    </main>
  );
}

function PostFromQuery() {
  const id = useSearchParams().get("id");
  const { hydrated, state, actions } = useAppStore();
  if (!hydrated) return null;

  const post = findPost(state.communityPosts, id);
  if (!post) {
    // 16 textSecondary · 패딩 xl — CommunityView.swift:205-207
    return <p className="p-8 text-base text-text-secondary">{JOURNAL_TEXT.deleted}</p>;
  }
  // 글이 바뀌면(다른 글로 이동) 댓글 입력을 비운다
  return <PostDetail key={post.id} post={post} onComment={(text) => actions.addComment(post.id, text)} />;
}

function PostDetail({ post, onComment }: { post: CommunityPost; onComment: (text: string) => boolean }) {
  const when = formatPostDateTime(post.date);
  const commentsHeadingId = useId();

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
          </p>
        </header>
        {/* 쓴 그대로(공백·줄바꿈 유지) — Swift Text는 저장된 문자열을 바꾸지 않는다 */}
        {post.body ? (
          <p className="text-base whitespace-pre-wrap wrap-break-word text-text-primary">{post.body}</p>
        ) : null}
        <hr className="border-divider" />
        <section aria-labelledby={commentsHeadingId} className="flex flex-col gap-4">
          <h3 id={commentsHeadingId} className="text-[0.9375rem] font-semibold text-text-secondary">
            {commentCountLabel(post.comments.length)}
          </h3>
          {post.comments.length > 0 ? (
            <ul className="flex flex-col gap-4">
              {post.comments.map((c) => (
                // 댓글 — 16 본문 + 11 "작성자 · 시각", 표면 라운드 14 · 패딩 sm (CommunityView.swift:192-201)
                <li key={c.id} className="flex flex-col gap-0.75 rounded-button bg-surface p-2">
                  <p className="text-base whitespace-pre-wrap wrap-break-word text-text-primary">{c.text}</p>
                  <p className="text-[0.6875rem] text-text-secondary">{commentMetaLine(c)}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </article>
      <CommentBar onSubmit={onComment} />
    </>
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
