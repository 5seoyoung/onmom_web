import { describe, expect, it } from "vitest";
import { ACCOUNT_FUNCTION, kakaoUnlinkResultOf, requestKakaoUnlink, type FunctionsInvoker } from "./kakaoUnlink";

function invoker(reply: { data: unknown; error: unknown } | "throw" | "hang", seen: unknown[] = []): FunctionsInvoker {
  return {
    invoke: (name, options) => {
      seen.push([name, options.body]);
      if (reply === "throw") return Promise.reject(new Error("network"));
      if (reply === "hang") return new Promise(() => {});
      return Promise.resolve(reply);
    },
  };
}

describe("requestKakaoUnlink", () => {
  it("account 함수에 본문을 보내고 답의 kakao 값을 돌려준다", async () => {
    const seen: unknown[] = [];
    expect(await requestKakaoUnlink(invoker({ data: { ok: true, kakao: "unlinked" }, error: null }, seen), { action: "kakao-unlink-self" })).toBe("unlinked");
    expect(seen).toEqual([[ACCOUNT_FUNCTION, { action: "kakao-unlink-self" }]]);
    for (const k of ["failed", "skipped", "not_kakao"] as const) {
      expect(await requestKakaoUnlink(invoker({ data: { ok: true, kakao: k }, error: null }), { action: "kakao-unlink-self" })).toBe(k);
    }
  });

  it("끊기를 시도했는지 알 수 없으면 unknown — 함수 없음(옛 배포)·오류 응답·연결 실패·시간 초과·클라이언트 없음", async () => {
    const body = { action: "kakao-unlink-admin", target: "x" } as const;
    expect(await requestKakaoUnlink(invoker({ data: null, error: { name: "FunctionsHttpError" } }), body)).toBe("unknown");
    expect(await requestKakaoUnlink(invoker("throw"), body)).toBe("unknown");
    expect(await requestKakaoUnlink(invoker("hang"), body, 5)).toBe("unknown");
    expect(await requestKakaoUnlink(undefined, body)).toBe("unknown");
    expect(kakaoUnlinkResultOf({ kakao: "deleted" })).toBe("unknown");
    expect(kakaoUnlinkResultOf("unlinked")).toBe("unknown");
  });
});
