// 매일 리마인더 — reminderModel.ts의 켜기·끄기·다시 묶기·맞추기 절차에 실제 브라우저(serviceWorker.ts)·서버(pushSubscriptions.ts) 의존성을 넣어 부른다.
// 쓰는 곳: 설정 화면 토글(useReminder), 계정이 바뀔 때·앱을 열 때(PwaClient). 로그아웃 흐름도 세션이 살아 있을 때 disableReminderNow()를 부르면
// 서버 행까지 바로 지운다(docs/PWA_AND_REMINDERS.md §8). 모두 브라우저에서만 부른다. 던지지 않는다(실패는 결과 값으로).
// 켜기·다시 묶기·맞추기에 성공하면 이 브라우저에 켜 둔 표시를 남기고(reminderSetting.ts), 끄기·로그아웃·다시 묶기 실패에서 지운다.

import { config } from "@/config";
import { deletePushSubscription, hasPushSubscriptionRow, listPushSubscriptionRows, savePushSubscription } from "./pushSubscriptions";
import {
  disableReminder,
  enableReminder,
  normalizePermission,
  rebindReminder,
  reconcileReminder,
  urlBase64ToUint8Array,
  type DisableReminderResult,
  type EnableReminderResult,
  type PushSubscriptionRow,
  type RebindReminderResult,
  type ReminderPermission,
  type SaveRowResult,
} from "./reminderModel";
import { forgetReminder, readReminderSetting, rememberReminder } from "./reminderSetting";
import { currentPushSubscription, getServiceWorkerRegistration, registerServiceWorker, unsubscribeLocalPush, waitForActiveWorker } from "./serviceWorker";

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

/** 지금 알림 권한 — 묻지 않고 읽기만 */
function currentPermission(): ReminderPermission | null {
  return typeof Notification === "undefined" ? null : normalizePermission(Notification.permission);
}

/** 서버 저장(savePushSubscription) — 저장에 성공한 끝점을 기억해 둔다(켜 둔 표시에 적을 값) */
function trackedSave() {
  let endpoint: string | null = null;
  return {
    save: async (row: PushSubscriptionRow): Promise<SaveRowResult> => {
      const result = await savePushSubscription(row);
      if (result.ok) endpoint = row.endpoint;
      return result;
    },
    saved: () => endpoint,
  };
}

/** 켜기 — 권한 요청 → 워커 등록·활성 대기 → 구독 → 서버 저장(reminderModel.enableReminder). 성공하면 이 계정으로 켜 둔 표시를 남긴다. */
export async function enableReminderNow(accountId: string | null): Promise<EnableReminderResult> {
  const key = currentApplicationServerKey();
  if (key === null) return { kind: "failed", reason: "config" };
  const tracked = trackedSave();
  try {
    const result = await enableReminder({
      applicationServerKey: key,
      requestPermission,
      pushManager: async () => {
        const registered = await registerServiceWorker(config.basePath);
        return registered ? (await waitForActiveWorker(registered)).pushManager : null;
      },
      timeZone: browserTimeZone,
      save: tracked.save,
      rowExists: hasPushSubscriptionRow,
    });
    const endpoint = tracked.saved();
    if (result.kind === "enabled" && endpoint !== null && accountId !== null) rememberReminder(accountId, endpoint);
    // 허용하지 않았거나 받을 수 없는 브라우저 — 앱을 열 때 되살리지 않는다(저장 실패는 표시를 그대로 둔다 — 켜려던 뜻은 남아 있다)
    if (result.kind === "permission" || result.kind === "unsupportedService") forgetReminder();
    return result;
  } catch {
    return { kind: "failed", reason: "unexpected" };
  }
}

/** 끄기 — 켜 둔 표시를 먼저 지우고, 서버 행 삭제(세션이 있을 때) → 이 브라우저의 구독 해지(reminderModel.disableReminder) */
export async function disableReminderNow(): Promise<DisableReminderResult> {
  // 구독을 풀지 못해도 앱을 열 때 되살리지 않게 — 끄려는 뜻을 먼저 남긴다
  forgetReminder();
  try {
    return await disableReminder({ currentSubscription: () => currentPushSubscription(config.basePath), deleteRow: deletePushSubscription });
  } catch {
    return { kind: "failed" };
  }
}

