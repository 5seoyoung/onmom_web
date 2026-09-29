"use client";

// 기록장 탭 — iOS CommunityView.swift. 개인 메모이며 공유 게시판이 아니다.
// 순서: 제목 → 저장 위치 안내(설정 없는 빌드 "이 기기에만", 서버 저장 빌드 "동의를 받은 뒤 온맘 서버에" — journalView localOnlyNoticeFor)
// → 내 기록(글쓰기 버튼 · 목록 또는 빈 상태) → 면책 한 줄(목록 아래, Swift 순서).
// 저장 실패(storageAvailable=false) 안내는 제목 아래(features/home/StorageWarning) — 글쓰기는 막지 않는다.
// 저장소를 읽기 전(hydrated=false)에는 목록 자리를 비워 둔다 — 빈 상태가 번쩍이지 않게.
// PC(넓은 화면): 화면 폭(컨테이너 쿼리 @container)이 42rem 이상이면 글 목록을 2열 카드로, 제목은
// 하위 화면 제목(ScreenHeader 24 bold)처럼 왼쪽에 둔다 — 폰 기둥(최대 30rem)에서는 늘 한 줄 목록·가운데 제목(iOS 그대로).

import Link from "next/link";
import { useId } from "react";
import { Clock, CircleUserRound, Lock, MessageSquare, SquarePen } from "lucide-react";
import { PAGE_FRAME } from "@/components/shell/pageFrame";
import { Card, EmptyState, SectionTitle, cx } from "@/components/ui";
import { isSupabaseConfigured } from "@/config";
import type { CommunityPost } from "@/domain/types";
import { StorageWarning } from "@/features/home/StorageWarning";
import { useAppStore } from "@/store/useAppStore";
import { JOURNAL_TEXT, JOURNAL_WRITE_HREF, commentCountLabel, formatPostDateTime, localOnlyNoticeFor, postHref } from "./journalView";

const LIST_HEADING_ID = "journal-list-heading";

export function JournalScreen() {
  const { hydrated, state } = useAppStore();

  return (
    // VStack(spacing: md) · 좌우 lg · 위 sm — CommunityView.swift:16-26. PC 틀은 pageFrame(탭 화면)
    <main className={cx("@container flex flex-1 flex-col gap-4 px-6 pt-2 pb-10", PAGE_FRAME.wide)}>
      {/* .navigationTitle("기록장") + .inline — 가운데 17 semibold. 넓은 화면은 내비게이션 막대가 없으니 페이지 제목처럼.
          PC(lg, 사이드바가 보일 때)는 폭과 상관없이 다른 화면 제목과 같게 — 1024px 창에서는 본문이 42rem보다 좁다 */}
      <h1 className="flex min-h-11 items-center justify-center text-[1.0625rem] font-semibold text-neutral @2xl:justify-start @2xl:py-2 @2xl:text-2xl @2xl:font-bold lg:justify-start lg:py-2 lg:text-2xl lg:font-bold">
        {JOURNAL_TEXT.title}
      </h1>

      <StorageWarning />
      <LocalOnlyNotice text={localOnlyNoticeFor(isSupabaseConfigured())} />

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

// 어디에 저장되고 공유되지 않는다는 사실을 화면 맨 위에서 알린다 — coralTint 배경 · 라운드 14 · 패딩 md (CommunityView.swift:35-50)
function LocalOnlyNotice({ text }: { text: string }) {
  return (
    <div role="note" className="flex w-full items-start gap-2 rounded-button bg-coral-tint p-4">
      <Lock aria-hidden className="mt-1 size-3.5 shrink-0 text-primary" strokeWidth={2.5} />
      <p className="min-w-0 flex-1 text-[0.8125rem] text-text-secondary">{text}</p>
    </div>
  );
}

function PostList({ posts }: { posts: readonly CommunityPost[] }) {
  if (posts.length === 0) {
    // 카드 안 13 textSecondary — CommunityView.swift:69-75
    return <EmptyState message={JOURNAL_TEXT.empty} />;
  }
  return (
    // 폰: 한 줄(간격 sm) / 넓은 화면: 2열, 한 줄의 카드 높이를 맞춘다
    // 넓은 화면 두 열은 다른 화면의 카드 두 열(홈·기록·가이드)과 같은 간격 16 — 카드 폭이 같게
    <ul className="grid grid-cols-1 gap-2 @2xl:grid-cols-2 @2xl:gap-4">
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
  // 링크 안에 <article>이 있으면 브라우저가 내용으로 링크 이름을 만들지 않는다(Chrome 접근성 트리에서 이름 "") —
  // 제목을 링크 이름으로 잇는다. 본문·작성자·댓글 수는 읽기 모드에서 그대로 읽힌다.
  const titleId = useId();
  return (
    <Link href={postHref(post.id)} aria-labelledby={titleId} className="block h-full rounded-card">
      <Card as="article" className="flex h-full flex-col gap-1">
        <h3 id={titleId} className="truncate text-base font-semibold text-text-primary">{post.title}</h3>
        {post.body ? (
          <p className="line-clamp-2 text-[0.8125rem] whitespace-pre-wrap wrap-break-word text-text-secondary">{post.body}</p>
        ) : null}
        {/* 2열에서 옆 카드보다 짧으면 작성자 줄을 카드 아래에 붙인다(한 줄 목록에서는 차이 없음) */}
        <p className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.6875rem] text-text-secondary">
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
