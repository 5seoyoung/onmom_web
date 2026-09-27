"use client";

// 관리자 화면(/admin/) — 운영자가 가입·이용 규모를 보는 곳. 메뉴에 링크하지 않는다.
//
// 보이는 것: 집계(전체·게스트·카카오·현재 판 동의·최근 7일 활성), 30일 신규 가입 막대, 계정 메타데이터 목록.
// 보이지 않는 것: 건강 기록(state)·이메일·닉네임 — 서버 함수가 애초에 돌려주지 않는다(supabase/migrations/0002_admin.sql).
//
// 누가 보나: Supabase 설정이 있는 빌드 + 카카오로 로그인한(게스트 아님) + public.admins에 있는 계정.
//   - 설정 없음 → "권한이 없어요"(설정 없는 빌드 안내). Supabase로 요청하지 않는다.
//   - 로그인 안 함·게스트 → "권한이 없어요" + 홈으로
//   - 카카오지만 관리자 아님 → 같은 안내 + "내 계정 ID"(소유자가 SQL로 자기를 관리자로 넣을 때 쓴다)
//   - 관리자 → 대시보드. 다른 탭에서 로그아웃하면 바로 내려 준다(공용 PC에 남지 않게).
// 권한은 서버가 지킨다(모든 함수가 is_admin()을 확인). 이 화면의 판단은 안내용이다.
// 앱 관문(features/flow/gate.ts)은 이 주소를 로그인·온보딩으로 옮기지 않아야 한다(공개 주소) — 권한은 여기서 본다.

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { getSupabaseClient } from "@/auth/client";
import { Card, PrimaryButton, primaryButtonClass, secondaryButtonClass } from "@/components/ui";
import { cx } from "@/components/ui/cx";
import { isSupabaseConfigured } from "@/config";
import { CURRENT_CONSENT_VERSION } from "@/domain/consent";
import { BrandLogo } from "@/features/flow/BrandLogo";
import { ROUTES } from "@/routes";
import {
  adminClientFrom,
  checkAdminAccess,
  fetchOverview,
  fetchUsersPage,
  type AdminClient,
  type AdminFailure,
  type UsersPage,
} from "./adminApi";
import {
  ADMIN_PAGE_SIZE,
  ADMIN_TEXT,
  chartBars,
  chartSummary,
  generatedAtLabel,
  kpiCards,
  niceScale,
  pageLabel,
  userRowView,
  type AdminOverview,
} from "./adminModel";
import { NewUsersChart } from "./NewUsersChart";
import { UserList, UserListCard } from "./UserList";

type Screen =
  | { kind: "checking" }
  | { kind: "notConfigured" }
  | { kind: "forbidden"; userId: string | null }
  | { kind: "error"; failure: Exclude<AdminFailure, "forbidden"> }
  | { kind: "admin"; client: AdminClient; userId: string };

export function AdminScreen() {
  // 설정 여부는 빌드 때 정해지는 값이라 정적 HTML과 브라우저의 첫 그림이 같다
  const [screen, setScreen] = useState<Screen>(() => (isSupabaseConfigured() ? { kind: "checking" } : { kind: "notConfigured" }));
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let cancelled = false;
    let stopWatching: (() => void) | null = null;
    const run = async () => {
      const supabase = await getSupabaseClient();
      if (cancelled) return;
      if (supabase === null) {
        setScreen({ kind: "error", failure: "failed" });
        return;
      }
      const client = adminClientFrom(supabase);
      stopWatching = client.onSignedOut(() => setScreen({ kind: "forbidden", userId: null }));
      const access = await checkAdminAccess(client);
      if (cancelled) return;
      switch (access.kind) {
        case "admin":
          setScreen({ kind: "admin", client, userId: access.userId });
          break;
        case "notAdmin":
          setScreen({ kind: "forbidden", userId: access.userId });
          break;
        case "signedOut":
        case "anonymous":
          setScreen({ kind: "forbidden", userId: null });
          break;
        case "error":
          setScreen({ kind: "error", failure: access.failure });
          break;
      }
    };
    void run();
    return () => {
      cancelled = true;
      stopWatching?.();
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setScreen({ kind: "checking" });
    setAttempt((n) => n + 1);
  }, []);

  const adminUserId = screen.kind === "admin" ? screen.userId : null;
  const onForbidden = useCallback(() => setScreen({ kind: "forbidden", userId: adminUserId }), [adminUserId]);

  if (screen.kind === "admin") return <AdminDashboard client={screen.client} onForbidden={onForbidden} />;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-6 py-16 text-center">
      <BrandLogo size="login" />
      {screen.kind === "checking" ? (
        <div role="status" className="flex flex-col items-center gap-4">
          <LoaderCircle aria-hidden className="size-7 animate-spin text-primary motion-reduce:animate-none" />
          <h1 className="text-lg font-semibold text-text-primary">{ADMIN_TEXT.checking}</h1>
        </div>
      ) : screen.kind === "error" ? (
        <div className="flex w-full max-w-[22rem] flex-col items-center gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-lg font-semibold text-text-primary">{ADMIN_TEXT.loadFailedTitle}</h1>
            <p className="text-[0.9375rem] text-text-secondary">{ADMIN_TEXT.loadFailedBody}</p>
            {screen.failure === "setupMissing" ? <p className="text-[0.8125rem] text-text-secondary">{ADMIN_TEXT.setupHint}</p> : null}
          </div>
          <div className="flex w-full flex-col gap-3">
            <PrimaryButton onClick={retry}>{ADMIN_TEXT.retry}</PrimaryButton>
            <Link href={ROUTES.home} className={secondaryButtonClass}>
              {ADMIN_TEXT.home}
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex w-full max-w-[22rem] flex-col items-center gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-lg font-semibold text-text-primary">{ADMIN_TEXT.forbiddenTitle}</h1>
            <p className="text-[0.9375rem] text-text-secondary">
              {screen.kind === "notConfigured" ? ADMIN_TEXT.notConfiguredBody : ADMIN_TEXT.forbiddenBody}
            </p>
          </div>
          {screen.kind === "forbidden" && screen.userId !== null ? (
            <div className="w-full rounded-chip bg-surface px-4 py-3 text-left ring-1 ring-divider">
              <p className="text-[0.8125rem] text-text-secondary">{ADMIN_TEXT.myAccountId}</p>
              <p className="mt-0.5 select-all break-all font-mono text-[0.8125rem] text-text-primary">{screen.userId}</p>
            </div>
          ) : null}
          <Link href={ROUTES.home} className={primaryButtonClass}>
            {ADMIN_TEXT.home}
          </Link>
        </div>
      )}
    </main>
  );
}

