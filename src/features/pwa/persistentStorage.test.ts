// 저장소 지속 요청 — 가짜 navigator.storage로. 우리 화면 없음·던지지 않음·네트워크 없음·한 번만.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { requestPersistentStorage, type StorageManagerLike } from "./persistentStorage";

function fakeStorage(state: { persisted: boolean; grant: boolean }) {
  const calls = { persisted: 0, persist: 0 };
  const storage: StorageManagerLike = {
    persisted: async () => (calls.persisted++, state.persisted),
    persist: async () => (calls.persist++, state.grant),
  };
  return { storage, calls };
}

describe("requestPersistentStorage", () => {
  it("아직 지속이 아니면 persist()를 한 번 부르고 결과를 돌려준다", async () => {
    const granted = fakeStorage({ persisted: false, grant: true });
    expect(await requestPersistentStorage(granted.storage)).toBe("granted");
    expect(granted.calls).toEqual({ persisted: 1, persist: 1 });

    const denied = fakeStorage({ persisted: false, grant: false });
    expect(await requestPersistentStorage(denied.storage)).toBe("denied");
    expect(denied.calls).toEqual({ persisted: 1, persist: 1 });
  });

  it("이미 지속이면 persist()를 부르지 않는다", async () => {
    const f = fakeStorage({ persisted: true, grant: true });
    expect(await requestPersistentStorage(f.storage)).toBe("already");
    expect(f.calls).toEqual({ persisted: 1, persist: 0 });
  });

  it("API가 없으면 아무것도 하지 않는다(서버 렌더링·옛 브라우저)", async () => {
    expect(await requestPersistentStorage(undefined)).toBe("unsupported");
    expect(await requestPersistentStorage(null)).toBe("unsupported");
    expect(await requestPersistentStorage({})).toBe("unsupported");
    let persisted = 0;
    expect(await requestPersistentStorage({ persisted: async () => (persisted++, false) })).toBe("unsupported");
    expect(persisted).toBe(0);
  });

  it("어느 단계에서 실패해도 던지지 않는다", async () => {
    const boom = async () => {
      throw new Error("SecurityError");
    };
    expect(await requestPersistentStorage({ persisted: boom, persist: async () => true })).toBe("failed");
    expect(await requestPersistentStorage({ persisted: async () => false, persist: boom })).toBe("failed");
    const syncThrow = () => {
      throw new Error("sync");
    };
    expect(await requestPersistentStorage({ persisted: syncThrow as unknown as () => Promise<boolean>, persist: async () => true })).toBe("failed");
  });
});

describe("requestPersistentStorageOnce", () => {
  it("여러 번 불러도 한 번만 요청하고, 저장소를 읽다 던져도 실패를 삼킨다", async () => {
    vi.resetModules();
    const { requestPersistentStorageOnce } = await import("./persistentStorage");
    const f = fakeStorage({ persisted: false, grant: true });
    const getStorage = vi.fn(() => f.storage);
    const [a, b] = await Promise.all([requestPersistentStorageOnce(getStorage), requestPersistentStorageOnce(getStorage)]);
    expect([a, b]).toEqual(["granted", "granted"]);
    expect(await requestPersistentStorageOnce(getStorage)).toBe("granted");
    expect(getStorage).toHaveBeenCalledTimes(1);
    expect(f.calls).toEqual({ persisted: 1, persist: 1 });

    vi.resetModules();
    const fresh = await import("./persistentStorage");
    await expect(
      fresh.requestPersistentStorageOnce(() => {
        throw new Error("navigator.storage getter");
      }),
    ).resolves.toBe("unsupported");
  });

  it("navigator.storage가 없는 곳(Node·서버 렌더링)에서는 기본값으로 아무것도 하지 않는다", async () => {
    vi.resetModules();
    const { requestPersistentStorageOnce } = await import("./persistentStorage");
    expect(typeof navigator === "undefined" ? undefined : navigator.storage).toBeUndefined();
    await expect(requestPersistentStorageOnce()).resolves.toBe("unsupported");
  });

  it("모듈은 네트워크를 쓰지 않고 우리 화면을 띄우지 않는다 · PwaClient가 앱을 열 때 한 번 부른다", () => {
    const src = readFileSync(fileURLToPath(new URL("./persistentStorage.ts", import.meta.url)), "utf8");
    const code = src.replace(/^\s*\/\/[^\n]*/gm, "");
    expect(code).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon|supabase|alert\(|confirm\(|window\.open/);
    const client = readFileSync(fileURLToPath(new URL("./PwaClient.tsx", import.meta.url)), "utf8");
    expect(client).toContain("void requestPersistentStorageOnce();");
  });
});
