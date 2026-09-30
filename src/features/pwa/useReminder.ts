"use client";

// 설정 > 알림 토글의 상태와 동작 — iOS MoreView.swift:120-133 toggleReminder를 웹 푸시로 옮긴 것.
//   켜기: 알림 권한 요청 → 서비스 워커 등록 → PushManager.subscribe(VAPID 공개 키) → 서버에 구독 저장. 어디서든 실패하면 구독을 풀고 꺼진 채로.
//   끄기: 서버 행 삭제 → 브라우저 구독 해지.
//   절차 자체는 reminderModel.ts(enableReminder·disableReminder — vitest가 가짜 의존성으로 확인), 실제 의존성은 reminderActions.ts.
// 토글의 켜짐은 저장된 플래그가 아니라 실제 상태로 본다 — 이 브라우저에 지금 빌드의 키로 만든 구독이 있고 그 끝점의 서버 행도 있을 때
// (reminderModel.subscribedState). 서버가 보낼 곳이 없는 "켜짐"은 없다.
// 이 훅은 브라우저에서만 마운트되는 화면(설정 — hydrated 뒤)에서 부른다.

import { useCallback, useEffect, useState } from "react";
import { useServerSession } from "@/auth/useServerSession";
import { config, isReminderConfigured } from "@/config";
import { useAppStore } from "@/store/useAppStore";
import { hasPushSubscriptionRow } from "./pushSubscriptions";
import { currentApplicationServerKey, disableReminderNow, enableReminderNow } from "./reminderActions";
import {
  isIosDevice,
  normalizePermission,
  REMINDER_TEXT,
  reminderView,
  sameApplicationServerKey,
  subscribedState,
  type ReminderPermission,
  type ReminderView,
} from "./reminderModel";
import { currentPushSubscription, pushSupported } from "./serviceWorker";

export interface ReminderControl {
  view: ReminderView;
  /** 브라우저 상태(권한·구독·서버 행)를 읽었는가 — 그 전에는 토글을 잠근다 */
  ready: boolean;
  busy: boolean;
  /** 실패 안내(role="alert") — 없으면 null */
  error: string | null;
  setEnabled(on: boolean): Promise<void>;
}

interface BrowserEnv {
  supported: boolean;
  ios: boolean;
  standalone: boolean;
}

function isStandalone(): boolean {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  try {
    return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
  } catch {
    return nav.standalone === true;
  }
}

/** 브라우저 판단 — 마운트 때 한 번(순수 읽기). 서버 렌더링 중이면 모두 false. */
function detectBrowser(): BrowserEnv {
  if (typeof window === "undefined") return { supported: false, ios: false, standalone: false };
  return {
    supported: pushSupported(),
    ios: isIosDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0),
    standalone: isStandalone(),
  };
}

function currentPermission(): ReminderPermission | null {
  if (typeof Notification === "undefined") return null;
  return normalizePermission(Notification.permission);
}

export function useReminder(): ReminderControl {
  const configured = isReminderConfigured();
  const { account } = useAppStore();
  const accountId = account?.id ?? null;
  // 구독은 이 계정의 서버 행으로만 저장된다 — 세션이 없는 게스트(익명 가입 실패)에게는 토글 대신 까닭을(reminderView needsAccount)
  const serverSession = useServerSession();
  const [env] = useState<BrowserEnv>(detectBrowser);
  const [permission, setPermission] = useState<ReminderPermission | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  /** 이 브라우저의 푸시 서비스가 받는 목록 밖이었다(켜기 결과) — "지원하지 않음"으로 보인다 */
  const [serviceUnsupported, setServiceUnsupported] = useState(false);
  const [probed, setProbed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 권한·구독·서버 행은 물어봐야 안다(비동기). 물어볼 것이 없으면(설정·지원 없음) 바로 준비된 것으로 본다.
  const needsProbe = configured && env.supported;

  // 계정이 바뀌면 다시 읽는다(PwaClient가 구독을 새 계정에 다시 묶거나 푼 뒤의 상태)
  useEffect(() => {
    const key = currentApplicationServerKey();
    if (!needsProbe || key === null) return;
    let cancelled = false;
    (async () => {
      const subscription = await currentPushSubscription(config.basePath);
      const withCurrentKey = subscription !== null && sameApplicationServerKey(subscription.options.applicationServerKey, key);
      const rowExists = withCurrentKey ? await hasPushSubscriptionRow(subscription.endpoint) : false;
      if (cancelled) return;
      setPermission(currentPermission());
      setSubscribed(subscribedState(withCurrentKey, rowExists));
      setProbed(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [needsProbe, accountId]);

  const setEnabled = useCallback(
    async (on: boolean) => {
      // 세션이 없으면 켜도 저장할 곳이 없다(토글은 보이지 않지만 확인 중에 눌린 경우 등 — 아무것도 하지 않는다)
      if (busy || (on && serverSession !== "server")) return;
      setBusy(true);
      setError(null);
      try {
        if (on) {
          const result = await enableReminderNow();
          setPermission(result.kind === "permission" ? result.permission : currentPermission());
          setSubscribed(result.kind === "enabled");
          if (result.kind === "unsupportedService") setServiceUnsupported(true);
          if (result.kind === "failed") setError(REMINDER_TEXT.failed);
        } else {
          const result = await disableReminderNow();
          if (result.kind === "failed") {
            // 구독을 풀지 못했다 — 서버 행은 지웠을 수 있으니 실제 상태를 다시 읽기 전까지 꺼짐으로 두고 알린다
            setError(REMINDER_TEXT.failed);
          }
          setSubscribed(false);
        }
      } finally {
        setBusy(false);
      }
    },
    [busy, serverSession],
  );

  return {
    view: reminderView({
      configured,
      serverSession,
      supported: env.supported && !serviceUnsupported,
      ios: env.ios,
      standalone: env.standalone,
      permission,
      subscribed,
    }),
    // 서버 세션을 확인하는 동안에도 잠근다(확인되면 토글, 없으면 안내로 바뀐다)
    ready: (!needsProbe || probed) && serverSession !== "checking",
    busy,
    error,
    setEnabled,
  };
}