// ── 대시보드 ────────────────────────────────────────────────────────────────

type Loadable<T> = { status: "loading"; last: T | null } | { status: "ok"; value: T } | { status: "failed"; failure: Exclude<AdminFailure, "forbidden"> };

function lastOf<T>(l: Loadable<T>): T | null {
  return l.status === "ok" ? l.value : l.status === "loading" ? l.last : null;
}

function AdminDashboard({ client, onForbidden }: { client: AdminClient; onForbidden(): void }) {
  const [reloadKey, setReloadKey] = useState(0);
  const [page, setPage] = useState(0);
  const [overview, setOverview] = useState<Loadable<AdminOverview>>({ status: "loading", last: null });
  const [users, setUsers] = useState<Loadable<UsersPage>>({ status: "loading", last: null });
  const usersTitleId = useId();

  useEffect(() => {
    let cancelled = false;
    void fetchOverview(client, CURRENT_CONSENT_VERSION).then((r) => {
      if (cancelled) return;
      if (r.ok) setOverview({ status: "ok", value: r.value });
      else if (r.failure === "forbidden") onForbidden();
      else setOverview({ status: "failed", failure: r.failure });
    });
    return () => {
      cancelled = true;
    };
  }, [client, reloadKey, onForbidden]);

  useEffect(() => {
    let cancelled = false;
    void fetchUsersPage(client, page, ADMIN_PAGE_SIZE).then((r) => {
      if (cancelled) return;
      if (r.ok) setUsers({ status: "ok", value: r.value });
      else if (r.failure === "forbidden") onForbidden();
      else setUsers({ status: "failed", failure: r.failure });
    });
    return () => {
      cancelled = true;
    };
  }, [client, page, reloadKey, onForbidden]);

  // 다시 불러오는 동안 이전 값을 흐리게 남긴다(자리가 튀지 않게)
  const reload = () => {
    setOverview((o) => ({ status: "loading", last: lastOf(o) }));
    setUsers((u) => ({ status: "loading", last: lastOf(u) }));
    setReloadKey((k) => k + 1);
  };
  const goToPage = (next: number) => {
    setUsers((u) => ({ status: "loading", last: lastOf(u) }));
    setPage(Math.max(0, next));
  };

  const shownOverview = lastOf(overview);
  const shownUsers = lastOf(users);
  const generated = shownOverview === null ? null : generatedAtLabel(shownOverview.generatedAt);

  const cards = useMemo(() => (shownOverview === null ? [] : kpiCards(shownOverview, CURRENT_CONSENT_VERSION)), [shownOverview]);
  const chart = useMemo(() => {
    if (shownOverview === null) return null;
    const days = shownOverview.newUsersByDay;
    const scale = niceScale(Math.max(0, ...days.map((d) => d.users)));
    return { bars: chartBars(days, scale), scale, summary: chartSummary(days) };
  }, [shownOverview]);
  const rowViews = useMemo(
    () => (shownUsers === null ? [] : shownUsers.rows.map((r) => userRowView(r, CURRENT_CONSENT_VERSION))),
    [shownUsers],
  );

  const busy = overview.status === "loading" || users.status === "loading";

  return (
    // PC(lg)는 앱 화면의 틀(components/shell/pageFrame.ts)과 같은 리듬 — 제목 24 bold가 위 32px에서 시작, 카드 사이 16,
    // 본문 폭은 앱의 넓은 화면과 같은 57rem(최대 64rem − 좌우 3.5rem = 껍데기 안쪽 2rem + 화면 1.5rem). 사이드바가 없어 가운데 둔다.
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex w-full max-w-[64rem] flex-col gap-4 px-4 py-6 md:gap-5 md:px-6 lg:gap-4 lg:px-14 lg:pt-8 lg:pb-12">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-2xl font-bold text-neutral">{ADMIN_TEXT.title}</h1>
            <p className="min-h-5 text-[0.8125rem] text-text-secondary tabular-nums">{generated ?? ""}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={reload}
              disabled={busy}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-button border-[1.5px] border-divider bg-surface px-4 text-[0.9375rem] font-semibold text-neutral disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw aria-hidden className={cx("size-4", busy && "animate-spin motion-reduce:animate-none")} />
              {ADMIN_TEXT.refresh}
            </button>
            <Link
              href={ROUTES.home}
              className="inline-flex min-h-11 items-center rounded-button px-3 text-[0.9375rem] font-semibold text-text-secondary"
            >
              {ADMIN_TEXT.home}
            </Link>
          </div>
        </header>

        <p className="flex items-start gap-2 rounded-chip bg-surface px-4 py-3 text-[0.8125rem] text-text-secondary ring-1 ring-divider">
          <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-state-normal" />
          <span>{ADMIN_TEXT.privacyNote}</span>
        </p>

        {overview.status === "failed" ? (
          <LoadFailed failure={overview.failure} onRetry={reload} />
        ) : shownOverview === null || chart === null ? (
          <LoadingBlock />
        ) : (
          <div aria-busy={overview.status === "loading"} className={cx("flex flex-col gap-4 transition-opacity md:gap-5 lg:gap-4", overview.status === "loading" && "opacity-50")}>
            <ul className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {cards.map((c, i) => (
                <li key={c.id} className={cx(i === 0 && "col-span-2 lg:col-span-1")}>
                  <Card className="flex h-full flex-col gap-1">
                    <p className="text-[0.8125rem] font-medium text-text-secondary">{c.label}</p>
                    <p className="text-[1.75rem] font-bold leading-tight text-neutral">{c.value}</p>
                    {c.caption !== null ? <p className="text-[0.75rem] text-text-secondary">{c.caption}</p> : null}
                  </Card>
                </li>
              ))}
            </ul>
            <NewUsersChart bars={chart.bars} scale={chart.scale} summary={chart.summary} />
          </div>
        )}

        <UserListCard titleId={usersTitleId}>
          {users.status === "failed" ? (
            <LoadFailed failure={users.failure} onRetry={reload} bare />
          ) : shownUsers === null ? (
            <LoadingBlock bare />
          ) : (
            <UserList
              titleId={usersTitleId}
              rows={rowViews}
              label={pageLabel(shownUsers.page, ADMIN_PAGE_SIZE, shownUsers.rows.length, shownOverview?.totals.users ?? null)}
              loading={users.status === "loading"}
              hasPrev={shownUsers.page > 0}
              hasNext={shownUsers.hasNext}
              onPrev={() => goToPage(shownUsers.page - 1)}
              onNext={() => goToPage(shownUsers.page + 1)}
            />
          )}
        </UserListCard>
      </div>
    </main>
  );
}

