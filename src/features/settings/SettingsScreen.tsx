"use client";

// 설정 — iOS SettingsView(MoreView.swift:4-142).
// 순서: 계정(로그인 표시 · 로그아웃 · 계정 삭제) → 프로필(편집 · 산후 일수 · 분만 방식 · 목표 · 내 동네)
//       → 알림(웹 미구현 — 준비 중, D4) → 개인정보·안전(면책 · 개인정보처리방침 — 서버 저장 빌드는 "내 기기에만 저장" 문장을 바꾼다
//       · 이용약관(초안) · 문의 mailto) → 내 데이터(웹 신규 — 동의 내역·철회 방법·내 데이터 내려받기, DataRightsCard).
// 로그아웃·계정 삭제는 확인 창을 거친다. 계정이 없어지면 앱 관문(features/flow/AppGate)이 로그인 화면으로 보낸다.
//
// 계정 카드(settingsView.ts accountModeFor·accountCardActions)
// - 사용자 관리(Supabase)가 없는 빌드: 지금까지와 같다 — 스토어에서 바로(로그아웃은 기록을 남기고, 삭제는 이 브라우저를 비운다).
// - 있는 빌드: src/auth(useAccountSession)를 거친다.
//   · 카카오: 로그아웃 전 남은 변경을 올리고(못 올렸으면 경고 뒤 [그래도 로그아웃]), 삭제는 서버를 먼저 지운다 —
//     실패하면 아무것도 지우지 않고 이 화면에 이유를 알린다(감사 #18·#19).
//   · 게스트(Supabase 익명 계정): 로그아웃이 없다 — 익명 계정은 로그아웃하면 다시 찾을 수 없다. 대신 [카카오 계정 연결](같은 계정에
//     카카오를 붙여 기록·서버 행을 그대로 이어 간다 — 카카오 화면을 다녀와 로그인 콜백이 마친다)과 [이 기기에서 기록 지우기(계정 삭제)]
//     (서버 먼저). 로그아웃이 없는 까닭을 카드 아래에 적는다.

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Mail, Pencil } from "lucide-react";
import { PAGE_FRAME } from "@/components/shell/pageFrame";
import { Card, SectionTitle, SubPageHeader, cx } from "@/components/ui";
import { isSupabaseConfigured } from "@/config";
import { useAccountSession } from "@/auth";
import { useAppStore } from "@/store/useAppStore";
import { useNowMs } from "@/features/profile/useNow";
import { CONTACT_EMAIL, CONTACT_TEXT, mailtoHref } from "@/features/terms/contact";
import { hasTermsText, TERMS_TEXT } from "@/features/terms/termsText";
import { ConfirmDialog } from "./ConfirmDialog";
import { DataRightsCard } from "./DataRightsCard";
import { ReminderSection } from "./ReminderSection";
import {
  PRIVACY_HREF,
  TERMS_HREF,
  PROFILE_EDIT_HREF,
  PROFILE_EDIT_TEXT,
  PROFILE_HREF,
  GUEST_ACCOUNT_TEXT,
  SERVER_ACCOUNT_TEXT,
  SETTINGS_TEXT,
  accountCardActions,
  accountModeFor,
  deleteConfirmMessage,
  performDeleteAccount,
  performLinkKakao,
  performSignOut,
  privacyBodyFor,
  settingsProfileRows,
  signOutConfirmMessage,
  usesServerAccount,
  type AccountCardActions,
  type SettingsRow,
} from "./settingsView";

type PendingConfirm = "signOut" | "unsynced" | "delete" | null;
type Busy = "signOut" | "delete" | "link" | null;

