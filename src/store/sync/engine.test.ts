import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PersistedState } from "@/domain/types";
import { createAppStore, type AppStore } from "../appStore";
import { initialState } from "../defaults";
import { createMemoryStorage, createStoragePersistence, STORAGE_PREFIX, type StorageLike } from "../persistence";
import { createSyncEngine, type SyncEngine } from "./engine";
import { createStorageSyncMarks, SERVER_STORAGE_CONSENT_VERSION, SYNC_BASE_KEY, SYNC_CONSENT_KEY, type SyncMarks } from "./marks";
import { STATE_SCHEMA_VERSION } from "./remote";
import { FakeRemote } from "./testUtils";

const ACCOUNT = { id: "kakao-1001", name: null, provider: "kakao" } as const;
const NOW = new Date("2026-09-27T12:00:00+09:00");

/** 스토어 → 같은 저장소를 쓰는 동기화 표시(합치기 기준·서버 저장 동의) */
const marksOf = new WeakMap<AppStore, SyncMarks>();

/** memory를 넘기면 같은 브라우저 저장소로 "페이지를 다시 연" 스토어를 만든다. */
function setupStore(memory: StorageLike = createMemoryStorage()): AppStore {
  let n = 0;
  const store = createAppStore({
    persistence: createStoragePersistence(() => memory),
    now: () => NOW,
    newId: () => `id-${++n}`,
  });
  store.load();
  marksOf.set(store, createStorageSyncMarks(() => memory));
  return store;
}
function marks(store: AppStore): SyncMarks {
  return marksOf.get(store)!;
}

function onboardedServerState(over: Partial<PersistedState> = {}): PersistedState {
  const s = initialState();
  return {
    ...s,
    hasOnboarded: true,
    ownerAccountID: ACCOUNT.id,
    profile: { ...s.profile, consentAccepted: true, deliveryDate: "2026-08-01", deliveryMethod: "cesarean", heightCm: 161 },
    ...over,
  };
}

function symptom(id: string, date: string) {
  return { id, date, lochiaIncreased: false, lochiaRed: false, feverEvent: false, painNrs: 2, redFlagCode: null, postpartumDays: 30 };
}

let engine: SyncEngine | null = null;
function start(store: AppStore, remote: FakeRemote, opts: { onPageHide?: (l: () => void) => () => void } = {}) {
  engine = createSyncEngine({
    store,
    remote,
    accountId: ACCOUNT.id,
    marks: marks(store),
    onPageHide: opts.onPageHide ?? (() => () => {}),
    decodeDeps: () => ({ now: NOW, newId: () => "server-id" }),
  });
  engine.start();
  return engine;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  engine?.stop();
  engine = null;
  vi.useRealTimers();
});

