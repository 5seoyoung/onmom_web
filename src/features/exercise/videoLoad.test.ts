import { describe, expect, it, vi } from "vitest";
import type { FetchVideosOptions, FetchVideosResult } from "@/api/video";
import { COLD_START_NOTICE_MS, COLD_START_TEXT, VIDEO_RETRY_TIMEOUT_MS, fetchVideosWithRetry, shouldRetryVideoFetch } from "./videoLoad";

const ok: FetchVideosResult = { ok: true, videos: [] };
const network: FetchVideosResult = { ok: false, kind: "network", message: "n" };
const server502: FetchVideosResult = { ok: false, kind: "server", message: "s", status: 502 };
const server500NoStatus: FetchVideosResult = { ok: false, kind: "server", message: "s" };
const server404: FetchVideosResult = { ok: false, kind: "server", message: "s", status: 404 };
const notConfigured: FetchVideosResult = { ok: false, kind: "notConfigured", message: "" };

/** 결과를 차례로 돌려주는 가짜 fetchVideos — 호출 인자를 남긴다 */
function sequence(...results: FetchVideosResult[]) {
  const calls: { tag: string; opts: FetchVideosOptions | undefined }[] = [];
  let i = 0;
  const fn = vi.fn(async (tag: string, opts?: FetchVideosOptions) => {
    calls.push({ tag, opts });
    return results[Math.min(i++, results.length - 1)];
  });
  return { fn, calls };
}

describe("콜드스타트 값(05 §0)", () => {
  it("8초 뒤 안내, 재시도 타임아웃 35초, 안내 문구", () => {
    expect(COLD_START_NOTICE_MS).toBe(8_000);
    expect(VIDEO_RETRY_TIMEOUT_MS).toBe(35_000);
    expect(COLD_START_TEXT).toBe("서버를 깨우는 중이에요 — 조금만 기다려 주세요");
  });

  it("안내는 시간을 약속하지 않는다 — 프록시 빌드의 첫 시도(45초) + 재시도(35초)는 05 §0의 '최대 30초'를 넘는다", () => {
    expect(COLD_START_TEXT).not.toMatch(/\d+\s*초/);
    expect(COLD_START_TEXT).not.toContain("최대");
  });
});

describe("shouldRetryVideoFetch — 잠든 서버일 수 있는 실패만", () => {
  it("연결 실패·시간 초과(network), 서버 오류(5xx·상태 없음)는 다시 시도", () => {
    expect(shouldRetryVideoFetch(network)).toBe(true);
    expect(shouldRetryVideoFetch(server502)).toBe(true);
    expect(shouldRetryVideoFetch(server500NoStatus)).toBe(true);
    expect(shouldRetryVideoFetch({ ok: false, kind: "server", message: "s", status: 503 })).toBe(true);
  });

  it("성공·미설정·4xx는 다시 해도 같으므로 하지 않는다", () => {
    expect(shouldRetryVideoFetch(ok)).toBe(false);
    expect(shouldRetryVideoFetch(notConfigured)).toBe(false);
    expect(shouldRetryVideoFetch(server404)).toBe(false);
    expect(shouldRetryVideoFetch({ ok: false, kind: "server", message: "s", status: 400 })).toBe(false);
  });
});

describe("fetchVideosWithRetry — 자동 재시도 1회", () => {
  it("첫 시도가 성공이면 한 번만 부르고 그대로 돌려준다(재시도 알림 없음)", async () => {
    const { fn, calls } = sequence(ok);
    const onRetry = vi.fn();
    const signal = new AbortController().signal;
    expect(await fetchVideosWithRetry(fn, "route_vaginal_delivery", { signal, onRetry })).toBe(ok);
    expect(calls).toEqual([{ tag: "route_vaginal_delivery", opts: { signal } }]);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("시간 초과·연결 실패 뒤 더 긴 타임아웃(35초)으로 한 번 더 — 재시도 시작을 알린다", async () => {
    const { fn, calls } = sequence(network, ok);
    const onRetry = vi.fn();
    expect(await fetchVideosWithRetry(fn, "route_cesarean_section", { onRetry })).toBe(ok);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(calls[0].opts).toEqual({ signal: undefined });
    expect(calls[1].opts).toEqual({ signal: undefined, timeoutMs: VIDEO_RETRY_TIMEOUT_MS });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("함수 프록시의 502(upstream_timeout)도 한 번 더 — 두 번째도 실패면 그 결과(더는 시도 없음)", async () => {
    const { fn } = sequence(server502, server502);
    const result = await fetchVideosWithRetry(fn, "route_cesarean_section");
    expect(result).toBe(server502);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("4xx·미설정은 다시 시도하지 않는다", async () => {
    for (const first of [server404, notConfigured]) {
      const { fn } = sequence(first, ok);
      const onRetry = vi.fn();
      expect(await fetchVideosWithRetry(fn, "route_cesarean_section", { onRetry })).toBe(first);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(onRetry).not.toHaveBeenCalled();
    }
  });

  it("사용자가 화면을 떠나(abort) 끝난 요청은 다시 시도하지 않는다", async () => {
    const controller = new AbortController();
    const fn = vi.fn(async (): Promise<FetchVideosResult> => {
      controller.abort();
      return network;
    });
    const onRetry = vi.fn();
    expect(await fetchVideosWithRetry(fn, "route_cesarean_section", { signal: controller.signal, onRetry })).toBe(network);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("재시도 타임아웃은 바꿀 수 있다", async () => {
    const { fn, calls } = sequence(network, ok);
    await fetchVideosWithRetry(fn, "route_cesarean_section", { retryTimeoutMs: 1_000 });
    expect(calls[1].opts).toEqual({ signal: undefined, timeoutMs: 1_000 });
  });

  it("fetchVideos가 던지면(호출자 버그 등) 그대로 올린다 — 재시도로 감추지 않는다", async () => {
    const fn = vi.fn(async (): Promise<FetchVideosResult> => {
      throw new TypeError("includeTag is required");
    });
    await expect(fetchVideosWithRetry(fn, "")).rejects.toThrow(TypeError);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
