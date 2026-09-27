import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createAppStore } from "./appStore";
import { STATE_KEY, createMemoryStorage, createStoragePersistence } from "./persistence";
import { StoreProvider } from "./StoreProvider";
import { useAppStore } from "./useAppStore";

function Probe() {
  const { hydrated, isSignedIn, displayName, state } = useAppStore();
  return createElement("p", null, `${hydrated}|${isSignedIn}|${displayName}|${state.hasOnboarded}`);
}

describe("useAppStore — 서버 렌더링(정적 export)", () => {
  it("저장소를 읽지 않은 초기 스냅샷으로 렌더링한다", () => {
    const storage = createMemoryStorage();
    storage.setItem(STATE_KEY, JSON.stringify({ hasOnboarded: true }));
    let reads = 0;
    const store = createAppStore({
      persistence: createStoragePersistence(() => {
        reads++;
        return storage;
      }),
      now: () => new Date("2026-09-23T00:00:00Z"),
      newId: () => "x",
    });
    const html = renderToString(createElement(StoreProvider, { store }, createElement(Probe)));
    expect(html).toContain("false|false|사용자|false");
    expect(reads).toBe(0);
  });

  it("Provider 없이도(브라우저 싱글턴) 서버에서 window 없이 렌더링된다", () => {
    expect(renderToString(createElement(Probe))).toContain("false|false|사용자|false");
  });
});
