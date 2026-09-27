"use client";

// 기록장 탭 — iOS CommunityView.swift. 개인 메모이며 공유 게시판이 아니다.
// 순서: 제목 → "이 기기에만 저장" 안내 → 내 기록(글쓰기 버튼 · 목록 또는 빈 상태) → 면책 한 줄(목록 아래, Swift 순서).
// 저장소를 읽기 전(hydrated=false)에는 목록 자리를 비워 둔다 — 빈 상태가 번쩍이지 않게.

import Link from "next/link";
import { Clock, CircleUserRound, Lock, MessageSquare, SquarePen } from "lucide-react";
import { Card, EmptyState, SectionTitle } from "@/components/ui";
import type { CommunityPost } from "@/domain/types";
import { useAppStore } from "@/store/useAppStore";
import { JOURNAL_TEXT, JOURNAL_WRITE_HREF, commentCountLabel, formatPostDateTime, postHref } from "./journalView";

const LIST_HEADING_ID = "journal-list-heading";

export function JournalScreen() {
  const { hydrated, state } = useAppStore();

  return (
    // VStack(spacing: md) · 좌우 lg · 위 sm — CommunityView.swift:16-26
    <main className="flex flex-1 flex-col gap-4 px-6 pt-2 pb-10">
      {/* .navigationTitle("기록장") + .inline — 가운데 17 semibold */}
      <h1 className="flex min-h-11 items-center justify-center text-[1.0625rem] font-semibold text-neutral">
        {JOURNAL_TEXT.title}
      </h1>

      <LocalOnlyNotice />

      <section aria-labelledby={LIST_HEADING_ID} className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <SectionTitle id={LIST_HEADING_ID}>{JOURNAL_TEXT.sectionTitle}</SectionTitle>
          </div>
          {/* 글쓰기 캡슐 — primary 배경 · 흰 13 semibold · 패딩 12/7 (CommunityView.swift:58-66).
              보이는 크기는 iOS대로 두고, 누르는 영역만 위아래로 넓혀 44px 이상을 맞춘다. */}
          <Link
            href={JOURNAL_WRITE_HREF}
            className="relative inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-3 py-1.75 text-[0.8125rem] font-semibold text-white before:absolute before:inset-x-0 before:-inset-y-1.5"
          >
            <SquarePen aria-hidden className="size-3.5" strokeWidth={2.5} />
            {JOURNAL_TEXT.write}
          </Link>
        </div>

        {hydrated ? <PostList posts={state.communityPosts} /> : null}
      </section>

      {/* 13 textSecondary, 가운데 — CommunityView.swift:20-22 */}
      <p className="text-center text-[0.8125rem] text-text-secondary">{JOURNAL_TEXT.disclaimer}</p>
    </main>
  );
}

// 공유되지 않는다는 사실을 화면 맨 위에서 알린다 — coralTint 배경 · 라운드 14 · 패딩 md (CommunityView.swift:35-50)
function LocalOnlyNotice() {
  return (
    <div role="note" className="flex w-full items-start gap-2 rounded-button bg-coral-tint p-4">
      <Lock aria-hidden className="mt-1 size-3.5 shrink-0 text-primary" strokeWidth={2.5} />
      <p className="min-w-0 flex-1 text-[0.8125rem] text-text-secondary">{JOURNAL_TEXT.localOnlyNotice}</p>
    </div>
  );
}

function PostList({ posts }: { posts: readonly CommunityPost[] }) {
  if (posts.length === 0) {
    // 카드 안 13 textSecondary — CommunityView.swift:69-75
    return <EmptyState message={JOURNAL_TEXT.empty} />;
  }
  return (
    <ul className="flex flex-col gap-2">
      {posts.map((post) => (
        <li key={post.id}>
          <PostRow post={post} />
        </li>
      ))}
    </ul>
  );
}

// 글 행 — 제목 16 semibold 한 줄 · 본문 13 두 줄 · 작성자/시각/댓글 수 11 (CommunityView.swift:91-108)
function PostRow({ post }: { post: CommunityPost }) {
  const when = formatPostDateTime(post.date);
  const count = post.comments.length;
  return (
    <Link href={postHref(post.id)} className="block rounded-card">
      <Card as="article" className="flex flex-col gap-1">
        <h3 className="truncate text-base font-semibold text-text-primary">{post.title}</h3>
        {post.body ? (
          <p className="line-clamp-2 text-[0.8125rem] whitespace-pre-wrap wrap-break-word text-text-secondary">{post.body}</p>
        ) : null}
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
          <span className="inline-flex items-center gap-1">
            <MessageSquare aria-hidden className="size-3.5 shrink-0" />
            <span aria-hidden>{count}</span>
            <span className="sr-only">{commentCountLabel(count)}</span>
          </span>
        </p>
      </Card>
    </Link>
  );
}
