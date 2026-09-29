// 매일 리마인더(웹 푸시) — 화면이 어떤 상태를 보일지 정하는 순수 규칙, 구독 값 변환, 켜기·끄기·계정 전환 절차(의존성을 받아 돈다).
// 브라우저 API는 serviceWorker.ts, 서버 저장은 pushSubscriptions.ts, 둘을 이 절차에 넣는 곳은 reminderActions.ts. 이 파일은 브라우저 전역을 쓰지 않아 vitest가 가짜 의존성으로 전부 돌려 본다.
//
// iOS 앱은 로컬 알림을 매일 20:00에 울렸다(NotificationManager.swift:20-33). 웹은 서버(Supabase pg_cron → Edge Function send-reminders)가
// 같은 시각(KST 20:00)에 웹 푸시를 보내고, 브라우저의 서비스 워커(public/sw.js)가 같은 문구를 보인다.
// 켤 수 있는 조건: Supabase 설정 + VAPID 공개 키(config.isReminderConfigured) + 푸시를 지원하는 브라우저 + 알림 권한.
// 정직한 상태: 설정이 없으면 "준비 중"(지금까지와 같음), 권한이 거부됐으면 허용 방법, iOS Safari 탭이면 홈 화면 설치 안내.
// 토글의 "켜짐" = 이 브라우저에 지금 빌드의 키로 만든 구독이 있고 **그 끝점의 서버 행도 있다**(서버가 보낼 곳이 없는 켜짐은 없다).

export type ReminderPermission = "default" | "granted" | "denied";

export interface ReminderEnv {
  /** Supabase + VAPID 공개 키가 둘 다 있는 빌드(config.isReminderConfigured) */
  configured: boolean;
  /** serviceWorker + PushManager + Notification이 모두 있는 브라우저 */
  supported: boolean;
  /** iPhone·iPad(Safari) — 홈 화면에 추가한 뒤에만 웹 푸시가 된다(iOS 16.4+) */
  ios: boolean;
  /** 홈 화면에서 연 창(standalone) */
  standalone: boolean;
  /** 알림 권한. 아직 읽기 전이면 null */
  permission: ReminderPermission | null;
  /** 이 브라우저에 지금 빌드의 VAPID 키로 만든 푸시 구독이 있고 서버 행도 있는가 */
  subscribed: boolean;
}

export type ReminderView =
  /** 설정 없는 빌드 — 지금까지처럼 "준비 중" */
  | { kind: "comingSoon" }
  /** iOS Safari 탭 — 홈 화면에 추가해야 알림을 켤 수 있다 */
  | { kind: "installHint" }
  /** 푸시를 지원하지 않는 브라우저 */
  | { kind: "unsupported" }
  /** 알림 권한이 차단됨 — 브라우저 설정에서 허용해야 한다 */
  | { kind: "denied" }
  /** 토글 — on = 구독 중 */
  | { kind: "toggle"; on: boolean };

export function reminderView(env: ReminderEnv): ReminderView {
  if (!env.configured) return { kind: "comingSoon" };
  if (!env.supported) return env.ios && !env.standalone ? { kind: "installHint" } : { kind: "unsupported" };
  if (env.permission === "denied") return { kind: "denied" };
  return { kind: "toggle", on: env.subscribed };
}

export const REMINDER_TEXT = {
  // 웹 신규 문구 — CPO 확인 필요 (브라우저에서 이 사이트의 알림 권한을 거부한 상태 — iOS에는 해당 화면이 없었다)
  denied: "브라우저에서 이 사이트의 알림이 차단되어 있어요. 브라우저 설정에서 알림을 허용한 뒤 다시 켜 주세요.",
  // 웹 신규 문구 — CPO 확인 필요 (iOS 16.4+ Safari는 홈 화면에 추가한 웹 앱에서만 푸시를 받는다)
  installHint: "iPhone·iPad에서는 Safari의 공유 버튼 → ‘홈 화면에 추가’로 설치한 뒤, 홈 화면의 온맘에서 알림을 켤 수 있어요.",
  // 웹 신규 문구 — CPO 확인 필요 (푸시를 지원하지 않는 브라우저)
  unsupported: "이 브라우저는 알림을 지원하지 않아요.",
  // 웹 신규 문구 — CPO 확인 필요 (구독·해지 실패 — 아무것도 바뀌지 않았다)
  failed: "알림 설정을 바꾸지 못했어요. 인터넷 연결을 확인하고 잠시 후 다시 시도해 주세요.",
  // 웹 신규 문구 — CPO 확인 필요 (진행 중 — 낭독용, aria-live)
  busy: "알림 설정을 바꾸고 있어요",
} as const;