describe("첫 읽기 전에는 쓰지 않는다(감사 #13)", () => {
  it("읽기가 끝나기 전의 변경은 모아 두고, 읽기가 끝난 뒤 합쳐서 올린다", async () => {
    const store = setupStore();
    store.actions.signIn(ACCOUNT);
    store.actions.completeOnboarding();
    const remote = new FakeRemote();
    remote.setServer(onboardedServerState({ symptomHistory: [symptom("server-rec", "2026-09-20T01:00:00.000Z")] }));
    let release!: () => void;
    remote.holdFetch = new Promise((r) => (release = r));

    start(store, remote);
    store.actions.addSymptomRecord({ lochiaIncreased: false, lochiaRed: false, feverEvent: false, painNrs: 3, redFlagCode: null, postpartumDays: 57 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(remote.writes()).toEqual([]); // 서버 기록을 빈 상태로 덮지 않는다
    expect(engine!.status()).toBe("loading");

    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(remote.writes()).toEqual(["update"]);
    // 서버 기록과 이 브라우저 기록이 모두 남는다
    expect(store.getSnapshot().state.symptomHistory.map((r) => r.id)).toEqual(["id-1", "server-rec"]);
    expect(remote.serverState().symptomHistory.map((r) => r.id)).toEqual(["id-1", "server-rec"]);
    expect(engine!.status()).toBe("synced");
  });

  it("첫 읽기가 실패하면 쓰지 않고, 잠시 뒤 다시 읽은 다음에 쓴다", async () => {
    const store = setupStore();
    store.actions.signIn(ACCOUNT);
    store.actions.completeOnboarding();
    const remote = new FakeRemote();
    remote.failFetch = 1;

    const e = start(store, remote);
    expect(await e.firstFetch()).toBe("error");
    expect(e.status()).toBe("error");
    store.actions.snoozeMoodCard();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(remote.writes()).toEqual([]);

    marks(store).acceptConsent(ACCOUNT.id); // 서버 저장 동의(온보딩이 남긴다)
    await vi.advanceTimersByTimeAsync(3_000); // 재시도 → 읽기 성공(행 없음) → 동의했으니 만든다
    expect(remote.calls).toEqual(["fetch", "fetch", "insert"]);
    expect(e.status()).toBe("synced");
  });
});

describe("동의 전에는 서버로 보내지 않는다(감사 #15·#20)", () => {
  it("행이 없고 온보딩 동의 전이면 기다렸다가, 서버 저장 동의와 함께 온보딩을 마치면 처음 만든다", async () => {
    const store = setupStore();
    store.actions.signIn(ACCOUNT);
    const remote = new FakeRemote();

    const e = start(store, remote);
    expect(await e.firstFetch()).toBe("ok");
    await vi.advanceTimersByTimeAsync(0);
    expect(e.status()).toBe("waitingConsent");

    // 온보딩 1·2단계 입력은 [온맘 시작하기] 전까지 저장되지 않지만, 저장돼도 동의 전이면 보내지 않는다
    store.actions.updateProfile({ deliveryDate: "2026-08-01", deliveryMethod: "vaginal" });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(remote.writes()).toEqual([]);

    marks(store).acceptConsent(ACCOUNT.id); // 새 온보딩 3단계: 서버 저장 동의
    store.actions.completeOnboarding();
    await vi.advanceTimersByTimeAsync(1_499);
    expect(remote.writes()).toEqual([]); // 1.5초 모아 보내기
    await vi.advanceTimersByTimeAsync(1);
    expect(remote.writes()).toEqual(["insert"]);
    expect(remote.serverState().profile.consentAccepted).toBe(true);
    expect(remote.serverState().ownerAccountID).toBe(ACCOUNT.id);
    expect(e.status()).toBe("synced");
  });

  it("온보딩 동의(\"내 기기에만 저장\")만으로는 행을 만들지 않는다 — 서버 저장 동의 뒤에 만든다", async () => {
    const store = setupStore();
    store.actions.signIn(ACCOUNT);
    const remote = new FakeRemote();
    const e = start(store, remote);
    await vi.advanceTimersByTimeAsync(0);

    store.actions.completeOnboarding();
    store.actions.addSymptomRecord({ lochiaIncreased: false, lochiaRed: false, feverEvent: false, painNrs: 3, redFlagCode: null, postpartumDays: 57 });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(remote.writes()).toEqual([]);
    expect(e.status()).toBe("waitingConsent");
    // 기록이 이 브라우저에만 있다 — 로그아웃이 지우지 않게 flush는 false
    expect(await e.flush(1_000)).toBe(false);

    marks(store).acceptConsent(ACCOUNT.id);
    e.retryNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(remote.writes()).toEqual(["insert"]);
    expect(remote.serverState().symptomHistory).toHaveLength(1);
    expect(e.status()).toBe("synced");
  });

  it("예전 판의 서버 저장 동의로는 새 행을 만들지 않는다(문구가 바뀌면 다시 받는다 — 감사 #20)", async () => {
    const memory = createMemoryStorage();
    const store = setupStore(memory);
    store.actions.signIn(ACCOUNT);
    store.actions.completeOnboarding();
    memory.setItem(SYNC_CONSENT_KEY, JSON.stringify({ accountId: ACCOUNT.id, consentVersion: SERVER_STORAGE_CONSENT_VERSION - 1, adopted: false }));
    const remote = new FakeRemote();
    const e = start(store, remote);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(remote.writes()).toEqual([]);
    expect(e.status()).toBe("waitingConsent");
  });

  it("다른 계정의 서버 저장 동의 표시는 쓰지 않는다", async () => {
    const store = setupStore();
    store.actions.signIn(ACCOUNT);
    store.actions.completeOnboarding();
    marks(store).acceptConsent("kakao-2002");
    const remote = new FakeRemote();
    start(store, remote);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(remote.writes()).toEqual([]);
  });

  it("게스트 기록을 가져온 로그인 — 행이 없으면 다시 동의할 때까지 만들지 않는다", async () => {
    const store = setupStore();
    store.actions.signInGuest();
    store.actions.completeOnboarding();
    store.actions.addMoodCheck({ questionID: 1, answer: "yes" });
    marks(store).markAdopted(ACCOUNT.id); // 로그인 콜백이 가져오기 전에 남긴다(src/auth/session.ts)
    store.actions.signIn(ACCOUNT); // 게스트 기록은 이 계정으로 귀속(state.ts)
    const remote = new FakeRemote();

    const e = start(store, remote);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(remote.calls).toEqual(["fetch"]);
    expect(e.status()).toBe("waitingConsent");
    expect(store.getSnapshot().state.moodChecks).toHaveLength(1); // 이 브라우저에는 그대로

    marks(store).acceptConsent(ACCOUNT.id); // 다시 동의
    e.retryNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(remote.calls).toEqual(["fetch", "insert"]);
    expect(remote.serverState().moodChecks).toHaveLength(1);
  });

  it("게스트 기록을 가져온 로그인 — 행이 있어도 다시 동의할 때까지 서버 행에 섞지 않는다(공용 PC)", async () => {
    const store = setupStore();
    store.actions.signInGuest();
    store.actions.completeOnboarding();
    store.actions.addMoodCheck({ questionID: 1, answer: "yes" });
    marks(store).markAdopted(ACCOUNT.id);
    store.actions.signIn(ACCOUNT);
    const remote = new FakeRemote();
    remote.setServer(onboardedServerState({ symptomHistory: [symptom("server-rec", "2026-09-20T01:00:00.000Z")] }));

    const e = start(store, remote);
    await vi.advanceTimersByTimeAsync(0);
    // 읽기는 한다 — 서버 기록이 이 브라우저에 보인다
    expect(store.getSnapshot().state.symptomHistory.map((r) => r.id)).toEqual(["server-rec"]);
    store.actions.addSymptomRecord({ lochiaIncreased: false, lochiaRed: false, feverEvent: false, painNrs: 1, redFlagCode: null, postpartumDays: 57 });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(remote.writes()).toEqual([]);
    expect(remote.serverState().moodChecks).toHaveLength(0);
    expect(e.status()).toBe("waitingConsent");
    expect(await e.flush(1_000)).toBe(false);

    marks(store).acceptConsent(ACCOUNT.id);
    e.retryNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(remote.writes()).toEqual(["update"]);
    expect(remote.serverState().moodChecks).toHaveLength(1);
  });
});

describe("서버에 행이 있을 때", () => {
  it("서버 기록을 이 브라우저에 적용하고, 다르지 않으면 쓰지 않는다(새 브라우저로 로그인)", async () => {
    const store = setupStore();
    store.actions.signIn(ACCOUNT);
    const remote = new FakeRemote();
    remote.setServer(onboardedServerState({ symptomHistory: [symptom("server-rec", "2026-09-20T01:00:00.000Z")] }));

    const e = start(store, remote);
    expect(await e.firstFetch()).toBe("ok");
    await vi.advanceTimersByTimeAsync(0);
    const s = store.getSnapshot().state;
    expect(s.hasOnboarded).toBe(true);
    expect(s.profile.deliveryMethod).toBe("cesarean");
    expect(s.symptomHistory.map((r) => r.id)).toEqual(["server-rec"]);
    expect(remote.writes()).toEqual([]);
    expect(e.status()).toBe("synced");
  });

  it("이후 변경은 1.5초 모아 한 번에, updated_at 조건부로 올린다", async () => {
    const store = setupStore();
    store.actions.signIn(ACCOUNT);
    const remote = new FakeRemote();
    remote.setServer(onboardedServerState());
    start(store, remote);
    await vi.advanceTimersByTimeAsync(0);

    store.actions.addMoodCheck({ questionID: 1, answer: "no" });
    await vi.advanceTimersByTimeAsync(700);
    store.actions.updateProfile({ heightCm: 163 });
    expect(engine!.status()).toBe("pending");
    await vi.advanceTimersByTimeAsync(1_499);
    expect(remote.writes()).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(remote.writes()).toEqual(["update"]);
    expect(remote.serverState().profile.heightCm).toBe(163);
    expect(remote.serverState().moodChecks).toHaveLength(1);
    expect(engine!.status()).toBe("synced");
  });

  it("충돌(다른 기기가 먼저 씀) → 다시 읽고 합친 뒤 재시도 — 양쪽 기록과 양쪽에서 고친 칸이 모두 남는다", async () => {
    const store = setupStore();
    store.actions.signIn(ACCOUNT);
    const remote = new FakeRemote();
    remote.setServer(onboardedServerState());
    start(store, remote);
    await vi.advanceTimersByTimeAsync(0);

    remote.beforeNextUpdate = () => {
      // 휴대폰: 기록 하나 + 출산 전 체중 입력
      const phone = remote.serverState();
      remote.setServer({
        ...phone,
        symptomHistory: [symptom("phone-rec", "2026-09-27T02:00:00.000Z"), ...phone.symptomHistory],
        profile: { ...phone.profile, prePregnancyWeightKg: 55 },
      });
    };
    // 이 브라우저: 키를 고침
    store.actions.updateProfile({ heightCm: 165 });
    await vi.advanceTimersByTimeAsync(1_500);

    expect(remote.calls.slice(1)).toEqual(["update", "fetch", "update"]);
    const server = remote.serverState();
    expect(server.symptomHistory.map((r) => r.id)).toEqual(["phone-rec"]);
    expect(server.profile.heightCm).toBe(165); // 이 브라우저가 고친 칸
    expect(server.profile.prePregnancyWeightKg).toBe(55); // 휴대폰이 고친 칸
    expect(store.getSnapshot().state.symptomHistory.map((r) => r.id)).toEqual(["phone-rec"]);
    expect(engine!.status()).toBe("synced");
  });

  it("쓰기가 실패하면 이 브라우저의 데이터는 그대로 두고 잠시 뒤 다시 시도한다", async () => {
    const store = setupStore();
    store.actions.signIn(ACCOUNT);
    const remote = new FakeRemote();
    remote.setServer(onboardedServerState());
    start(store, remote);
    await vi.advanceTimersByTimeAsync(0);

    remote.failWrite = 1;
    store.actions.addMoodCheck({ questionID: 2, answer: "unsure" });
    await vi.advanceTimersByTimeAsync(1_500);
    expect(engine!.status()).toBe("error");
    expect(store.getSnapshot().state.moodChecks).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(3_000);
    expect(remote.writes()).toEqual(["update", "update"]);
    expect(remote.serverState().moodChecks).toHaveLength(1);
    expect(engine!.status()).toBe("synced");
  });

  it("서버 형식이 이 웹보다 새로우면 읽기만 한다(덮지 않음)", async () => {
    const store = setupStore();
    store.actions.signIn(ACCOUNT);
    store.actions.completeOnboarding();
    const remote = new FakeRemote();
    remote.setServer(onboardedServerState(), STATE_SCHEMA_VERSION + 1);
    const e = start(store, remote);
    expect(await e.firstFetch()).toBe("outdated");
    store.actions.addMoodCheck({ questionID: 1, answer: "no" });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(remote.writes()).toEqual([]);
    expect(await e.flush(1_000)).toBe(false);
  });

  it("읽기 전용이 된 뒤에는 flush·retryNow도 쓰지 않는다 — 행이 없어져도 옛 형식으로 새로 만들지 않는다", async () => {
    const store = setupStore();
    store.actions.signIn(ACCOUNT);
    store.actions.completeOnboarding();
    marks(store).acceptConsent(ACCOUNT.id);
    const remote = new FakeRemote();
    remote.setServer(onboardedServerState(), STATE_SCHEMA_VERSION + 1);
    const e = start(store, remote);
    expect(await e.firstFetch()).toBe("outdated");

    store.actions.addMoodCheck({ questionID: 1, answer: "no" });
    expect(await e.flush(1_000)).toBe(false);
    e.retryNow();
    await vi.advanceTimersByTimeAsync(10_000);
    remote.row = null; // 다른 곳에서 행이 지워져도
    expect(await e.flush(1_000)).toBe(false);
    e.retryNow();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(remote.writes()).toEqual([]);
    expect(e.status()).toBe("outdated");
  });
});

describe("페이지를 다시 열 때 — 올리기 전에 닫혀도 이 브라우저에서 고친 값을 잃지 않는다", () => {
  it("프로필을 고치고 1.5초 안에 닫은 뒤 다시 열면, 고친 값이 남고 서버로 올라간다", async () => {
    const memory = createMemoryStorage();
    const store = setupStore(memory);
    store.actions.signIn(ACCOUNT);
    const remote = new FakeRemote();
    remote.setServer(onboardedServerState()); // heightCm 161
    const first = start(store, remote);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getSnapshot().state.profile.heightCm).toBe(161);

    store.actions.updateProfile({ heightCm: 170 });
    store.actions.updateMaternity({ anemia: true });
    first.stop(); // 탭이 닫혔다(1.5초 전)
    expect(remote.writes()).toEqual([]);

    const reopened = setupStore(memory); // 같은 브라우저 저장소
    expect(reopened.getSnapshot().state.profile.heightCm).toBe(170);
    start(reopened, remote);
    await vi.advanceTimersByTimeAsync(0);
    expect(reopened.getSnapshot().state.profile.heightCm).toBe(170);
    expect(reopened.getSnapshot().state.maternity.anemia).toBe(true);
    expect(remote.writes()).toEqual(["update"]);
    expect(remote.serverState().profile.heightCm).toBe(170);
    expect(remote.serverState().maternity.anemia).toBe(true);
  });

  it("그사이 다른 기기가 다른 칸을 고쳤으면 그 칸은 서버 값, 이 브라우저가 고친 칸은 이 브라우저 값", async () => {
    const memory = createMemoryStorage();
    const store = setupStore(memory);
    store.actions.signIn(ACCOUNT);
    const remote = new FakeRemote();
    remote.setServer(onboardedServerState());
    const first = start(store, remote);
    await vi.advanceTimersByTimeAsync(0);
    store.actions.updateProfile({ heightCm: 170 });
    first.stop();

    const phone = remote.serverState();
    remote.setServer({ ...phone, profile: { ...phone.profile, prePregnancyWeightKg: 55 } });

    const reopened = setupStore(memory);
    start(reopened, remote);
    await vi.advanceTimersByTimeAsync(0);
    expect(remote.serverState().profile.heightCm).toBe(170);
    expect(remote.serverState().profile.prePregnancyWeightKg).toBe(55);
    expect(reopened.getSnapshot().state.profile.prePregnancyWeightKg).toBe(55);
  });

  it("오프라인에서 고치고(쓰기 실패) 다시 열어도 고친 값이 남는다", async () => {
    const memory = createMemoryStorage();
    const store = setupStore(memory);
    store.actions.signIn(ACCOUNT);
    const remote = new FakeRemote();
    remote.setServer(onboardedServerState());
    const first = start(store, remote);
    await vi.advanceTimersByTimeAsync(0);
    remote.failWrite = 1;
    store.actions.updateProfile({ neighborhood: "망원동" });
    await vi.advanceTimersByTimeAsync(1_500);
    expect(first.status()).toBe("error");
    first.stop();

    const reopened = setupStore(memory);
    start(reopened, remote);
    await vi.advanceTimersByTimeAsync(0);
    expect(reopened.getSnapshot().state.profile.neighborhood).toBe("망원동");
    expect(remote.serverState().profile.neighborhood).toBe("망원동");
  });

  it("저장된 기준이 없는 새 브라우저는 지금처럼 서버 프로필을 쓴다", async () => {
    const store = setupStore();
    store.actions.signIn(ACCOUNT);
    store.actions.updateProfile({ heightCm: 150 }); // 온보딩 전 흔적(동의 전)
    const remote = new FakeRemote();
    remote.setServer(onboardedServerState());
    start(store, remote);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getSnapshot().state.profile.heightCm).toBe(161);
  });

  it("합치기 기준은 \"onmom.web.\" 키에 있어 로그아웃 후 삭제·계정 삭제가 함께 지운다", async () => {
    const memory = createMemoryStorage();
    const store = setupStore(memory);
    store.actions.signIn(ACCOUNT);
    const remote = new FakeRemote();
    remote.setServer(onboardedServerState());
    start(store, remote);
    await vi.advanceTimersByTimeAsync(0);
    expect(memory.getItem(SYNC_BASE_KEY)).not.toBeNull();
    expect(SYNC_BASE_KEY.startsWith(STORAGE_PREFIX) && SYNC_CONSENT_KEY.startsWith(STORAGE_PREFIX)).toBe(true);
    store.actions.deleteAccount();
    expect(memory.getItem(SYNC_BASE_KEY)).toBeNull();
  });

  it("페이지가 가려지면(앱 전환·탭 닫기) 1.5초를 기다리지 않고 바로 올린다", async () => {
    const store = setupStore();
    store.actions.signIn(ACCOUNT);
    const remote = new FakeRemote();
    remote.setServer(onboardedServerState());
    let hide: (() => void) | null = null;
    const e = start(store, remote, {
      onPageHide: (l) => {
        hide = l;
        return () => (hide = null);
      },
    });
    await vi.advanceTimersByTimeAsync(0);
    hide!(); // 바뀐 것이 없으면 아무것도 하지 않는다
    await vi.advanceTimersByTimeAsync(0);
    expect(remote.writes()).toEqual([]);

    store.actions.updateProfile({ heightCm: 172 });
    hide!();
    await vi.advanceTimersByTimeAsync(0);
    expect(remote.writes()).toEqual(["update"]);
    expect(remote.serverState().profile.heightCm).toBe(172);
    e.stop();
    expect(hide).toBeNull(); // 멈추면 이벤트도 뗀다
  });
});

