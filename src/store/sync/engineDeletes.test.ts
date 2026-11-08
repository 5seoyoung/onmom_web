// 동기화 엔진 — 지운 기록·고친 기록이 서버까지 이어지는지(형식 2), 형식 1의 서버 행과 예전 판의 웹.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CURRENT_CONSENT_VERSION } from "@/domain/consent";
import type { PersistedState } from "@/domain/types";
import { RULES_VERSION } from "@/rules/version";
import { createAppStore, type AppStore } from "../appStore";
import { initialState } from "../defaults";
import { createMemoryStorage, createStoragePersistence, type StorageLike } from "../persistence";
import { createSyncEngine, type SyncEngine } from "./engine";
import { createStorageSyncMarks } from "./marks";
import { STATE_SCHEMA_VERSION } from "./remote";
import { FakeRemote } from "./testUtils";

const ACCOUNT = { id: "kakao-1001", name: null, provider: "kakao" } as const;
const NOW = new Date("2026-11-08T12:00:00+09:00");
/** 모아 보내기(1.5초)를 넘겨 기다린다 */
const SYNC_WAIT_MS = 5_000;

function symptom(id: string, date: string, over: Partial<PersistedState["symptomHistory"][number]> = {}) {
  return { id, date, lochiaIncreased: false, lochiaRed: false, feverEvent: false, painNrs: 2, redFlagCode: null, postpartumDays: 30, rulesVersion: RULES_VERSION, ...over };
}

function serverState(over: Partial<PersistedState> = {}): PersistedState {
  const s = initialState();
  return {
    ...s,
    hasOnboarded: true,
    ownerAccountID: ACCOUNT.id,
    profile: { ...s.profile, consentAccepted: true, consentVersion: CURRENT_CONSENT_VERSION, consentAcceptedAt: "2026-11-01T00:00:00.000Z", deliveryDate: "2026-10-01" },
    ...over,
  };
}

/** 형식 1의 서버 행(이 작업 전의 웹이 올린 것) — deleted 칸·고친 시각이 없다 */
function v1(state: PersistedState): PersistedState {
  const raw = JSON.parse(JSON.stringify(state)) as Partial<PersistedState>;
  delete raw.deleted;
  return raw as PersistedState;
}

let engine: SyncEngine | null = null;
function setup(memory: StorageLike = createMemoryStorage()): AppStore {
  const store = createAppStore({ persistence: createStoragePersistence(() => memory), now: () => NOW, newId: () => "local-new" });
  store.load();
  store.actions.signIn(ACCOUNT);
  return store;
}
function start(store: AppStore, remote: FakeRemote, memory: StorageLike) {
  engine = createSyncEngine({
    store,
    remote,
    accountId: ACCOUNT.id,
    marks: createStorageSyncMarks(() => memory),
    onPageHide: () => () => {},
    decodeDeps: () => ({ now: NOW, newId: () => "server-id" }),
  });
  engine.start();
  return engine;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  engine?.stop();
  engine = null;
  vi.useRealTimers();
});

const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id);

