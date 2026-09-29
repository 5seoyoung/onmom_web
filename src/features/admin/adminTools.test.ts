// 관리자 도구 카드(AdminTools·DeleteUserDialog·UserList의 [계정 삭제]·NewUsersChart의 나눈 막대) — 정적 마크업으로 구조·접근성만 본다.
// 데이터 상태는 AdminScreen이 들고 있으므로(브라우저 전용), 여기서는 그리기 결과가 문구·역할·이름을 제대로 내는지 확인한다.

import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ADMIN_TEXT,
  adminRowView,
  chartBars,
  chartSummary,
  consentVersionRows,
  niceScale,
  userRowView,
  type AdminUserRow,
  type DayCount,
} from "./adminModel";
import { AdminsTable, ConsentVersionsTable, UserSearch, type SearchState } from "./AdminTools";
import { DeleteUserDialog } from "./DeleteUserDialog";
import { NewUsersChart } from "./NewUsersChart";
import { UserList } from "./UserList";

const VERSION = "web-2026-09-28";
const KAKAO: AdminUserRow = {
  id: "3f0f9b2e-0000-4000-8000-000000000001",
  createdAt: "2026-09-27T15:30:00+00:00",
  lastSignInAt: "2026-09-28T01:02:00+00:00",
  isAnonymous: false,
  provider: "kakao",
  hasState: true,
  consentVersion: VERSION,
  stateUpdatedAt: "2026-09-28T01:05:00+00:00",
};
const GUEST: AdminUserRow = { ...KAKAO, id: "a1b2c3d4-0000-4000-8000-000000000002", isAnonymous: true, provider: "anonymous", hasState: false, consentVersion: null, stateUpdatedAt: null };
const row = (r: AdminUserRow) => userRowView(r, VERSION);
const count = (markup: string, re: RegExp) => (markup.match(re) ?? []).length;

describe("동의 버전 분포 카드", () => {
  it("현재 판에 배지, 판 없음은 '없음', 비율 칸", () => {
    const rows = consentVersionRows([{ version: VERSION, users: 3 }, { version: null, users: 1 }], VERSION);
    const markup = renderToStaticMarkup(h(ConsentVersionsTable, { rows }));
    expect(count(markup, /현재 판/g)).toBe(1);
    expect(markup).toContain(VERSION);
    expect(markup).toContain(ADMIN_TEXT.consentNone);
    expect(markup).toContain("75%");
    expect(markup).toContain("25%");
    expect(markup).toContain('scope="row"');
  });

  it("비어 있으면 표 대신 한 줄", () => {
    const markup = renderToStaticMarkup(h(ConsentVersionsTable, { rows: [] }));
    expect(markup).toContain(ADMIN_TEXT.consentVersionsEmpty);
    expect(markup).not.toContain("<table");
  });
});

describe("관리자 목록 카드", () => {
  it("계정 ID 앞 8자리(전체는 title) · 등록일 · 최근 접속 · 나 배지, 그리고 SQL Editor 안내", () => {
    const rows = [
      adminRowView({ userId: KAKAO.id, addedAt: "2026-09-28T00:00:00Z", lastSignInAt: "2026-09-28T01:02:00Z", isMe: true }),
      adminRowView({ userId: GUEST.id, addedAt: "2026-09-27T00:00:00Z", lastSignInAt: null, isMe: false }),
    ];
    const markup = renderToStaticMarkup(h(AdminsTable, { rows }));
    expect(markup).toContain(`title="${KAKAO.id}"`);
    expect(markup).toContain(">3f0f9b2e<");
    expect(count(markup, new RegExp(`>${ADMIN_TEXT.me}<`, "g"))).toBe(1);
    expect(markup).toContain("2026.09.28 10:02");
    expect(markup).toContain(ADMIN_TEXT.adminsHint);
    expect(ADMIN_TEXT.adminsHint).toContain("SQL Editor");
  });

  it("비어 있으면 안내만", () => {
    const markup = renderToStaticMarkup(h(AdminsTable, { rows: [] }));
    expect(markup).toContain(ADMIN_TEXT.adminsEmpty);
    expect(markup).toContain(ADMIN_TEXT.adminsHint);
  });
});