export function SettingsScreen() {
  const { hydrated, isSignedIn, state, account, displayName, actions } = useAppStore();
  const session = useAccountSession();
  const nowMs = useNowMs();
  const [confirming, setConfirming] = useState<PendingConfirm>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const supabase = isSupabaseConfigured();
  const serverAccount = usesServerAccount(account?.provider, supabase);
  const cardActions = accountCardActions(accountModeFor(account?.provider, supabase));

  /**
   * 확인 창이 닫혔다(취소·Esc·바깥·확정 뒤 close()). 그 창의 것일 때만 지운다 — <dialog>의 close 이벤트는 늦게 오므로,
   * 로그아웃 확인 창이 닫히는 사이에 경고 창("unsynced")이 열렸다면 그것을 닫지 않게.
   */
  function closeConfirm(which: Exclude<PendingConfirm, null>) {
    setConfirming((c) => (c === which ? null : c));
  }

  async function signOut(force: boolean) {
    setConfirming(null);
    setFailure(null);
    if (supabase) setBusy("signOut");
    const outcome = await performSignOut({
      supabaseConfigured: supabase,
      force,
      signOutLocal: actions.signOut, // 계정만 지운다 — 기록은 남는다(iOS와 같음)
      signOutEverywhere: session.signOut,
    });
    setBusy(null);
    // done이면 계정이 없어져 관문이 로그인 화면으로 보낸다. 못 올린 기록이 있으면 경고 뒤 다시 묻는다.
    if (outcome.kind === "unsynced") setConfirming("unsynced");
  }

  /** 계정 삭제 — 설정이 없으면 이 브라우저만 비운다(MoreView.swift:113-118). 서버 계정은 서버를 먼저 지운다. */
  async function deleteAccount() {
    setConfirming(null);
    setFailure(null);
    if (supabase) setBusy("delete");
    const outcome = await performDeleteAccount({
      supabaseConfigured: supabase,
      deleteLocal: actions.deleteAccount,
      deleteAccountEverywhere: session.deleteAccount,
    });
    setBusy(null);
    if (outcome.kind === "failed") setFailure(outcome.message);
  }

  /** 게스트의 [카카오 계정 연결] — 카카오 화면으로 이동한다. 이동하는 동안 버튼을 잠근 채 둔다(두 번 누르기 방지). */
  async function linkKakao() {
    setFailure(null);
    setBusy("link");
    const outcome = await performLinkKakao({ signInWithKakao: session.signInWithKakao });
    if (outcome.kind === "redirecting") return;
    setBusy(null);
    if (outcome.kind === "failed") setFailure(outcome.message);
  }

  return (
    // VStack(spacing: md) · 좌우 lg · 위 md — MoreView.swift:13-89
    // PC 틀은 pageFrame(읽기 화면 — 최대 48rem, 왼쪽 정렬). 사이드바에 있는 화면이라 PC에서는 [뒤로]를 숨긴다. 폰 기둥(30rem)에서는 그대로.
    <main className={cx("flex flex-1 flex-col gap-4 px-6 pt-2 pb-10", PAGE_FRAME.reading)}>
      <SubPageHeader title={SETTINGS_TEXT.title} backHref={PROFILE_HREF} hideBackWithSidebar />

      {hydrated && isSignedIn && nowMs !== null ? (
        <>
          <AccountCard
            displayName={displayName}
            actions={cardActions}
            busy={busy}
            failure={failure}
            onSignOut={() => setConfirming("signOut")}
            onLinkKakao={() => void linkKakao()}
            onDelete={() => setConfirming("delete")}
          />
          <ProfileCard rows={settingsProfileRows(state.profile, new Date(nowMs))} />
          <ReminderSection fallback={<NotificationCard />} />
          <PrivacyCard body={privacyBodyFor(supabase)} />
          {/* 내 데이터(웹 신규) — 동의 내역·철회 방법·내려받기(열람권). 계정·처리방침 카드 뒤, 마지막. */}
          <DataRightsCard snapshot={{ state, account }} />
        </>
      ) : null}

      <ConfirmDialog
        open={confirming === "signOut"}
        title={SETTINGS_TEXT.signOutConfirmTitle}
        message={signOutConfirmMessage(account?.provider, serverAccount)}
        confirmLabel={SETTINGS_TEXT.signOutConfirm}
        cancelLabel={SETTINGS_TEXT.cancel}
        onConfirm={() => void signOut(false)}
        onClose={() => closeConfirm("signOut")}
      />
      <ConfirmDialog
        open={confirming === "unsynced"}
        title={SERVER_ACCOUNT_TEXT.unsyncedTitle}
        message={SERVER_ACCOUNT_TEXT.unsyncedMessage}
        confirmLabel={SERVER_ACCOUNT_TEXT.unsyncedConfirm}
        cancelLabel={SETTINGS_TEXT.cancel}
        onConfirm={() => void signOut(true)}
        onClose={() => closeConfirm("unsynced")}
      />
      <ConfirmDialog
        open={confirming === "delete"}
        title={SETTINGS_TEXT.deleteConfirmTitle}
        message={deleteConfirmMessage(serverAccount)}
        confirmLabel={SETTINGS_TEXT.deleteConfirm}
        cancelLabel={SETTINGS_TEXT.cancel}
        onConfirm={() => void deleteAccount()}
        onClose={() => closeConfirm("delete")}
      />
    </main>
  );
}