/** iPhone·iPad(iPadOS는 데스크톱 UA를 쓰므로 Macintosh + 터치로 본다) */
export function isIosDevice(userAgent: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (userAgent.includes("Macintosh") && maxTouchPoints > 1);
}

/** 브라우저에 푸시 API가 모두 있는가 — iOS Safari 탭에는 PushManager가 없다(홈 화면 앱에만 있다). */
export function pushApiAvailable(w: { PushManager?: unknown; Notification?: unknown; navigator?: { serviceWorker?: unknown } }): boolean {
  return typeof w.PushManager !== "undefined" && typeof w.Notification !== "undefined" && typeof w.navigator?.serviceWorker !== "undefined";
}

/** Notification.permission / requestPermission 결과 → 세 값 중 하나(모르는 값은 default) */
export function normalizePermission(value: string | null | undefined): ReminderPermission {
  return value === "granted" || value === "denied" ? value : "default";
}

/** 표준 base64url → 바이트(VAPID 공개 키 → applicationServerKey). 패딩이 없어도 된다. */
export function urlBase64ToUint8Array(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/** 브라우저 구독의 applicationServerKey가 지금 빌드의 키와 같은가 — 키를 바꿨으면 예전 구독은 풀고 새로 만든다. */
export function sameApplicationServerKey(existing: ArrayBuffer | null | undefined, key: Uint8Array): boolean {
  if (!existing) return false;
  const a = new Uint8Array(existing);
  if (a.length !== key.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== key[i]) return false;
  return true;
}

/**
 * 토글의 켜짐 — 브라우저 구독(지금 키)이 있고, 서버 행 확인이 "없다"가 아닐 때. 확인을 못 했으면(null — 오프라인·클라이언트 없음)
 * 브라우저 상태를 그대로 믿는다: 오프라인에서 "꺼짐"으로 보이면 사용자가 다시 켜려다 멀쩡한 구독을 풀게 된다.
 */
export function subscribedState(browserSubscribedWithCurrentKey: boolean, rowExists: boolean | null): boolean {
  return browserSubscribedWithCurrentKey && rowExists !== false;
}

/** public.push_subscriptions 한 행 — user_id는 서버가 auth.uid()로 채운다(supabase/migrations/0004_push_reminders.sql). */
export interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
  tz: string;
}

export const PUSH_SUBSCRIPTIONS_TABLE = "push_subscriptions";

/**
 * 받는 푸시 서비스(브라우저 회사가 운영하는 곳)만 — 발송 함수가 아무 주소로나 서명한 요청을 보내지 않게(남용·SSRF 방지).
 * Chrome·Samsung 인터넷·Opera 등 Chromium 계열 = FCM, Firefox = Mozilla autopush, Edge = WNS, Safari(macOS·iOS 16.4+) = Apple.
 * 목록 밖 푸시 서비스를 쓰는 브라우저는 구독을 저장하지 않고 "이 브라우저는 알림을 지원하지 않아요."로 보인다(켜진 척하지 않는다).
 * supabase/functions/_shared/reminders.ts의 같은 이름 상수·0004_push_reminders.sql의 check 제약과 같은 규칙이다(pwa.test.ts가 글자로 비교).
 * 목록을 바꾸면 세 곳을 함께 바꾸고 0004 제약을 새 마이그레이션으로 바꾼다.
 */
