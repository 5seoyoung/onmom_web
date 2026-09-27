// Edge Function videos 공용 — 영상 서버 프록시의 입력 검증·응답 정리(Deno·vitest 양쪽에서 읽는다. cors.ts 머리말 참고).
//
// 영상 서버(Render)는 CORS가 없어 브라우저가 직접 부를 수 없다. 함수가 대신 부르고, 웹이 쓰는 두 분만 경로 태그만 통과시킨다.
// 응답은 웹 src/api/video.ts parseVideoResponse와 같은 모양({ count, videos: [{ video_id, title, url, description, tags }] })으로
// 알려진 필드만 다시 담아 돌려준다 — 업스트림의 다른 필드·오류 본문은 내보내지 않는다.

/** 웹이 쓰는 분만 경로 태그(rules/exercise routeTag) — 이 둘만 받는다 */
export const VIDEO_ROUTE_TAGS = ["route_vaginal_delivery", "route_cesarean_section"] as const;
export type VideoRouteTag = (typeof VIDEO_ROUTE_TAGS)[number];

/** 웹 VIDEO_QUERY_LIMIT(rules/exercise)과 같은 값 — 라우트 전체를 받는다 */
export const VIDEO_MAX_LIMIT = 500;
/** VIDEO_API_URL 환경 변수가 비었을 때 */
export const DEFAULT_VIDEO_API_URL = "https://hackathon-video-api.onrender.com";
/** Render 무료 인스턴스는 잠들었다 깨는 데 30초 넘게 걸리기도 한다 */
export const VIDEO_UPSTREAM_TIMEOUT_MS = 40_000;
/** 공개 데이터 — 브라우저 5분, CDN 10분 */
export const VIDEO_CACHE_CONTROL = "public, max-age=300, s-maxage=600";

export interface VideoQuery {
  include: VideoRouteTag;
  limit: number;
}

export interface ProxiedVideo {
  video_id: string;
  title: string;
  url: string;
  description: string;
  tags: string[];
}

export interface ProxiedVideoPayload {
  count: number;
  videos: ProxiedVideo[];
}

const isRouteTag = (v: string): v is VideoRouteTag => (VIDEO_ROUTE_TAGS as readonly string[]).includes(v);

/**
 * ?include=<태그>&limit=<n> 검증. include는 정확히 하나(두 경로 영상이 섞이지 않게), limit은 1~500 정수(없으면 500).
 * 그 밖의 매개변수(exclude 등)는 웹이 쓰지 않으므로 거부한다. 틀리면 null.
 */
export function parseVideoQuery(params: URLSearchParams): VideoQuery | null {
  for (const key of params.keys()) {
    if (key !== "include" && key !== "limit") return null;
  }
  const includes = params.getAll("include");
  if (includes.length !== 1 || !isRouteTag(includes[0])) return null;
  const limits = params.getAll("limit");
  if (limits.length > 1) return null;
  let limit = VIDEO_MAX_LIMIT;
  if (limits.length === 1) {
    if (!/^[1-9][0-9]{0,2}$/.test(limits[0])) return null;
    limit = Number(limits[0]);
    if (limit > VIDEO_MAX_LIMIT) return null;
  }
  return { include: includes[0], limit };
}

/** 업스트림 주소 — VIDEO_API_URL이 https(로컬 개발은 http://localhost)가 아니면 null(설정 오류). */
export function upstreamVideosUrl(base: string, query: VideoQuery): string | null {
  let u: URL;
  try {
    u = new URL(`${base.trim().replace(/\/+$/, "")}/videos`);
  } catch {
    return null;
  }
  const local = u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
  if (u.protocol !== "https:" && !local) return null;
  if (u.username !== "" || u.password !== "") return null;
  u.search = "";
  u.searchParams.set("include", query.include);
  u.searchParams.set("limit", String(query.limit));
  return u.toString();
}

const isString = (v: unknown): v is string => typeof v === "string";

/**
 * 업스트림 본문 → 알려진 필드만. 한 항목이라도 형식이 틀리면 전체를 거부한다(null — 웹 parseVideoResponse와 같은 규칙).
 */
export function sanitizeVideoPayload(data: unknown): ProxiedVideoPayload | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const { count, videos } = data as { count?: unknown; videos?: unknown };
  if (typeof count !== "number" || !Number.isInteger(count) || count < 0 || !Array.isArray(videos)) return null;
  const out: ProxiedVideo[] = [];
  for (const v of videos) {
    if (typeof v !== "object" || v === null) return null;
    const r = v as Record<string, unknown>;
    if (!isString(r.video_id) || !isString(r.title) || !isString(r.url) || !isString(r.description)) return null;
    if (!Array.isArray(r.tags) || !r.tags.every(isString)) return null;
    out.push({ video_id: r.video_id, title: r.title, url: r.url, description: r.description, tags: [...r.tags] });
  }
  return { count, videos: out };
}
