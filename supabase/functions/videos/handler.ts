/* eslint-disable @typescript-eslint/ban-ts-comment -- Deno는 ".ts" 확장자가 있어야 가져온다. Next tsc(TS5097)만 그 줄을 넘기게 한다. */
// Edge Function "videos"의 요청 처리 — 의존성(업스트림 fetch·로그)을 받아 만든다.
// 실제 연결은 index.ts(Deno), 테스트는 src/api/edgeHandlers.test.ts(vitest — 웹 표준 Request/Response만 쓰므로 Node에서도 돈다).
//
// POST 본문 { include: <route_vaginal_delivery|route_cesarean_section>, limit?: <1~500> } — 웹(src/api/video.ts)이 보내는 방식.
//   분만 경로 태그가 주소(쿼리)에 없어 Supabase 플랫폼의 요청 기록(주소·IP)에 남지 않는다. 응답은 캐시하지 않는다(no-store).
// GET ?include=&limit= — 예전 방식(2026-11 POST로 옮김). 열린 탭·설치한 앱에 남은 예전 번들을 위해 당분간 받는다(같은 검증, 캐시 10분).
//   로그의 method가 "GET"인 줄이 사라지면 지운다.
//   → 영상 서버 GET {VIDEO_API_URL}/videos?include=&limit= → 알려진 필드만 담아 { count, videos } (공개 데이터)
// 잘못된 요청(태그 아님·둘 이상·limit 범위 밖·모르는 필드)은 400, 업스트림을 부르지 않는다.
// 업스트림이 느리거나(잠든 Render 깨우기) 실패하면 502 + 코드만. 업스트림 오류 본문·주소는 내보내지 않는다.
// 로그: 메서드·상태·코드·소요 시간·업스트림 상태만. 분만 경로 태그(= 사용자의 분만 방식)는 기록하지 않는다.

// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { readBodyWithLimit } from "../_shared/chat.ts";
// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { checkOrigin, corsHeaders, failure, jsonResponse, preflightHeaders } from "../_shared/cors.ts";
// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { parseVideoBody, parseVideoQuery, sanitizeVideoPayload, upstreamVideosUrl, VIDEO_CACHE_CONTROL, VIDEO_MAX_BODY_BYTES } from "../_shared/videos.ts";
import type { VideoQuery } from "../_shared/videos.ts";

export interface VideosLogEntry {
  fn: "videos";
  /** GET(예전 번들)·POST만 적는다 — 예전 GET이 얼마나 남았는지 보려고 */
  method?: "GET" | "POST";
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

const METHODS = "GET, POST, OPTIONS";

export function createVideosHandler(deps: VideosHandlerDeps): (req: Request) => Promise<Response> {
  const now = deps.now ?? Date.now;

  return async (req) => {
    const started = now();
    const origin = checkOrigin(req.headers.get("origin"), deps.allowedOrigins);
    const cors = corsHeaders(origin);
    const method = req.method === "GET" || req.method === "POST" ? req.method : undefined;
    const done = (res: Response, extra: Partial<VideosLogEntry> = {}): Response => {
      deps.log({ fn: "videos", ...(method ? { method } : {}), status: res.status, ms: now() - started, ...extra });
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
      if (method === undefined) {
        return done(failure(405, "method_not_allowed", { ...cors, Allow: METHODS }), { code: "method_not_allowed" });
      }

      let query: VideoQuery | null;
      if (method === "POST") {
        // 본문 — 크기 상한 → JSON → 형식(chat과 같은 순서). 적힌 Content-Length가 크면 읽지 않고, 없거나 틀려도 상한까지만 읽는다.
        const declared = Number(req.headers.get("content-length") ?? "0");
        if (Number.isFinite(declared) && declared > VIDEO_MAX_BODY_BYTES) return fail(413, "too_large");
        const raw = await readBodyWithLimit(req, VIDEO_MAX_BODY_BYTES);
        if (raw === null) return fail(413, "too_large");
        let body: unknown;
        try {
          body = JSON.parse(new TextDecoder().decode(raw));
        } catch {
          return fail(400, "bad_request");
        }
        query = parseVideoBody(body);
      } else {
        query = parseVideoQuery(new URL(req.url).searchParams);
      }
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
      // 예전 GET만 캐시 헤더를 그대로 — POST는 jsonResponse 기본(no-store)
      return done(jsonResponse(200, payload, method === "GET" ? { ...cors, "Cache-Control": VIDEO_CACHE_CONTROL } : cors));
    } catch {
      // 예상 밖 오류 — 내용은 내보내지도 기록하지도 않는다
      return fail(500, "internal");
    }
  };
}

function isTimeout(e: unknown): boolean {
  return e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
}
