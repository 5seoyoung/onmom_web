// 기록장 글 수정·삭제, 댓글 삭제 — 규칙(journalView)과 글 상세의 마크업·접근성 속성(서버 렌더로 확인).
import { readFileSync } from "node:fs";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CommunityPost } from "@/domain/types";
import { ROUTES } from "@/routes";
import { PostDetail } from "./JournalPostScreen";
import { JOURNAL_EDIT_TEXT, JOURNAL_TEXT, canSavePostEdit, postEditHref } from "./journalView";
import { PostFields } from "./PostFields";

const noop = () => {};
const count = (html: string, needle: string) => html.split(needle).length - 1;
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

const post = (patch: Partial<CommunityPost> = {}): CommunityPost => ({
  id: "p1",
  title: "제목",
  body: "본문",
  authorName: "게스트",
  date: "2026-11-01T06:05:00.000Z",
  comments: [
    { id: "c1", text: "첫 댓글", authorName: "게스트", date: "2026-11-01T07:00:00.000Z" },
    { id: "c2", text: "둘째 댓글", authorName: "게스트", date: "2026-11-01T08:00:00.000Z" },
  ],
  ...patch,
});

describe("규칙", () => {
  it("글 수정 주소는 쿼리로 — 기록장 탭 아래", () => {
    expect(postEditHref("a b")).toBe(`${ROUTES.journalEdit}?id=a%20b`);
    expect(ROUTES.journalEdit.startsWith(ROUTES.journal)).toBe(true);
  });

  it("[저장]은 제목이 있고 앞뒤 공백을 뺀 제목·본문이 바뀌었을 때만", () => {
    const p = post();
    expect(canSavePostEdit(p, "제목", "본문")).toBe(false);
    expect(canSavePostEdit(p, " 제목 ", "본문\n")).toBe(false);
    expect(canSavePostEdit(p, "새 제목", "본문")).toBe(true);
    expect(canSavePostEdit(p, "제목", "새 본문")).toBe(true);
    expect(canSavePostEdit(p, "   ", "새 본문")).toBe(false);
  });
});

describe("글 상세", () => {
  const html = renderToStaticMarkup(h(PostDetail, { post: post({ updatedAt: "2026-11-02T00:00:00.000Z" }), onComment: () => true, onDeletePost: noop, onDeleteComment: () => true }));

  it("글 [수정] 링크·[삭제] 버튼 — 누르는 영역 44px, 삭제는 확인 창을 연다, 인쇄에서는 뺀다", () => {
    expect(html).toMatch(new RegExp(`<a [^>]*href="/journal/edit/?\\?id=p1"[^>]*>${JOURNAL_EDIT_TEXT.edit}</a>`));
    expect(html).toMatch(new RegExp(`<button type="button" aria-haspopup="dialog" class="[^"]*min-h-11 min-w-11[^"]*">${JOURNAL_EDIT_TEXT.delete}</button>`));
    expect(html).toContain('<div class="-ml-3 flex print:hidden">');
  });

  it("고친 글은 시각 옆에 수정됨", () => {
    expect(html).toContain(`<span>${JOURNAL_EDIT_TEXT.edited}</span>`);
    const plain = renderToStaticMarkup(h(PostDetail, { post: post(), onComment: () => true, onDeletePost: noop, onDeleteComment: () => true }));
    expect(plain).not.toContain(JOURNAL_EDIT_TEXT.edited);
  });

  it("댓글마다 [삭제](아이콘 44px) — 낭독 이름 '댓글 삭제' + 어느 댓글인지는 그 댓글 글자를 설명으로", () => {
    expect(count(html, `aria-label="${JOURNAL_EDIT_TEXT.deleteComment}"`)).toBe(2);
    for (const text of ["첫 댓글", "둘째 댓글"]) {
      const id = new RegExp(`<p id="([^"]+)"[^>]*>${text}</p>`).exec(html)?.[1];
      expect(id, text).toBeTruthy();
      expect(html).toContain(`aria-describedby="${id}"`);
    }
    expect(count(html, "flex size-11 shrink-0 items-center justify-center rounded-button")).toBe(2); // 댓글 입력의 등록 버튼(rounded-full)과 다르다
  });

  it("댓글 제목은 포커스를 받을 수 있고(지운 뒤 초점이 갈 곳), 알림 칸(role=status)이 미리 있다", () => {
    expect(html).toMatch(/<h3 id="[^"]+" tabindex="-1" class="[^"]*focus:outline-none">댓글 2<\/h3>/);
    expect(html).toContain('<p role="status" class="sr-only"></p>');
  });

  it("확인 창은 닫혀 있다 — [취소]는 기록장 원문", () => {
    expect(html).toMatch(/<dialog (?![^>]*\bopen\b)/);
    expect(html).toContain(`>${JOURNAL_TEXT.cancel}</button>`);
  });
});

describe("글쓰기·글 수정이 같이 쓰는 칸", () => {
  it("제목·내용 칸 — 라벨로 이름", () => {
    const html = renderToStaticMarkup(h(PostFields, { title: "t", body: "b", onTitleChange: noop, onBodyChange: noop }));
    const titleId = /<label for="([^"]+)"[^>]*>제목<\/label>/.exec(html)?.[1];
    const bodyId = /<label for="([^"]+)"[^>]*>내용<\/label>/.exec(html)?.[1];
    expect(html).toContain(`<input id="${titleId}"`);
    expect(html).toContain(`<textarea id="${bodyId}"`);
  });
});

describe("소스 — 연결", () => {
  it("글 삭제·댓글 삭제는 확인 창의 [확인]에서만, 글을 지우면 목록으로 떠난다", () => {
    const src = read("./JournalPostScreen.tsx");
    expect(src).toContain("<ConfirmDialog");
    const confirm = src.indexOf("function confirmDelete()");
    const confirmEnd = src.indexOf("\n  }\n", confirm);
    for (const m of src.matchAll(/onDelete(Post|Comment)\(/g)) expect(m.index! > confirm && m.index! < confirmEnd, m[0]).toBe(true);
    expect(src).toMatch(/if \(actions\.deletePost\(post\.id\)\) exit\.leave\(\)/);
  });

  it("글 수정은 store의 updatePost로 저장하고 글 상세로 돌아간다", () => {
    const src = read("./JournalEditScreen.tsx");
    expect(src).toContain("actions.updatePost(post.id, { title, body })");
    expect(src).toContain("useLeaveSubPage(parent, BACK_FROM)");
    expect(src).toContain("const BACK_FROM: readonly string[] = [ROUTES.journalPost]");
  });
});
