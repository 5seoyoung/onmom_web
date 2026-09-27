import { describe, expect, it } from "vitest";
import { createMemoryStorage, STORAGE_PREFIX } from "@/store/persistence";
import { ANON_PAUSE_KEY, AUTH_FLOW_KEY, AUTH_FLOW_TTL_MS, createAuthFlowStore } from "./authFlow";

const T0 = new Date("2026-09-28T03:00:00.000Z");

describe("로그인 흐름 표시 — 카카오를 다녀오는 동안", () => {
  it("저장·읽기·지우기, 키는 onmom.web. 접두(계정 삭제가 함께 지운다)", () => {
    const memory = createMemoryStorage();
    const flow = createAuthFlowStore(() => memory, () => T0);
    expect(flow.load()).toBeNull();
    flow.save({ kind: "link", guestAccountId: "guest-a", anonUserId: "a", at: T0.toISOString() });
    expect(flow.load()).toEqual({ kind: "link", guestAccountId: "guest-a", anonUserId: "a", at: T0.toISOString() });
    flow.save({ kind: "switch", guestAccountId: "guest-a", anonUserId: "a", at: T0.toISOString() });
    expect(flow.load()?.kind).toBe("switch");
    flow.clear();
    expect(flow.load()).toBeNull();
    expect(AUTH_FLOW_KEY.startsWith(STORAGE_PREFIX) && ANON_PAUSE_KEY.startsWith(STORAGE_PREFIX)).toBe(true);
  });

  it("30분이 지난 표시·미래 시각·망가진 값은 없는 것으로 본다(카카오 화면에서 떠난 흐름이 나중 로그인에 끼어들지 않게)", () => {
    const memory = createMemoryStorage();
    let now = T0;
    const flow = createAuthFlowStore(() => memory, () => now);
    flow.save({ kind: "link", guestAccountId: "guest-a", anonUserId: null, at: T0.toISOString() });
    now = new Date(T0.getTime() + AUTH_FLOW_TTL_MS);
    expect(flow.load()).not.toBeNull();
    now = new Date(T0.getTime() + AUTH_FLOW_TTL_MS + 1);
    expect(flow.load()).toBeNull();

    now = T0;
    flow.save({ kind: "link", guestAccountId: "guest-a", anonUserId: null, at: new Date(T0.getTime() + 60_000).toISOString() });
    expect(flow.load()).toBeNull();
    memory.setItem(AUTH_FLOW_KEY, "{broken");
    expect(flow.load()).toBeNull();
    memory.setItem(AUTH_FLOW_KEY, JSON.stringify({ kind: "switch", guestAccountId: "guest-a", anonUserId: null, at: T0.toISOString() }));
    expect(flow.load()).toBeNull(); // 전환에는 익명 사용자 id가 있어야 한다
  });

  it("익명 로그인 쉬기 — 정한 시간 동안만", () => {
    const memory = createMemoryStorage();
    let now = T0;
    const flow = createAuthFlowStore(() => memory, () => now);
    expect(flow.anonPaused()).toBe(false);
    flow.pauseAnon(60_000);
    expect(flow.anonPaused()).toBe(true);
    now = new Date(T0.getTime() + 60_001);
    expect(flow.anonPaused()).toBe(false);
  });

  it("저장소를 쓸 수 없어도 던지지 않는다", () => {
    const flow = createAuthFlowStore(() => null, () => T0);
    flow.save({ kind: "link", guestAccountId: "guest-a", anonUserId: null, at: T0.toISOString() });
    expect(flow.load()).toBeNull();
    flow.pauseAnon(1_000);
    expect(flow.anonPaused()).toBe(false);
    flow.clear();
  });
});