export const PUSH_SERVICE_HOSTS = ["fcm.googleapis.com", "push.services.mozilla.com", "notify.windows.com", "push.apple.com"] as const;
export const PUSH_ENDPOINT_PATTERN = /^https:\/\/(?:[a-z0-9-]+\.)*(?:fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com)\/\S+$/i;
export const PUSH_ENDPOINT_MAX_LENGTH = 2048;

/** 알려진 푸시 서비스의 끝점인가(PUSH_SERVICE_HOSTS — 그 호스트이거나 그 아래 이름, https, 포트·사용자 정보 없음) */
export function isKnownPushService(endpoint: string | null | undefined): boolean {
  const s = endpoint ?? "";
  return s.length <= PUSH_ENDPOINT_MAX_LENGTH && PUSH_ENDPOINT_PATTERN.test(s);
}

/** IANA 시간대 이름 모양("Asia/Seoul") — 서버 검사(check 제약)와 같은 규칙. 틀리면 기본값. */
export const DEFAULT_TIME_ZONE = "Asia/Seoul";
export function normalizeTimeZone(tz: string | null | undefined): string {
  const s = (tz ?? "").trim();
  return s.length > 0 && s.length <= 64 && /^[A-Za-z0-9_+\-/]+$/.test(s) ? s : DEFAULT_TIME_ZONE;
}

/** PushSubscription.toJSON() → 저장할 행. 끝점·키가 빠졌거나 모양이 틀리면 null(저장하지 않는다). */
export function subscriptionRow(
  json: { endpoint?: string | null; keys?: Record<string, string> | null } | null | undefined,
  tz: string | null | undefined,
): PushSubscriptionRow | null {
  const endpoint = json?.endpoint ?? "";
  const p256dh = json?.keys?.p256dh ?? "";
  const auth = json?.keys?.auth ?? "";
  if (!isKnownPushService(endpoint)) return null;
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{20,30}$/.test(auth)) return null;
  return { endpoint, p256dh, auth, tz: normalizeTimeZone(tz) };
}

/** 운영 빌드에서만 서비스 워커를 자동 등록한다(개발 서버의 캐시 꼬임 방지). 토글로 켤 때는 어느 빌드에서나 명시적으로 등록한다. */
export function shouldAutoRegisterServiceWorker(nodeEnv: string | undefined, supported: boolean): boolean {
  return nodeEnv === "production" && supported;
}

/**
 * 스토어의 계정이 바뀌었을 때 푸시 구독에 무엇을 할지.
 * - signedOut: 로그인 상태였다가 계정이 없어졌다(로그아웃·계정 삭제) → 이 브라우저의 구독을 푼다(AppStore.swift:116 eraseAll과 같은 뜻).
 * - switched:  다른 계정으로 바로 바뀌었다(null을 거치지 않음 — 게스트→이미 있던 카카오 계정 전환은 익명 사용자를 먼저 지우므로 그 사용자의
 *              서버 행이 cascade로 사라진다(src/auth/session.ts). 브라우저 구독은 남아 있다) → 끝점을 새 계정의 행으로 다시 묶는다(rebindReminder).
 *              게스트에 카카오를 연결한 경우(같은 Supabase 사용자)도 같은 길을 지나며 upsert가 제자리 갱신이 된다.
 * - none:      첫 관찰(이전 값 없음)·로그인·같은 계정.
 */
export type AccountTransition = "none" | "signedOut" | "switched";
export function accountTransition(previousAccountId: string | null | undefined, accountId: string | null): AccountTransition {
  if (typeof previousAccountId !== "string") return "none";
  if (accountId === null) return "signedOut";
  return accountId === previousAccountId ? "none" : "switched";
}

// MARK: 켜기 · 끄기 · 계정 전환 절차 — 브라우저·서버 의존성을 받아 돈다(reminderActions.ts가 serviceWorker.ts·pushSubscriptions.ts의 실제 것을 넣는다)

/** 브라우저 PushSubscription 중 이 절차가 쓰는 것 — 실제 PushSubscription이 그대로 맞는다 */
export interface PushSubscriptionLike {
  readonly endpoint: string;
  readonly options: { readonly applicationServerKey: ArrayBuffer | null };
  toJSON(): { endpoint?: string | null; keys?: Record<string, string> | null };
  unsubscribe(): Promise<boolean>;
}