describe("계정·멈춤·flush", () => {
  it("스토어 계정이 바뀌면(로그아웃) 멈추고 더 쓰지 않는다", async () => {
    const store = setupStore();
    store.actions.signIn(ACCOUNT);
    const remote = new FakeRemote();
    remote.setServer(onboardedServerState());
    const e = start(store, remote);
    await vi.advanceTimersByTimeAsync(0);

    store.actions.addMoodCheck({ questionID: 1, answer: "no" });
    store.actions.signOut();
    expect(e.status()).toBe("stopped");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(remote.writes()).toEqual([]);
  });

  it("다른 계정으로 로그인한 스토어에서는 시작하지 않는다", async () => {
    const store = setupStore();
    store.actions.signIn({ id: "kakao-2002", name: null, provider: "kakao" });
    const remote = new FakeRemote();
    const e = start(store, remote);
    expect(e.status()).toBe("stopped");
    await vi.advanceTimersByTimeAsync(0);
    expect(remote.calls).toEqual([]);
  });

  it("flush는 모아 두던 변경을 바로 올리고, 서버와 같아지면 true", async () => {
    const store = setupStore();
    store.actions.signIn(ACCOUNT);
    const remote = new FakeRemote();
    remote.setServer(onboardedServerState());
    const e = start(store, remote);
    await vi.advanceTimersByTimeAsync(0);

    store.actions.addMoodCheck({ questionID: 1, answer: "no" });
    expect(await e.flush(5_000)).toBe(true);
    expect(remote.writes()).toEqual(["update"]);
  });

  it("flush — 올리지 못하면 false, 동의 전이라 올릴 것이 없으면 true", async () => {
    const store = setupStore();
    store.actions.signIn(ACCOUNT);
    const remote = new FakeRemote();
    remote.setServer(onboardedServerState());
    const e = start(store, remote);
    await vi.advanceTimersByTimeAsync(0);
    remote.failWrite = 5;
    store.actions.addMoodCheck({ questionID: 1, answer: "no" });
    expect(await e.flush(5_000)).toBe(false);

    const fresh = setupStore();
    fresh.actions.signIn(ACCOUNT);
    const e2 = createSyncEngine({ store: fresh, remote: new FakeRemote(), accountId: ACCOUNT.id, marks: marks(fresh), onPageHide: () => () => {} });
    e2.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(e2.status()).toBe("waitingConsent");
    expect(await e2.flush(1_000)).toBe(true);
    e2.stop();
  });
});
