// 앱을 열 때 맞추기는 계정마다 한 번 — 같은 페이지에서 계정이 바뀌면(로그아웃 뒤 다른 계정·게스트 → 카카오) 새 계정도 맞춘다.
import { describe, expect, it, vi } from "vitest";
import { oncePerAccount, reconcileReminderOnce } from "./reminderActions";

describe("oncePerAccount — 계정마다 한 번", () => {
  it("같은 계정은 처음 시작한 약속을 돌려주고, 다른 계정은 따로 한 번 돈다", async () => {
    const run = vi.fn<(accountId: string) => Promise<void>>(async () => {});
    const once = oncePerAccount(run);
    const a1 = once("kakao-1");
    const a2 = once("kakao-1");
    expect(a2).toBe(a1);
    expect(run).toHaveBeenCalledTimes(1);

    const b = once("guest-2"); // 같은 페이지에서 계정이 바뀌었다
    expect(b).not.toBe(a1);
    expect(run.mock.calls.map(([id]) => id)).toEqual(["kakao-1", "guest-2"]);

    // 앞 계정으로 돌아와도 다시 돌지 않는다(페이지마다 한 번)
    expect(once("kakao-1")).toBe(a1);
    expect(run).toHaveBeenCalledTimes(2);
    await Promise.all([a1, b]);
  });

  it("앞 계정의 맞추기가 끝나지 않았어도 새 계정은 기다리지 않고 따로 돈다", async () => {
    let release: () => void = () => {};
    const run = vi.fn((accountId: string) => (accountId === "kakao-1" ? new Promise<void>((r) => (release = r)) : Promise.resolve()));
    const once = oncePerAccount(run);
    const slow = once("kakao-1");
    await expect(once("kakao-2")).resolves.toBeUndefined();
    release();
    await slow;
  });
});

describe("reconcileReminderOnce", () => {
  it("계정이 다르면 같은 약속을 돌려주지 않는다(설정이 없는 이 시험 빌드에서는 요청 없이 끝난다)", async () => {
    const a = reconcileReminderOnce("kakao-1");
    expect(reconcileReminderOnce("kakao-1")).toBe(a);
    const b = reconcileReminderOnce("kakao-2");
    expect(b).not.toBe(a);
    await expect(Promise.all([a, b])).resolves.toEqual([undefined, undefined]);
  });
});
