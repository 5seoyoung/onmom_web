// 이 계정의 서버 세션 판단 — 설정 > 알림이 토글을 보일지(서버 세션 없는 게스트에게는 켤 수 없는 까닭을 보인다).
import { describe, expect, it, vi } from "vitest";
import { accountFromSessionUser } from "./kakaoAccount";
import { SESSION_READ_RETRY_DELAYS_MS, readSessionWithRetry, serverSessionStatus, type ServerSessionInput, type SessionReadAttempt } from "./serverSession";

const GUEST = "guest-11111111-1111-4111-8111-111111111111";
const base: ServerSessionInput = { configured: true, accountId: GUEST, storedSession: true, session: { accountId: GUEST } };

describe("serverSessionStatus", () => {
  it("설정 없는 빌드·로그아웃은 none(요청할 것도 없다)", () => {
    expect(serverSessionStatus({ ...base, configured: false })).toBe("none");
    expect(serverSessionStatus({ ...base, accountId: null })).toBe("none");
  });

  it("익명 가입이 안 된 게스트(저장된 세션 없음 — 이 브라우저 전용)는 none", () => {
    expect(serverSessionStatus({ ...base, storedSession: false, session: undefined })).toBe("none");
  });

  it("저장된 세션이 있으면 읽을 때까지(또는 읽지 못해 다시 읽는 동안) checking — 확인되기 전에는 토글을 잠근다", () => {
    expect(serverSessionStatus({ ...base, session: undefined })).toBe("checking");
    expect(serverSessionStatus({ ...base, session: "error" })).toBe("checking");
  });

  it("다시 읽어도 끝내 읽지 못하면(unavailable) none — checking으로 영영 남지 않는다", () => {
    expect(serverSessionStatus({ ...base, session: "unavailable" })).toBe("none");
  });

  it("세션 사용자가 이 계정이면 server, 세션이 없거나 다른 계정이면 none", () => {
    expect(serverSessionStatus(base)).toBe("server");
    expect(serverSessionStatus({ ...base, session: null })).toBe("none");
    expect(serverSessionStatus({ ...base, session: { accountId: "kakao-42" } })).toBe("none");
    expect(serverSessionStatus({ ...base, session: { accountId: null } })).toBe("none");
  });

  it("세션 사용자 → 앱 계정은 동기화와 같은 규칙(익명 = guest-<id>, 카카오 identity = kakao-<회원번호>)", () => {
    const anon = accountFromSessionUser({ id: "11111111-1111-4111-8111-111111111111", is_anonymous: true, identities: [] });
    expect(serverSessionStatus({ ...base, session: { accountId: anon?.id ?? null } })).toBe("server");
    const kakao = accountFromSessionUser({
      id: "22222222-2222-4222-8222-222222222222",
      is_anonymous: true, // 카카오 이메일이 확인되지 않으면 연결 뒤에도 익명으로 남을 수 있다 — 그래도 카카오 계정
      identities: [{ provider: "kakao", identity_data: { provider_id: "42" } }],
    });
    expect(serverSessionStatus({ ...base, accountId: "kakao-42", session: { accountId: kakao?.id ?? null } })).toBe("server");
  });
});

describe("readSessionWithRetry — 세션을 읽지 못하면 잠시 뒤 몇 번 더, 그래도 못 읽으면 unavailable", () => {
  /** 차례로 돌려줄 값 — 다 쓰면 마지막 값 */
  function reads(...results: (SessionReadAttempt | Error)[]) {
    let i = 0;
    return vi.fn(async (): Promise<SessionReadAttempt> => {
      const r = results[Math.min(i++, results.length - 1)];
      if (r instanceof Error) throw r;
      return r;
    });
  }
  const waits = () => vi.fn<(ms: number) => Promise<boolean>>(async () => true);

  it("한 번에 읽으면 기다리지 않는다", async () => {
    const wait = waits();
    expect(await readSessionWithRetry(reads({ accountId: GUEST }), wait)).toEqual({ accountId: GUEST });
    expect(await readSessionWithRetry(reads(null), wait)).toBeNull();
    expect(wait).not.toHaveBeenCalled();
  });

  it("읽지 못했다가(오프라인·갱신 실패·예외) 다시 읽어 되면 그 값", async () => {
    const read = reads("error", new Error("network"), { accountId: GUEST });
    const wait = waits();
    expect(await readSessionWithRetry(read, wait)).toEqual({ accountId: GUEST });
    expect(read).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls.map(([ms]) => ms)).toEqual(SESSION_READ_RETRY_DELAYS_MS.slice(0, 2));
  });

  it("정해진 만큼만 다시 읽고 끝내 못 읽으면 unavailable(→ none)", async () => {
    const read = reads("error");
    const wait = waits();
    const result = await readSessionWithRetry(read, wait);
    expect(result).toBe("unavailable");
    expect(serverSessionStatus({ ...base, session: result })).toBe("none");
    expect(read).toHaveBeenCalledTimes(SESSION_READ_RETRY_DELAYS_MS.length + 1);
    expect(wait.mock.calls.map(([ms]) => ms)).toEqual([...SESSION_READ_RETRY_DELAYS_MS]);
  });

  it("기다리는 중에 그만두면(화면을 떠남·계정이 바뀜) 더 읽지 않는다", async () => {
    const read = reads("error", { accountId: GUEST });
    expect(await readSessionWithRetry(read, async () => false)).toBe("unavailable");
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("실제 타이머로도 간격을 지킨다(가짜 시계)", async () => {
    vi.useFakeTimers();
    try {
      const read = reads("error", "error", { accountId: GUEST });
      const sleep = (ms: number) => new Promise<boolean>((resolve) => setTimeout(() => resolve(true), ms));
      const done = readSessionWithRetry(read, sleep);
      await vi.advanceTimersByTimeAsync(SESSION_READ_RETRY_DELAYS_MS[0] - 1);
      expect(read).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(read).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(SESSION_READ_RETRY_DELAYS_MS[1]);
      expect(await done).toEqual({ accountId: GUEST });
    } finally {
      vi.useRealTimers();
    }
  });
});
