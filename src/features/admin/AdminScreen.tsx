"use client";

// 관리자 화면(/admin/) — 운영자가 가입·이용 규모를 보고, 이용자의 삭제 요청을 처리하는 곳. 메뉴에 링크하지 않는다.
//
// 보이는 것: 집계(전체·게스트·카카오·현재 판 동의·최근 7일 활성), 30일 신규 가입 막대(0005 뒤에는 게스트·카카오 나눔),
//   동의 버전 분포·관리자 목록·계정 찾기(0005_admin_tools.sql), 계정 메타데이터 목록(+ 행마다 [계정 삭제] · CSV 내려받기).
// 보이지 않는 것: 건강 기록(state)·이메일·닉네임 — 서버 함수가 애초에 돌려주지 않는다(supabase/migrations/0002_admin.sql·0005_admin_tools.sql).
//
// 누가 보나: Supabase 설정이 있는 빌드 + 카카오로 로그인한(게스트 아님) + public.admins에 있는 계정.
//   - 설정 없음 → "권한이 없어요"(설정 없는 빌드 안내). Supabase로 요청하지 않는다.
//   - 로그인 안 함·게스트 → "권한이 없어요" + 홈으로
//   - 카카오지만 관리자 아님 → 같은 안내 + "내 계정 ID"(소유자가 SQL로 자기를 관리자로 넣을 때 쓴다)
//   - 관리자 → 대시보드. 다른 탭에서 로그아웃하면 바로 내려 준다(공용 PC에 남지 않게).
// 권한은 서버가 지킨다(모든 함수가 is_admin()을 확인). 이 화면의 판단은 안내용이다.
// 앱 관문(features/flow/gate.ts)은 이 주소를 로그인·온보딩으로 옮기지 않아야 한다(공개 주소) — 권한은 여기서 본다.
//
// 0005가 아직 실행되지 않은 서버(0002만): 집계·목록은 그대로 보이고, 동의 버전 분포 카드는 그리지 않으며(응답에 칸이 없음),
//   관리자 목록·계정 찾기·계정 삭제는 "0005_admin_tools.sql을 실행했는지 확인" 안내를 보인다.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Download, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { getSupabaseClient } from "@/auth/client";
import { Card, PrimaryButton, primaryButtonClass, secondaryButtonClass } from "@/components/ui";
import { cx } from "@/components/ui/cx";
import { isSupabaseConfigured } from "@/config";
import { CURRENT_CONSENT_VERSION } from "@/domain/consent";
import { BrandLogo } from "@/features/flow/BrandLogo";
import { downloadTextFile } from "@/features/settings/dataExport";
import { ROUTES } from "@/routes";
import {
  adminClientFrom,
  checkAdminAccess,
  deleteUser,
  fetchAdmins,
  fetchAllUsers,
  fetchOverview,
  fetchUsersPage,
  findUser,
  type AdminClient,
  type AdminFailure,
  type UsersPage,
} from "./adminApi";
import {
  ADMIN_PAGE_SIZE,
  ADMIN_TEXT,
  adminRowView,
  chartBars,
  chartSummary,
  consentVersionRows,
  csvFileName,
  deleteFailureMessage,
  generatedAtLabel,
  kpiCards,
  niceScale,
  normalizeUuid,
  pageLabel,
  userRowView,
  usersCsv,
  type AdminListRow,
  type AdminOverview,
  type UserRowView,
} from "./adminModel";
import { AdminsTable, ConsentVersionsTable, TOOL_BUTTON_CLASS, ToolCard, UserSearch, type SearchState } from "./AdminTools";
import { DeleteUserDialog } from "./DeleteUserDialog";
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

/** 계정 찾기·삭제·CSV가 실패했을 때의 문장 — 0005 미실행은 설치 안내, 그 밖은 잠시 후 다시 */
function toolFailureMessage(failure: Exclude<AdminFailure, "forbidden">, fallback: string): string {
  return failure === "setupMissing" ? ADMIN_TEXT.toolsSetupHint : fallback;
}

