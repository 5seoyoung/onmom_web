// 내 동네 입력 — 글자마다 저장하지 않고 입력이 멈추면 한 번, 칸을 떠나거나 검색하거나 화면을 떠나면(flush) 바로 저장한다.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppStore } from "./appStore";
import { createDraftSaver, DRAFT_SAVE_DELAY_MS } from "./draftSaver";
import { STATE_KEY, createMemoryStorage, createStoragePersistence, type StorageLike } from "./persistence";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("createDraftSaver", () => {
  it("입력이 멈춘 뒤 한 번, 마지막 값으로 저장한다", () => {
    const save = vi.fn();
    const saver = createDraftSaver(save);
    for (const v of ["서", "서울", "서울 노", "서울 노원구"]) {
      saver.change(v);
      vi.advanceTimersByTime(DRAFT_SAVE_DELAY_MS - 1);
    }
    expect(save).not.toHaveBeenCalled();
    expect(saver.pending()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(save.mock.calls).toEqual([["서울 노원구"]]);
    expect(saver.pending()).toBe(false);
  });

  it("flush(칸을 떠남·검색·화면을 떠남)는 기다리지 않고 바로 저장하고, 예약을 지운다", () => {
    const save = vi.fn();
    const saver = createDraftSaver(save);
    saver.change("회기동");
    saver.flush();
    expect(save.mock.calls).toEqual([["회기동"]]);
    vi.advanceTimersByTime(DRAFT_SAVE_DELAY_MS * 2);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("저장할 때는 마지막으로 받은 함수를 쓴다 — 아직 없으면 받을 때까지 입력을 들고 있는다(setSave)", () => {
    const saver = createDraftSaver(null);
    saver.change("노원구");
    vi.advanceTimersByTime(DRAFT_SAVE_DELAY_MS);
    expect(saver.pending()).toBe(true);
    const first = vi.fn();
    const latest = vi.fn();
    saver.setSave(first);
    saver.setSave(latest);
    saver.flush();
    expect(first).not.toHaveBeenCalled();
    expect(latest.mock.calls).toEqual([["노원구"]]);
  });

  it("기다리는 입력이 없으면 flush는 아무것도 하지 않는다(빈 칸으로 지운 것은 저장한다)", () => {
    const save = vi.fn();
    const saver = createDraftSaver(save);
    saver.flush();
    expect(save).not.toHaveBeenCalled();
    saver.change("");
    saver.flush();
    saver.flush();
    expect(save.mock.calls).toEqual([[""]]);
  });
});

describe("스토어와 함께 — 글자마다 상태 전체를 쓰지 않는다", () => {
  /** 상태 저장 횟수를 센다(localStorage 쓰기 = 서버 동기화 예약의 계기) */
  function countingStore() {
    const inner = createMemoryStorage();
    let stateWrites = 0;
    const storage: StorageLike = {
      get length() {
        return inner.length;
      },
      key: (i) => inner.key(i),
      getItem: (k) => inner.getItem(k),
      setItem: (k, v) => {
        if (k === STATE_KEY) stateWrites += 1;
        inner.setItem(k, v);
      },
      removeItem: (k) => inner.removeItem(k),
    };
    const store = createAppStore({ persistence: createStoragePersistence(() => storage), now: () => new Date(), newId: () => "x" });
    store.load();
    store.actions.signIn({ id: "kakao-1", name: null, provider: "kakao" });
    store.actions.completeOnboarding();
    return { store, writes: () => stateWrites };
  }

  it("열 글자를 이어 치면 한 번 저장한다", () => {
    const { store, writes } = countingStore();
    const before = writes();
    const saver = createDraftSaver((value) => store.actions.updateProfile({ neighborhood: value }));
    const typed = "서울 동대문구 회기동";
    for (let i = 1; i <= typed.length; i++) {
      saver.change(typed.slice(0, i));
      vi.advanceTimersByTime(80);
    }
    expect(writes() - before).toBe(0);
    vi.advanceTimersByTime(DRAFT_SAVE_DELAY_MS);
    expect(writes() - before).toBe(1);
    expect(store.getSnapshot().state.profile.neighborhood).toBe(typed);
  });
});

describe("화면이 모아 저장한다(지역 연계·기록)", () => {
  const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

  it("동네 칸은 useDraftField로 묶고, 칸을 떠남·검색에서 바로 저장한다 — 글자마다 updateProfile을 부르지 않는다", () => {
    for (const path of ["../features/region/RegionScreen.tsx", "../features/record/RecordScreen.tsx"]) {
      const source = read(path);
      expect(source, path).toContain("useDraftField(state.profile.neighborhood");
      expect(source, path).toContain("onBlur={neighborhood.flush} onSubmit={neighborhood.flush}");
      expect(source, path).not.toMatch(/(onAddressChange|onNeighborhoodChange)=\{\(?value\)? => actions\.updateProfile/);
      expect(source, path).not.toContain("address={state.profile.neighborhood}");
      expect(source, path).not.toContain("neighborhood={state.profile.neighborhood}");
    }
    // [확인하기]는 기록을 남기기 전에 기다리던 동네 입력을 저장한다
    expect(read("../features/record/RecordScreen.tsx")).toMatch(/function runCheck\(\) \{\n\s+neighborhood\.flush\(\);/);
  });
});
