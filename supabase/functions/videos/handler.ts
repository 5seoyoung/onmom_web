/* eslint-disable @typescript-eslint/ban-ts-comment -- Deno는 ".ts" 확장자가 있어야 가져온다. Next tsc(TS5097)만 그 줄을 넘기게 한다. */
// Edge Function "videos"의 요청 처리 — 의존성(업스트림 fetch·로그)을 받아 만든다.
// 실제 연결은 index.ts(Deno), 테스트는 src/api/edgeHandlers.test.ts(vitest — 웹 표준 Request/Response만 쓰므로 Node에서도 돈다).
//
// GET ?include=<route_vaginal_delivery|route_cesarean_section>&limit=<1~500>
//   → 영상 서버 GET {VIDEO_API_URL}/videos?include=&limit= → 알려진 필드만 담아 { count, videos } (공개 데이터, 캐시 10분)
// 업스트림이 느리거나(잠든 Render 깨우기) 실패하면 502 + 코드만. 업스트림 오류 본문·주소는 내보내지 않는다.
// 로그: 상태·코드·소요 시간·업스트림 상태만. 분만 경로 태그(= 사용자의 분만 방식)는 기록하지 않는다.

// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { checkOrigin, corsHeaders, failure, jsonResponse, preflightHeaders } from "../_shared/cors.ts";
// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { parseVideoQuery, sanitizeVideoPayload, upstreamVideosUrl, VIDEO_CACHE_CONTROL } from "../_shared/videos.ts";

export interface VideosLogEntry {
  fn: "videos";
  status: number;
  ms: number;
  code?: string;
  upstream_status?: number;
}

export interface VideosHandlerDeps {
  allowedOrigins: readonly string[];
  /** VIDEO_API_URL — 예: https://hackathon-video-api.onrender.com */
  upstreamBaseUrl: string;
  timeoutMs: number;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  log: (entry: VideosLogEntry) => void;
  now?: () => number;
}

const METHODS = "GET, OPTIONS";

export function createVideosHandler(deps: VideosHandlerDeps): (req: Request) => Promise<Response> {
  const now = deps.now ?? Date.now;

  return async (req) => {
    const started = now();
    const origin = checkOrigin(req.headers.get("origin"), deps.allowedOrigins);
    const cors = corsHeaders(origin);
    const done = (res: Response, extra: Partial<VideosLogEntry> = {}): Response => {
      deps.log({ fn: "videos", status: res.status, ms: now() - started, ...extra });
      return res;
    };
    const fail = (status: number, code: string, extra: Partial<VideosLogEntry> = {}) =>
      done(failure(status, code, cors), { code, ...extra });

    try {
      // 허용 목록 밖 사이트의 브라우저 요청은 preflight부터 거절한다
      if (origin.kind === "denied") return fail(403, "origin_not_allowed");
      if (req.method === "OPTIONS") {
        return done(new Response(null, { status: 204, headers: preflightHeaders(origin, METHODS) }));
      }
      if (req.method !== "GET") {
        return done(failure(405, "method_not_allowed", { ...cors, Allow: METHODS }), { code: "method_not_allowed" });
      }

      const query = parseVideoQuery(new URL(req.url).searchParams);
      if (!query) return fail(400, "bad_request");
      const upstream = upstreamVideosUrl(deps.upstreamBaseUrl, query);
      if (!upstream) return fail(500, "not_configured");

      let res: Response;
      try {
        res = await deps.fetch(upstream, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(deps.timeoutMs),
        });
      } catch (e) {
        return fail(502, isTimeout(e) ? "upstream_timeout" : "upstream_unreachable");
      }
      if (res.status !== 200) {
        await res.body?.cancel().catch(() => {});
        return fail(502, "upstream_error", { upstream_status: res.status });
      }
      let data: unknown;
      try {
        data = await res.json();
      } catch (e) {
        return fail(502, isTimeout(e) ? "upstream_timeout" : "upstream_bad_response");
      }
      const payload = sanitizeVideoPayload(data);
      if (!payload) return fail(502, "upstream_bad_response");
      return done(jsonResponse(200, payload, { ...cors, "Cache-Control": VIDEO_CACHE_CONTROL }));
    } catch {
      // 예상 밖 오류 — 내용은 내보내지도 기록하지도 않는다
      return fail(500, "internal");
    }
  };
}

function isTimeout(e: unknown): boolean {
  return e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
}
