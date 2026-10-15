// 유튜브 추천 영상 수집 — 빌드 전에 한 번(배포 워크플로의 "Fetch approved YouTube videos" 단계, scripts/youtube-fetch.mjs).
// YouTube Data API v3의 싼 호출만 쓴다(일일 기본 할당량 10,000 단위):
// - videos.list: 영상 ID 50개까지 1단위 — 승인 영상과 자동 표시 채널 후보의 상태(공개·퍼가기·연령 제한·지역) 확인
// - channels.list(contentDetails): 채널 50개까지 1단위 — 채널의 업로드 재생목록 ID
// - playlistItems.list: 한 쪽(50개)에 1단위 — 업로드 재생목록, 채널마다 MAX_UPLOAD_PAGES 쪽까지
// search.list(100단위)는 쓰지 않는다 — 부를 수 있는 끝점을 YouTubeEndpoint 셋으로 묶었다.
//
// API 키
// - 요청 헤더(X-Goog-Api-Key)로만 보낸다. 주소(?key=)에 넣지 않아 오류·프록시 기록에 남지 않는다.
// - 로그·생성 파일에 쓰지 않는다. 생성 파일에는 공개 메타데이터(제목·채널 이름·게시 시각·미리보기 주소)만 싣는다(serializeCatalog).
// 실패는 조용히(fail soft): 어느 호출이든 실패하면 HTTP 상태만 남기고 빈 목록을 쓴다 — 예전 목록을 남기거나 일부만 싣지 않는다.
// 그러면 화면은 유튜브 목록을 그리지 않고 CSP도 i.ytimg.com을 열지 않는다.
//
// Node가 그대로 불러온다(타입 제거 — src/cspHash.mts와 같은 규칙): 지울 수 있는 타입 문법만, 불러오는 모듈은 ./youtubeCore.mjs 하나.
// 이 파일은 앱 번들에 들어가지 않는다(scripts/youtube-fetch.mjs와 테스트만 부른다). 문구는 개발용 로그다.

import {
  EMPTY_CATALOG,
  MAX_CHANNEL_TITLE_LENGTH,
  MAX_TITLE_LENGTH,
  VIDEO_ID_PATTERN,
  exclusionMatch,
  isAllowlistEmpty,
  parseAllowlist,
  parseCatalog,
  serializeCatalog,
  stageForVideo,
  thumbnailUrl,
} from "./youtubeCore.mjs";
import type { CatalogVideo, Delivery, YouTubeAllowlist, YouTubeCatalog } from "./youtubeCore.mjs";

