// 홈의 서버 저장 안내(SyncStatusNotice) — 진짜 동기화 엔진(store/sync/engine.ts)의 상태 흐름을 그대로 받아 60초 뒤 보이는지.
//
// 엔진은 재시도할 때마다 error → loading(다시 읽기) 또는 error → pending(다시 올리기) → error로 상태를 바꾼다.
// 재시도 간격은 3·10·30·60초라 "error가 이어진 시간"은 최대 60초에서 끊긴다 — 그래서 첫 실패 시각을 재시도 중에도 잇는다.
// 화면(React)은 그리지 않고, SyncStatusNotice.tsx의 두 effect를 그대로 옮긴 작은 하네스로 확인한다.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountSyncStatus } from "@/auth/session";
import { createAppStore } from "@/store/appStore";
import { createMemoryStorage, createStoragePersistence } from "@/store/persistence";
import { createSyncEngine, SYNC_RETRY_DELAYS_MS, type SyncEngine } from "@/store/sync/engine";
import { createStorageSyncMarks } from "@/store/sync/marks";
import { FakeRemote } from "@/store/sync/testUtils";
import { HOME_SYNC_ERROR_DELAY_MS, homeSyncNoticeVisible, homeSyncNoticeWaitMs, nextErrorSince } from "./syncStatusView";

const ACCOUNT = { id: "kakao-1001", name: null, provider: "kakao" } as const;
const NOW = new Date("2026-09-27T12:00:00+09:00");

/** SyncStatusNotice.tsx의 두 effect를 그대로 옮긴 것 — 상태가 바뀌면 errorSince를 잇고, errorSince가 바뀌면 타이머를 다시 건다 */
function noticeHarness(engine: SyncEngine) {
  let status: AccountSyncStatus = toAccountStatus(engine.status());
  let errorSince: number | null = null;
  let now = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const seen: string[] = [];

  function armTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (errorSince === null) return;
    timer = setTimeout(() => {
      now = Date.now();
    }, homeSyncNoticeWaitMs(errorSince, Date.now()));
  }
  function apply(next: AccountSyncStatus) {
    status = next;
    seen.push(`${next}@${Date.now() - NOW.getTime()}`);
    const prev = errorSince;
    errorSince = nextErrorSince(next, errorSince, Date.now());
    if (errorSince !== prev) armTimer();
  }
  apply(status);
  const off = engine.onStatus((s) => apply(toAccountStatus(s)));
  return {
    seen,
    visible: () => homeSyncNoticeVisible(status, errorSince, now),
    status: () => status,
    dispose() {
      off();
      if (timer !== null) clearTimeout(timer);
    },
  };
}

function toAccountStatus(s: ReturnType<SyncEngine["status"]>): AccountSyncStatus {
  return s === "stopped" ? "off" : s; // session.ts syncStatus()와 같다
}

let engine: SyncEngine | null = null;
let harness: ReturnType<typeof noticeHarness> | null = null;

function start(remote: FakeRemote) {
  const memory = createMemoryStorage();
  let n = 0;
  const store = createAppStore({
    persistence: createStoragePersistence(() => memory),
    now: () => NOW,
    newId: () => `id-${++n}`,
  });
  store.load();
  store.actions.signIn(ACCOUNT);
  store.actions.completeOnboarding();
  store.actions.acceptConsent(); // 지금 판의 동의 — 올릴 수 있다
  engine = createSyncEngine({
    store,
    remote,
    accountId: ACCOUNT.id,
    marks: createStorageSyncMarks(() => memory),
    onPageHide: () => () => {},
    decodeDeps: () => ({ now: NOW, newId: () => "server-id" }),
  });
  harness = noticeHarness(engine);
  engine.start();
  return { store, engine, harness };
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
});
afterEach(() => {
  harness?.dispose();
  harness = null;
  engine?.stop();
  engine = null;
  vi.useRealTimers();
});

