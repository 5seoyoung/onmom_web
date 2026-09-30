// 서버 동기화 상태(src/auth useSyncStatus) → 화면 문구. 순수 함수.
//
// 지금까지 동기화 실패(Supabase 일시 중지·네트워크)는 보이지 않았다 — 엔진이 조용히 다시 시도하고, 로그아웃할 때만
// "아직 서버에 저장되지 않은 기록이 있어요"로 알렸다(docs/DEV_NOTES.md §7-3). 이 표는 설정 계정 카드의 상태 줄과
// 홈의 작은 안내(오래 실패했을 때만)가 같은 말을 하도록 한 곳에 둔다. 설정 없는 빌드("off")와 첫 읽기 중("loading")은 아무 말도 하지 않는다.
// iOS에는 서버 저장이 없어 원문이 없다 — 아래 문구는 모두 웹 신규.

import type { AccountSyncStatus } from "@/auth/session";

/** 웹 신규 문구 — CPO 확인 필요 (서버 저장 상태 표시) */
export const SYNC_STATUS_TEXT = {
  synced: "서버에 저장됨", // 웹 신규 문구 — CPO 확인 필요
  pending: "저장 중", // 웹 신규 문구 — CPO 확인 필요
  error: "서버에 저장하지 못했어요", // 웹 신규 문구 — CPO 확인 필요
  retry: "다시 시도", // 원문: ExerciseView.swift:184
  waitingConsent: "동의 후 저장돼요", // 웹 신규 문구 — CPO 확인 필요
  outdated: "새 버전의 온맘이 필요해요 — 새로 고침", // 웹 신규 문구 — CPO 확인 필요
  /** 홈의 작은 안내(오래 실패했을 때) — 기록이 사라진 것은 아니라는 점을 함께 말한다 */
  homeError: "서버에 저장하지 못했어요. 기록은 이 브라우저에 남아 있고, 연결되면 다시 저장을 시도해요.", // 웹 신규 문구 — CPO 확인 필요
} as const;

export interface SyncStatusLine {
  text: string;
  tone: "normal" | "watch" | "alert" | "muted";
  /** [다시 시도] 버튼을 붙일지(실패했을 때만) */
  retry: boolean;
  /** 새로 고침을 권할지(서버 형식이 더 새로울 때) */
  refresh: boolean;
}

/** 설정 계정 카드의 상태 줄(settings/SettingsScreen.tsx SyncLine) — 보일 것이 없으면 null(설정 없는 빌드·첫 읽기 중). */
export function syncStatusLine(status: AccountSyncStatus): SyncStatusLine | null {
  switch (status) {
    case "synced":
      return { text: SYNC_STATUS_TEXT.synced, tone: "normal", retry: false, refresh: false };
    case "pending":
      return { text: SYNC_STATUS_TEXT.pending, tone: "muted", retry: false, refresh: false };
    case "error":
      return { text: SYNC_STATUS_TEXT.error, tone: "alert", retry: true, refresh: false };
    case "waitingConsent":
      return { text: SYNC_STATUS_TEXT.waitingConsent, tone: "muted", retry: false, refresh: false };
    case "outdated":
      return { text: SYNC_STATUS_TEXT.outdated, tone: "watch", retry: false, refresh: true };
    case "off":
    case "loading":
      return null;
  }
}

/** 홈에서 실패를 알리기까지 기다리는 시간 — 엔진이 스스로 다시 시도하는 동안(3·10·30·60초, engine.ts SYNC_RETRY_DELAYS_MS)에는 조용히 둔다. */
export const HOME_SYNC_ERROR_DELAY_MS = 60_000;

/** 타이머 여유 — setTimeout이 딱 60초에 깨어나도 `now - errorSince >= 60초`가 되도록 조금 늦게 깨운다 */
export const HOME_SYNC_TIMER_SLACK_MS = 50;

/**
 * "실패 중"으로 세는 상태 — error뿐 아니라 다시 시도가 진행 중인 pending(다시 올리기)·loading(다시 읽기)도.
 * 엔진은 재시도할 때마다 error → loading/pending → error로 상태를 바꾸므로(engine.ts run(): `if (!fetched) setStatus("loading")`,
 * 올리기 전 `setStatus("pending")`), error만 세면 "이어진 실패"가 최대 60초(마지막 재시도 간격)에서 끊겨 안내가 영영 뜨지 않는다.
 */
function stillFailing(status: AccountSyncStatus): boolean {
  return status === "error" || status === "pending" || status === "loading";
}

/**
 * 홈의 작은 안내를 보일지 — 마지막 성공 뒤 첫 실패(errorSince)부터 60초가 지났고, 아직 실패·재시도 중일 때만.
 * errorSince가 null이면 실패 중이 아니다(성공했거나, 아직 실패한 적이 없다).
 */
export function homeSyncNoticeVisible(status: AccountSyncStatus, errorSince: number | null, now: number): boolean {
  return errorSince !== null && stillFailing(status) && now - errorSince >= HOME_SYNC_ERROR_DELAY_MS;
}

/**
 * "마지막 성공 뒤 첫 실패" 시각을 잇는다.
 * - error: 이미 실패 중이면 처음 시각 그대로, 새로 실패하면 지금
 * - pending·loading: 재시도가 진행 중(또는 아직 실패한 적 없음) — 있던 값을 그대로 둔다(null이면 null)
 * - synced·waitingConsent·outdated·off: 실패가 끝났다 → null
 */
export function nextErrorSince(status: AccountSyncStatus, prev: number | null, now: number): number | null {
  if (status === "error") return prev ?? now;
  if (status === "pending" || status === "loading") return prev;
  return null;
}

/** errorSince가 정해진 뒤 화면을 다시 그릴 때까지 기다릴 시간(ms, 0 이상) — 타이머는 상태가 아니라 errorSince에 매단다. */
export function homeSyncNoticeWaitMs(errorSince: number, now: number): number {
  return Math.max(0, errorSince + HOME_SYNC_ERROR_DELAY_MS + HOME_SYNC_TIMER_SLACK_MS - now);
}
