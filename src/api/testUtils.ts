// 테스트 공용 — fetch 대역. (vitest 전용, 앱 코드에서 import하지 않는다)
import { vi } from "vitest";
import type { BackendConfig } from "./http";

export const testConfig: BackendConfig = {
  videoURL: "https://video.onmom.test",
  llmURL: "https://llm.onmom.test",
  accountURL: "https://account.onmom.test",
  appKey: "test-app-key",
};

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** 응답을 주지 않고 signal이 끊길 때만 실제 fetch처럼 AbortError로 끝나는 fetch */
export function hangingFetch() {
  return vi.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        const abort = () => reject(new DOMException("The operation was aborted.", "AbortError"));
        if (init?.signal?.aborted) abort();
        else init?.signal?.addEventListener("abort", abort);
      }),
  );
}

export function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** 마지막 fetch 호출의 URL·init */
export function lastCall(fn: ReturnType<typeof vi.fn>): { url: string; init: RequestInit; headers: Headers } {
  const [url, init] = fn.mock.calls.at(-1) as [string, RequestInit];
  return { url, init, headers: new Headers(init.headers) };
}