/** 관리자일 때만 그린다. 데이터 상태는 여기 있고, 카드들(AdminTools·UserList·NewUsersChart)은 그리기만 한다. */
function AdminDashboard({ client, onForbidden }: { client: AdminClient; onForbidden(): void }) {
  const [reloadKey, setReloadKey] = useState(0);
  const [page, setPage] = useState(0);
  const [overview, setOverview] = useState<Loadable<AdminOverview>>({ status: "loading", last: null });
  const [users, setUsers] = useState<Loadable<UsersPage>>({ status: "loading", last: null });
  const [admins, setAdmins] = useState<Loadable<AdminListRow[]>>({ status: "loading", last: null });
  // 계정 찾기(이용자가 보낸 UUID)
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<SearchState>({ kind: "idle" });
  // 계정 삭제(요청 처리) — 대상이 있을 때만 확인 창을 그린다
  const [deleteTarget, setDeleteTarget] = useState<UserRowView | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // 확인 창이 닫힌 뒤 포커스가 갈 곳(WCAG 2.4.3) — 창이 사라지면 브라우저는 포커스를 body로 떨어뜨린다(연 단추가 창이 떠 있는 동안
  // 잠겨 있어 네이티브 <dialog>의 되돌리기도 실패한다). 취소 = 연 단추로, 삭제 완료 = 알림 줄로. 창이 사라진 다음 렌더에서 옮긴다.
  // 갈 곳은 ref로 둔다(상태로 두면 효과 안에서 다시 setState — 렌더가 한 번 더 돈다). 창이 사라진 렌더의 효과가 읽고 비운다.
  const deleteTriggerRef = useRef<HTMLElement | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const pendingFocusRef = useRef<"trigger" | "notice" | null>(null);
  // CSV 내려받기(메타데이터만)
  const [csv, setCsv] = useState<"idle" | "busy" | "failed">("idle");
  const usersTitleId = useId();
  const consentTitleId = useId();
  const adminsTitleId = useId();
  const searchTitleId = useId();
  const searchInputId = useId();

  useEffect(() => {
    const pendingFocus = pendingFocusRef.current;
    if (pendingFocus === null || deleteTarget !== null) return;
    pendingFocusRef.current = null;
    const trigger = deleteTriggerRef.current;
    deleteTriggerRef.current = null;
    if (pendingFocus === "notice") {
      noticeRef.current?.focus();
    } else if (trigger !== null && trigger.isConnected) {
      trigger.focus();
    } else {
      // 연 단추가 사라졌으면(목록이 바뀜) 계정 찾기 입력으로 — 화면 밖으로 떨어지지 않게
      document.getElementById(searchInputId)?.focus();
    }
  }, [deleteTarget, searchInputId]);

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

  useEffect(() => {
    let cancelled = false;
    void fetchAdmins(client).then((r) => {
      if (cancelled) return;
      if (r.ok) setAdmins({ status: "ok", value: r.value });
      else if (r.failure === "forbidden") onForbidden();
      else setAdmins({ status: "failed", failure: r.failure });
    });
    return () => {
      cancelled = true;
    };
  }, [client, reloadKey, onForbidden]);

  // 다시 불러오는 동안 이전 값을 흐리게 남긴다(자리가 튀지 않게)
  const reload = () => {
    setOverview((o) => ({ status: "loading", last: lastOf(o) }));
    setUsers((u) => ({ status: "loading", last: lastOf(u) }));
    setAdmins((a) => ({ status: "loading", last: lastOf(a) }));
    setReloadKey((k) => k + 1);
  };
  const goToPage = (next: number) => {
    setUsers((u) => ({ status: "loading", last: lastOf(u) }));
    setPage(Math.max(0, next));
  };

  /** 계정 찾기 — 형식이 아니면 서버에 묻지 않는다 */
  async function runSearch() {
    const id = normalizeUuid(query);
    if (id === null) {
      setSearch({ kind: "invalid" });
      return;
    }
    setSearch({ kind: "loading" });
    const r = await findUser(client, id);
    if (!r.ok) {
      if (r.failure === "forbidden") onForbidden();
      else setSearch({ kind: "failed", message: toolFailureMessage(r.failure, ADMIN_TEXT.searchFailed) });
      return;
    }
    setSearch(r.value === null ? { kind: "notFound" } : { kind: "found", row: userRowView(r.value, CURRENT_CONSENT_VERSION) });
  }

  function openDelete(row: UserRowView) {
    // 누른 [계정 삭제] 단추(지금 포커스) — 취소하면 여기로 돌아온다
    deleteTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    pendingFocusRef.current = null;
    setNotice(null);
    setDeleteError(null);
    setDeleteTarget(row);
  }

  /** 취소·Esc·바깥 누름 — 창을 닫고 포커스를 연 단추로 되돌린다 */
  function closeDelete() {
    if (deleteBusy) return;
    pendingFocusRef.current = "trigger";
    setDeleteTarget(null);
    setDeleteError(null);
  }

  /** 확인 창의 확정 — 서버가 지우고 admin_audit에 남긴다. 성공하면 창을 닫고 목록·집계를 다시 불러온다. */
  async function confirmDelete(reason: string | null) {
    if (deleteTarget === null || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError(null);
    const r = await deleteUser(client, deleteTarget.id, reason);
    setDeleteBusy(false);
    if (!r.ok) {
      if (r.failure === "forbidden") onForbidden();
      else setDeleteError(deleteFailureMessage(r.failure));
      return;
    }
    const deletedId = deleteTarget.id;
    pendingFocusRef.current = "notice"; // 연 단추는 방금 지운 행과 함께 사라진다 — 알림 줄로
    setDeleteTarget(null);
    setNotice(ADMIN_TEXT.deleteDone);
    // 찾기 결과가 그 계정이면 "삭제됐어요"로 바꾼다(다시 [계정 삭제]를 누를 수 없게)
    setSearch((s) => (s.kind === "found" && s.row.id === deletedId ? { kind: "deleted", row: s.row } : s));
    // 이 쪽의 마지막 한 명을 지웠으면 앞 쪽으로(빈 쪽을 보이지 않게), 아니면 같은 쪽을 다시
    const shown = lastOf(users);
    if (shown !== null && shown.rows.length === 1 && page > 0) setPage(page - 1);
    reload();
  }

  /** CSV — 전체 목록을 서버 최대(100명)씩 모아 파일로. 부분 파일은 만들지 않는다(adminApi fetchAllUsers). */
  async function exportCsv() {
    setCsv("busy");
    const r = await fetchAllUsers(client);
    if (!r.ok) {
      if (r.failure === "forbidden") onForbidden();
      else setCsv("failed");
      return;
    }
    const ok = downloadTextFile(csvFileName(new Date()), usersCsv(r.value, CURRENT_CONSENT_VERSION), "text/csv;charset=utf-8");
    setCsv(ok ? "idle" : "failed");
  }

  const shownOverview = lastOf(overview);
  const shownUsers = lastOf(users);
  const shownAdmins = lastOf(admins);
  const generated = shownOverview === null ? null : generatedAtLabel(shownOverview.generatedAt);

  const cards = useMemo(() => (shownOverview === null ? [] : kpiCards(shownOverview, CURRENT_CONSENT_VERSION)), [shownOverview]);
  const chart = useMemo(() => {
    if (shownOverview === null) return null;
    const days = shownOverview.newUsersByDay;
    const scale = niceScale(Math.max(0, ...days.map((d) => d.users)));
    return { bars: chartBars(days, scale), scale, summary: chartSummary(days) };
  }, [shownOverview]);
  const consentRows = useMemo(
    () => (shownOverview === null || shownOverview.consentVersions === null ? null : consentVersionRows(shownOverview.consentVersions, CURRENT_CONSENT_VERSION)),
    [shownOverview],
  );
  const rowViews = useMemo(
    () => (shownUsers === null ? [] : shownUsers.rows.map((r) => userRowView(r, CURRENT_CONSENT_VERSION))),
    [shownUsers],
  );
  const adminRows = useMemo(() => (shownAdmins === null ? [] : shownAdmins.map(adminRowView)), [shownAdmins]);

  const busy = overview.status === "loading" || users.status === "loading" || admins.status === "loading";
  const deleting = deleteTarget !== null;

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

        {/* 방금 한 일(계정 삭제 완료) — 화면 낭독기에도 읽히고, 삭제 뒤 포커스가 여기로 온다(tabIndex -1: 탭 순서에는 없다). 비어 있으면 자리도 없다. */}
        <div
          ref={noticeRef}
          tabIndex={-1}
          role="status"
          aria-live="polite"
          className="empty:hidden rounded-chip bg-surface px-4 py-3 text-[0.8125rem] font-semibold text-text-primary ring-1 ring-divider focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          {notice}
        </div>

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

        {/* 동의 버전 분포(0005 뒤에만 — 응답에 칸이 있을 때) · 관리자 목록. 둘 다 있으면 PC는 두 열, 하나면 전체 폭. */}
        <div className={cx("grid gap-4 md:gap-5 lg:gap-4", consentRows !== null && "lg:grid-cols-2")}>
          {consentRows !== null ? (
            <ToolCard titleId={consentTitleId} title={ADMIN_TEXT.consentVersionsTitle} subtitle={ADMIN_TEXT.consentVersionsSubtitle}>
              <div aria-busy={overview.status === "loading"} className={cx("transition-opacity", overview.status === "loading" && "opacity-50")}>
                <ConsentVersionsTable rows={consentRows} />
              </div>
            </ToolCard>
          ) : null}
          <ToolCard titleId={adminsTitleId} title={ADMIN_TEXT.adminsTitle}>
            {admins.status === "failed" ? (
              <LoadFailed failure={admins.failure} onRetry={reload} bare setupHint={ADMIN_TEXT.toolsSetupHint} />
            ) : shownAdmins === null ? (
              <LoadingBlock bare />
            ) : (
              <div aria-busy={admins.status === "loading"} className={cx("transition-opacity", admins.status === "loading" && "opacity-50")}>
                <AdminsTable rows={adminRows} />
              </div>
            )}
          </ToolCard>
        </div>

        {/* 계정 찾기 — 이용자가 문의로 보낸 계정 ID로 찾아 삭제 요청을 처리한다(0005) */}
        <ToolCard titleId={searchTitleId} title={ADMIN_TEXT.searchTitle}>
          <UserSearch
            inputId={searchInputId}
            query={query}
            onQueryChange={(v) => {
              setQuery(v);
              if (search.kind === "invalid") setSearch({ kind: "idle" });
            }}
            onSubmit={() => void runSearch()}
            state={search}
            onDelete={openDelete}
            deleting={deleting}
          />
        </ToolCard>

        <UserListCard
          titleId={usersTitleId}
          note={ADMIN_TEXT.csvNote}
          actions={
            <button type="button" onClick={() => void exportCsv()} disabled={csv === "busy" || shownUsers === null} className={TOOL_BUTTON_CLASS}>
              {csv === "busy" ? (
                <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <Download aria-hidden className="size-4" strokeWidth={2.5} />
              )}
              {csv === "busy" ? ADMIN_TEXT.csvExporting : ADMIN_TEXT.csvExport}
            </button>
          }
        >
          <div role="alert" className="empty:hidden text-[0.8125rem] font-semibold text-state-alert-text">
            {csv === "failed" ? ADMIN_TEXT.csvFailed : null}
          </div>
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
              onDelete={openDelete}
              deleting={deleting}
            />
          )}
        </UserListCard>
      </div>

      {deleteTarget !== null ? (
        <DeleteUserDialog target={deleteTarget} busy={deleteBusy} error={deleteError} onConfirm={(reason) => void confirmDelete(reason)} onClose={closeDelete} />
      ) : null}
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

/** setupHint — 설치 안내 문장(기본은 0002, 관리자 도구 카드는 0005) */
function LoadFailed({
  failure,
  onRetry,
  bare = false,
  setupHint = ADMIN_TEXT.setupHint,
}: {
  failure: Exclude<AdminFailure, "forbidden">;
  onRetry(): void;
  bare?: boolean;
  setupHint?: string;
}) {
  const body = (
    <div role="alert" className="flex flex-col items-center gap-3 py-6 text-center">
      <p className="text-[0.9375rem] font-semibold text-text-primary">{ADMIN_TEXT.loadFailedTitle}</p>
      <p className="text-[0.8125rem] text-text-secondary">{failure === "setupMissing" ? setupHint : ADMIN_TEXT.loadFailedBody}</p>
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
