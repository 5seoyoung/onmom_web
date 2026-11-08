// 삭제 표시의 따로 둔 사본(persistence DELETED_KEY) — 쓰기·지우기·여러 탭 비교 값·계정 삭제.
import { describe, expect, it } from "vitest";
import { initialState } from "./defaults";
import { DELETED_KEY, STATE_KEY, STORAGE_PREFIX, createMemoryStorage, createStoragePersistence } from "./persistence";
import { withTombstone } from "./tombstones";

const AT = "2026-11-08T01:00:00.000Z";

describe("삭제 표시 사본", () => {
  it("지운 기록이 있으면 상태와 함께 쓰고, 없으면 키를 두지 않는다", () => {
    const storage = createMemoryStorage();
    const p = createStoragePersistence(() => storage);
    const deleted = withTombstone(initialState().deleted, "moodChecks", "m", AT);
    expect(p.saveState({ ...initialState(), deleted })).toBe(true);
    expect(JSON.parse(storage.getItem(DELETED_KEY)!)).toEqual(deleted);
    expect(JSON.parse(storage.getItem(STATE_KEY)!).deleted).toEqual(deleted);
    expect(p.loadDeleted!()).toEqual(deleted);

    p.saveState(initialState());
    expect(storage.getItem(DELETED_KEY)).toBeNull();
    expect(p.loadDeleted!()).toBeNull();
  });

  it("deleted 칸이 없는 상태(예전 형식을 그대로 넘김)도 저장한다 — 사본은 두지 않는다", () => {
    const storage = createMemoryStorage();
    const p = createStoragePersistence(() => storage);
    const old = { ...initialState() } as Partial<ReturnType<typeof initialState>>;
    delete old.deleted;
    expect(p.saveState(old as ReturnType<typeof initialState>)).toBe(true);
    expect(storage.getItem(DELETED_KEY)).toBeNull();
  });

  it("여러 탭 비교 값에 사본도 들어간다 — 다른 탭이 지운 것도 바뀐 것", () => {
    const storage = createMemoryStorage();
    const p = createStoragePersistence(() => storage);
    p.saveState(initialState());
    const before = p.stateToken!();
    storage.setItem(DELETED_KEY, "{}");
    expect(p.stateToken!()).not.toBe(before);
  });

  it("onmom.web. 접두 — 계정 삭제가 함께 지운다", () => {
    expect(DELETED_KEY.startsWith(STORAGE_PREFIX)).toBe(true);
    const storage = createMemoryStorage();
    const p = createStoragePersistence(() => storage);
    p.saveState({ ...initialState(), deleted: withTombstone(initialState().deleted, "symptomHistory", "x", AT) });
    p.eraseAll();
    expect(storage.getItem(DELETED_KEY)).toBeNull();
  });
});
