import { describe, expect, it } from "vitest";
import type { CommunityPost } from "@/domain/types";
import { initialState } from "@/store/defaults";
import { addComment, addPost, canSubmitComment, canSubmitPost } from "@/store/state";
import { commentCountLabel, commentMetaLine, findPost, formatPostDateTime, postHref } from "./journalView";

const post = (id: string, patch: Partial<CommunityPost> = {}): CommunityPost => ({
  id,
  title: "제목",
  body: "",
  authorName: "게스트",
  date: "2026-09-16T12:15:00.000Z",
  comments: [],
  ...patch,
});

describe("formatPostDateTime", () => {
  it("iOS .dateTime.month().day().hour().minute() (ko_KR)와 같은 모양 — journal.png", () => {
    // TZ Asia/Seoul: 12:15Z = 21:15
    expect(formatPostDateTime("2026-09-16T12:15:00.000Z")).toBe("9월 16일 오후 9:15");
  });

  it("오전·정오·자정 표기", () => {
    expect(formatPostDateTime("2026-09-16T00:05:00.000Z")).toBe("9월 16일 오전 9:05");
    expect(formatPostDateTime("2026-09-16T03:05:00.000Z")).toBe("9월 16일 오후 12:05");
    expect(formatPostDateTime("2026-09-16T15:00:00.000Z")).toBe("9월 17일 오전 12:00");
  });

  it("못 읽는 날짜는 빈 문자열(지어내지 않음)", () => {
    expect(formatPostDateTime("")).toBe("");
    expect(formatPostDateTime("not-a-date")).toBe("");
  });
});

describe("commentMetaLine / commentCountLabel", () => {
  it("작성자 · 시각", () => {
    expect(commentMetaLine({ authorName: "게스트", date: "2026-09-16T12:15:00.000Z" })).toBe("게스트 · 9월 16일 오후 9:15");
  });
  it("시각을 못 읽으면 작성자만", () => {
    expect(commentMetaLine({ authorName: "게스트", date: "x" })).toBe("게스트");
  });
  it("댓글 n", () => {
    expect(commentCountLabel(0)).toBe("댓글 0");
    expect(commentCountLabel(3)).toBe("댓글 3");
  });
});

describe("postHref / findPost", () => {
  it("쿼리로 id를 넘기고 경로는 /로 끝난다", () => {
    expect(postHref("abc-123")).toBe("/journal/post/?id=abc-123");
    expect(postHref("a b&c")).toBe("/journal/post/?id=a%20b%26c");
    expect(new URL(postHref("a b&c"), "https://x.test").searchParams.get("id")).toBe("a b&c");
  });

  it("없는 글·빈 id는 null(→ 삭제된 글이에요.)", () => {
    const posts = [post("1"), post("2")];
    expect(findPost(posts, "2")?.id).toBe("2");
    expect(findPost(posts, "3")).toBeNull();
    expect(findPost(posts, null)).toBeNull();
    expect(findPost(posts, "")).toBeNull();
    expect(findPost([], "1")).toBeNull();
  });
});

// 화면이 기대는 저장 규칙(store/state) — 제목 필수, 본문 선택, 빈 댓글 거부
describe("기록장 입력 규칙", () => {
  it("제목은 공백만이면 등록 불가, 본문은 선택", () => {
    expect(canSubmitPost("")).toBe(false);
    expect(canSubmitPost("   ")).toBe(false);
    expect(canSubmitPost(" 오늘 첫 산책 ")).toBe(true);
    const meta = { id: "p1", authorName: "게스트", now: new Date("2026-09-16T12:15:00Z") };
    const s = addPost(initialState(), { title: " 오늘 첫 산책 ", body: "" }, meta);
    expect(s.communityPosts[0]).toMatchObject({ id: "p1", title: "오늘 첫 산책", body: "", authorName: "게스트" });
  });

  it("빈 댓글은 받지 않고, 댓글은 오래된 순으로 붙는다", () => {
    expect(canSubmitComment(" \n ")).toBe(false);
    const now = new Date("2026-09-16T12:15:00Z");
    let s = addPost(initialState(), { title: "t", body: "b" }, { id: "p1", authorName: "게스트", now });
    s = addComment(s, "p1", "첫 댓글", { id: "c1", authorName: "게스트", now });
    s = addComment(s, "p1", "둘째", { id: "c2", authorName: "게스트", now });
    expect(s.communityPosts[0].comments.map((c) => c.text)).toEqual(["첫 댓글", "둘째"]);
    expect(addComment(s, "p1", "  ", { id: "c3", authorName: "게스트", now })).toBe(s);
  });
});