describe("지우기·고치기가 서버까지 — 형식 2로 올린다", () => {
  it("지운 기록은 서버 JSON의 목록에서 빠지고 표시(id·시각만)만 실린다", async () => {
    const memory = createMemoryStorage();
    const store = setup(memory);
    const remote = new FakeRemote();
    remote.setServer(serverState({ symptomHistory: [symptom("x", "2026-11-02T01:00:00.000Z", { painNrs: 9 }), symptom("y", "2026-11-01T01:00:00.000Z")] }));
    start(store, remote, memory);
    await vi.advanceTimersByTimeAsync(0);
    expect(ids(store.getSnapshot().state.symptomHistory)).toEqual(["x", "y"]);

    store.actions.deleteSymptomRecord("x");
    await vi.advanceTimersByTimeAsync(SYNC_WAIT_MS);
    expect(remote.writes()).toEqual(["update"]);
    expect(remote.row!.schemaVersion).toBe(STATE_SCHEMA_VERSION);
    expect(STATE_SCHEMA_VERSION).toBe(2);
    const sent = remote.serverState();
    expect(ids(sent.symptomHistory)).toEqual(["y"]);
    expect(sent.deleted.symptomHistory).toEqual([{ id: "x", deletedAt: NOW.toISOString() }]);
    expect(JSON.stringify(sent.deleted)).not.toMatch(/painNrs|redFlagCode|date"/);
    expect(engine!.status()).toBe("synced");
  });

  it("고친 기록은 고친 시각과 함께 올라가고, 다른 기기가 읽으면 고친 값이 보인다", async () => {
    const memory = createMemoryStorage();
    const store = setup(memory);
    const remote = new FakeRemote();
    remote.setServer(serverState({ moodChecks: [{ id: "m", date: "2026-11-07T01:00:00.000Z", questionID: 1, answer: "no", moodVersion: null }] }));
    const first = start(store, remote, memory);
    await vi.advanceTimersByTimeAsync(0);
    store.actions.updateMoodAnswer("m", "yes");
    await vi.advanceTimersByTimeAsync(SYNC_WAIT_MS);
    expect(remote.serverState().moodChecks[0]).toMatchObject({ answer: "yes", updatedAt: NOW.toISOString() });
    first.stop();

    // 다른 기기 — 고치기 전 사본을 들고 있다
    const otherMemory = createMemoryStorage();
    const other = setup(otherMemory);
    other.replaceState({ ...serverState(), moodChecks: [{ id: "m", date: "2026-11-07T01:00:00.000Z", questionID: 1, answer: "no", moodVersion: null }] });
    start(other, remote, otherMemory);
    await vi.advanceTimersByTimeAsync(SYNC_WAIT_MS);
    expect(other.getSnapshot().state.moodChecks[0].answer).toBe("yes");
  });

  it("다른 기기가 지운 기록 — 이 브라우저의 사본에서도 빠진다", async () => {
    const memory = createMemoryStorage();
    const store = setup(memory);
    store.replaceState({ ...serverState(), symptomHistory: [symptom("x", "2026-11-02T01:00:00.000Z")] });
    const remote = new FakeRemote();
    remote.setServer(serverState({ deleted: { ...initialState().deleted, symptomHistory: [{ id: "x", deletedAt: "2026-11-05T00:00:00.000Z" }] } }));
    start(store, remote, memory);
    await vi.advanceTimersByTimeAsync(SYNC_WAIT_MS);
    expect(store.getSnapshot().state.symptomHistory).toEqual([]);
    expect(remote.writes()).toEqual([]); // 서버와 같아졌다 — 올릴 것이 없다
  });

  it("다른 기기가 먼저 썼으면(충돌) 다시 읽어 합친다 — 그쪽이 지운 것과 이쪽이 고친 것이 둘 다 남는다", async () => {
    const memory = createMemoryStorage();
    const store = setup(memory);
    const remote = new FakeRemote();
    const both = [symptom("a", "2026-11-02T01:00:00.000Z"), symptom("b", "2026-11-01T01:00:00.000Z")];
    remote.setServer(serverState({ symptomHistory: both }));
    start(store, remote, memory);
    await vi.advanceTimersByTimeAsync(0);

    remote.beforeNextUpdate = () => {
      remote.setServer(
        serverState({ symptomHistory: [both[1]], deleted: { ...initialState().deleted, symptomHistory: [{ id: "a", deletedAt: "2026-11-08T02:00:00.000Z" }] } }),
      );
    };
    store.actions.updateSymptomRecord("b", { ...symptom("b", ""), painNrs: 6 });
    await vi.advanceTimersByTimeAsync(SYNC_WAIT_MS);
    expect(remote.writes()).toEqual(["update", "update"]);
    const sent = remote.serverState();
    expect(ids(sent.symptomHistory)).toEqual(["b"]);
    expect(sent.symptomHistory[0]).toMatchObject({ painNrs: 6, updatedAt: NOW.toISOString() });
    expect(ids(store.getSnapshot().state.symptomHistory)).toEqual(["b"]);
  });
});

describe("형식 1의 서버 행·예전 판의 웹", () => {
  it("형식 1의 행에 남은 기록 — 이 브라우저가 (오프라인에서) 지웠으면 합친 뒤에도 빠지고, 형식 2로 올린다", async () => {
    const memory = createMemoryStorage();
    const store = setup(memory);
    store.replaceState({ ...serverState(), symptomHistory: [symptom("x", "2026-11-02T01:00:00.000Z")] });
    store.actions.deleteSymptomRecord("x");
    const remote = new FakeRemote();
    remote.setServer(v1(serverState({ symptomHistory: [symptom("x", "2026-11-02T01:00:00.000Z")] })), 1);
    start(store, remote, memory);
    await vi.advanceTimersByTimeAsync(SYNC_WAIT_MS);
    expect(store.getSnapshot().state.symptomHistory).toEqual([]);
    expect(remote.writes()).toEqual(["update"]);
    expect(remote.row!.schemaVersion).toBe(2);
    expect(remote.serverState().symptomHistory).toEqual([]);
    expect(ids(remote.serverState().deleted.symptomHistory)).toEqual(["x"]);
  });

  it("형식 1의 행은 그대로 읽는다 — 바뀐 것이 없으면 올리지 않는다(행은 형식 1 그대로)", async () => {
    const memory = createMemoryStorage();
    const store = setup(memory);
    const remote = new FakeRemote();
    remote.setServer(v1(serverState({ symptomHistory: [symptom("x", "2026-11-02T01:00:00.000Z")] })), 1);
    start(store, remote, memory);
    await vi.advanceTimersByTimeAsync(SYNC_WAIT_MS);
    expect(ids(store.getSnapshot().state.symptomHistory)).toEqual(["x"]);
    expect(remote.writes()).toEqual([]);
    expect(remote.row!.schemaVersion).toBe(1);
  });

  it("이 웹보다 새 형식의 행은 읽기만 한다 — 예전 판의 웹(형식 1)이 형식 2의 행을 볼 때와 같은 길", async () => {
    const memory = createMemoryStorage();
    const store = setup(memory);
    store.replaceState({ ...serverState(), symptomHistory: [symptom("x", "2026-11-02T01:00:00.000Z")] });
    const remote = new FakeRemote();
    remote.setServer(serverState({ deleted: { ...initialState().deleted, symptomHistory: [{ id: "x", deletedAt: "2026-11-05T00:00:00.000Z" }] } }), STATE_SCHEMA_VERSION + 1);
    const e = start(store, remote, memory);
    expect(await e.firstFetch()).toBe("outdated");
    store.actions.addMoodCheck({ questionID: 1, answer: "no" });
    await vi.advanceTimersByTimeAsync(SYNC_WAIT_MS);
    expect(remote.writes()).toEqual([]);
    expect(e.status()).toBe("outdated");
  });
});
