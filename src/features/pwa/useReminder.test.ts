// 설정 > 알림 토글이 실제 상태를 읽는 절차 — 어디서 실패해도 끝나야 한다(끝나지 않으면 토글이 영영 잠긴다).
import { describe, expect, it, vi } from "vitest";
import { urlBase64ToUint8Array } from "./reminderModel";
import { probeReminderSubscribed, type ReminderProbeDeps } from "./useReminder";

// RFC 8291 부록 A의 서버 공개 키 — 모양 검사용(실제 키가 아니다)
const KEY = urlBase64ToUint8Array("BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8");
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/test-endpoint";

function deps(over: Partial<ReminderProbeDeps> = {}): ReminderProbeDeps {
  return {
    accountId: "kakao-1",
    applicationServerKey: KEY,
    settle: vi.fn(async () => {}),
    currentSubscription: async () => ({ endpoint: ENDPOINT, options: { applicationServerKey: KEY.slice().buffer } }),
    rowExists: async () => true,
    remember: vi.fn(),
    ...over,
  };
}

describe("probeReminderSubscribed", () => {
  it("지금 빌드의 키로 만든 구독 + 서버 행 → 켜짐, 켜 둔 표시를 그 끝점으로 맞춘다(맞추기를 먼저 기다린다)", async () => {
    const d = deps();
    expect(await probeReminderSubscribed(d, () => false)).toBe(true);
    expect(d.settle).toHaveBeenCalledWith("kakao-1");
    expect(d.remember).toHaveBeenCalledWith("kakao-1", ENDPOINT);
  });

  it("서버 행이 없거나 구독이 없으면 꺼짐 · 서버 행을 확인하지 못했으면(null) 브라우저 구독대로", async () => {
    expect(await probeReminderSubscribed(deps({ rowExists: async () => false }), () => false)).toBe(false);
    expect(await probeReminderSubscribed(deps({ currentSubscription: async () => null }), () => false)).toBe(false);
    const unknown = deps({ rowExists: async () => null });
    expect(await probeReminderSubscribed(unknown, () => false)).toBe(true);
    expect(unknown.remember).not.toHaveBeenCalled();
  });

  it("어디서 실패해도 던지지 않고 꺼짐으로 끝난다(맞추기·워커·서버 행 읽기)", async () => {
    const boom = () => Promise.reject(new Error("boom"));
    for (const over of [{ settle: boom }, { currentSubscription: boom }, { rowExists: boom }] as Partial<ReminderProbeDeps>[]) {
      const d = deps(over);
      await expect(probeReminderSubscribed(d, () => false)).resolves.toBe(false);
      expect(d.remember).not.toHaveBeenCalled();
    }
  });

  it("그만 읽게 됐으면(계정이 바뀜·화면을 떠남) 켜 둔 표시를 남기지 않는다", async () => {
    const d = deps();
    await probeReminderSubscribed(d, () => true);
    expect(d.remember).not.toHaveBeenCalled();
  });

  it("로그인 계정이 없으면 맞추기를 기다리지 않는다", async () => {
    const d = deps({ accountId: null });
    expect(await probeReminderSubscribed(d, () => false)).toBe(true);
    expect(d.settle).not.toHaveBeenCalled();
    expect(d.remember).not.toHaveBeenCalled();
  });
});