describe("홈의 서버 저장 안내 — 진짜 엔진의 상태 흐름", () => {
  it("엔진의 재시도 간격은 3·10·30·60초 — 마지막 간격이 안내 지연(60초)과 같아서 error만 세면 안내가 뜨지 않는다", () => {
    expect([...SYNC_RETRY_DELAYS_MS]).toEqual([3_000, 10_000, 30_000, 60_000]);
    expect(HOME_SYNC_ERROR_DELAY_MS).toBe(60_000);
  });

  it("첫 읽기가 계속 실패(Supabase 일시 중지): error→loading→error가 되풀이돼도 60초 뒤 보이고, 읽기가 되면 사라진다", async () => {
    const remote = new FakeRemote();
    remote.failFetch = 1_000;
    const { harness: h } = start(remote);

    await vi.advanceTimersByTimeAsync(0);
    expect(h.status()).toBe("error");
    expect(h.visible()).toBe(false);

    // 재시도 3·10·30초 — 아직 60초 전
    await vi.advanceTimersByTimeAsync(59_000);
    expect(h.seen).toEqual(expect.arrayContaining(["loading@3000", "error@3000", "loading@13000", "error@13000", "loading@43000", "error@43000"]));
    expect(h.visible()).toBe(false);

    // 60초 + 타이머 여유 → 보인다
    await vi.advanceTimersByTimeAsync(1_100);
    expect(h.visible()).toBe(true);

    // 이후 60초마다 재시도(loading→error) — 그 순간에도 사라지지 않는다
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.seen).toEqual(expect.arrayContaining(["loading@103000", "error@103000"]));
    expect(h.visible()).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.seen).toEqual(expect.arrayContaining(["loading@163000", "error@163000"]));
    expect(h.visible()).toBe(true);
    expect(h.seen.filter((s) => s.startsWith("error@")).length).toBeGreaterThanOrEqual(5);

    // 서버가 돌아오면 다음 재시도에서 읽기 성공 → 동의했으니 행을 만든다 → synced → 안내 사라짐
    remote.failFetch = 0;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.status()).toBe("synced");
    expect(h.visible()).toBe(false);
  });

  it("올리기가 계속 실패: error→pending→error가 되풀이돼도 60초 뒤 보이고, 올리기가 되면 사라진다", async () => {
    const remote = new FakeRemote();
    remote.failWrite = 1_000;
    const { store, harness: h } = start(remote);

    await vi.advanceTimersByTimeAsync(0);
    // 읽기는 됐고(행 없음) 동의했으니 만들려다(insert) 실패
    expect(remote.calls.slice(0, 2)).toEqual(["fetch", "insert"]);
    expect(h.status()).toBe("error");
    expect(h.visible()).toBe(false);

    // 그 사이 기록을 하나 더 남겨도(pending) 첫 실패 시각은 그대로
    store.actions.addSymptomRecord({ lochiaIncreased: false, lochiaRed: false, feverEvent: false, painNrs: 3, redFlagCode: null, postpartumDays: 57 });
    await vi.advanceTimersByTimeAsync(59_000);
    expect(h.seen.filter((s) => s.startsWith("pending@")).length).toBeGreaterThanOrEqual(3);
    expect(h.visible()).toBe(false);

    await vi.advanceTimersByTimeAsync(1_100);
    expect(h.visible()).toBe(true);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.visible()).toBe(true);

    remote.failWrite = 0;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.status()).toBe("synced");
    expect(h.visible()).toBe(false);
    expect(remote.row).not.toBeNull();
  });

  it("실패 없이 읽고 올리면(loading→pending→synced) 아무 때도 보이지 않는다", async () => {
    const remote = new FakeRemote();
    const { harness: h } = start(remote);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.status()).toBe("synced");
    await vi.advanceTimersByTimeAsync(HOME_SYNC_ERROR_DELAY_MS * 3);
    expect(h.visible()).toBe(false);
  });
});
