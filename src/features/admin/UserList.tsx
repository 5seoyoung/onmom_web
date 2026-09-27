"use client";

// 사용자 목록 — 계정 메타데이터만(짧은 ID, 가입일, 최근 접속, 게스트/카카오, 동의 판, 서버 기록 유무).
// 건강 기록·이메일·닉네임은 서버 함수가 돌려주지 않으므로 여기 올 수 없다.
// - 폰(md 미만): 한 사람 = 한 줄 묶음(정의 목록, 구분선으로 나눔 — 카드 안에 상자를 겹치지 않는다). 표를 가로로 밀지 않게.
// - PC(md 이상): 표. 숫자·날짜 칸은 자리 맞춤(tabular-nums).
// - 다시 불러오는 동안 이전 목록을 흐리게 남긴다(자리가 튀지 않게).

import type { ReactNode } from "react";
import { Card } from "@/components/ui";
import { cx } from "@/components/ui/cx";
import { ADMIN_TEXT, type UserRowView } from "./adminModel";

/** 쪽 넘김 단추 — 공용 보조 단추와 같은 모양, 폭만 글자에 맞춤(cx는 같은 속성을 덮어쓰지 못해 따로 둔다) */
const PAGE_BUTTON_CLASS =
  "inline-flex min-h-11 items-center justify-center rounded-button border-[1.5px] border-divider bg-transparent px-5 text-[0.9375rem] font-semibold text-neutral disabled:cursor-not-allowed disabled:opacity-50";

function KindBadge({ row }: { row: UserRowView }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[0.75rem] font-semibold",
        row.kind === "kakao" ? "bg-accent/60 text-neutral" : "bg-divider text-text-secondary",
      )}
    >
      {row.kindLabel}
    </span>
  );
}

function Consent({ row }: { row: UserRowView }) {
  return <span className={cx("break-all", row.consentCurrent ? "text-text-primary" : "text-text-secondary")}>{row.consent}</span>;
}

function StateCell({ row }: { row: UserRowView }) {
  return (
    <span className={row.hasState ? "text-text-primary" : "text-text-secondary"}>
      {row.stateLabel}
      {row.stateUpdated !== null ? <span className="text-text-secondary tabular-nums"> · {row.stateUpdated}</span> : null}
    </span>
  );
}

export interface UserListProps {
  titleId: string;
  rows: UserRowView[];
  /** "21–40 / 전체 45명" */
  label: string | null;
  loading: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev(): void;
  onNext(): void;
}

export function UserList({ titleId, rows, label, loading, hasPrev, hasNext, onPrev, onNext }: UserListProps) {
  return (
    <div className="flex flex-col gap-4">
      <div aria-busy={loading} className={cx("transition-opacity", loading && "opacity-50")}>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-[0.9375rem] text-text-secondary">{ADMIN_TEXT.empty}</p>
        ) : (
          <>
            {/* 폰 — 한 사람씩 */}
            <ul className="flex flex-col divide-y divide-divider border-y border-divider md:hidden">
              {rows.map((r) => (
                <li key={r.id} className="py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[0.875rem] text-text-primary" title={r.id}>
                      {r.shortId}
                    </span>
                    <KindBadge row={r} />
                  </div>
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[0.8125rem]">
                    <dt className="text-text-secondary">{ADMIN_TEXT.colCreated}</dt>
                    <dd className="text-text-primary tabular-nums">{r.created}</dd>
                    <dt className="text-text-secondary">{ADMIN_TEXT.colLastSignIn}</dt>
                    <dd className="text-text-primary tabular-nums">{r.lastSignIn}</dd>
                    <dt className="text-text-secondary">{ADMIN_TEXT.colConsent}</dt>
                    <dd>
                      <Consent row={r} />
                    </dd>
                    <dt className="text-text-secondary">{ADMIN_TEXT.colState}</dt>
                    <dd>
                      <StateCell row={r} />
                    </dd>
                  </dl>
                </li>
              ))}
            </ul>

            {/* PC — 표 */}
            <div className="hidden md:block">
              <table aria-labelledby={titleId} className="w-full text-left text-[0.875rem]">
                <thead>
                  <tr className="border-b border-divider text-[0.8125rem] text-text-secondary">
                    <th scope="col" className="py-2 pr-4 font-medium">
                      {ADMIN_TEXT.colId}
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      {ADMIN_TEXT.colCreated}
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      {ADMIN_TEXT.colLastSignIn}
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      {ADMIN_TEXT.colKind}
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      {ADMIN_TEXT.colConsent}
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      {ADMIN_TEXT.colState}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-divider last:border-b-0">
                      <th scope="row" className="py-3 pr-4 font-mono font-normal text-text-primary" title={r.id}>
                        {r.shortId}
                      </th>
                      <td className="py-3 pr-4 text-text-primary tabular-nums">{r.created}</td>
                      <td className="py-3 pr-4 text-text-primary tabular-nums">{r.lastSignIn}</td>
                      <td className="py-3 pr-4">
                        <KindBadge row={r} />
                      </td>
                      <td className="py-3 pr-4">
                        <Consent row={r} />
                      </td>
                      <td className="py-3">
                        <StateCell row={r} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {hasPrev || hasNext ? (
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={onPrev} disabled={!hasPrev || loading} className={PAGE_BUTTON_CLASS}>
            {ADMIN_TEXT.prev}
          </button>
          <p className="text-center text-[0.8125rem] text-text-secondary tabular-nums" aria-live="polite">
            {label}
          </p>
          <button type="button" onClick={onNext} disabled={!hasNext || loading} className={PAGE_BUTTON_CLASS}>
            {ADMIN_TEXT.next}
          </button>
        </div>
      ) : label !== null ? (
        <p className="text-right text-[0.8125rem] text-text-secondary tabular-nums">{label}</p>
      ) : null}
    </div>
  );
}

/** 목록 칸 — 제목과 목록을 한 카드에 */
export function UserListCard({ titleId, children }: { titleId: string; children: ReactNode }) {
  return (
    <Card as="section" aria-labelledby={titleId} className="flex flex-col gap-4">
      <h2 id={titleId} className="text-[1.0625rem] font-semibold text-neutral">
        {ADMIN_TEXT.usersTitle}
      </h2>
      {children}
    </Card>
  );
}