function LoadingBlock({ bare = false }: { bare?: boolean }) {
  const body = (
    <div role="status" className="flex items-center justify-center gap-3 py-10 text-[0.9375rem] text-text-secondary">
      <LoaderCircle aria-hidden className="size-5 animate-spin text-primary motion-reduce:animate-none" />
      <span className="sr-only">{ADMIN_TEXT.checking}</span>
    </div>
  );
  return bare ? body : <Card>{body}</Card>;
}

function LoadFailed({ failure, onRetry, bare = false }: { failure: Exclude<AdminFailure, "forbidden">; onRetry(): void; bare?: boolean }) {
  const body = (
    <div role="alert" className="flex flex-col items-center gap-3 py-6 text-center">
      <p className="text-[0.9375rem] font-semibold text-text-primary">{ADMIN_TEXT.loadFailedTitle}</p>
      <p className="text-[0.8125rem] text-text-secondary">{failure === "setupMissing" ? ADMIN_TEXT.setupHint : ADMIN_TEXT.loadFailedBody}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-11 items-center rounded-button border-[1.5px] border-divider px-5 text-[0.9375rem] font-semibold text-neutral"
      >
        {ADMIN_TEXT.retry}
      </button>
    </div>
  );
  return bare ? body : <Card>{body}</Card>;
}
