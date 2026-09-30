// 이 브라우저에서 매일 리마인더를 켰다는 표시(reminderModel.ReminderSetting) — 켜기에 성공한 계정과 그때 서버에 저장한 끝점.
// 토글의 켜짐은 이 표시가 아니라 실제 상태(구독 + 서버 행)로 본다(useReminder). 이 표시는 브라우저가 구독을 갈아 끼우거나 잃었을 때
// 앱을 열면서 되살릴지 정하는 데만 쓴다(reminderModel.reconcileReminder). 표시가 없으면 워커·서버에 아무것도 묻지 않는다.
// 키는 "onmom.web." 접두 — 계정 삭제·다른 사람의 데이터 정리(store eraseAll)가 함께 지운다. 끄기·로그아웃·계정 전환 실패에서도 지운다.
// 모든 접근은 try/catch — 저장소가 막혀 있으면 표시가 없는 것과 같다(지금까지처럼 설정 화면에서 다시 켜면 된다).

import { STORAGE_PREFIX } from "@/store/persistence";
import { parseReminderSetting } from "./reminderModel";

export const REMINDER_SETTING_KEY = `${STORAGE_PREFIX}reminder.v1`;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** 이 계정으로 켜 둔 표시의 끝점 — 없거나 다른 계정의 표시면 null */
export function readReminderSetting(accountId: string): { endpoint: string } | null {
  try {
    const setting = parseReminderSetting(storage()?.getItem(REMINDER_SETTING_KEY));
    return setting !== null && setting.account === accountId ? { endpoint: setting.endpoint } : null;
  } catch {
    return null;
  }
}

/** 켜기·다시 묶기·맞추기에 성공했을 때 — 같은 값이면 쓰지 않는다(다른 탭에 변경 알림을 보내지 않게) */
export function rememberReminder(accountId: string, endpoint: string): void {
  try {
    const s = storage();
    if (!s) return;
    const current = parseReminderSetting(s.getItem(REMINDER_SETTING_KEY));
    if (current !== null && current.account === accountId && current.endpoint === endpoint) return;
    s.setItem(REMINDER_SETTING_KEY, JSON.stringify({ account: accountId, endpoint }));
  } catch {
    // 저장하지 못하면 표시가 없는 것과 같다
  }
}

/** 끄기·로그아웃·계정 전환 실패·이 브라우저로는 받을 수 없게 됐을 때 */
export function forgetReminder(): void {
  try {
    const s = storage();
    if (s && s.getItem(REMINDER_SETTING_KEY) !== null) s.removeItem(REMINDER_SETTING_KEY);
  } catch {
    // 저장소가 막혀 있으면 표시도 읽히지 않는다
  }
}
