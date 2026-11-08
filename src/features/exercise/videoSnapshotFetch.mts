/* eslint-disable @typescript-eslint/ban-ts-comment -- Node는 ".ts" 확장자가 있어야 가져온다. Next tsc(TS5097)만 그 줄을 넘기게 한다. */
// 운동 영상 목록 수집 — 빌드 전에 한 번(배포 워크플로의 "Fetch exercise video list" 단계, scripts/videos-fetch.mjs).
// Edge Function videos가 부르는 그 영상 서버를 같은 주소 모양으로 직접 부른다: GET {VIDEO_API_URL}/videos?include=<경로 태그>&limit=500
// (_shared/videos.ts upstreamVideosUrl — https만, 로컬 개발은 http://localhost). 응답은 함수와 같은 검사(sanitizeVideoPayload)로
// 다섯 필드만 남기고, 스냅숏 검사(videoSnapshot.ts parseVideoSnapshot)를 거쳐 src/content/videos.generated.json에 쓴다.
//
// - 두 경로를 차례로 묻는다(첫 요청이 잠든 서버를 깨운다). 요청마다 60초까지 기다리고, 연결 실패·시간 초과·5xx면 5초 뒤 한 번 더.
// - 실패는 조용히(fail soft): VIDEO_API_URL이 없거나 틀렸거나, 어느 요청이든 끝내 실패하거나, 형식이 틀리거나, 한 경로가 비었거나,
//   너무 크면 빈 스냅숏을 쓰고 경고 한 줄만 남긴다(종료 코드 0 — 빌드는 이어지고, 앱은 지금처럼 함수에 묻는다).
//   한 경로만 싣지 않는다(videoSnapshot.ts 머리말 — 요청 유무로 분만 방식이 드러나지 않게). 예전 목록을 남기지도 않는다.
// - 로그에는 경로 태그·HTTP 상태·개수·시간만. 주소·응답 본문은 옮기지 않는다.
//
// Node가 그대로 불러온다(타입 제거 — src/cspHash.mts와 같은 규칙): 지울 수 있는 타입 문법만, 확장자까지 적은 가져오기만.
// 이 파일은 앱 번들에 들어가지 않는다(scripts/videos-fetch.mjs와 테스트만 부른다). 문구는 개발용 로그다.

// @ts-ignore: TS5097(Next tsc) — Node용 확장자
import { sanitizeVideoPayload, upstreamVideosUrl, VIDEO_MAX_LIMIT, VIDEO_ROUTE_TAGS } from "../../../supabase/functions/_shared/videos.ts";
import type { VideoRouteTag } from "../../../supabase/functions/_shared/videos.ts";
// @ts-ignore: TS5097(Next tsc) — Node용 확장자
import { EMPTY_VIDEO_SNAPSHOT, parseVideoSnapshot, serializeVideoSnapshot, VideoSnapshotError } from "./videoSnapshot.ts";
import type { SnapshotVideo } from "./videoSnapshot.ts";

/** 요청 하나를 기다리는 시간 — 잠든 Render 무료 인스턴스를 깨우는 데 20~40초(2026-11-08 운영 33초). 함수(40초)보다 넉넉히. */
export const SNAPSHOT_REQUEST_TIMEOUT_MS = 60_000;
/** 첫 시도가 실패하면 이만큼 쉬고 한 번 더(깨어나는 중인 서버에 바로 다시 묻지 않게) */
export const SNAPSHOT_RETRY_DELAY_MS = 5_000;
/**
 * 파일 크기 상한 — 넘으면 싣지 않는다(빈 스냅숏 → 앱은 함수에 묻는다). 목록은 운동·분석 화면의 JS 조각에 그대로 들어가므로
 * 번들이 크게 불지 않게 둔다. 지금 모양(영상 한 건 0.4~0.6KB)으로 두 경로 합쳐 400개 남짓까지.
 */
export const VIDEO_SNAPSHOT_MAX_BYTES = 256 * 1024;

export interface FetchResponseLike {
  status: number;
  json(): Promise<unknown>;
}
export type FetchLike = (url: string, init: { method: "GET"; headers: Record<string, string>; signal: AbortSignal }) => Promise<FetchResponseLike>;

/** 경로 하나를 받지 못했다 — reason은 로그에 그대로 쓰는 짧은 말(주소·본문 없음) */
export class VideoSnapshotFetchError extends Error {
  readonly tag: VideoRouteTag;
  readonly reason: string;
  constructor(tag: VideoRouteTag, reason: string) {
    super(`${tag} ${reason}`);
    this.name = "VideoSnapshotFetchError";
    this.tag = tag;
    this.reason = reason;
  }
}

export interface RunOptions {
  /** process.env.VIDEO_API_URL — 비면 요청 없이 빈 스냅숏 */
  baseUrl: string | undefined;
  fetch: FetchLike;
  /** src/content/videos.generated.json에 쓴다 */
  writeSnapshot(json: string): Promise<void>;
  log(line: string): void;
  /** 빈 스냅숏을 쓰게 된 까닭 — 배포 워크플로에서는 경고(annotation)로 보인다 */
  warn(line: string): void;
  now(): Date;
  /** 다시 묻기 전에 쉰다(테스트는 바로 돌아온다) */
  wait(ms: number): Promise<void>;
  timeoutMs?: number;
  retryDelayMs?: number;
  maxBytes?: number;
}

type Attempt = { ok: true; videos: SnapshotVideo[] } | { ok: false; retry: boolean; reason: string };

function isTimeout(e: unknown): boolean {
  return e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
}

