import { afterEach, describe, expect, it, vi } from "vitest";
import { isOwnBackendUrl, joinBackendUrl, requestJson } from "./http";
import { hangingFetch, jsonResponse, lastCall, stubFetch, testConfig } from "./testUtils";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("isOwnBackendUrl", () => {
  it("온맘 백엔드 origin만 참", () => {
    expect(isOwnBackendUrl("https://video.onmom.test/videos?x=1", testConfig)).toBe(true);
    expect(isOwnBackendUrl("https://llm.onmom.test/chat", testConfig)).toBe(true);
    expect(isOwnBackendUrl("https://account.onmom.test/me/state", testConfig)).toBe(true);
  });

  it("제3자·다른 포트·다른 스킴·하위 도메인 흉내는 거짓", () => {
    expect(isOwnBackendUrl("https://dapi.kakao.com/v2/local/search/keyword.json", testConfig)).toBe(false);
    expect(isOwnBackendUrl("https://video.onmom.test:8443/videos", testConfig)).toBe(false);
    expect(isOwnBackendUrl("http://video.onmom.test/videos", testConfig)).toBe(false);
    expect(isOwnBackendUrl("https://video.onmom.test.evil.example/videos", testConfig)).toBe(false);
    expect(isOwnBackendUrl("not a url", testConfig)).toBe(false);
  });

  it("비어 있는 설정은 어떤 URL과도 맞지 않는다", () => {
    const empty = { ...testConfig, videoURL: null, llmURL: null, accountURL: null, appKey: "k" };
    expect(isOwnBackendUrl("https://video.onmom.test/videos", empty)).toBe(false);
  });

  it("Supabase 함수 주소는 온맘 백엔드로 보지 않는다(x-onmom-key를 붙이지 않는다)", () => {
    const cfg = { ...testConfig, functionsURL: "https://proj.supabase.test/functions/v1", supabaseKey: "sb_publishable_x" };
    expect(isOwnBackendUrl("https://proj.supabase.test/functions/v1/videos", cfg)).toBe(false);
  });
});

describe("joinBackendUrl", () => {
  it("base 경로 뒤에 붙인다", () => {
    expect(joinBackendUrl("https://x.test", "videos")?.toString()).toBe("https://x.test/videos");
    expect(joinBackendUrl("https://x.test/api/", "videos")?.toString()).toBe("https://x.test/api/videos");
  });

  it("비었거나 URL이 아니면 null", () => {
    expect(joinBackendUrl(null, "videos")).toBeNull();
    expect(joinBackendUrl("hackathon-video-api.onrender.com", "videos")).toBeNull();
    expect(joinBackendUrl("javascript:alert(1)", "videos")).toBeNull();
  });
});

describe("requestJson", () => {
  it("x-onmom-key는 온맘 origin에만 붙는다", async () => {
    const fetch = stubFetch(async () => jsonResponse(200, {}));

    await requestJson("https://video.onmom.test/videos", { timeoutMs: 1000, config: testConfig });
    expect(lastCall(fetch).headers.get("x-onmom-key")).toBe("test-app-key");

    await requestJson("https://dapi.kakao.com/v2/maps/whatever", { timeoutMs: 1000, config: testConfig });
    expect(lastCall(fetch).headers.has("x-onmom-key")).toBe(false);
  });

  it("앱 키가 비어 있으면 헤더를 붙이지 않는다(단순 요청 유지)", async () => {
    const fetch = stubFetch(async () => jsonResponse(200, {}));
    await requestJson("https://video.onmom.test/videos", { timeoutMs: 1000, config: { ...testConfig, appKey: null } });
    expect(lastCall(fetch).headers.has("x-onmom-key")).toBe(false);
  });

  it("쿠키를 보내지 않는다", async () => {
    const fetch = stubFetch(async () => jsonResponse(200, {}));
    await requestJson("https://video.onmom.test/videos", { timeoutMs: 1000, config: testConfig });
    expect(lastCall(fetch).init.credentials).toBe("omit");
  });

  it("body는 JSON으로 보내고 content-type을 붙인다", async () => {
    const fetch = stubFetch(async () => jsonResponse(200, { ok: 1 }));
    const res = await requestJson("https://llm.onmom.test/chat", {
      method: "POST",
      body: { a: 1 },
      timeoutMs: 1000,
      config: testConfig,
    });
    const { init, headers } = lastCall(fetch);
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"a":1}');
    expect(headers.get("content-type")).toBe("application/json");
    expect(res).toEqual({ ok: true, status: 200, data: { ok: 1 } });
  });

  it("허용되지 않은 상태 코드 → status", async () => {
    stubFetch(async () => jsonResponse(503, { detail: "down" }));
    const res = await requestJson("https://video.onmom.test/videos", { timeoutMs: 1000, config: testConfig });
    expect(res).toEqual({ ok: false, kind: "status", status: 503 });
  });

  it("acceptStatus로 성공 범위를 좁힐 수 있다", async () => {
    stubFetch(async () => jsonResponse(201, {}));
    const res = await requestJson("https://video.onmom.test/videos", {
      timeoutMs: 1000,
      config: testConfig,
      acceptStatus: (s) => s === 200,
    });
    expect(res).toEqual({ ok: false, kind: "status", status: 201 });
  });

  it("fetch 자체가 실패(오프라인·CORS 차단) → network/failed", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    const res = await requestJson("https://video.onmom.test/videos", { timeoutMs: 1000, config: testConfig });
    expect(res).toEqual({ ok: false, kind: "network", reason: "failed" });
  });

  it("JSON이 아닌 본문 → network/badBody", async () => {
    stubFetch(async () => new Response("<html>502</html>", { status: 200 }));
    const res = await requestJson("https://video.onmom.test/videos", { timeoutMs: 1000, config: testConfig });
    expect(res).toEqual({ ok: false, kind: "network", reason: "badBody" });
  });

  it("타임아웃이 지나면 요청을 끊고 network/timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", hangingFetch());
    let settled = false;
    const p = requestJson("https://video.onmom.test/videos", { timeoutMs: 5000, config: testConfig }).finally(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(4999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await p).toEqual({ ok: false, kind: "network", reason: "timeout" });
  });

  it("호출자가 취소하면 network/aborted", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const ac = new AbortController();
    const p = requestJson("https://video.onmom.test/videos", { timeoutMs: 5000, signal: ac.signal, config: testConfig });
    ac.abort();
    expect(await p).toEqual({ ok: false, kind: "network", reason: "aborted" });
  });

  it("이미 취소된 signal이면 바로 aborted", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const ac = new AbortController();
    ac.abort();
    const res = await requestJson("https://video.onmom.test/videos", { timeoutMs: 5000, signal: ac.signal, config: testConfig });
    expect(res).toEqual({ ok: false, kind: "network", reason: "aborted" });
  });
});
