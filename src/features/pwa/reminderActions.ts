// 매일 리마인더 — reminderModel.ts의 켜기·끄기·다시 묶기 절차에 실제 브라우저(serviceWorker.ts)·서버(pushSubscriptions.ts) 의존성을 넣어 부른다.
// 쓰는 곳: 설정 화면 토글(useReminder), 계정이 바뀔 때(PwaClient). 로그아웃 흐름도 세션이 살아 있을 때 disableReminderNow()를 부르면
// 서버 행까지 바로 지운다(docs/PWA_AND_REMINDERS.md §8). 모두 브라우저에서만 부른다. 던지지 않는다(실패는 결과 값으로).

import { config } from "@/config";
import { deletePushSubscription, hasPushSubscriptionRow, savePushSubscription } from "./pushSubscriptions";
import {
  disableReminder,
  enableReminder,
  rebindReminder,
  urlBase64ToUint8Array,
  type DisableReminderResult,
  type EnableReminderResult,
  type RebindReminderResult,
} from "./reminderModel";
import { currentPushSubscription, registerServiceWorker, unsubscribeLocalPush, waitForActiveWorker } from "./serviceWorker";

/** 브라우저의 IANA 시간대(모르면 null → 서버 기본 Asia/Seoul) */
export function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

/** 지금 빌드의 VAPID 공개 키(applicationServerKey). 설정 없는 빌드면 null. */
export function currentApplicationServerKey(): Uint8Array<ArrayBuffer> | null {
  return config.vapidPublicKey === null ? null : urlBase64ToUint8Array(config.vapidPublicKey);
}

async function requestPermission(): Promise<string> {
  try {
    return await Notification.requestPermission();
  } catch {
    return "default";
  }
}

/** 켜기 — 권한 요청 → 워커 등록·활성 대기 → 구독 → 서버 저장(reminderModel.enableReminder) */
export async function enableReminderNow(): Promise<EnableReminderResult> {
  const key = currentApplicationServerKey();
  if (key === null) return { kind: "failed", reason: "config" };
  try {
    return await enableReminder({
      applicationServerKey: key,
      requestPermission,
      pushManager: async () => {
        const registered = await registerServiceWorker(config.basePath);
        return registered ? (await waitForActiveWorker(registered)).pushManager : null;
      },
      timeZone: browserTimeZone,
      save: savePushSubscription,
      rowExists: hasPushSubscriptionRow,
    });
  } catch {
    return { kind: "failed", reason: "unexpected" };
  }
}

/** 끄기 — 서버 행 삭제(세션이 있을 때) → 이 브라우저의 구독 해지(reminderModel.disableReminder) */
export async function disableReminderNow(): Promise<DisableReminderResult> {
  try {
    return await disableReminder({ currentSubscription: () => currentPushSubscription(config.basePath), deleteRow: deletePushSubscription });
  } catch {
    return { kind: "failed" };
  }
}

/** 계정이 바뀐 뒤 — 이 브라우저의 구독을 새 계정의 행으로 저장, 못 하면 해지(reminderModel.rebindReminder) */
export async function rebindReminderNow(): Promise<RebindReminderResult> {
  try {
    return await rebindReminder({
      applicationServerKey: currentApplicationServerKey(),
      currentSubscription: () => currentPushSubscription(config.basePath),
      timeZone: browserTimeZone,
      save: savePushSubscription,
    });
  } catch {
    // 절차 밖의 예외 — 서버 행을 확인하지 못한 구독을 "켜짐"으로 남기지 않는다
    await unsubscribeLocalPush(config.basePath);
    return "dropped";
  }
}
