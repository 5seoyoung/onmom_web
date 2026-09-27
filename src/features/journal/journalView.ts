// 기록장(개인 메모 — 공유 게시판 아님) 표시 규칙 — iOS CommunityView.swift.
// 글·댓글 저장 규칙(제목 필수·trim·최신순)은 store/state.ts(canSubmitPost·canSubmitComment·addPost·addComment)가 단일 출처다.

import type { CommunityComment, CommunityPost } from "@/domain/types";

export const JOURNAL_TEXT = {
  title: "기록장", // 원문: CommunityView.swift:29
  // D5: iOS 문구 "이 기기" 그대로(CPO 수정 대기)
  localOnlyNotice: "여기에 쓴 글은 이 기기에만 저장돼요. 아직 다른 분들과 공유되지 않아요.", // 원문: CommunityView.swift:40
  sectionTitle: "내 기록", // 원문: CommunityView.swift:57
  write: "글쓰기", // 원문: CommunityView.swift:62
  empty: "아직 기록이 없어요. 오늘의 회복 이야기를 남겨보세요.", // 원문: CommunityView.swift:71
  disclaimer: "의학적 판단이 아닙니다. 위험 신호는 '기록' 탭에서 확인하세요.", // 원문: CommunityView.swift:20
  // 글쓰기
  composeTitle: "글쓰기", // 원문: CommunityView.swift:145
  cancel: "취소", // 원문: CommunityView.swift:148
  submit: "등록", // 원문: CommunityView.swift:150
  titleLabel: "제목", // 원문: CommunityView.swift:126
  titlePlaceholder: "제목을 입력하세요", // 원문: CommunityView.swift:127
  bodyLabel: "내용", // 원문: CommunityView.swift:133
  // 상세
  detailTitle: "게시글", // 원문: CommunityView.swift:213
  deleted: "삭제된 글이에요.", // 원문: CommunityView.swift:206
  commentPlaceholder: "댓글을 입력하세요", // 원문: CommunityView.swift:218
  commentSubmit: "댓글 등록", // 원문: CommunityView.swift:231
} as const;

export const JOURNAL_HREF = "/journal/";
export const JOURNAL_WRITE_HREF = "/journal/write/";

/**
 * 글 상세 주소. 정적 export라 글마다 경로를 미리 만들 수 없어(글은 브라우저에만 있다) 쿼리로 넘긴다.
 * trailingSlash: true — 경로는 "/"로 끝낸다.
 */
export function postHref(id: string): string {
  return `/journal/post/?id=${encodeURIComponent(id)}`;
}

/** 목록의 글 — 없으면 null("삭제된 글이에요."). */
export function findPost(posts: readonly CommunityPost[], id: string | null | undefined): CommunityPost | null {
  if (!id) return null;
  return posts.find((p) => p.id === id) ?? null;
}

const KO_DATE_TIME = new Intl.DateTimeFormat("ko-KR", {
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * 글·댓글 시각 — iOS `.dateTime.month().day().hour().minute()`(ko_KR) = "9월 16일 오후 9:15".
 * 연도는 붙이지 않는다(iOS와 같음). 못 읽는 날짜는 빈 문자열.
 */
export function formatPostDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // 로케일 데이터에 따라 끼는 좁은 공백(U+202F)은 보통 공백으로 맞춘다
  return KO_DATE_TIME.format(d).replace(/ /g, " ");
}

/** 댓글 아래 줄 — "{작성자} · {시각}"(CommunityView.swift:196) */
export function commentMetaLine(c: Pick<CommunityComment, "authorName" | "date">): string {
  const when = formatPostDateTime(c.date);
  return when ? `${c.authorName} · ${when}` : c.authorName;
}

/** "댓글 n"(CommunityView.swift:191) — 목록 행의 말풍선 숫자에도 스크린리더용으로 같은 문구를 쓴다. */
export function commentCountLabel(count: number): string {
  return `댓글 ${count}`;
}