/** 활성 서비스 워커의 PushManager 중 이 절차가 쓰는 것 */
export interface PushManagerLike {
  getSubscription(): Promise<PushSubscriptionLike | null>;
  subscribe(options: { userVisibleOnly: boolean; applicationServerKey: Uint8Array<ArrayBuffer> }): Promise<PushSubscriptionLike>;
}

export type SaveRowResult = { ok: true } | { ok: false; reason: string };

export interface EnableReminderDeps {
  /** 지금 빌드의 VAPID 공개 키(urlBase64ToUint8Array) */
  applicationServerKey: Uint8Array<ArrayBuffer>;
  /** Notification.requestPermission */
  requestPermission(): Promise<string>;
  /** 서비스 워커 등록 → 활성 워커의 pushManager. 등록하지 못하면 null */
  pushManager(): Promise<PushManagerLike | null>;
  /** 브라우저의 IANA 시간대(모르면 null → Asia/Seoul) */
  timeZone(): string | null;
  /** 서버 행 upsert(pushSubscriptions.ts savePushSubscription) */
  save(row: PushSubscriptionRow): Promise<SaveRowResult>;
  /**
   * 끝점의 서버 행이 (이 사용자에게) 있는가 — 모르면 null(pushSubscriptions.ts hasPushSubscriptionRow).
   * 브라우저에 남은 구독의 행이 없으면(다른 사용자의 행이거나 발송 함수가 410으로 지웠다) 그 구독은 쓰지 않고 새로 만든다.
   */
  rowExists?(endpoint: string): Promise<boolean | null>;
}

export type EnableReminderResult =
  /** 구독을 만들고 서버에 저장했다 */
  | { kind: "enabled" }
  /** 권한이 허용되지 않았다(default = 닫음, denied = 차단) — 아무것도 만들지 않았다 */
  | { kind: "permission"; permission: ReminderPermission }
  /** 이 브라우저의 푸시 서비스가 받는 목록(PUSH_SERVICE_HOSTS) 밖이다 — 구독은 풀었다. 화면은 "지원하지 않음" */
  | { kind: "unsupportedService" }
  /** register = 워커 등록 실패, subscribe = 구독 생성 예외, row = 구독 값이 온전하지 않음, 그 밖 = 서버 저장 실패 사유. 구독은 남기지 않았다 */
  | { kind: "failed"; reason: string };

async function unsubscribeQuietly(subscription: PushSubscriptionLike): Promise<void> {
  try {
    await subscription.unsubscribe();
  } catch {
    // 풀지 못해도 서버 행이 없으므로 설정 화면은 꺼짐으로 보인다(subscribedState)
  }
}

/**
 * 켜기(MoreView.swift:120-133 toggleReminder의 웹판): 권한 → 워커 → (키가 바뀌었거나 서버 행이 없는 예전 구독은 해지) → 구독 → 서버 저장.
 * 서버에 없는 구독은 알림을 받지 못한다 — 저장에 실패하면 구독을 도로 풀어 켜진 척하지 않는다.
 */
export async function enableReminder(deps: EnableReminderDeps): Promise<EnableReminderResult> {
  const permission = normalizePermission(await deps.requestPermission());
  if (permission !== "granted") return { kind: "permission", permission };

  const manager = await deps.pushManager();
  if (!manager) return { kind: "failed", reason: "register" };

  let subscription: PushSubscriptionLike;
  try {
    let existing = await manager.getSubscription();
    // VAPID 키를 바꿨으면 예전 키로 만든 구독은 서버가 서명하지 못한다 — 풀고 새로 만든다.
    // 서버 행이 없는 구독(다른 사용자의 행·만료되어 지워진 끝점)도 다시 쓰지 않는다 — 새 끝점으로.
    if (
      existing &&
      (!sameApplicationServerKey(existing.options.applicationServerKey, deps.applicationServerKey) ||
        (deps.rowExists !== undefined && (await deps.rowExists(existing.endpoint)) === false))
    ) {
      await existing.unsubscribe();
      existing = null;
    }
    subscription = existing ?? (await manager.subscribe({ userVisibleOnly: true, applicationServerKey: deps.applicationServerKey }));
  } catch {
    return { kind: "failed", reason: "subscribe" };
  }

  const json = subscription.toJSON();
  if (!isKnownPushService(json.endpoint ?? subscription.endpoint)) {
    await unsubscribeQuietly(subscription);
    return { kind: "unsupportedService" };
  }
  const row = subscriptionRow(json, deps.timeZone());
  const saved: SaveRowResult = row === null ? { ok: false, reason: "row" } : await deps.save(row);
  if (!saved.ok) {
    await unsubscribeQuietly(subscription);
    return { kind: "failed", reason: saved.reason };
  }
  return { kind: "enabled" };
}

