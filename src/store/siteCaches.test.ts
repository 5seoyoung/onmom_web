// 계정 삭제 때 서비스 워커 캐시 지우기 — 가짜 Cache Storage로 확인한다(브라우저 없이).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createAppStore } from "./appStore";
import { createMemoryStorage, createStoragePersistence } from "./persistence";
import { SW_CACHE_PREFIX, browserCacheStorage, clearServiceWorkerCaches, type CacheStorageLike } from "./siteCaches";

/** 가짜 Cache Storage — 이름 목록만 */
function fakeCaches(names: string[], opts: { failDelete?: string; failKeys?: "reject" | "throw" } = {}) {
  const left = new Set(names);
  const deleted: string[] = [];
  const storage: CacheStorageLike = {
    keys() {
      if (opts.failKeys === "throw") throw new DOMException("blocked", "SecurityError");
      if (opts.failKeys === "reject") return Promise.reject(new DOMException("blocked", "SecurityError"));
      return Promise.resolve([...left]);
    },
    delete(name) {
      if (name === opts.failDelete) return Promise.reject(new Error("busy"));
      deleted.push(name);
      return Promise.resolve(left.delete(name));
    },
  };
  return { storage, left, deleted };
}

const SW_CACHES = ["onmom-2026-09-30-1:static", "onmom-2026-09-30-1:pages", "onmom-2026-09-01-1:pages"];

describe("clearServiceWorkerCaches", () => {
  it("이 앱(sw.js)의 캐시만 지운다 — 같은 origin의 다른 앱 캐시는 둔다", async () => {
    const { storage, left, deleted } = fakeCaches([...SW_CACHES, "other-app-v3", "workbox-precache"]);
    expect(await clearServiceWorkerCaches(storage)).toBe(3);
    expect(deleted.sort()).toEqual([...SW_CACHES].sort());
    expect([...left].sort()).toEqual(["other-app-v3", "workbox-precache"]);
  });

  it("접두는 sw.js의 CACHE_PREFIX와 같고, sw.js의 캐시 이름은 그 접두로 시작한다", () => {
    const sw = readFileSync(fileURLToPath(new URL("../../public/sw.js", import.meta.url)), "utf8");
    expect(/const CACHE_PREFIX = "([^"]*)";/.exec(sw)?.[1]).toBe(SW_CACHE_PREFIX);
    expect(/const CACHE_VERSION = "([^"]*)";/.exec(sw)?.[1].startsWith(SW_CACHE_PREFIX)).toBe(true);
  });

  it("Cache Storage가 없거나 막혀 있으면 아무것도 하지 않는다 — 던지지 않는다", async () => {
    expect(await clearServiceWorkerCaches(null)).toBe(0);
    expect(await clearServiceWorkerCaches(fakeCaches(SW_CACHES, { failKeys: "reject" }).storage)).toBe(0);
    expect(await clearServiceWorkerCaches(fakeCaches(SW_CACHES, { failKeys: "throw" }).storage)).toBe(0);
    // 브라우저 밖(이 시험 — Node에는 caches 전역이 없다)
    expect(browserCacheStorage()).toBeNull();
    await expect(clearServiceWorkerCaches()).resolves.toBe(0);
  });

  it("하나를 못 지워도 나머지는 지운다", async () => {
    const { storage, left } = fakeCaches(SW_CACHES, { failDelete: SW_CACHES[1] });
    expect(await clearServiceWorkerCaches(storage)).toBe(2);
    expect([...left]).toEqual([SW_CACHES[1]]);
  });
});

describe("계정 삭제가 서비스 워커 캐시를 지운다(appStore deleteAccount)", () => {
  function setup(clearSiteCaches: () => unknown) {
    const storage = createMemoryStorage();
    const store = createAppStore({
      persistence: createStoragePersistence(() => storage),
      now: () => new Date("2026-10-01T09:00:00+09:00"),
      newId: () => "x",
      clearSiteCaches,
    });
    store.load();
    return { store, storage };
  }

  it("계정 삭제 때 한 번 — 로그인·로그아웃·계정 전환에서는 지우지 않는다", async () => {
    const { storage: caches, left } = fakeCaches([...SW_CACHES, "other-app-v3"]);
    const clear = vi.fn(() => clearServiceWorkerCaches(caches));
    const { store } = setup(clear);
    store.actions.signIn({ id: "kakao-A", name: null, provider: "kakao" });
    store.actions.completeOnboarding();
    store.actions.signOut();
    store.actions.signIn({ id: "kakao-B", name: null, provider: "kakao" }); // 앞사람 기록을 지우는 전환
    expect(clear).not.toHaveBeenCalled();

    store.actions.deleteAccount();
    expect(clear).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect([...left]).toEqual(["other-app-v3"]));
  });

  it("캐시 지우기가 던지거나 실패해도 계정 삭제를 막지 않는다(기다리지도 않는다)", () => {
    for (const clear of [
      () => {
        throw new Error("sync");
      },
      () => Promise.reject(new Error("async")),
      () => new Promise(() => {}), // 끝나지 않음
    ]) {
      const { store, storage } = setup(clear);
      store.actions.signIn({ id: "kakao-A", name: null, provider: "kakao" });
      store.actions.completeOnboarding();
      expect(() => store.actions.deleteAccount()).not.toThrow();
      expect(store.getSnapshot().account).toBeNull();
      expect(store.getSnapshot().state.hasOnboarded).toBe(false);
      expect(storage.length).toBe(0);
    }
  });
});
