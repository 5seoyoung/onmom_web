// 앱을 열 때 맞추기 — 브라우저가 푸시 구독을 갈아 끼우거나(pushsubscriptionchange) 잃었을 때 서버 행을 되살리는 규칙과 절차.
// 결정은 순수 함수(reminderReconcileAction), 절차(reconcileReminder)는 가짜 PushManager·서버로 돌린다(reminderActions가 실제 것을 넣는다).
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryStorage, STORAGE_PREFIX } from "@/store/persistence";
import {
  parseReminderSetting,
  reconcileReminder,
  reminderReconcileAction,
  urlBase64ToUint8Array,
  type PushManagerLike,
  type PushSubscriptionKeys,
  type PushSubscriptionLike,
  type PushSubscriptionRow,
  type ReconcileReminderDeps,
  type ReminderPermission,
  type SaveRowResult,
} from "./reminderModel";
import { forgetReminder, readReminderSetting, rememberReminder, REMINDER_SETTING_KEY } from "./reminderSetting";

// RFC 8291 부록 A의 서버 공개 키 — 모양 검사용(실제 키가 아니다)
const SAMPLE_PUBLIC_KEY = "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";
const KEY = urlBase64ToUint8Array(SAMPLE_PUBLIC_KEY);
const OTHER_KEY = urlBase64ToUint8Array(SAMPLE_PUBLIC_KEY.slice(0, -2) + "AA");
const SUB_KEYS = { p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", auth: "BTBZMqHH6r4Tts7J_aSIgg" };
const OTHER_KEYS = { p256dh: `C${SUB_KEYS.p256dh.slice(1)}`, auth: "AAAAAAAAAAAAAAAAAAAAAA" };
// FCM 끝점 모양(실제 구독이 아니다)
const FCM = "https://fcm.googleapis.com/fcm/send/test-endpoint";
const E1 = `${FCM}-e1`;
const E2 = `${FCM}-e2`;
const NEW = `${FCM}-new`;

const row = (endpoint: string, keys: { p256dh: string; auth: string } = SUB_KEYS): PushSubscriptionKeys => ({ endpoint, ...keys });
const sub = (endpoint: string, currentKey = true) => ({ endpoint, ...SUB_KEYS, currentKey });

describe("reminderReconcileAction — 앱을 열 때 무엇을 할지(순수 규칙)", () => {
  const on = { setting: { endpoint: E1 }, permission: "granted" as const };

  it("켜 둔 표시가 없거나·권한이 허용이 아니거나(묻지 않는다)·서버 행을 읽지 못했으면(오프라인) 아무것도 하지 않는다", () => {
    const base = { ...on, browserSub: null, serverRows: [row(E1)] };
    expect(reminderReconcileAction({ ...base, setting: null })).toEqual({ kind: "none" });
    expect(reminderReconcileAction({ ...base, setting: null, browserSub: sub(E2), serverRows: [] })).toEqual({ kind: "none" });
    for (const permission of ["default", "denied", null] as const) expect(reminderReconcileAction({ ...base, permission }), String(permission)).toEqual({ kind: "none" });
    expect(reminderReconcileAction({ ...base, serverRows: null })).toEqual({ kind: "none" });
  });

  it("이미 맞으면 아무것도 하지 않는다", () => {
    expect(reminderReconcileAction({ ...on, browserSub: sub(E1), serverRows: [row(E1)] })).toEqual({ kind: "none" });
    expect(reminderReconcileAction({ ...on, browserSub: sub(E1), serverRows: [row(E1), row(`${FCM}-phone`)] })).toEqual({ kind: "none" });
  });

  it("브라우저가 새 끝점으로 갈아 끼웠다 → 새 끝점을 저장하고 예전 끝점의 행을 지운다", () => {
    expect(reminderReconcileAction({ ...on, browserSub: sub(E2), serverRows: [row(E1)] })).toEqual({ kind: "save", stale: E1 });
    expect(reminderReconcileAction({ ...on, browserSub: sub(E2), serverRows: [] })).toEqual({ kind: "save", stale: null });
  });

  it("같은 끝점인데 키가 다르다 → 저장(같은 끝점 upsert가 키를 갱신)", () => {
    expect(reminderReconcileAction({ ...on, browserSub: sub(E1), serverRows: [row(E1, OTHER_KEYS)] })).toEqual({ kind: "save", stale: null });
    expect(reminderReconcileAction({ ...on, browserSub: sub(E2), serverRows: [row(E1), row(E2, OTHER_KEYS)] })).toEqual({ kind: "save", stale: E1 });
  });

  it("표시의 끝점 행을 서버가 지웠다(푸시 서비스가 404/410 — 구독이 끝남) → 같은 끝점을 다시 저장하지 않고 새로 구독", () => {
    expect(reminderReconcileAction({ ...on, browserSub: sub(E1), serverRows: [] })).toEqual({ kind: "resubscribe", stale: null });
  });

  it("구독이 없다 · 예전 VAPID 키의 구독이다 → 새로 구독하고 이 기기의 예전 행을 지운다(서버가 서명하지 못한다)", () => {
    expect(reminderReconcileAction({ ...on, browserSub: null, serverRows: [row(E1)] })).toEqual({ kind: "resubscribe", stale: E1 });
    expect(reminderReconcileAction({ ...on, browserSub: null, serverRows: [] })).toEqual({ kind: "resubscribe", stale: null });
    expect(reminderReconcileAction({ ...on, browserSub: sub(E1, false), serverRows: [row(E1)] })).toEqual({ kind: "resubscribe", stale: E1 });
  });

  it("서버는 이미 새 끝점 — 표시만 바꾸고 남은 예전 행은 지운다", () => {
    expect(reminderReconcileAction({ ...on, browserSub: sub(E2), serverRows: [row(E1), row(E2)] })).toEqual({ kind: "track", stale: E1 });
    expect(reminderReconcileAction({ ...on, browserSub: sub(E2), serverRows: [row(E2)] })).toEqual({ kind: "track", stale: null });
  });

  it("다른 기기의 행은 건드리지 않는다(지우는 것은 이 브라우저가 저장했던 끝점뿐)", () => {
    const phone = `${FCM}-phone`;
    for (const browserSub of [sub(E2), sub(E1), null, sub(E1, false)]) {
      const action = reminderReconcileAction({ ...on, browserSub, serverRows: [row(phone)] });
      expect(action.kind === "none" ? null : action.stale).toBeNull();
    }
  });
});

// 가짜 PushManager — 구독 하나(브라우저와 같다). log에 subscribe·unsubscribe를 남긴다.
function fakePush(opts: { existing?: { endpoint: string; key: Uint8Array } | null; newEndpoint?: string } = {}) {
  const log: string[] = [];
  const make = (endpoint: string, key: Uint8Array): PushSubscriptionLike => ({
    endpoint,
    options: { applicationServerKey: key.slice().buffer },
    toJSON: () => ({ endpoint, keys: SUB_KEYS }),
    unsubscribe: async () => {
      log.push(`unsubscribe:${endpoint}`);
      if (current?.endpoint === endpoint) current = null;
      return true;
    },
  });
  let current: PushSubscriptionLike | null = opts.existing ? make(opts.existing.endpoint, opts.existing.key) : null;
  const manager: PushManagerLike = {
    getSubscription: async () => current,
    subscribe: async ({ applicationServerKey }) => {
      log.push("subscribe");
      current = make(opts.newEndpoint ?? NEW, applicationServerKey);
      return current;
    },
  };
  return { manager, log, current: () => current };
}

function harness(opts: {
  setting?: { endpoint: string } | null;
  permission?: ReminderPermission | null;
  push?: ReturnType<typeof fakePush> | null;
  rows?: PushSubscriptionKeys[] | null;
  saveResult?: SaveRowResult;
}) {
  /** 워커·서버에 물은 순서 */
  const asked: string[] = [];
  const saved: PushSubscriptionRow[] = [];
  /** 표시 — undefined = 건드리지 않음, null = 지움 */
  let marker: string | null | undefined;
  const push = opts.push === undefined ? fakePush() : opts.push;
  const deps: ReconcileReminderDeps = {
    applicationServerKey: KEY,
    setting: () => (opts.setting === undefined ? { endpoint: E1 } : opts.setting),
    permission: () => (opts.permission === undefined ? "granted" : opts.permission),
    pushManager: async () => (asked.push("pushManager"), push === null ? null : push.manager),
    listRows: async () => (asked.push("listRows"), opts.rows === undefined ? [] : opts.rows),
    timeZone: () => "Asia/Seoul",
    save: async (r) => (asked.push(`save:${r.endpoint}`), saved.push(r), opts.saveResult ?? { ok: true }),
    deleteRow: async (endpoint) => (asked.push(`delete:${endpoint}`), true),
    remember: (endpoint) => void (marker = endpoint),
    forget: () => void (marker = null),
  };
  return { deps, asked, saved, push, marker: () => marker };
}

describe("reconcileReminder — 앱을 열 때 한 번(가짜 브라우저·서버)", () => {
  it("켜 둔 표시가 없거나 권한이 허용이 아니면 워커·서버에 아무것도 묻지 않는다(요청 없음, 권한도 묻지 않음)", async () => {
    for (const opts of [{ setting: null }, { permission: "default" as const }, { permission: "denied" as const }, { permission: null }]) {
      const h = harness({ ...opts, push: fakePush({ existing: { endpoint: E2, key: KEY } }), rows: [row(E1)] });
      expect(await reconcileReminder(h.deps)).toBe("none");
      expect(h.asked).toEqual([]);
      expect(h.push?.log).toEqual([]);
      expect(h.marker()).toBeUndefined();
    }
  });

  it("브라우저가 갈아 끼운 새 구독(워커의 pushsubscriptionchange 또는 브라우저) → 예전 행을 지우고 새 끝점을 저장, 표시를 새 끝점으로", async () => {
    const h = harness({ push: fakePush({ existing: { endpoint: E2, key: KEY } }), rows: [row(E1)] });
    expect(await reconcileReminder(h.deps)).toBe("saved");
    expect(h.asked).toEqual(["pushManager", "listRows", `delete:${E1}`, `save:${E2}`]);
    expect(h.saved).toEqual([{ endpoint: E2, ...SUB_KEYS, tz: "Asia/Seoul" }]);
    expect(h.push?.log).toEqual([]); // 구독은 그대로 쓴다
    expect(h.marker()).toBe(E2);
  });

  it("구독을 잃었다 → 권한을 묻지 않고 같은 키로 새로 구독해 저장", async () => {
    const h = harness({ push: fakePush(), rows: [row(E1)] });
    expect(await reconcileReminder(h.deps)).toBe("resubscribed");
    expect(h.asked).toEqual(["pushManager", "listRows", `delete:${E1}`, `save:${NEW}`]);
    expect(h.push?.log).toEqual(["subscribe"]);
    expect(h.marker()).toBe(NEW);
  });

  it("서버가 지운 끝점(404/410)·예전 VAPID 키의 구독 → 풀고 새로 구독", async () => {
    const pruned = harness({ push: fakePush({ existing: { endpoint: E1, key: KEY } }), rows: [] });
    expect(await reconcileReminder(pruned.deps)).toBe("resubscribed");
    expect(pruned.push?.log).toEqual([`unsubscribe:${E1}`, "subscribe"]);
    expect(pruned.saved.map((r) => r.endpoint)).toEqual([NEW]);

    const oldKey = harness({ push: fakePush({ existing: { endpoint: E1, key: OTHER_KEY } }), rows: [row(E1)] });
    expect(await reconcileReminder(oldKey.deps)).toBe("resubscribed");
    expect(oldKey.asked).toContain(`delete:${E1}`);
    expect(oldKey.push?.log).toEqual([`unsubscribe:${E1}`, "subscribe"]);
    expect(oldKey.marker()).toBe(NEW);
  });

  it("이미 맞으면 저장하지 않는다 · 서버가 이미 새 끝점이면 표시만 바꾼다", async () => {
    const same = harness({ push: fakePush({ existing: { endpoint: E1, key: KEY } }), rows: [row(E1)] });
    expect(await reconcileReminder(same.deps)).toBe("none");
    expect(same.asked).toEqual(["pushManager", "listRows"]);
    expect(same.marker()).toBeUndefined();

    const tracked = harness({ push: fakePush({ existing: { endpoint: E2, key: KEY } }), rows: [row(E1), row(E2)] });
    expect(await reconcileReminder(tracked.deps)).toBe("tracked");
    expect(tracked.asked).toEqual(["pushManager", "listRows", `delete:${E1}`]);
    expect(tracked.saved).toEqual([]);
    expect(tracked.marker()).toBe(E2);
  });

  it("서버 행을 읽지 못했다(오프라인·세션 없음·다른 계정의 세션) · 워커가 없다 → 아무것도 바꾸지 않는다", async () => {
    const offline = harness({ push: fakePush({ existing: { endpoint: E2, key: KEY } }), rows: null });
    expect(await reconcileReminder(offline.deps)).toBe("none");
    expect(offline.saved).toEqual([]);
    expect(offline.push?.log).toEqual([]);
    expect(offline.marker()).toBeUndefined();

    const noWorker = harness({ push: null, rows: [row(E1)] });
    expect(await reconcileReminder(noWorker.deps)).toBe("none");
    expect(noWorker.asked).toEqual(["pushManager"]);
  });

  it("저장 실패 → 구독을 도로 풀고(서버에 없는 켜짐은 없다) 표시는 둔다 — 다음에 앱을 열 때 다시", async () => {
    const h = harness({ push: fakePush({ existing: { endpoint: E2, key: KEY } }), rows: [row(E1)], saveResult: { ok: false, reason: "failed" } });
    expect(await reconcileReminder(h.deps)).toBe("failed");
    expect(h.push?.current()).toBeNull();
    expect(h.marker()).toBeUndefined();
  });

  it("받는 목록 밖 푸시 서비스로 바뀌었다 → 저장하지 않고 표시를 지운다(앱을 열 때마다 구독을 만들었다 풀지 않게)", async () => {
    const h = harness({ push: fakePush({ newEndpoint: "https://push.other-browser.example/x" }), rows: [] });
    expect(await reconcileReminder(h.deps)).toBe("dropped");
    expect(h.saved).toEqual([]);
    expect(h.push?.current()).toBeNull();
    expect(h.marker()).toBeNull();
  });
});

describe("켜 둔 표시(reminderSetting) — 이 브라우저·이 계정에서 켜기에 성공했다는 표시", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("키는 onmom.web. 접두 — 계정 삭제(eraseAll)가 함께 지운다", () => {
    expect(REMINDER_SETTING_KEY.startsWith(STORAGE_PREFIX)).toBe(true);
  });

  it("모양이 틀린 값은 없는 것으로 본다", () => {
    expect(parseReminderSetting(JSON.stringify({ account: "kakao-1", endpoint: E1 }))).toEqual({ account: "kakao-1", endpoint: E1 });
    for (const raw of [null, undefined, "", "not json", "null", "[]", "1", JSON.stringify({ account: "", endpoint: E1 }), JSON.stringify({ account: "a" }), JSON.stringify({ account: 1, endpoint: E1 })]) {
      expect(parseReminderSetting(raw), String(raw)).toBeNull();
    }
  });

  it("같은 계정일 때만 읽힌다 · 같은 값은 다시 쓰지 않는다(다른 탭에 변경 알림을 보내지 않게) · 지우기", () => {
    const storage = createMemoryStorage();
    let writes = 0;
    const setItem = storage.setItem.bind(storage);
    storage.setItem = (k, v) => (writes++, setItem(k, v));
    vi.stubGlobal("window", { localStorage: storage });

    expect(readReminderSetting("kakao-1")).toBeNull();
    rememberReminder("kakao-1", E1);
    expect(readReminderSetting("kakao-1")).toEqual({ endpoint: E1 });
    expect(readReminderSetting("guest-2")).toBeNull();
    rememberReminder("kakao-1", E1);
    expect(writes).toBe(1);
    rememberReminder("kakao-1", E2);
    expect(readReminderSetting("kakao-1")).toEqual({ endpoint: E2 });
    forgetReminder();
    expect(storage.getItem(REMINDER_SETTING_KEY)).toBeNull();
    expect(readReminderSetting("kakao-1")).toBeNull();
  });

  it("저장소가 없거나 막혀 있으면 표시가 없는 것과 같다(던지지 않는다)", () => {
    expect(readReminderSetting("kakao-1")).toBeNull();
    vi.stubGlobal("window", {
      get localStorage(): Storage {
        throw new Error("SecurityError");
      },
    });
    expect(readReminderSetting("kakao-1")).toBeNull();
    expect(() => rememberReminder("kakao-1", E1)).not.toThrow();
    expect(() => forgetReminder()).not.toThrow();
  });
});