export const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
/** 부를 수 있는 끝점 — 모두 1단위. search(100단위)는 없다. */
export type YouTubeEndpoint = "videos" | "channels" | "playlistItems";
export const IDS_PER_REQUEST = 50;
/** 자동 표시 채널마다 읽는 업로드 재생목록 쪽 수(쪽당 50개) — 최근 100개 */
export const MAX_UPLOAD_PAGES = 2;
export const REQUEST_TIMEOUT_MS = 15_000;
/** 한국에서 볼 수 있어야 한다(contentDetails.regionRestriction) */
export const VIEWER_REGION = "KR";

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}
export type FetchLike = (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<FetchResponseLike>;

/** API 실패 — status가 null이면 연결 실패·시간 초과. 메시지에 주소·키·응답 본문을 넣지 않는다. */
export class YouTubeApiError extends Error {
  readonly endpoint: YouTubeEndpoint;
  readonly status: number | null;
  constructor(endpoint: YouTubeEndpoint, status: number | null) {
    super(`YouTube API ${endpoint}.list ${status === null ? "연결 실패" : `HTTP ${status}`}`);
    this.name = "YouTubeApiError";
    this.endpoint = endpoint;
    this.status = status;
  }
}

interface ApiClient {
  call(endpoint: YouTubeEndpoint, params: Record<string, string>): Promise<Record<string, unknown>[]>;
  /** 지금까지 보낸 요청 수 = 쓴 할당량(모두 1단위) */
  readonly requests: number;
  /** 마지막 응답의 nextPageToken(playlistItems 쪽 넘김) */
  readonly nextPageToken: string | null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function createClient(fetchImpl: FetchLike, apiKey: string): ApiClient {
  let requests = 0;
  let nextPageToken: string | null = null;
  return {
    get requests() {
      return requests;
    },
    get nextPageToken() {
      return nextPageToken;
    },
    async call(endpoint, params) {
      const url = `${YOUTUBE_API_BASE}/${endpoint}?${new URLSearchParams(params).toString()}`;
      requests++;
      let res: FetchResponseLike;
      try {
        res = await fetchImpl(url, {
          headers: { "X-Goog-Api-Key": apiKey, Accept: "application/json" },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch {
        throw new YouTubeApiError(endpoint, null);
      }
      if (!res.ok) throw new YouTubeApiError(endpoint, res.status);
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        throw new YouTubeApiError(endpoint, res.status);
      }
      if (!isRecord(body)) throw new YouTubeApiError(endpoint, res.status);
      nextPageToken = typeof body.nextPageToken === "string" && body.nextPageToken !== "" ? body.nextPageToken : null;
      // 결과가 없으면 items가 빠지기도 한다(channels.list에 없는 ID)
      if (body.items === undefined) return [];
      if (!Array.isArray(body.items)) throw new YouTubeApiError(endpoint, res.status);
      return body.items.filter(isRecord);
    },
  };
}

function chunks<T>(xs: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

// MARK: - videos.list

/** videos.list 한 건에서 쓰는 값 */
export interface VideoResource {
  id: string;
  title: string;
  description: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  liveBroadcastContent: string;
  privacyStatus: string;
  uploadStatus: string;
  embeddable: boolean;
  ytRating: string | null;
  regionAllowed: string[] | null;
  regionBlocked: string[];
}

export function toVideoResource(item: Record<string, unknown>): VideoResource | null {
  const snippet = isRecord(item.snippet) ? item.snippet : {};
  const status = isRecord(item.status) ? item.status : {};
  const details = isRecord(item.contentDetails) ? item.contentDetails : {};
  const rating = isRecord(details.contentRating) ? details.contentRating : {};
  const region = isRecord(details.regionRestriction) ? details.regionRestriction : {};
  const id = str(item.id);
  if (!VIDEO_ID_PATTERN.test(id)) return null;
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null);
  return {
    id,
    title: str(snippet.title),
    description: str(snippet.description),
    channelId: str(snippet.channelId),
    channelTitle: str(snippet.channelTitle),
    publishedAt: str(snippet.publishedAt),
    liveBroadcastContent: str(snippet.liveBroadcastContent),
    privacyStatus: str(status.privacyStatus),
    uploadStatus: str(status.uploadStatus),
    embeddable: status.embeddable === true,
    ytRating: typeof rating.ytRating === "string" ? rating.ytRating : null,
    regionAllowed: list(region.allowed),
    regionBlocked: list(region.blocked) ?? [],
  };
}

/** 보여 줄 수 없는 까닭 — 공개·처리 끝·퍼가기 허용·연령 제한 없음·실시간/예정 방송 아님·한국에서 볼 수 있음이어야 null */
export function unplayableReason(v: VideoResource): string | null {
  if (v.privacyStatus !== "public") return "공개 영상이 아님";
  if (v.uploadStatus !== "processed") return "처리가 끝나지 않음";
  if (!v.embeddable) return "퍼가기 허용 안 됨";
  if (v.ytRating === "ytAgeRestricted") return "연령 제한";
  if (v.liveBroadcastContent !== "none") return "실시간·예정 방송";
  if (v.regionBlocked.includes(VIEWER_REGION) || (v.regionAllowed !== null && !v.regionAllowed.includes(VIEWER_REGION))) {
    return "한국에서 볼 수 없음";
  }
  return null;
}

async function videosById(api: ApiClient, ids: readonly string[]): Promise<VideoResource[]> {
  const out: VideoResource[] = [];
  for (const chunk of chunks(ids, IDS_PER_REQUEST)) {
    const items = await api.call("videos", { part: "snippet,status,contentDetails", id: chunk.join(","), maxResults: String(IDS_PER_REQUEST) });
    for (const item of items) {
      const v = toVideoResource(item);
      if (v !== null && chunk.includes(v.id)) out.push(v);
    }
  }
  return out;
}

// MARK: - 채널 업로드

async function uploadsPlaylists(api: ApiClient, channelIds: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const chunk of chunks(channelIds, IDS_PER_REQUEST)) {
    const items = await api.call("channels", { part: "contentDetails", id: chunk.join(","), maxResults: String(IDS_PER_REQUEST) });
    for (const item of items) {
      const details = isRecord(item.contentDetails) ? item.contentDetails : {};
      const related = isRecord(details.relatedPlaylists) ? details.relatedPlaylists : {};
      const id = str(item.id);
      const uploads = str(related.uploads);
      if (chunk.includes(id) && uploads !== "") out.set(id, uploads);
    }
  }
  return out;
}

export interface UploadItem {
  videoId: string;
  title: string;
  description: string;
  publishedAt: string;
}

async function recentUploads(api: ApiClient, playlistId: string): Promise<UploadItem[]> {
  const out: UploadItem[] = [];
  let pageToken: string | null = null;
  for (let page = 0; page < MAX_UPLOAD_PAGES; page++) {
    const params: Record<string, string> = { part: "snippet,contentDetails", playlistId, maxResults: String(IDS_PER_REQUEST) };
    if (pageToken !== null) params.pageToken = pageToken;
    const items = await api.call("playlistItems", params);
    for (const item of items) {
      const snippet = isRecord(item.snippet) ? item.snippet : {};
      const resource = isRecord(snippet.resourceId) ? snippet.resourceId : {};
      const details = isRecord(item.contentDetails) ? item.contentDetails : {};
      const videoId = str(resource.videoId) || str(details.videoId);
      if (!VIDEO_ID_PATTERN.test(videoId)) continue;
      out.push({ videoId, title: str(snippet.title), description: str(snippet.description), publishedAt: str(details.videoPublishedAt) });
    }
    pageToken = api.nextPageToken;
    if (pageToken === null) break;
  }
  return out;
}

// MARK: - 생성 목록 만들기

/** 제목·채널 이름 — 제어 문자를 빼고 앞뒤 공백을 다듬어 길이 상한까지 */
function cleanText(s: string, max: number): string {
  return s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function catalogVideo(v: VideoResource, stageKey: string, delivery: Delivery | null): CatalogVideo {
  return {
    videoId: v.id,
    channelId: v.channelId,
    title: cleanText(v.title, MAX_TITLE_LENGTH),
    channelTitle: cleanText(v.channelTitle, MAX_CHANNEL_TITLE_LENGTH),
    publishedAt: v.publishedAt,
    stageKey,
    delivery,
    thumbnail: thumbnailUrl(v.id),
  };
}

export interface BuildStats {
  /** 보낸 요청 수 = 쓴 할당량 단위 */
  requests: number;
  approved: number;
  fromChannels: number;
}

/**
 * 허용 목록 → 생성 목록. API 오류는 YouTubeApiError로 던진다(부르는 쪽이 빈 목록으로 바꾼다).
 * 1) 승인 영상: videos.list로 상태 확인 → 보여 줄 수 있고 제목이 제외 키워드에 맞지 않으면 허용 목록의 단계로.
 * 2) autoShow 채널: 업로드 재생목록의 최근 영상 중 제목이 제외 키워드에 맞지 않고 단계 키워드에 맞는 것 → videos.list로 상태·채널 확인.
 *    autoShow가 false인 채널의 업로드는 읽지 않는다(승인 영상으로만 보인다 — 할당량도 아낀다).
 */
export async function buildCatalog(
  fetchImpl: FetchLike,
  apiKey: string,
  allowlist: YouTubeAllowlist,
  stageKeys: readonly string[],
  now: Date,
): Promise<{ catalog: YouTubeCatalog; stats: BuildStats }> {
  const api = createClient(fetchImpl, apiKey);
  const approved = new Map(allowlist.videos.map((v) => [v.videoId, v]));
  const videos: CatalogVideo[] = [];

  for (const v of await videosById(api, [...approved.keys()])) {
    const a = approved.get(v.id);
    if (a === undefined || unplayableReason(v) !== null || exclusionMatch(v.title, allowlist) !== null) continue;
    videos.push(catalogVideo(v, a.stageKey, a.delivery));
  }
  const approvedCount = videos.length;

  const auto = allowlist.channels.filter((c) => c.autoShow);
  if (auto.length > 0) {
    const playlists = await uploadsPlaylists(api, auto.map((c) => c.channelId));
    /** 후보 영상 ID → 그 영상이 나와야 하는 채널 */
    const candidates = new Map<string, string>();
    for (const c of auto) {
      const playlist = playlists.get(c.channelId);
      if (playlist === undefined) continue;
      for (const u of await recentUploads(api, playlist)) {
        if (approved.has(u.videoId) || candidates.has(u.videoId)) continue;
        if (exclusionMatch(u.title, allowlist) !== null) continue;
        if (stageForVideo(u.title, u.description, allowlist, stageKeys) === null) continue;
        candidates.set(u.videoId, c.channelId);
      }
    }
    for (const v of await videosById(api, [...candidates.keys()])) {
      // 재생목록이 다른 채널 영상을 담고 있어도 그 채널 영상으로 싣지 않는다
      if (v.channelId !== candidates.get(v.id)) continue;
      if (unplayableReason(v) !== null || exclusionMatch(v.title, allowlist) !== null) continue;
      const stage = stageForVideo(v.title, v.description, allowlist, stageKeys);
      if (stage !== null) videos.push(catalogVideo(v, stage, null));
    }
  }

  videos.sort((a, b) => (a.videoId < b.videoId ? -1 : a.videoId > b.videoId ? 1 : 0));
  return {
    catalog: { generatedAt: now.toISOString(), videos },
    stats: { requests: api.requests, approved: approvedCount, fromChannels: videos.length - approvedCount },
  };
}

// MARK: - 검토 후보(--review)

export interface ReviewCandidate {
  channelId: string;
  videoId: string;
  title: string;
  publishedAt: string;
  /** 단계 키워드 판정(없으면 null — autoShow여도 보이지 않는다) */
  suggestedStage: string | null;
  /** 맞은 제외 키워드·패턴(없으면 null) */
  excludedBy: string | null;
  /** 이미 videos에 승인된 영상인가 */
  approved: boolean;
}

/**
 * 모든 허용 채널(autoShow와 무관)의 최근 업로드를 검토 후보로 — 화면에 싣지 않고 CPO·임상 자문이 승인할 영상을 고르는 데만 쓴다.
 * 승인하려면 videos에 { videoId, stageKey, note }를 더한다.
 */
export async function reviewCandidates(
  fetchImpl: FetchLike,
  apiKey: string,
  allowlist: YouTubeAllowlist,
  stageKeys: readonly string[],
): Promise<{ candidates: ReviewCandidate[]; requests: number }> {
  const api = createClient(fetchImpl, apiKey);
  const approved = new Set(allowlist.videos.map((v) => v.videoId));
  const playlists = await uploadsPlaylists(api, allowlist.channels.map((c) => c.channelId));
  const candidates: ReviewCandidate[] = [];
  for (const c of allowlist.channels) {
    const playlist = playlists.get(c.channelId);
    if (playlist === undefined) continue;
    for (const u of await recentUploads(api, playlist)) {
      candidates.push({
        channelId: c.channelId,
        videoId: u.videoId,
        title: cleanText(u.title, MAX_TITLE_LENGTH),
        publishedAt: u.publishedAt,
        suggestedStage: stageForVideo(u.title, u.description, allowlist, stageKeys),
        excludedBy: exclusionMatch(u.title, allowlist),
        approved: approved.has(u.videoId),
      });
    }
  }
  return { candidates, requests: api.requests };
}

// MARK: - 실행

export interface RunOptions {
  /** process.env.YOUTUBE_API_KEY — 비면 아무것도 하지 않는다 */
  apiKey: string | undefined;
  /** src/content/youtube-allowlist.json 내용 */
  allowlistRaw: unknown;
  /** content.json stage_buckets의 key(order 오름차순) */
  stageKeys: readonly string[];
  fetch: FetchLike;
  /** src/content/youtube.generated.json에 쓴다 */
  writeCatalog(json: string): Promise<void>;
  log(line: string): void;
  now(): Date;
  mode: "build" | "review";
}

function failureLabel(e: unknown): string {
  if (e instanceof YouTubeApiError) return e.status === null ? `${e.endpoint}.list 연결 실패` : `${e.endpoint}.list HTTP ${e.status}`;
  return "예상하지 못한 오류";
}

/**
 * 수집 한 번 — 종료 코드를 돌려준다.
 * - 허용 목록 형식 오류: 1(빌드도 같은 검사로 멈춘다 — 커밋한 설정의 잘못이라 조용히 넘기지 않는다).
 * - 허용 목록이 비었거나 키가 없음: 0, 요청 없음, 파일을 건드리지 않는다(커밋된 빈 목록 그대로).
 * - API 실패: 0, 빈 목록을 쓴다(실패 상태만 로그). 예외 메시지는 로그에 옮기지 않는다.
 */
export async function runYouTubeFetch(o: RunOptions): Promise<number> {
  let allowlist: YouTubeAllowlist;
  try {
    allowlist = parseAllowlist(o.allowlistRaw, o.stageKeys);
  } catch (e) {
    o.log(`youtube-fetch: 허용 목록 오류 - ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
  if (isAllowlistEmpty(allowlist)) {
    o.log("youtube-fetch: 허용 목록이 비어 있어 건너뜁니다(요청 없음).");
    return 0;
  }
  const apiKey = (o.apiKey ?? "").trim();
  if (apiKey === "") {
    o.log("youtube-fetch: YOUTUBE_API_KEY가 없어 건너뜁니다(요청 없음).");
    return 0;
  }

  if (o.mode === "review") {
    try {
      const { candidates, requests } = await reviewCandidates(o.fetch, apiKey, allowlist, o.stageKeys);
      for (const c of candidates) {
        const state = c.approved ? "승인됨" : c.excludedBy !== null ? `제외(${c.excludedBy})` : (c.suggestedStage ?? "단계 없음");
        o.log(`${c.videoId}\t${c.publishedAt.slice(0, 10)}\t${state}\t${c.title}`);
      }
      o.log(`youtube-fetch --review: 후보 ${candidates.length}개, 요청 ${requests}회(할당량 ${requests}단위). 생성 파일은 바꾸지 않았습니다.`);
      return 0;
    } catch (e) {
      o.log(`youtube-fetch --review: YouTube API 실패(${failureLabel(e)})`);
      return 1;
    }
  }

  let json: string;
  try {
    const { catalog, stats } = await buildCatalog(o.fetch, apiKey, allowlist, o.stageKeys, o.now());
    // 쓰기 전에 빌드와 같은 검사를 거친다(형식이 틀린 파일로 빌드가 멈추지 않게)
    json = serializeCatalog(parseCatalog(JSON.parse(serializeCatalog(catalog)), o.stageKeys));
    o.log(
      `youtube-fetch: 영상 ${catalog.videos.length}개(승인 영상 ${stats.approved} · 자동 표시 채널 ${stats.fromChannels}), 요청 ${stats.requests}회(할당량 ${stats.requests}단위).`,
    );
  } catch (e) {
    o.log(`youtube-fetch: YouTube API 실패(${failureLabel(e)}) - 유튜브 추천 영상 없이 빌드합니다.`);
    json = serializeCatalog(EMPTY_CATALOG);
  }
  await o.writeCatalog(json);
  return 0;
}
