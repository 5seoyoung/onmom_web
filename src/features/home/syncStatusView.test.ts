import { describe, expect, it } from "vitest";
import type { AccountSyncStatus } from "@/auth/session";
import {
  HOME_SYNC_ERROR_DELAY_MS,
  HOME_SYNC_TIMER_SLACK_MS,
  SYNC_STATUS_TEXT,
  homeSyncNoticeVisible,
  homeSyncNoticeWaitMs,
  nextErrorSince,
  syncStatusLine,
} from "./syncStatusView";

describe("설정 계정 카드의 상태 줄(syncStatusLine)", () => {
  it("설정 없는 빌드(off)·첫 읽기 중(loading)은 아무 말도 하지 않는다", () => {
    expect(syncStatusLine("off")).toBeNull();
    expect(syncStatusLine("loading")).toBeNull();
  });

  it("상태마다 문구·톤 — 실패에만 [다시 시도], 새 형식에만 새로 고침", () => {
    expect(syncStatusLine("synced")).toEqual({ text: "서버에 저장됨", tone: "normal", retry: false, refresh: false });
    expect(syncStatusLine("pending")).toEqual({ text: "저장 중", tone: "muted", retry: false, refresh: false });
    expect(syncStatusLine("error")).toEqual({ text: "서버에 저장하지 못했어요", tone: "alert", retry: true, refresh: false });
    expect(syncStatusLine("waitingConsent")).toEqual({ text: "동의 후 저장돼요", tone: "muted", retry: false, refresh: false });
    expect(syncStatusLine("outdated")).toEqual({
      text: "새 버전의 온맘이 필요해요 — 새로 고침",
      tone: "watch",
      retry: false,
      refresh: true,
    });
  });

  it("모든 상태를 다룬다(빠진 상태가 없다)", () => {
    const all: AccountSyncStatus[] = ["off", "loading", "waitingConsent", "pending", "synced", "error", "outdated"];
    for (const s of all) expect(() => syncStatusLine(s)).not.toThrow();
    expect(SYNC_STATUS_TEXT.retry).toBe("다시 시도");
  });
});

