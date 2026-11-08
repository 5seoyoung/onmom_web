// Edge Function videos 공용 — 영상 서버 프록시의 입력 검증·응답 정리(Deno·vitest 양쪽에서 읽는다. cors.ts 머리말 참고).
//
// 영상 서버(Render)는 CORS가 없어 브라우저가 직접 부를 수 없다. 함수가 대신 부르고, 웹이 쓰는 두 분만 경로 태그만 통과시킨다.
// 웹은 태그를 POST 본문으로 보낸다(parseVideoBody — 주소에 태그가 없어 Supabase 요청 기록에 남지 않는다). 예전 GET 쿼리(parseVideoQuery)도 당분간 받는다.
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
/**
 * 예전 GET(?include=&limit=) 응답만 — 공개 데이터라 브라우저 5분, CDN 10분. POST 응답은 캐시하지 않는다(jsonResponse 기본 no-store):
 * 브라우저·CDN은 POST 응답을 캐시하지 않고, 분만 경로가 본문에만 있어 캐시 열쇠(주소)로 응답을 나눌 수도 없다.
 */
export const VIDEO_CACHE_CONTROL = "public, max-age=300, s-maxage=600";
/** POST 본문 상한 — {"include":"route_cesarean_section","limit":500}는 50바이트 안팎 */
export const VIDEO_MAX_BODY_BYTES = 1024;

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
 * POST 본문 { include: <태그>, limit?: <n> } 검증 — 웹(src/api/video.ts)이 보내는 모양. 분만 경로 태그를 주소(쿼리) 대신 본문에 실어
 * Supabase 플랫폼의 요청 기록(주소·IP)에 남지 않게 한다. 규칙은 parseVideoQuery와 같다: include는 태그 문자열 하나(배열 안 됨),
 * limit은 1~500 정수(숫자 — 문자열 안 됨, 없으면 500). 다른 필드가 하나라도 있거나 객체가 아니면 null.
 */
export function parseVideoBody(body: unknown): VideoQuery | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const r = body as Record<string, unknown>;
  for (const key of Object.keys(r)) {
    if (key !== "include" && key !== "limit") return null;
  }
  if (typeof r.include !== "string" || !isRouteTag(r.include)) return null;
  let limit = VIDEO_MAX_LIMIT;
  if (r.limit !== undefined) {
    if (typeof r.limit !== "number" || !Number.isInteger(r.limit) || r.limit < 1 || r.limit > VIDEO_MAX_LIMIT) return null;
    limit = r.limit;
  }
  return { include: r.include, limit };
}

/**
 * (예전 GET — 열린 탭·설치한 앱에 남은 예전 번들이 보낸다. 웹은 POST 본문(parseVideoBody)으로 옮겼다)
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
