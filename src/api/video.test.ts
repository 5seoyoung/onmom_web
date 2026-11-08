import { afterEach, describe, expect, it, vi } from "vitest";
import { parseVideoBody, sanitizeVideoPayload } from "../../supabase/functions/_shared/videos";
import { fetchVideos, parseVideoResponse, VIDEO_MESSAGES, VIDEO_ROUTE_TAGS, videoRequestBody } from "./video";
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

  it("count는 0 이상의 정수 — 서버(Edge Function sanitizeVideoPayload)와 같은 규칙으로 음수·소수·문자를 거부한다", () => {
    for (const count of [-1, 1.5, "1", Number.NaN, Number.POSITIVE_INFINITY]) {
      const body = { count, videos: [serverVideo] };
      expect(parseVideoResponse(body), String(count)).toBeNull();
      expect(sanitizeVideoPayload(body), String(count)).toBeNull();
    }
    for (const count of [0, 1, 7]) {
      const body = { count, videos: [serverVideo] };
      expect(parseVideoResponse(body)).toHaveLength(1);
      expect(sanitizeVideoPayload(body)?.videos).toHaveLength(1);
    }
  });
});

describe("fetchVideos — Supabase Edge Function videos(영상 서버에 CORS가 없어 함수를 거친다)", () => {
  const FN_URL = "https://proj.supabase.test/functions/v1/videos";
  /** 요청 본문의 include — 함수로 묻는 요청은 태그가 본문에만 있다 */
  const includeOf = (init?: RequestInit) => (JSON.parse(String(init?.body)) as { include: string }).include;

  it("POST {functionsURL}/videos, 본문 { include, limit: 500 } — 주소에 쿼리 없음, apikey(공개 키)·content-type만, 로그인 토큰·앱 키 없음", async () => {
    const other = { ...serverVideo, video_id: "vd_cesarean", tags: ["route_cesarean_section"] };
    const fetch = stubFetch(async (_url, init) => jsonResponse(200, { count: 1, videos: [includeOf(init) === "route_vaginal_delivery" ? serverVideo : other] }));
    const res = await fetchVideos("route_vaginal_delivery", { config: supabaseTestConfig });
    for (const [url, init] of fetch.mock.calls as [string, RequestInit][]) {
      // 분만 경로가 주소(→ Supabase 요청 기록)에 실리지 않는다
      expect(url).toBe(FN_URL);
      expect(new URL(url).search).toBe("");
      expect(init.method).toBe("POST");
      const headers = new Headers(init.headers);
      expect(headers.get("apikey")).toBe("sb_publishable_test");
      expect(headers.get("accept")).toBe("application/json");
      expect(headers.get("content-type")).toBe("application/json");
      expect(headers.has("authorization")).toBe(false);
      expect(headers.has("x-onmom-key")).toBe(false);
      expect(init.credentials).toBe("omit");
    }
    const [, first] = fetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(first.body))).toEqual({ include: "route_vaginal_delivery", limit: 500 });
    expect(res).toEqual({ ok: true, videos: [serverVideo] });
  });

  it("본문은 함수가 받는 모양 그대로(parseVideoBody) — 태그 외에는 limit뿐", () => {
    for (const tag of VIDEO_ROUTE_TAGS) {
      expect(Object.keys(videoRequestBody(tag)).sort()).toEqual(["include", "limit"]);
      expect(parseVideoBody(JSON.parse(JSON.stringify(videoRequestBody(tag))))).toEqual({ include: tag, limit: 500 });
    }
  });

  it("두 라우트의 본문 길이가 같다 — 요청 크기(Content-Length)로도 분만 방식이 드러나지 않는다", () => {
    const [a, b] = VIDEO_ROUTE_TAGS.map((t) => new TextEncoder().encode(JSON.stringify(videoRequestBody(t))).byteLength);
    expect(a).toBe(b);
  });

  it("함수로 물을 때는 두 라우트를 늘 함께 묻는다 — 요청 수·순서만으로 분만 방식을 알 수 없게, 쓰는 것은 내 라우트 응답", async () => {
    expect([...VIDEO_ROUTE_TAGS].sort()).toEqual(["route_cesarean_section", "route_vaginal_delivery"]);
    for (const mine of VIDEO_ROUTE_TAGS) {
      const fetch = stubFetch(async (_url, init) =>
        jsonResponse(200, { count: 1, videos: [{ ...serverVideo, video_id: includeOf(init) === mine ? "vd_mine" : "vd_other", tags: [] }] }),
      );
      const res = await fetchVideos(mine, { config: supabaseTestConfig });
      // 순서까지 같다 — 내 라우트를 먼저 물으면 요청 순서로 분만 방식이 드러난다
      expect(fetch.mock.calls.map(([u]) => u as string)).toEqual([FN_URL, FN_URL]);
      expect(fetch.mock.calls.map(([, init]) => includeOf(init as RequestInit))).toEqual([...VIDEO_ROUTE_TAGS]);
      expect(res).toMatchObject({ ok: true, videos: [{ video_id: "vd_mine" }] });
    }
  });

  it("다른 라우트 요청이 실패해도 내 결과에는 영향이 없다", async () => {
    stubFetch(async (_url, init) =>
      String(init?.body).includes("route_cesarean_section")
        ? jsonResponse(502, { ok: false, code: "upstream_timeout" })
        : jsonResponse(200, { count: 1, videos: [serverVideo] }),
    );
    expect(await fetchVideos("route_vaginal_delivery", { config: supabaseTestConfig })).toEqual({ ok: true, videos: [serverVideo] });
  });

  it("영상 서버를 직접 부르는 빌드(설정 없는 쪽)는 내 라우트 하나만, 예전처럼 GET 쿼리로 묻는다(영상 서버는 GET만 받는다)", async () => {
    const fetch = stubFetch(async () => jsonResponse(200, { count: 1, videos: [serverVideo] }));
    await fetchVideos("route_vaginal_delivery", { config: testConfig });
    expect(fetch).toHaveBeenCalledTimes(1);
    const { url, init } = lastCall(fetch);
    expect(url).toBe("https://video.onmom.test/videos?include=route_vaginal_delivery&limit=500");
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
  });

  it("영상 서버 주소(NEXT_PUBLIC_VIDEO_URL)가 비어 있어도 함수로 묻는다", async () => {
    const fetch = stubFetch(async () => jsonResponse(200, { count: 0, videos: [] }));
    const res = await fetchVideos("route_cesarean_section", { config: { ...supabaseTestConfig, videoURL: null } });
    expect(res).toEqual({ ok: true, videos: [] });
    expect(lastCall(fetch).url).toBe("https://proj.supabase.test/functions/v1/videos");
    expect(lastCall(fetch).init.method).toBe("POST");
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