describe("계정 찾기", () => {
  const render = (state: SearchState, query = "") =>
    renderToStaticMarkup(h(UserSearch, { inputId: "q", query, onQueryChange() {}, onSubmit() {}, state, onDelete() {}, deleting: false }));

  it("처음엔 입력·[찾기]·안내만 — 알림 줄은 비어 있다", () => {
    const markup = render({ kind: "idle" });
    expect(markup).toContain(`<label for="q"`);
    expect(markup).toContain(ADMIN_TEXT.searchHint);
    expect(markup).toContain(`role="status"`);
    expect(markup).not.toContain("aria-invalid");
    expect(markup).not.toContain(ADMIN_TEXT.deleteUser);
  });

  it("형식 오류는 입력에 aria-invalid + 문장, 없음·실패·삭제됨은 문장", () => {
    expect(render({ kind: "invalid" }, "abc")).toContain('aria-invalid="true"');
    expect(render({ kind: "invalid" }, "abc")).toContain(ADMIN_TEXT.searchInvalid);
    expect(render({ kind: "notFound" })).toContain(ADMIN_TEXT.searchNotFound);
    expect(render({ kind: "failed", message: ADMIN_TEXT.toolsSetupHint })).toContain(ADMIN_TEXT.toolsSetupHint);
    expect(render({ kind: "loading" })).toMatch(/<button type="submit" disabled/);
  });

  it("찾으면 메타데이터 목록과 [계정 삭제], 지웠으면 '삭제됐어요'만(단추 없음)", () => {
    const found = render({ kind: "found", row: row(KAKAO) });
    expect(found).toContain(KAKAO.id);
    expect(found).toContain(ADMIN_TEXT.kindKakao);
    expect(found).toContain("2026.09.28 10:02");
    expect(count(found, new RegExp(`>${ADMIN_TEXT.deleteUser}<`, "g"))).toBe(1);
    expect(found).not.toMatch(/email|state"|nickname/);
    const deleted = render({ kind: "deleted", row: row(KAKAO) });
    expect(deleted).toContain(ADMIN_TEXT.searchDeleted);
    expect(deleted).not.toContain(`>${ADMIN_TEXT.deleteUser}<`);
  });
});

describe("계정 삭제 확인 창", () => {
  const render = (props: Partial<Parameters<typeof DeleteUserDialog>[0]> = {}) =>
    renderToStaticMarkup(h(DeleteUserDialog, { target: row(GUEST), busy: false, error: null, onConfirm() {}, onClose() {}, ...props }));

  it("이름·설명이 연결된 대화상자, 앞 8자리 굵게, 입력은 8자·사유는 500자까지", () => {
    const markup = render();
    expect(markup).toMatch(/<dialog[^>]*aria-labelledby="[^"]+"[^>]*aria-describedby="[^"]+"/);
    expect(markup).toContain(ADMIN_TEXT.deleteTitle);
    expect(markup).toContain(ADMIN_TEXT.deleteMessage);
    expect(markup).toContain(`<strong class="font-bold">a1b2c3d4</strong>`);
    expect(markup).toContain(GUEST.id.slice(8));
    expect(markup).toMatch(/<input[^>]*maxlength="8"/i);
    expect(markup).toMatch(/<textarea[^>]*maxlength="500"/i);
    expect(markup).toContain(`<button type="submit"`);
    expect(markup).toContain(ADMIN_TEXT.cancel);
    expect(markup).not.toContain(ADMIN_TEXT.deleting);
  });

  it("서버가 거절하면 role=alert에 문장, 삭제 중에는 단추가 잠기고 '삭제하고 있어요'", () => {
    const failed = render({ error: ADMIN_TEXT.deleteIsAdmin });
    const alert = failed.split('role="alert"')[1] ?? "";
    expect(alert.slice(0, alert.indexOf("</div>"))).toContain(ADMIN_TEXT.deleteIsAdmin);
    const busy = render({ busy: true });
    expect(busy).toContain(ADMIN_TEXT.deleting);
    expect(busy).toMatch(/<form[^>]*aria-busy="true"/);
    expect(count(busy, /disabled=""/g)).toBeGreaterThanOrEqual(4); // 입력·사유·확정·취소
  });
});

describe("사용자 목록의 [계정 삭제]", () => {
  const base = { titleId: "t", rows: [row(KAKAO), row(GUEST)], label: "1–2 / 전체 2명", loading: false, hasPrev: false, hasNext: false, onPrev() {}, onNext() {} };

  it("onDelete가 있으면 행마다(폰 목록·PC 표) 어느 계정인지 이름이 붙은 단추, 없으면 단추 없음", () => {
    const withDelete = renderToStaticMarkup(h(UserList, { ...base, onDelete() {} }));
    expect(count(withDelete, /aria-label="계정 삭제 3f0f9b2e"/g)).toBe(2);
    expect(count(withDelete, /aria-label="계정 삭제 a1b2c3d4"/g)).toBe(2);
    expect(withDelete).toContain(`<span class="sr-only">${ADMIN_TEXT.colActions}</span>`);
    const without = renderToStaticMarkup(h(UserList, base));
    expect(without).not.toContain("계정 삭제");
    expect(without).not.toContain(ADMIN_TEXT.colActions);
  });

  it("삭제 창이 떠 있는 동안 단추를 잠근다", () => {
    const markup = renderToStaticMarkup(h(UserList, { ...base, onDelete() {}, deleting: true }));
    expect(count(markup, /aria-label="계정 삭제 [0-9a-f]{8}"[^>]*/g)).toBe(4);
    expect(count(markup, /<button type="button" disabled="" aria-label="계정 삭제/g)).toBe(4);
  });
});

describe("30일 막대 — 게스트·카카오 나눈 막대", () => {
  function days(split: boolean): DayCount[] {
    const out: DayCount[] = [];
    const start = Date.UTC(2026, 7, 30);
    for (let i = 0; i < 30; i++) {
      const users = i === 29 ? 3 : i % 2;
      out.push({
        day: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
        users,
        anonymousUsers: split ? Math.min(users, 1) : null,
        kakaoUsers: split ? users - Math.min(users, 1) : null,
      });
    }
    return out;
  }
  const render = (split: boolean) => {
    const d = days(split);
    const scale = niceScale(3);
    return renderToStaticMarkup(h(NewUsersChart, { bars: chartBars(d, scale), scale, summary: chartSummary(d) }));
  };

  it("나눌 수 있으면 범례(글자와 함께)·부제·표의 종류 칸, 알림에도 조각 값", () => {
    const markup = render(true);
    expect(markup).toContain(ADMIN_TEXT.chartSplitNote);
    expect(count(markup, new RegExp(`<li[^>]*>.*?${ADMIN_TEXT.kindGuest}</li>`, "g"))).toBe(1);
    expect(count(markup, new RegExp(`<th scope="col"[^>]*>${ADMIN_TEXT.kindKakao}</th>`, "g"))).toBe(1);
    expect(count(markup, /<th scope="col"/g)).toBe(4); // 날짜 · 신규 가입 · 게스트 · 카카오(기타 없음)
  });

  it("0002만 실행된 서버(칸 없음)는 한 색 막대 — 범례·종류 칸 없음", () => {
    const markup = render(false);
    expect(markup).not.toContain(ADMIN_TEXT.chartSplitNote);
    expect(count(markup, /<th scope="col"/g)).toBe(2);
    expect(markup).not.toContain(`>${ADMIN_TEXT.kindGuest}<`);
  });
});
