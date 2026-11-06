// AI 답변 동의의 서버 기록(aiConsentRecord.ts) — 동의하면 public.ai_consents에 판·시각·두 동의를 upsert(실패하면 한 번 더),
// 바로 뒤 AI 요청은 그 기록이 끝난 뒤. Supabase 없는 빌드·세션 없음·다른 계정의 세션이면 요청하지 않는다. 철회는 그 행을 지운다.
import { afterEach, describe, expect, it, vi } from "vitest";
import { AI_CONSENT_VERSION } from "../../../supabase/functions/_shared/aiConsent";
import {
  AI_CONSENT_RECORD_RETRY_MS,
  AI_CONSENT_RECORD_TIMEOUT_MS,
  afterAiConsentRecord,
  aiConsentRecordSettled,
  browserAiConsentPorts,
  readAiConsentOnServer,
  recordAiConsent,
  startAiConsentRecord,
  withdrawAiConsent,
  type AiConsentRecordPorts,
  type AiConsentRow,
} from "./aiConsentRecord";

const AT = new Date("2026-10-23T03:04:05.000Z");

/** 가짜 의존성 — 세션·쓰기 결과를 차례로 정한다 */
function ports(over: Partial<AiConsentRecordPorts> = {}) {
  const rows: AiConsentRow[] = [];
  const removed: string[] = [];
  const sleeps: number[] = [];
  const p: AiConsentRecordPorts = {
    usesServer: () => true,
    canRecord: () => true,
    session: async () => ({ userId: "uuid-1", accountId: "guest-uuid-1" }),
    upsert: async (row) => {
      rows.push(row);
    },
    exists: async () => true,
    remove: async (userId) => {
      removed.push(userId);
    },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    ...over,
  };
  return { p, rows, removed, sleeps };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("recordAiConsent — 판·동의 시각을 이 계정의 서버 행으로", () => {
  it("세션 사용자 id로 한 번 upsert — 판은 함수와 같은 값, 시각은 동의를 누른 때", async () => {
    const { p, rows, sleeps } = ports();
    await expect(recordAiConsent("guest-uuid-1", AT, p)).resolves.toBe("recorded");
    expect(rows).toEqual([
      { user_id: "uuid-1", version: AI_CONSENT_VERSION, accepted_at: "2026-10-23T03:04:05.000Z", sensitive_agreed: true, transfer_agreed: true },
    ]);
    expect(sleeps).toEqual([]);
  });

  it("실패하면 한 번만 더 — 두 번째에 되면 recorded, 둘 다 실패면 failed(던지지 않는다)", async () => {
    let calls = 0;
    const flaky = ports({
      upsert: async () => {
        calls++;
        if (calls === 1) throw new Error("offline");
      },
    });
    await expect(recordAiConsent("guest-uuid-1", AT, flaky.p)).resolves.toBe("recorded");
    expect(calls).toBe(2);
    expect(flaky.sleeps).toEqual([AI_CONSENT_RECORD_RETRY_MS]);

    let tries = 0;
    const down = ports({
      upsert: async () => {
        tries++;
        throw new Error("500");
      },
    });
    await expect(recordAiConsent("guest-uuid-1", AT, down.p)).resolves.toBe("failed");
    expect(tries).toBe(2);

    let reads = 0;
    const sessionDown = ports({
      session: async () => {
        reads++;
        throw new Error("refresh failed");
      },
    });
    await expect(recordAiConsent("guest-uuid-1", AT, sessionDown.p)).resolves.toBe("failed");
    expect(reads).toBe(2);
    expect(sessionDown.rows).toEqual([]);
  });

  it("쓸 수 없는 빌드·브라우저(Supabase 없음·저장된 세션 없음)면 아무것도 부르지 않는다", async () => {
    const session = vi.fn(async () => ({ userId: "u", accountId: "guest-u" }));
    const upsert = vi.fn(async () => undefined);
    await expect(recordAiConsent("guest-u", AT, { ...ports().p, canRecord: () => false, session, upsert })).resolves.toBe("skipped");
    await expect(
      recordAiConsent("guest-u", AT, {
        ...ports().p,
        canRecord: () => {
          throw new Error("SecurityError");
        },
        session,
        upsert,
      }),
    ).resolves.toBe("skipped");
    expect(session).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("세션이 없거나 다른 계정의 세션(계정 전환 중)이면 쓰지 않고 다시 하지도 않는다 — 남의 행에 동의를 남기지 않는다", async () => {
    for (const session of [async () => null, async () => ({ userId: "uuid-2", accountId: "kakao-999" }), async () => ({ userId: "uuid-3", accountId: null })]) {
      const { p, rows, sleeps } = ports({ session });
      await expect(recordAiConsent("guest-uuid-1", AT, p)).resolves.toBe("skipped");
      expect(rows).toEqual([]);
      expect(sleeps).toEqual([]);
    }
  });

  it("한 시도가 오래 걸리면 끊고 한 번 더 — 바로 뒤 AI 요청이 오래 기다리지 않게", async () => {
    vi.useFakeTimers();
    let tries = 0;
    const { p } = ports({
      upsert: () => {
        tries++;
        return new Promise<void>(() => {}); // 끝나지 않는 요청
      },
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    });
    let result: string | null = null;
    void recordAiConsent("guest-uuid-1", AT, p).then((r) => (result = r));
    await vi.advanceTimersByTimeAsync(AI_CONSENT_RECORD_TIMEOUT_MS * 2 + AI_CONSENT_RECORD_RETRY_MS);
    expect(result).toBe("failed");
    expect(tries).toBe(2);
  });
});

describe("afterAiConsentRecord — 방금 동의한 계정의 AI 요청은 기록이 끝난 뒤", () => {
  it("진행 중인 기록이 끝나야 요청을 보낸다(결과와 상관없이), 다른 계정·기록 없음은 바로", async () => {
    let finish: () => void = () => {};
    let upsertStarted: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      upsertStarted = resolve;
    });
    const { p } = ports({
      upsert: () =>
        new Promise<void>((resolve) => {
          finish = resolve;
          upsertStarted();
        }),
    });
    const record = startAiConsentRecord("guest-uuid-1", AT, p);
    const complete = vi.fn(async (q: string) => `answer:${q}`);
    const pendingAnswer = afterAiConsentRecord("guest-uuid-1", complete)("q1");
    await started; // 쓰기가 서버에 가 있는 동안
    expect(complete).not.toHaveBeenCalled();
    // 다른 계정·로그인 전의 요청은 기다리지 않는다
    await expect(afterAiConsentRecord("kakao-1", complete)("q2")).resolves.toBe("answer:q2");
    await expect(afterAiConsentRecord(null, complete)("q3")).resolves.toBe("answer:q3");
    finish();
    await expect(record).resolves.toBe("recorded");
    await expect(pendingAnswer).resolves.toBe("answer:q1");
    expect(complete.mock.calls.map((c) => c[0])).toEqual(["q2", "q3", "q1"]);
    // 끝난 기록은 지워져 다음 요청은 바로 간다
    await expect(aiConsentRecordSettled("guest-uuid-1")).resolves.toBeUndefined();
  });

  it("기록이 실패해도 요청은 나간다(서버가 403이면 화면이 동의 카드를 다시 띄운다)", async () => {
    const { p } = ports({
      upsert: async () => {
        throw new Error("500");
      },
    });
    const record = startAiConsentRecord("guest-uuid-1", AT, p);
    const complete = vi.fn(async () => "ok");
    await expect(afterAiConsentRecord("guest-uuid-1", complete)()).resolves.toBe("ok");
    await expect(record).resolves.toBe("failed");
  });
});

describe("withdrawAiConsent — 철회는 이 계정의 서버 행을 지운다", () => {
  it("세션 사용자 id의 행을 한 번 지운다 → withdrawn", async () => {
    const { p, removed, sleeps } = ports();
    await expect(withdrawAiConsent("guest-uuid-1", p)).resolves.toBe("withdrawn");
    expect(removed).toEqual(["uuid-1"]);
    expect(sleeps).toEqual([]);
  });

  it("실패하면 한 번만 더 — 둘 다 실패면 failed(던지지 않는다)", async () => {
    let tries = 0;
    const flaky = ports({
      remove: async () => {
        tries += 1;
        if (tries === 1) throw new Error("503");
      },
    });
    await expect(withdrawAiConsent("guest-uuid-1", flaky.p)).resolves.toBe("withdrawn");
    expect(tries).toBe(2);
    expect(flaky.sleeps).toEqual([AI_CONSENT_RECORD_RETRY_MS]);
    tries = 0;
    const down = ports({
      remove: async () => {
        tries += 1;
        throw new Error("offline");
      },
    });
    await expect(withdrawAiConsent("guest-uuid-1", down.p)).resolves.toBe("failed");
    expect(tries).toBe(2);
  });

  it("세션이 없거나 다른 계정의 세션이면 지우지 않고 failed — 남의 행을 지우지 않고, 철회된 것처럼 보이지 않게", async () => {
    const remove = vi.fn(async () => undefined);
    await expect(withdrawAiConsent("guest-uuid-1", { ...ports().p, canRecord: () => false, remove })).resolves.toBe("failed");
    await expect(withdrawAiConsent("guest-uuid-1", { ...ports().p, session: async () => null, remove })).resolves.toBe("failed");
    await expect(withdrawAiConsent("kakao-other", { ...ports().p, remove })).resolves.toBe("failed");
    expect(remove).not.toHaveBeenCalled();
  });

  it("서버를 쓰지 않는 빌드는 지울 서버 행이 없다 → withdrawn, 요청 없음", async () => {
    const remove = vi.fn(async () => undefined);
    await expect(withdrawAiConsent("guest-uuid-1", { ...ports().p, usesServer: () => false, canRecord: () => false, remove })).resolves.toBe("withdrawn");
    expect(remove).not.toHaveBeenCalled();
  });

  it("진행 중인 동의 기록이 끝난 뒤에 지운다 — 늦게 닿은 upsert가 철회를 되살리지 않게", async () => {
    const order: string[] = [];
    let finish: () => void = () => {};
    let started: () => void = () => {};
    const upsertStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const { p } = ports({
      upsert: () =>
        new Promise<void>((resolve) => {
          finish = () => {
            order.push("upsert");
            resolve();
          };
          started();
        }),
      remove: async () => {
        order.push("remove");
      },
    });
    const record = startAiConsentRecord("guest-uuid-1", AT, p);
    const withdrawn = withdrawAiConsent("guest-uuid-1", p);
    await upsertStarted; // 쓰기가 서버에 가 있는 동안
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(order).toEqual([]);
    finish();
    await record;
    await expect(withdrawn).resolves.toBe("withdrawn");
    expect(order).toEqual(["upsert", "remove"]);
  });
});

describe("readAiConsentOnServer — 설정의 철회 행이 다른 기기에서 한 동의도 찾는다", () => {
  it("이 계정의 세션이면 서버 행이 있는지 묻는다", async () => {
    const exists = vi.fn(async () => true);
    await expect(readAiConsentOnServer("guest-uuid-1", { ...ports().p, exists })).resolves.toBe(true);
    expect(exists).toHaveBeenCalledWith("uuid-1");
    await expect(readAiConsentOnServer("guest-uuid-1", { ...ports().p, exists: async () => false })).resolves.toBe(false);
  });

  it("쓸 수 없는 빌드·세션 없음·다른 계정·읽기 실패면 null(모른다) — 던지지 않는다", async () => {
    const exists = vi.fn(async () => true);
    await expect(readAiConsentOnServer("guest-uuid-1", { ...ports().p, canRecord: () => false, exists })).resolves.toBeNull();
    await expect(readAiConsentOnServer("guest-uuid-1", { ...ports().p, session: async () => null, exists })).resolves.toBeNull();
    await expect(readAiConsentOnServer("kakao-other", { ...ports().p, exists })).resolves.toBeNull();
    expect(exists).not.toHaveBeenCalled();
    await expect(
      readAiConsentOnServer("guest-uuid-1", {
        ...ports().p,
        exists: async () => {
          throw new Error("500");
        },
      }),
    ).resolves.toBeNull();
  });
});

describe("브라우저 기본값 — Supabase가 없는 빌드(브라우저 전용)는 네트워크 없이 건너뛴다", () => {
  it("canRecord는 설정·저장된 세션만 본다(이 테스트 빌드는 Supabase 없음) → skipped, fetch 없음", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(browserAiConsentPorts.canRecord()).toBe(false);
    await expect(recordAiConsent("guest-uuid-1", AT)).resolves.toBe("skipped");
    await expect(startAiConsentRecord("guest-uuid-1", AT)).resolves.toBe("skipped");
    await expect(readAiConsentOnServer("guest-uuid-1")).resolves.toBeNull();
    await expect(withdrawAiConsent("guest-uuid-1")).resolves.toBe("withdrawn");
    expect(fetch).not.toHaveBeenCalled();
  });
});