export interface DisableReminderDeps {
  /** 이 브라우저의 구독(serviceWorker.ts currentPushSubscription) */
  currentSubscription(): Promise<PushSubscriptionLike | null>;
  /** 서버 행 삭제 — 실패해도 던지지 않고 false(pushSubscriptions.ts deletePushSubscription) */
  deleteRow(endpoint: string): Promise<boolean>;
}

export type DisableReminderResult =
  /** 행을 지우고(rowDeleted) 구독을 풀었다 */
  | { kind: "disabled"; rowDeleted: boolean }
  /** 풀 구독이 없었다 */
  | { kind: "nothing" }
  /** 구독을 풀지 못했다(행은 지웠을 수 있다 — 그래도 설정 화면은 서버 행이 없으면 꺼짐으로 보인다) */
  | { kind: "failed" };

/** 끄기: 세션이 살아 있는 지금 서버 행을 먼저 지우고, 브라우저 구독을 푼다. 로그아웃 직전에도 같은 절차를 쓸 수 있다(reminderActions.disableReminderNow). */
export async function disableReminder(deps: DisableReminderDeps): Promise<DisableReminderResult> {
  const subscription = await deps.currentSubscription();
  if (!subscription) return { kind: "nothing" };
  const rowDeleted = await deps.deleteRow(subscription.endpoint);
  try {
    await subscription.unsubscribe();
  } catch {
    return { kind: "failed" };
  }
  return { kind: "disabled", rowDeleted };
}

export interface RebindReminderDeps {
  /** 지금 빌드의 VAPID 공개 키 — 없으면(설정 없는 빌드) 남은 구독은 쓸모가 없어 푼다 */
  applicationServerKey: Uint8Array<ArrayBuffer> | null;
  currentSubscription(): Promise<PushSubscriptionLike | null>;
  timeZone(): string | null;
  save(row: PushSubscriptionRow): Promise<SaveRowResult>;
}

export type RebindReminderResult =
  /** 구독이 없었다 */
  | "nothing"
  /** 끝점을 새 계정의 행으로 저장했다(같은 사용자면 제자리 갱신) */
  | "rebound"
  /** 저장하지 못해(행이 아직 다른 사용자의 것 — RLS 42501, 세션 없음, 키 불일치) 구독을 풀었다 → 토글은 꺼짐 */
  | "dropped";

/**
 * 계정이 바뀐 뒤(accountTransition "switched") 이 브라우저의 구독을 새 계정에 다시 묶는다. 저장에 실패하면 구독을 푼다 —
 * 서버가 보낼 곳이 없는 구독을 "켜짐"으로 보이지 않게(사용자는 설정에서 다시 켤 수 있다).
 */
export async function rebindReminder(deps: RebindReminderDeps): Promise<RebindReminderResult> {
  const subscription = await deps.currentSubscription();
  if (!subscription) return "nothing";
  const key = deps.applicationServerKey;
  const row = key !== null && sameApplicationServerKey(subscription.options.applicationServerKey, key) ? subscriptionRow(subscription.toJSON(), deps.timeZone()) : null;
  if (row !== null && (await deps.save(row)).ok) return "rebound";
  await unsubscribeQuietly(subscription);
  return "dropped";
}