/** 계정이 바뀐 뒤 — 이 브라우저의 구독을 새 계정의 행으로 저장, 못 하면 해지(reminderModel.rebindReminder). 켜 둔 표시도 새 계정으로 옮기거나 지운다. */
export async function rebindReminderNow(accountId: string): Promise<RebindReminderResult> {
  const tracked = trackedSave();
  try {
    const result = await rebindReminder({
      applicationServerKey: currentApplicationServerKey(),
      currentSubscription: () => currentPushSubscription(config.basePath),
      timeZone: browserTimeZone,
      save: tracked.save,
    });
    const endpoint = tracked.saved();
    if (result === "rebound" && endpoint !== null) rememberReminder(accountId, endpoint);
    else forgetReminder();
    return result;
  } catch {
    // 절차 밖의 예외 — 서버 행을 확인하지 못한 구독을 "켜짐"으로 남기지 않는다
    forgetReminder();
    await unsubscribeLocalPush(config.basePath);
    return "dropped";
  }
}

/** 로그아웃·계정 삭제 뒤 — 켜 둔 표시를 지우고 이 브라우저의 구독을 푼다(세션이 없어 서버 행은 못 지운다 — 다음 발송 때 404/410으로 지워진다) */
export async function releaseReminderNow(): Promise<boolean> {
  forgetReminder();
  return unsubscribeLocalPush(config.basePath);
}

/** 앱을 연 뒤 처음 시작한 맞추기 — 한 번만 돈다(PwaClient·설정 화면이 같은 것을 기다린다) */
let reconciling: Promise<void> | null = null;

/**
 * 앱을 열 때 한 번 — 이 브라우저에서 켜 둔 알림의 구독을 브라우저가 갈아 끼웠거나 잃었으면 서버 행을 맞춘다(reminderModel.reconcileReminder).
 * 켜 둔 표시가 없거나 권한이 허용이 아니면 워커·서버에 묻지 않는다(요청 없음). 권한은 묻지 않는다. 던지지 않는다.
 * 부르는 쪽이 Supabase + VAPID 설정(config.isReminderConfigured)과 푸시 지원(serviceWorker.pushSupported)을 확인한 뒤에 부른다.
 */
export function reconcileReminderOnce(accountId: string): Promise<void> {
  reconciling ??= (async () => {
    const key = currentApplicationServerKey();
    if (key === null) return;
    try {
      await reconcileReminder({
        applicationServerKey: key,
        setting: () => readReminderSetting(accountId),
        permission: currentPermission,
        // 이미 있는 워커만 — 앱을 열 때 새로 등록하거나 활성화를 기다리지 않는다(켤 때 등록한 워커가 있다)
        pushManager: async () => {
          const registration = await getServiceWorkerRegistration(config.basePath);
          return registration?.active ? registration.pushManager : null;
        },
        listRows: () => listPushSubscriptionRows(accountId),
        timeZone: browserTimeZone,
        save: savePushSubscription,
        deleteRow: deletePushSubscription,
        remember: (endpoint) => rememberReminder(accountId, endpoint),
        forget: forgetReminder,
      });
    } catch {
      // 다음에 앱을 열 때 다시 — 설정 화면은 실제 상태를 보인다
    }
  })();
  return reconciling;
}

/** 설정 화면이 상태를 읽기 전에 맞추기가 끝나기를 기다린다 — 오래 걸리면(느린 연결) 기다리지 않는다(토글을 오래 잠그지 않게) */
export async function settleReminderReconcile(accountId: string, timeoutMs = 4000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([reconcileReminderOnce(accountId), new Promise<void>((resolve) => (timer = setTimeout(resolve, timeoutMs)))]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
