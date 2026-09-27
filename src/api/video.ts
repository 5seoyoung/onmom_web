// Video DB 조회 — iOS VideoDBClient.swift 이식.
// GET {videoURL}/videos?include=<route 태그>&limit=500 → { count, videos: [{ video_id, title, url, description, tags }] }
// 서버는 태그만 거르고, 주차 게이팅·금기는 앱 규칙이 한다(ExerciseRules). 그래서 라우트 전체(limit 500)를 받는다.
//
// 서버로 나가는 사용자 정보는 분만 방식 라우트 태그 하나뿐이다(URL 쿼리). 이 URL은 서버 접근 로그에 남으므로
// 분석·모니터링 도구가 네트워크 URL을 수집한다면 온맘 API 요청은 제외하거나 쿼리를 지운다(검수 #49).
// 응답의 url은 신뢰하지 않는다 — 링크로 만들 때 safeExternalUrl을 거친다(검수 #51).

import { EXERCISE_TEXT, VIDEO_QUERY_LIMIT, type Video } from "@/rules/exercise";
import { defaultBackendConfig, joinBackendUrl, requestJson, type BackendConfig } from "./http";

/** 서버 응답 그대로의 필드명(video_id) — 규칙(exercisePlan·runRecoveryAnalysis)에 변환 없이 넘긴다. */
export type VideoDBVideo = Video;

export type VideoFailureKind = "notConfigured" | "server" | "network";

export type FetchVideosResult =
  | { ok: true; videos: VideoDBVideo[] }
  | { ok: false; kind: VideoFailureKind; message: string; status?: number };

// 문구의 단일 출처는 rules/exercise.ts EXERCISE_TEXT(운동 탭이 같은 문구를 보여준다).
export const VIDEO_MESSAGES: Record<VideoFailureKind, string> = {
  notConfigured: EXERCISE_TEXT.unavailableBody, // 원문: VideoDBClient.swift:39
  server: EXERCISE_TEXT.failedServer, // 원문: VideoDBClient.swift:40
  network: EXERCISE_TEXT.failedUnreachable, // 원문: VideoDBClient.swift:41
};

export const VIDEO_TIMEOUT_MS = 8_000; // VideoDBClient.swift:57
export const VIDEO_LIMIT = VIDEO_QUERY_LIMIT; // ExerciseRules.swift:134 — 값은 규칙 모듈 한 곳

export type FetchVideosOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  config?: BackendConfig;
};

const isString = (v: unknown): v is string => typeof v === "string";

/** 응답 본문 검증. iOS JSONDecoder처럼 한 항목이라도 형식이 틀리면 전체를 거부한다(null). */
export function parseVideoResponse(data: unknown): VideoDBVideo[] | null {
  if (typeof data !== "object" || data === null) return null;
  const { count, videos } = data as { count?: unknown; videos?: unknown };
  if (typeof count !== "number" || !Number.isInteger(count) || !Array.isArray(videos)) return null;
  const out: VideoDBVideo[] = [];
  for (const v of videos) {
    if (typeof v !== "object" || v === null) return null;
    const r = v as Record<string, unknown>;
    if (!isString(r.video_id) || !isString(r.title) || !isString(r.url) || !isString(r.description)) return null;
    if (!Array.isArray(r.tags) || !r.tags.every(isString)) return null;
    out.push({ video_id: r.video_id, title: r.title, url: r.url, description: r.description, tags: [...r.tags] });
  }
  return out;
}

const fail = (kind: VideoFailureKind, status?: number): FetchVideosResult => ({
  ok: false,
  kind,
  message: VIDEO_MESSAGES[kind],
  status,
});

/**
 * 분만 방식 라우트 태그(route_vaginal_delivery / route_cesarean_section)로 영상 목록을 받는다.
 * 태그 매핑은 규칙 모듈 몫이다.
 * 미설정 확인이 먼저다(iOS ExerciseRules.swift:132) — 미설정 빌드에서는 어떤 입력이든 notConfigured로 끝나고 던지지 않는다.
 * 설정된 상태에서 빈 태그는 호출자 버그다: 보내면 두 라우트 영상이 섞이므로 TypeError로 거부한다.
 */
export async function fetchVideos(includeTag: string, opts: FetchVideosOptions = {}): Promise<FetchVideosResult> {
  const cfg = opts.config ?? defaultBackendConfig;
  const url = joinBackendUrl(cfg.videoURL, "videos");
  if (!url) return fail("notConfigured");
  if (includeTag.trim() === "") throw new TypeError("fetchVideos: includeTag is required");
  url.searchParams.append("include", includeTag);
  url.searchParams.append("limit", String(VIDEO_LIMIT));

  const res = await requestJson(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    timeoutMs: opts.timeoutMs ?? VIDEO_TIMEOUT_MS,
    signal: opts.signal,
    // iOS는 200만 성공으로 본다(VideoDBClient.swift:62)
    acceptStatus: (s) => s === 200,
    config: cfg,
  });
  if (!res.ok) return res.kind === "status" ? fail("server", res.status) : fail("network");
  // iOS는 디코딩 실패도 unreachable로 묶는다(VideoDBClient.swift:66-67)
  const videos = parseVideoResponse(res.data);
  return videos ? { ok: true, videos } : fail("network");
}