// 라벨 16 textSecondary · 값 15 semibold (MoreView.swift:135-141)
function InfoRows({ rows }: { rows: ReadonlyArray<{ key: string; label: string; value: string }> }) {
  return (
    <dl className="flex flex-col gap-2">
      {rows.map((row) => (
        <div key={row.key} className="flex items-center justify-between gap-4">
          <dt className="shrink-0 text-base text-text-secondary">{row.label}</dt>
          <dd className="min-w-0 text-right text-[0.9375rem] font-semibold text-text-primary">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function AccountCard({
  displayName,
  actions,
  busy,
  failure,
  onSignOut,
  onLinkKakao,
  onDelete,
}: {
  displayName: string;
  /** 이 계정에 보이는 동작(settingsView.ts accountCardActions) */
  actions: AccountCardActions;
  /** 서버를 거치는 로그아웃·삭제·연결이 진행 중 — 버튼을 막고 진행 상태를 읽어 준다 */
  busy: Busy;
  /** 계정 삭제·연결 실패 안내(아무것도 지우지 않았다) */
  failure: string | null;
  onSignOut: () => void;
  onLinkKakao: () => void;
  onDelete: () => void;
}) {
  const disabled = busy !== null;
  return (
    // MoreView.swift:14-35
    <Card as="section" aria-labelledby="settings-account" aria-busy={disabled} className="flex flex-col gap-2">
      <SectionTitle id="settings-account">{SETTINGS_TEXT.account}</SectionTitle>
      <InfoRows rows={[{ key: "signIn", label: SETTINGS_TEXT.signInRow, value: displayName }]} />
      {actions.linkKakao ? (
        <>
          <hr className="border-divider" />
          <button
            type="button"
            onClick={onLinkKakao}
            disabled={disabled}
            aria-busy={busy === "link" || undefined}
            className="flex min-h-11 w-full flex-col items-start gap-0.5 py-1 text-left disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="text-[0.9375rem] font-semibold text-primary-text">{GUEST_ACCOUNT_TEXT.linkKakao}</span>
            <span className="text-[0.8125rem] text-text-secondary">{GUEST_ACCOUNT_TEXT.linkKakaoHint}</span>
          </button>
        </>
      ) : null}
      {actions.signOut ? (
        <>
          <hr className="border-divider" />
          <button
            type="button"
            onClick={onSignOut}
            disabled={disabled}
            className="flex min-h-11 w-full items-center text-left text-[0.9375rem] font-semibold text-state-alert-text disabled:cursor-not-allowed disabled:opacity-50"
          >
            {SETTINGS_TEXT.signOut}
          </button>
        </>
      ) : null}
      <hr className="border-divider" />
      <button
        type="button"
        onClick={onDelete}
        disabled={disabled}
        className="flex min-h-11 w-full flex-col items-start gap-0.5 py-1 text-left disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="text-[0.9375rem] font-semibold text-state-alert-text">{actions.deleteLabel}</span>
        <span className="text-[0.8125rem] text-text-secondary">{SETTINGS_TEXT.deleteAccountHint}</span>
      </button>
      {actions.notice !== null ? <p className="text-[0.8125rem] text-text-secondary">{actions.notice}</p> : null}
      {/* 진행 상태는 polite로, 실패는 alert로 읽힌다. 실패는 색만이 아니라 문장으로 알린다. */}
      <p aria-live="polite" className="text-[0.8125rem] text-text-secondary empty:hidden">
        {busy === "signOut" ? SERVER_ACCOUNT_TEXT.signingOut : busy === "delete" ? SERVER_ACCOUNT_TEXT.deleting : null}
      </p>
      <div role="alert" className="empty:hidden">
        {failure !== null ? <p className="text-[0.8125rem] font-semibold text-state-alert-text">{failure}</p> : null}
      </div>
    </Card>
  );
}

function ProfileCard({ rows }: { rows: SettingsRow[] }) {
  return (
    // MoreView.swift:36-56 — 이 카드는 행 사이 구분선이 없다
    <Card as="section" aria-labelledby="settings-profile" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <SectionTitle id="settings-profile">{SETTINGS_TEXT.profile}</SectionTitle>
        </div>
        {/* 연필 12 + "편집" 13 semibold primary. 보이는 크기는 iOS대로, 누르는 영역만 44px로 */}
        <Link
          href={PROFILE_EDIT_HREF}
          aria-label={PROFILE_EDIT_TEXT.title}
          className="-my-2.5 -mr-2 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-button px-2 text-[0.8125rem] font-semibold text-primary-text"
        >
          <Pencil aria-hidden className="size-3" strokeWidth={2.5} />
          {SETTINGS_TEXT.edit}
        </Link>
      </div>
      <InfoRows rows={rows} />
    </Card>
  );
}

// 알림 — 웹은 매일 리마인더를 아직 보내지 못한다(D4). 동작하지 않는 토글 대신 "준비 중"을 보인다.
function NotificationCard() {
  return (
    // MoreView.swift:57-69
    <Card as="section" aria-labelledby="settings-notifications" className="flex flex-col gap-2">
      <SectionTitle id="settings-notifications">{SETTINGS_TEXT.notifications}</SectionTitle>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-text-primary">{SETTINGS_TEXT.reminderTitle}</p>
          <p className="mt-0.5 text-[0.8125rem] text-text-secondary">{SETTINGS_TEXT.reminderBody}</p>
        </div>
        <span className="shrink-0 rounded-full bg-background px-3 py-1 text-[0.8125rem] font-semibold text-text-secondary">
          {SETTINGS_TEXT.comingSoon}
        </span>
      </div>
    </Card>
  );
}

const PRIVACY_LINK_CLASS = "flex min-h-11 items-center justify-between gap-2 rounded-button text-[0.9375rem] font-semibold text-primary-text";

/**
 * body — privacyBodyFor(서버 저장 빌드면 "내 기기에만 저장" 문장을 바꾼 것).
 * 링크: 개인정보처리방침(원문) · 이용약관(초안 — features/terms, 본문이 있을 때만) · 문의(방침의 이메일로 mailto — features/terms/contact.ts).
 */
function PrivacyCard({ body }: { body: string }) {
  return (
    // MoreView.swift:70-87
    <Card as="section" aria-labelledby="settings-privacy" className="flex flex-col gap-2">
      <SectionTitle id="settings-privacy">{SETTINGS_TEXT.privacy}</SectionTitle>
      <p className="text-[0.8125rem] text-text-secondary">{body}</p>
      <Link href={PRIVACY_HREF} className={PRIVACY_LINK_CLASS}>
        {SETTINGS_TEXT.privacyPolicy}
        <ChevronRight aria-hidden className="size-4 shrink-0 text-text-secondary" strokeWidth={2.5} />
      </Link>
      {hasTermsText() ? (
        <>
          <hr className="border-divider" />
          <Link href={TERMS_HREF} className={PRIVACY_LINK_CLASS}>
            {TERMS_TEXT.navTitle}
            <ChevronRight aria-hidden className="size-4 shrink-0 text-text-secondary" strokeWidth={2.5} />
          </Link>
        </>
      ) : null}
      {CONTACT_EMAIL !== null ? (
        <>
          <hr className="border-divider" />
          {/* 문의 — 이름은 왼쪽, 주소는 오른쪽(누르면 메일 앱, 제목만 미리 채움) */}
          <a href={mailtoHref(CONTACT_EMAIL)} className={PRIVACY_LINK_CLASS}>
            {CONTACT_TEXT.label}
            <span className="inline-flex min-w-0 items-center gap-1 text-[0.8125rem] font-medium text-text-secondary">
              <span className="break-all">{CONTACT_EMAIL}</span>
              <Mail aria-hidden className="size-4 shrink-0" strokeWidth={2.5} />
            </span>
          </a>
        </>
      ) : null}
    </Card>
  );
}