async function attempt(o: RunOptions, url: string): Promise<Attempt> {
  let res: FetchResponseLike;
  const signal = AbortSignal.timeout(o.timeoutMs ?? SNAPSHOT_REQUEST_TIMEOUT_MS);
  try {
    res = await o.fetch(url, { method: "GET", headers: { Accept: "application/json" }, signal });
  } catch (e) {
    return { ok: false, retry: true, reason: isTimeout(e) ? "시간 초과" : "연결 실패" };
  }
  // 함수와 같이 200만 성공(handler.ts). 5xx는 깨어나는 중일 수 있어 한 번 더, 4xx는 다시 해도 같다.
  if (res.status !== 200) return { ok: false, retry: res.status >= 500, reason: `HTTP ${res.status}` };
  let data: unknown;
  try {
    data = await res.json();
  } catch (e) {
    return isTimeout(e) ? { ok: false, retry: true, reason: "시간 초과" } : { ok: false, retry: false, reason: "JSON이 아님" };
  }
  // 함수와 같은 검사 — 한 항목이라도 틀리면 전체 거부, 다섯 필드만
  const payload = sanitizeVideoPayload(data);
  if (payload === null) return { ok: false, retry: false, reason: "응답 형식이 틀림" };
  return { ok: true, videos: payload.videos };
}

/** 경로 하나 — 실패하면 한 번 더(잠든 서버). 끝내 실패하면 VideoSnapshotFetchError. 돌려주는 값: 영상·보낸 요청 수 */
async function fetchRoute(o: RunOptions, tag: VideoRouteTag, url: string): Promise<{ videos: SnapshotVideo[]; requests: number }> {
  const first = await attempt(o, url);
  if (first.ok) return { videos: first.videos, requests: 1 };
  if (!first.retry) throw new VideoSnapshotFetchError(tag, first.reason);
  o.log(`videos-fetch: ${tag} ${first.reason} - ${Math.round((o.retryDelayMs ?? SNAPSHOT_RETRY_DELAY_MS) / 1000)}초 뒤 한 번 더 묻습니다(잠든 서버일 수 있음).`);
  await o.wait(o.retryDelayMs ?? SNAPSHOT_RETRY_DELAY_MS);
  const second = await attempt(o, url);
  if (second.ok) return { videos: second.videos, requests: 2 };
  throw new VideoSnapshotFetchError(tag, `${first.reason} → 다시 시도도 ${second.reason}`);
}

const FALLBACK_NOTE = "빈 목록으로 빌드합니다(앱은 지금처럼 영상 서버에 묻습니다).";

/**
 * 수집 한 번 — 늘 0을 돌려주고(빌드를 멈추지 않는다) 파일을 한 번 쓴다: 받은 스냅숏 또는 빈 스냅숏.
 * 쓰기 자체가 실패하면 그 오류는 그대로 올라간다(부르는 쪽 scripts/videos-fetch.mjs가 경고로 바꾼다 — 저장소의 빈 파일이 남는다).
 */
export async function runVideoSnapshotFetch(o: RunOptions): Promise<number> {
  const empty = serializeVideoSnapshot(EMPTY_VIDEO_SNAPSHOT);
  const base = (o.baseUrl ?? "").trim();
  if (base === "") {
    o.warn(`videos-fetch: VIDEO_API_URL이 없어 영상 목록을 받지 않았습니다(요청 없음) - ${FALLBACK_NOTE}`);
    await o.writeSnapshot(empty);
    return 0;
  }
  const targets: { tag: VideoRouteTag; url: string }[] = [];
  for (const tag of VIDEO_ROUTE_TAGS) {
    const url = upstreamVideosUrl(base, { include: tag, limit: VIDEO_MAX_LIMIT });
    if (url === null) {
      o.warn(`videos-fetch: VIDEO_API_URL 형식이 틀렸습니다(https 주소만, 로컬 개발은 http://localhost - 요청 없음) - ${FALLBACK_NOTE}`);
      await o.writeSnapshot(empty);
      return 0;
    }
    targets.push({ tag, url });
  }

  const started = Date.now();
  let json: string;
  try {
    const routes: Partial<Record<VideoRouteTag, SnapshotVideo[]>> = {};
    let requests = 0;
    // 차례로 — 첫 경로가 잠든 서버를 깨우고, 둘째는 깨어난 서버에 묻는다. 하나라도 끝내 실패하면 둘 다 싣지 않는다.
    for (const { tag, url } of targets) {
      const r = await fetchRoute(o, tag, url);
      routes[tag] = r.videos;
      requests += r.requests;
    }
    // 쓰기 전에 앱과 같은 검사(형식·두 경로 모두 영상이 있는지) — 틀린 파일로 빌드가 멈추지 않게
    const snapshot = parseVideoSnapshot({ fetchedAt: o.now().toISOString(), routes });
    json = serializeVideoSnapshot(snapshot);
    const bytes = new TextEncoder().encode(json).byteLength;
    const max = o.maxBytes ?? VIDEO_SNAPSHOT_MAX_BYTES;
    if (bytes > max) throw new VideoSnapshotError(`목록이 너무 큽니다(${bytes}바이트 > 상한 ${max}바이트)`);
    const counts = VIDEO_ROUTE_TAGS.map((tag) => `${tag} ${snapshot.routes[tag].length}개`).join(" · ");
    o.log(`videos-fetch: 영상 ${counts}, ${bytes}바이트, 요청 ${requests}회, ${((Date.now() - started) / 1000).toFixed(1)}초.`);
  } catch (e) {
    o.warn(`videos-fetch: 영상 목록을 받지 못했습니다(${failureLabel(e)}) - ${FALLBACK_NOTE}`);
    json = empty;
  }
  await o.writeSnapshot(json);
  return 0;
}

function failureLabel(e: unknown): string {
  if (e instanceof VideoSnapshotFetchError) return e.message;
  if (e instanceof VideoSnapshotError) return e.message;
  return "예상하지 못한 오류";
}
