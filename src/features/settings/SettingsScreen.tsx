"use client";

// 설정 — iOS SettingsView(MoreView.swift:4-142).
// 순서: 계정(로그인 표시 · 로그아웃 · 계정 삭제) → 프로필(편집 · 산후 일수 · 분만 방식 · 목표 · 내 동네)
//       → 알림(웹 미구현 — 준비 중, D4) → 개인정보·안전(면책 · 개인정보처리방침).
// 로그아웃·계정 삭제는 확인 창을 거친다. 계정이 없어지면 앱 관문(features/flow/AppGate)이 로그인 화면으로 보낸다.

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Pencil } from "lucide-react";
import { Card, SectionTitle, SubPageHeader } from "@/components/ui";
import { useAppStore } from "@/store/useAppStore";
import { useNowMs } from "@/features/profile/useNow";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  PRIVACY_HREF,
  PROFILE_EDIT_HREF,
  PROFILE_EDIT_TEXT,
  PROFILE_HREF,
  SETTINGS_TEXT,
  settingsProfileRows,
  signOutMessage,
  type SettingsRow,
} from "./settingsView";

type PendingConfirm = "signOut" | "delete" | null;

export function SettingsScreen() {
  const { hydrated, isSignedIn, state, account, displayName, actions } = useAppStore();
  const nowMs = useNowMs();
  const [confirming, setConfirming] = useState<PendingConfirm>(null);

  function signOut() {
    setConfirming(null);
    actions.signOut(); // 계정만 지운다 — 기록은 남는다(iOS와 같음)
  }

  /** 계정 삭제 — 데이터는 이 브라우저에만 있으므로 로컬 삭제로 탈퇴가 끝난다(MoreView.swift:113-118 deleteAccount). 서버 탈퇴는 미구현. */
  function deleteAccount() {
    setConfirming(null);
    actions.deleteAccount();
  }

  return (
    // VStack(spacing: md) · 좌우 lg · 위 md — MoreView.swift:13-89
    <main className="flex flex-1 flex-col gap-4 px-6 pt-2 pb-10">
      <SubPageHeader title={SETTINGS_TEXT.title} backHref={PROFILE_HREF} />

      {hydrated && isSignedIn && nowMs !== null ? (
        <>
          <AccountCard
            displayName={displayName}
            onSignOut={() => setConfirming("signOut")}
            onDelete={() => setConfirming("delete")}
          />
          <ProfileCard rows={settingsProfileRows(state.profile, new Date(nowMs))} />
          <NotificationCard />
          <PrivacyCard />
        </>
      ) : null}

      <ConfirmDialog
        open={confirming === "signOut"}
        title={SETTINGS_TEXT.signOutConfirmTitle}
        message={signOutMessage(account?.provider)}
        confirmLabel={SETTINGS_TEXT.signOutConfirm}
        cancelLabel={SETTINGS_TEXT.cancel}
        onConfirm={signOut}
        onClose={() => setConfirming(null)}
      />
      <ConfirmDialog
        open={confirming === "delete"}
        title={SETTINGS_TEXT.deleteConfirmTitle}
        message={SETTINGS_TEXT.deleteMessage}
        confirmLabel={SETTINGS_TEXT.deleteConfirm}
        cancelLabel={SETTINGS_TEXT.cancel}
        onConfirm={deleteAccount}
        onClose={() => setConfirming(null)}
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
  onSignOut,
  onDelete,
}: {
  displayName: string;
  onSignOut: () => void;
  onDelete: () => void;
}) {
  return (
    // MoreView.swift:14-35
    <Card as="section" aria-labelledby="settings-account" className="flex flex-col gap-2">
      <SectionTitle id="settings-account">{SETTINGS_TEXT.account}</SectionTitle>
      <InfoRows rows={[{ key: "signIn", label: SETTINGS_TEXT.signInRow, value: displayName }]} />
      <hr className="border-divider" />
      <button
        type="button"
        onClick={onSignOut}
        className="flex min-h-11 w-full items-center text-left text-[0.9375rem] font-semibold text-state-alert"
      >
        {SETTINGS_TEXT.signOut}
      </button>
      <hr className="border-divider" />
      <button type="button" onClick={onDelete} className="flex min-h-11 w-full flex-col items-start gap-0.5 py-1 text-left">
        <span className="text-[0.9375rem] font-semibold text-state-alert">{SETTINGS_TEXT.deleteAccount}</span>
        <span className="text-[0.8125rem] text-text-secondary">{SETTINGS_TEXT.deleteAccountHint}</span>
      </button>
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
          className="-my-2.5 -mr-2 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-button px-2 text-[0.8125rem] font-semibold text-primary"
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

function PrivacyCard() {
  return (
    // MoreView.swift:70-87
    <Card as="section" aria-labelledby="settings-privacy" className="flex flex-col gap-2">
      <SectionTitle id="settings-privacy">{SETTINGS_TEXT.privacy}</SectionTitle>
      <p className="text-[0.8125rem] text-text-secondary">{SETTINGS_TEXT.privacyBody}</p>
      <Link
        href={PRIVACY_HREF}
        className="flex min-h-11 items-center justify-between gap-2 rounded-button text-[0.9375rem] font-semibold text-primary"
      >
        {SETTINGS_TEXT.privacyPolicy}
        <ChevronRight aria-hidden className="size-4 shrink-0 text-text-secondary" strokeWidth={2.5} />
      </Link>
    </Card>
  );
}
