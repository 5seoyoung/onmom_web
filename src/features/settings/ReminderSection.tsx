"use client";

// 설정 > 알림 — iOS MoreView.swift:57-69의 토글을 웹 푸시로 옮긴 것(동작은 features/pwa/useReminder).
// Supabase + VAPID 공개 키가 없는 빌드는 지금까지처럼 fallback("준비 중" 카드, D4)을 그대로 그린다.
// 있는 빌드: 토글(라벨은 iOS 원문 그대로) / 권한 거부·iOS 설치 안내·미지원 브라우저는 토글 대신 한 줄로 정직하게(문구는 웹 신규 — reminderModel.ts).

import type { ReactNode } from "react";
import { Card, SectionTitle, Toggle } from "@/components/ui";
import { isReminderConfigured } from "@/config";
import { REMINDER_TEXT, type ReminderView } from "@/features/pwa/reminderModel";
import { useReminder } from "@/features/pwa/useReminder";
import { SETTINGS_TEXT } from "./settingsView";

export function ReminderSection({ fallback }: { fallback: ReactNode }) {
  if (!isReminderConfigured()) return <>{fallback}</>;
  return <ReminderCard />;
}

/** 토글 대신 보이는 안내 — 상태마다 한 줄. 토글이면 null. */
export function reminderHint(view: ReminderView): string | null {
  switch (view.kind) {
    case "installHint":
      return REMINDER_TEXT.installHint;
    case "unsupported":
      return REMINDER_TEXT.unsupported;
    case "denied":
      return REMINDER_TEXT.denied;
    default:
      return null;
  }
}

function ReminderCard() {
  const { view, ready, busy, error, setEnabled } = useReminder();
  const hint = reminderHint(view);
  return (
    // MoreView.swift:57-69
    <Card as="section" aria-labelledby="settings-notifications" aria-busy={busy || undefined} className="flex flex-col gap-2">
      <SectionTitle id="settings-notifications">{SETTINGS_TEXT.notifications}</SectionTitle>
      {view.kind === "toggle" ? (
        <Toggle
          label={<span className="font-semibold">{SETTINGS_TEXT.reminderTitle}</span>}
          description={SETTINGS_TEXT.reminderBody}
          checked={view.on}
          onCheckedChange={(on) => void setEnabled(on)}
          disabled={!ready || busy}
        />
      ) : (
        <div>
          <p className="text-base font-semibold text-text-primary">{SETTINGS_TEXT.reminderTitle}</p>
          <p className="mt-0.5 text-[0.8125rem] text-text-secondary">{SETTINGS_TEXT.reminderBody}</p>
        </div>
      )}
      {hint !== null ? <p className="text-[0.8125rem] text-text-secondary">{hint}</p> : null}
      {/* 진행 상태는 polite로, 실패는 alert로 읽힌다(계정 카드와 같은 방식) */}
      <p aria-live="polite" className="text-[0.8125rem] text-text-secondary empty:hidden">
        {busy ? REMINDER_TEXT.busy : null}
      </p>
      <div role="alert" className="empty:hidden">
        {error !== null ? <p className="text-[0.8125rem] font-semibold text-state-alert-text">{error}</p> : null}
      </div>
    </Card>
  );
}
