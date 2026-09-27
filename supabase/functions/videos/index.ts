/* eslint-disable @typescript-eslint/ban-ts-comment -- Deno는 ".ts" 확장자가 있어야 가져온다. Next tsc(TS5097)만 그 줄을 넘기게 한다. */
// Supabase Edge Function "videos" — 운동 영상 목록 프록시(영상 서버에 CORS가 없어 브라우저가 직접 부를 수 없다).
// 설명·배포: docs/SUPABASE_FUNCTIONS.md
//
// 공개 데이터라 로그인 없이 부른다 — 게이트웨이 JWT 확인을 끈다(supabase/config.toml [functions.videos] verify_jwt = false).
// 환경 변수(모두 선택): VIDEO_API_URL(기본 https://hackathon-video-api.onrender.com), ALLOWED_ORIGINS(쉼표 구분).
// 이 파일은 Deno에서만 돈다(Next tsc용 처리는 chat/index.ts 머리말과 같다).

// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { parseAllowedOrigins } from "../_shared/cors.ts";
// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { DEFAULT_VIDEO_API_URL, VIDEO_UPSTREAM_TIMEOUT_MS } from "../_shared/videos.ts";
// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { createVideosHandler } from "./handler.ts";

/** Deno 전역 중 이 파일이 쓰는 것만 — Next tsc용 선언(Deno에서는 실제 Deno 전역이 그대로 쓰인다) */
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Promise<Response>): unknown;
};

const handler = createVideosHandler({
  allowedOrigins: parseAllowedOrigins(Deno.env.get("ALLOWED_ORIGINS")),
  upstreamBaseUrl: Deno.env.get("VIDEO_API_URL")?.trim() || DEFAULT_VIDEO_API_URL,
  timeoutMs: VIDEO_UPSTREAM_TIMEOUT_MS,
  fetch: (url, init) => fetch(url, init),
  // 상태·코드·소요 시간만(요청 주소·분만 경로는 기록하지 않는다)
  log: (entry) => console.log(JSON.stringify(entry)),
});

Deno.serve(handler);
