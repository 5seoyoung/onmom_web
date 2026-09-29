"use client";

// 관리자 도구 카드(0005_admin_tools.sql) — 동의 버전 분포 · 관리자 목록 · 계정 찾기(이용자의 삭제 요청 처리).
// 모두 메타데이터만: 계정 ID·시각·유형·동의 판·기록 유무. 건강 기록·이메일·닉네임은 서버 함수가 돌려주지 않는다.
// 데이터 상태(불러오는 중·실패)는 AdminScreen이 들고 있고, 여기는 그리기만 한다.

import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { Card } from "@/components/ui";
import { cx } from "@/components/ui/cx";
import { ADMIN_TEXT, type AdminRowView, type ConsentVersionRow, type UserRowView } from "./adminModel";

/** 카드 틀 — 제목(h2) + 부제 + 오른쪽 단추 자리 */
export function ToolCard({
  titleId,
  title,
  subtitle,
  actions,
  className,
  children,
}: {
  titleId: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card as="section" aria-labelledby={titleId} className={cx("flex flex-col gap-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={titleId} className="text-[1.0625rem] font-semibold text-neutral">
            {title}
          </h2>
          {subtitle !== undefined ? <p className="text-[0.8125rem] text-text-secondary">{subtitle}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </Card>
  );
}

/** 작은 글자 단추(계정 삭제 등 행 안의 동작) — 확인 창의 확정 단추와 같은 색 */
export const ROW_ACTION_CLASS =
  "inline-flex min-h-11 items-center justify-center rounded-button bg-coral-tint px-3 text-[0.8125rem] font-semibold text-state-alert-text disabled:cursor-not-allowed disabled:opacity-50";

/** 보조 단추(찾기·CSV 내려받기) — 목록의 쪽 넘김 단추와 같은 모양 */
export const TOOL_BUTTON_CLASS =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-button border-[1.5px] border-divider bg-surface px-4 text-[0.9375rem] font-semibold text-neutral disabled:cursor-not-allowed disabled:opacity-50";

// ── 동의 버전 분포 ───────────────────────────────────────────────────────────

export function ConsentVersionsTable({ rows }: { rows: ConsentVersionRow[] }) {
  if (rows.length === 0) return <p className="py-6 text-center text-[0.9375rem] text-text-secondary">{ADMIN_TEXT.consentVersionsEmpty}</p>;
  return (
    <table className="w-full text-left text-[0.875rem]">
      <thead>
        <tr className="border-b border-divider text-[0.8125rem] text-text-secondary">
          <th scope="col" className="py-2 pr-4 font-medium">
            {ADMIN_TEXT.colConsent}
          </th>
          <th scope="col" className="py-2 pr-4 text-right font-medium">
            {ADMIN_TEXT.colUsers}
          </th>
          <th scope="col" className="py-2 text-right font-medium">
            <span className="sr-only">{ADMIN_TEXT.colShare}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-b border-divider last:border-b-0">
            <th scope="row" className="py-3 pr-4 font-normal">
              <span className={cx("break-all", r.isCurrent ? "font-semibold text-text-primary" : "text-text-secondary")}>{r.label}</span>
              {r.isCurrent ? (
                <span className="ml-2 inline-flex items-center rounded-full bg-accent/60 px-2 py-0.5 text-[0.75rem] font-semibold text-neutral">
                  {ADMIN_TEXT.consentCurrentBadge}
                </span>
              ) : null}
            </th>
            <td className="py-3 pr-4 text-right text-text-primary tabular-nums">{r.usersLabel}</td>
            <td className="py-3 text-right text-text-secondary tabular-nums">{r.share ?? ADMIN_TEXT.none}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── 관리자 목록 ──────────────────────────────────────────────────────────────

export function AdminsTable({ rows }: { rows: AdminRowView[] }) {
  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 ? (
        <p className="py-6 text-center text-[0.9375rem] text-text-secondary">{ADMIN_TEXT.adminsEmpty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-divider border-y border-divider">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 text-[0.8125rem]">
              <span className="inline-flex items-center gap-2">
                <span className="font-mono text-[0.875rem] text-text-primary" title={r.id}>
                  {r.shortId}
                </span>
                {r.isMe ? (
                  <span className="inline-flex items-center rounded-full bg-accent/60 px-2 py-0.5 text-[0.75rem] font-semibold text-neutral">{ADMIN_TEXT.me}</span>
                ) : null}
              </span>
              <span className="flex flex-wrap gap-x-4 text-text-secondary tabular-nums">
                <span>
                  {ADMIN_TEXT.colAddedAt} {r.added}
                </span>
                <span>
                  {ADMIN_TEXT.colLastSignIn} {r.lastSignIn}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[0.8125rem] text-text-secondary">{ADMIN_TEXT.adminsHint}</p>
    </div>
  );
}

// ── 계정 찾기 ────────────────────────────────────────────────────────────────

export type SearchState =
  | { kind: "idle" }
  | { kind: "invalid" }
  | { kind: "loading" }
  | { kind: "notFound" }
  /** 서버 오류 — 문장은 부모가 정한다(설치 안내 등) */
  | { kind: "failed"; message: string }
  | { kind: "found"; row: UserRowView }
  /** 방금 이 화면에서 지운 계정 */
  | { kind: "deleted"; row: UserRowView };

export interface UserSearchProps {
  inputId: string;
  query: string;
  onQueryChange(value: string): void;
  onSubmit(): void;
  state: SearchState;
  /** [계정 삭제] — 찾은 계정에만 */
  onDelete(row: UserRowView): void;
  /** 삭제 창이 떠 있거나 삭제 중 */
  deleting: boolean;
}

export function UserSearch({ inputId, query, onQueryChange, onSubmit, state, onDelete, deleting }: UserSearchProps) {
  const messageId = `${inputId}-message`;
  const invalid = state.kind === "invalid";
  const message =
    state.kind === "invalid"
      ? ADMIN_TEXT.searchInvalid
      : state.kind === "notFound"
        ? ADMIN_TEXT.searchNotFound
        : state.kind === "failed"
          ? state.message
          : state.kind === "deleted"
            ? ADMIN_TEXT.searchDeleted
            : null;

  return (
    <div className="flex flex-col gap-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="flex flex-col gap-2 md:flex-row md:items-end"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor={inputId} className="text-[0.9375rem] font-semibold text-text-secondary">
            {ADMIN_TEXT.searchLabel}
          </label>
          <input
            id={inputId}
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-invalid={invalid || undefined}
            aria-describedby={message !== null ? messageId : undefined}
            className="min-h-11 w-full rounded-button bg-background px-3 font-mono text-[0.9375rem] text-text-primary placeholder:text-text-subtle-aa"
          />
        </div>
        <button type="submit" disabled={state.kind === "loading"} className={TOOL_BUTTON_CLASS}>
          <Search aria-hidden className="size-4" strokeWidth={2.5} />
          {ADMIN_TEXT.searchButton}
        </button>
      </form>
      <p className="text-[0.8125rem] text-text-secondary">{ADMIN_TEXT.searchHint}</p>

      <div id={messageId} role="status" aria-live="polite" className="empty:hidden text-[0.8125rem] font-semibold text-text-primary">
        {message}
      </div>

      {state.kind === "found" || state.kind === "deleted" ? (
        <div className={cx("flex flex-col gap-3 rounded-chip bg-background px-4 py-3", state.kind === "deleted" && "opacity-60")}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[0.8125rem]">
            <dt className="text-text-secondary">{ADMIN_TEXT.colAccountId}</dt>
            <dd className="break-all font-mono text-text-primary">{state.row.id}</dd>
            <dt className="text-text-secondary">{ADMIN_TEXT.colKind}</dt>
            <dd className="text-text-primary">{state.row.kindLabel}</dd>
            <dt className="text-text-secondary">{ADMIN_TEXT.colCreated}</dt>
            <dd className="text-text-primary tabular-nums">{state.row.created}</dd>
            <dt className="text-text-secondary">{ADMIN_TEXT.colLastSignIn}</dt>
            <dd className="text-text-primary tabular-nums">{state.row.lastSignIn}</dd>
            <dt className="text-text-secondary">{ADMIN_TEXT.colConsent}</dt>
            <dd className={cx("break-all", state.row.consentCurrent ? "text-text-primary" : "text-text-secondary")}>{state.row.consent}</dd>
            <dt className="text-text-secondary">{ADMIN_TEXT.colState}</dt>
            <dd className={state.row.hasState ? "text-text-primary" : "text-text-secondary"}>
              {state.row.stateLabel}
              {state.row.stateUpdated !== null ? <span className="text-text-secondary tabular-nums"> · {state.row.stateUpdated}</span> : null}
            </dd>
          </dl>
          {state.kind === "found" ? (
            <div className="flex justify-end">
              <button type="button" onClick={() => onDelete(state.row)} disabled={deleting} className={ROW_ACTION_CLASS}>
                {ADMIN_TEXT.deleteUser}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
