import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchVideos, parseVideoResponse, VIDEO_MESSAGES } from "./video";
import { hangingFetch, jsonResponse, lastCall, stubFetch, supabaseTestConfig, testConfig } from "./testUtils";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const serverVideo = {
  video_id: "vd_kegel_basic",
  title: "케겔 운동 기초",
  url: "https://www.youtube.com/watch?v=abc",
  description: "골반저근 수축·이완 기본 동작",
  tags: ["route_vaginal_delivery", "stage_pelvic_floor", "kegel"],
};

describe("문구는 VideoDBClient.swift:39-41 원문", () => {
  it("세 가지", () => {
    expect(VIDEO_MESSAGES).toEqual({
      notConfigured: "운동 영상 추천은 준비 중이에요. 곧 만나보실 수 있어요.",
      server: "영상을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
      network: "네트워크에 연결할 수 없어요. 연결 상태를 확인해 주세요.",
    });
  });
});

describe("fetchVideos", () => {
  it("videoURL이 비면 notConfigured — 요청하지 않는다", async () => {
    const fetch = stubFetch(async () => jsonResponse(200, { count: 0, videos: [] }));
    const res = await fetchVideos("route_vaginal_delivery", { config: { ...testConfig, videoURL: null } });
    expect(res).toMatchObject({ ok: false, kind: "notConfigured", message: VIDEO_MESSAGES.notConfigured });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("GET /videos?include=<태그>&limit=500, Accept·x-onmom-key", async () => {
    const fetch = stubFetch(async () => jsonResponse(200, { count: 1, videos: [serverVideo] }));
    const res = await fetchVideos("route_cesarean_section", { config: testConfig });
    const { url, init, headers } = lastCall(fetch);
    expect(url).toBe("https://video.onmom.test/videos?include=route_cesarean_section&limit=500");
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("x-onmom-key")).toBe("test-app-key");
    expect(res).toEqual({
      ok: true,
      videos: [
        {
          video_id: "vd_kegel_basic",
          title: "케겔 운동 기초",
          url: "https://www.youtube.com/watch?v=abc",
          description: "골반저근 수축·이완 기본 동작",
          tags: ["route_vaginal_delivery", "stage_pelvic_floor", "kegel"],
        },
      ],
    });
  });

  it("태그 외에는 아무것도 보내지 않는다", async () => {
    const fetch = stubFetch(async () => jsonResponse(200, { count: 0, videos: [] }));
    await fetchVideos("route_vaginal_delivery", { config: testConfig });
    const { url } = lastCall(fetch);
    expect([...new URL(url).searchParams.keys()]).toEqual(["include", "limit"]);
  });

  it("base URL에 경로가 있으면 그 뒤에 붙인다", async () => {
    const fetch = stubFetch(async () => jsonResponse(200, { count: 0, videos: [] }));
    await fetchVideos("route_vaginal_delivery", { config: { ...testConfig, videoURL: "https://video.onmom.test/api" } });
    expect(lastCall(fetch).url).toBe("https://video.onmom.test/api/videos?include=route_vaginal_delivery&limit=500");
  });

  it("앱 키가 없으면 헤더 없이 보낸다", async () => {
    const fetch = stubFetch(async () => jsonResponse(200, { count: 0, videos: [] }));
    await fetchVideos("route_vaginal_delivery", { config: { ...testConfig, appKey: null } });
    expect(lastCall(fetch).headers.has("x-onmom-key")).toBe(false);
  });

  it("빈 태그는 거부(두 라우트가 섞이므로) — 요청하지 않는다", async () => {
    const fetch = stubFetch(async () => jsonResponse(200, { count: 0, videos: [] }));
    await expect(fetchVideos("  ", { config: testConfig })).rejects.toThrow(TypeError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("미설정이 먼저 — 빈 태그여도 던지지 않고 notConfigured(ExerciseRules.swift:132 순서)", async () => {
    const fetch = stubFetch(async () => jsonResponse(200, { count: 0, videos: [] }));
    const res = await fetchVideos("", { config: { ...testConfig, videoURL: null } });
    expect(res).toMatchObject({ ok: false, kind: "notConfigured", message: VIDEO_MESSAGES.notConfigured });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([500, 404, 401, 201])("HTTP %i → server + 원문", async (status) => {
    stubFetch(async () => jsonResponse(status, { count: 0, videos: [] }));
    const res = await fetchVideos("route_vaginal_delivery", { config: testConfig });
    expect(res).toMatchObject({ ok: false, kind: "server", message: VIDEO_MESSAGES.server, status });
  });

  it("CORS 차단·오프라인(fetch TypeError) → network + 원문", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    const res = await fetchVideos("route_vaginal_delivery", { config: testConfig });
    expect(res).toMatchObject({ ok: false, kind: "network", message: VIDEO_MESSAGES.network });
  });

  it("8초 타임아웃 → network, 자동 재시도 없음", async () => {
    vi.useFakeTimers();
    const fetch = hangingFetch();
    vi.stubGlobal("fetch", fetch);
    let settled = false;
    const p = fetchVideos("route_vaginal_delivery", { config: testConfig }).finally(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(7_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await p).toMatchObject({ ok: false, kind: "network", message: VIDEO_MESSAGES.network });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("본문 형식이 틀리면 network(iOS 디코딩 실패와 같게)", async () => {
    stubFetch(async () => jsonResponse(200, { count: 1, videos: [{ ...serverVideo, tags: "stage_pelvic_floor" }] }));
    const res = await fetchVideos("route_vaginal_delivery", { config: testConfig });
    expect(res).toMatchObject({ ok: false, kind: "network" });
  });
});

describe("parseVideoResponse", () => {
  it("빈 목록", () => {
    expect(parseVideoResponse({ count: 0, videos: [] })).toEqual([]);
  });

  it("필수 필드가 하나라도 없으면 전체 거부", () => {
    const { description: _omit, ...noDescription } = serverVideo;
    void _omit;
    expect(parseVideoResponse({ count: 1, videos: [noDescription] })).toBeNull();
    expect(parseVideoResponse({ count: 1, videos: [{ ...serverVideo, video_id: 7 }] })).toBeNull();
    expect(parseVideoResponse({ count: 1, videos: [{ ...serverVideo, tags: [1] }] })).toBeNull();
    expect(parseVideoResponse({ videos: [serverVideo] })).toBeNull();
    expect(parseVideoResponse({ count: 1 })).toBeNull();
    expect(parseVideoResponse(null)).toBeNull();
    expect(parseVideoResponse([serverVideo])).toBeNull();
  });

  it("알 수 없는 필드는 무시한다", () => {
    expect(parseVideoResponse({ count: 1, videos: [{ ...serverVideo, extra: true }], next: null })).toHaveLength(1);
  });
});

describe("fetchVideos — Supabase Edge Function videos(영상 서버에 CORS가 없어 함수를 거친다)", () => {
  it("GET {functionsURL}/videos?include=&limit=500 — apikey(공개 키)만, 로그인 토큰·앱 키 없음", async () => {
    const fetch = stubFetch(async () => jsonResponse(200, { count: 1, videos: [serverVideo] }));
    const res = await fetchVideos("route_vaginal_delivery", { config: supabaseTestConfig });
    const { url, init, headers } = lastCall(fetch);
    expect(url).toBe("https://proj.supabase.test/functions/v1/videos?include=route_vaginal_delivery&limit=500");
    expect(init.method).toBe("GET");
    expect(headers.get("apikey")).toBe("sb_publishable_test");
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.has("authorization")).toBe(false);
    expect(headers.has("x-onmom-key")).toBe(false);
    expect(res).toEqual({ ok: true, videos: [serverVideo] });
  });

  it("영상 서버 주소(NEXT_PUBLIC_VIDEO_URL)가 비어 있어도 함수로 묻는다", async () => {
    const fetch = stubFetch(async () => jsonResponse(200, { count: 0, videos: [] }));
    const res = await fetchVideos("route_cesarean_section", { config: { ...supabaseTestConfig, videoURL: null } });
    expect(res).toEqual({ ok: true, videos: [] });
    expect(lastCall(fetch).url.startsWith("https://proj.supabase.test/functions/v1/videos")).toBe(true);
  });

  it("함수가 영상 서버 실패를 502로 알리면 server + 원문", async () => {
    stubFetch(async () => jsonResponse(502, { ok: false, code: "upstream_timeout" }));
    const res = await fetchVideos("route_vaginal_delivery", { config: supabaseTestConfig });
    expect(res).toMatchObject({ ok: false, kind: "server", message: VIDEO_MESSAGES.server, status: 502 });
  });

  it("잠든 영상 서버를 깨우는 동안 45초까지 기다린다", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", hangingFetch());
    let settled = false;
    const p = fetchVideos("route_vaginal_delivery", { config: supabaseTestConfig }).finally(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(44_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await p).toMatchObject({ ok: false, kind: "network", message: VIDEO_MESSAGES.network });
  });
});