describe("홈의 작은 안내 — 마지막 성공 뒤 첫 실패부터 60초가 지났고 아직 실패·재시도 중일 때만", () => {
  const T0 = 1_000_000;

  it("첫 실패 시각을 잇는다 — 계속 실패면 처음 시각, 새 실패면 지금", () => {
    expect(nextErrorSince("error", null, T0)).toBe(T0);
    expect(nextErrorSince("error", T0, T0 + 5_000)).toBe(T0);
  });

  it("재시도 중(pending·loading)에는 있던 시각을 그대로 둔다 — 엔진이 재시도마다 error→loading/pending→error로 바꾸기 때문", () => {
    expect(nextErrorSince("pending", T0, T0 + 5_000)).toBe(T0);
    expect(nextErrorSince("loading", T0, T0 + 5_000)).toBe(T0);
    // 실패한 적이 없으면(첫 읽기·보통의 올리기) null 그대로
    expect(nextErrorSince("pending", null, T0)).toBeNull();
    expect(nextErrorSince("loading", null, T0)).toBeNull();
  });

  it("실패가 끝나면(synced·waitingConsent·outdated·off) null", () => {
    expect(nextErrorSince("synced", T0, T0 + 5_000)).toBeNull();
    expect(nextErrorSince("waitingConsent", T0, T0)).toBeNull();
    expect(nextErrorSince("outdated", T0, T0)).toBeNull();
    expect(nextErrorSince("off", T0, T0)).toBeNull();
    expect(nextErrorSince("synced", null, T0)).toBeNull();
  });

  it("60초(엔진 자동 재시도 3·10·30·60초) 전에는 조용히, 지나면 보인다", () => {
    expect(HOME_SYNC_ERROR_DELAY_MS).toBe(60_000);
    expect(homeSyncNoticeVisible("error", T0, T0 + 59_999)).toBe(false);
    expect(homeSyncNoticeVisible("error", T0, T0 + 60_000)).toBe(true);
    expect(homeSyncNoticeVisible("error", T0, T0 + 3_600_000)).toBe(true);
  });

  it("재시도 중(pending·loading)이라도 첫 실패부터 60초가 지났으면 보인다 — 재시도 순간에 깜빡 사라지지 않게", () => {
    expect(homeSyncNoticeVisible("pending", T0, T0 + 60_000)).toBe(true);
    expect(homeSyncNoticeVisible("loading", T0, T0 + 60_000)).toBe(true);
    expect(homeSyncNoticeVisible("pending", T0, T0 + 59_999)).toBe(false);
  });

  it("실패가 끝났거나 시작 시각을 모르면 보이지 않는다", () => {
    expect(homeSyncNoticeVisible("error", null, T0 + 60_000)).toBe(false);
    expect(homeSyncNoticeVisible("pending", null, T0 + 60_000)).toBe(false);
    expect(homeSyncNoticeVisible("synced", T0, T0 + 60_000)).toBe(false);
    expect(homeSyncNoticeVisible("waitingConsent", T0, T0 + 60_000)).toBe(false);
    expect(homeSyncNoticeVisible("outdated", T0, T0 + 60_000)).toBe(false);
    expect(homeSyncNoticeVisible("off", T0, T0 + 60_000)).toBe(false);
  });

  it("타이머는 errorSince에 매단다 — 남은 시간 + 여유, 이미 지났으면 0", () => {
    expect(homeSyncNoticeWaitMs(T0, T0)).toBe(60_000 + HOME_SYNC_TIMER_SLACK_MS);
    expect(homeSyncNoticeWaitMs(T0, T0 + 20_000)).toBe(40_000 + HOME_SYNC_TIMER_SLACK_MS);
    expect(homeSyncNoticeWaitMs(T0, T0 + 3_600_000)).toBe(0);
  });

  it("엔진의 실제 상태 흐름을 그대로 넣어도(error→loading→error가 60초마다) 60초 뒤 보인다", () => {
    // engine.ts 재시도 간격 3·10·30·60초 — 읽기 실패가 계속되면 재시도마다 loading으로 한 번 갔다가 error로 돌아온다
    const flow: [number, AccountSyncStatus][] = [
      [0, "error"],
      [3_000, "loading"],
      [3_000, "error"],
      [13_000, "loading"],
      [13_000, "error"],
      [43_000, "loading"],
      [43_000, "error"],
      [103_000, "loading"],
      [103_000, "error"],
    ];
    let since: number | null = null;
    for (const [at, status] of flow) {
      since = nextErrorSince(status, since, T0 + at);
      expect(homeSyncNoticeVisible(status, since, T0 + at)).toBe(at >= 60_000);
    }
    expect(since).toBe(T0);
    // 올리기 실패도 같다: error→pending→error
    since = null;
    for (const [at, status] of [[0, "error"], [3_000, "pending"], [3_000, "error"], [60_000, "pending"]] as const) {
      since = nextErrorSince(status, since, T0 + at);
      expect(homeSyncNoticeVisible(status, since, T0 + at)).toBe(at >= 60_000);
    }
    // 성공하면 바로 사라진다
    since = nextErrorSince("synced", since, T0 + 61_000);
    expect(since).toBeNull();
    expect(homeSyncNoticeVisible("synced", since, T0 + 61_000)).toBe(false);
  });

  it("홈 안내 문구는 기록이 사라진 게 아니라는 점을 함께 말한다", () => {
    expect(SYNC_STATUS_TEXT.homeError).toContain("기록은 이 브라우저에 남아 있고");
    expect(SYNC_STATUS_TEXT.homeError.startsWith(SYNC_STATUS_TEXT.error)).toBe(true);
  });
});
