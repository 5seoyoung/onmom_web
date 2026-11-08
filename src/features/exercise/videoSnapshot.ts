/* eslint-disable @typescript-eslint/ban-ts-comment -- Node(빌드 전 수집)는 ".ts" 확장자가 있어야 가져온다. Next tsc(TS5097)만 그 줄을 넘기게 한다. */
// 운동 영상 목록 스냅숏 — 빌드 전에 받아 둔 두 분만 경로의 영상 목록(src/content/videos.generated.json)의 형식과 검사.
// 쓰는 쪽은 둘이고 같은 검사를 쓴다: 빌드 전 수집(videoSnapshotFetch.mts ← scripts/videos-fetch.mjs, Node)과 앱(videoLoad.ts, 번들).
//
// 왜: 영상 서버(Render 무료 인스턴스)는 15분 쓰지 않으면 잠들어 첫 요청이 20~40초 걸린다. 빌드 때 받아 두면 화면은 기다리지 않고,
// 분만 경로 태그(= 사용자의 분만 방식)도 기기 밖으로 나가지 않는다. 받지 못한 빌드는 지금처럼 Edge Function에 묻는다(videoLoad.ts loadVideos).
//
// 형식: { fetchedAt: ISO 시각 | null, routes: { route_vaginal_delivery: Video[], route_cesarean_section: Video[] } }
// - 영상 한 건은 Edge Function videos가 돌려주는 다섯 필드(video_id·title·url·description·tags)뿐 — 함수와 같은 검사
//   (_shared/videos.ts sanitizeVideoPayload: 한 항목이라도 틀리면 그 목록 전체를 거부, 모르는 필드는 버린다). 순서는 서버가 준 그대로.
// - url은 여기서도 신뢰하지 않는다 — 화면이 링크로 만들 때 safeExternalUrl을 거친다(exerciseModel.ts, 검수 #51).
// - 둘 중 하나만 있다:
//   빈 스냅숏 — fetchedAt null, 두 경로 모두 빈 목록(저장소에 커밋된 모양, 수집하지 못한 빌드) → 앱은 함수에 묻는다.
//   받은 스냅숏 — fetchedAt 시각, 두 경로 모두 영상 1개 이상 → 앱은 요청하지 않는다.
//   한 경로만 받았거나 한 경로가 비면 받지 못한 것으로 본다: 한쪽 사용자만 함수에 묻게 되면 요청이 있는지만으로 분만 방식이
//   드러나기 때문이다(api/video.ts 머리말 — 누구나 같은 요청을 보낸다). 수집 단계는 그런 결과를 빈 스냅숏으로 바꿔 쓴다.
//
// Node가 그대로 불러온다(타입 제거 — CI는 Node 24): 지울 수 있는 타입 문법만, 가져오는 모듈은 _shared/videos.ts 하나(확장자까지 —
// @/ 별칭·확장자 없는 경로는 Node가 못 찾는다). 오류 문구는 개발용이다(빌드·수집 단계에서만 보인다).

// @ts-ignore: TS5097(Next tsc) — Node용 확장자
import { sanitizeVideoPayload, VIDEO_ROUTE_TAGS } from "../../../supabase/functions/_shared/videos.ts";
import type { ProxiedVideo, VideoRouteTag } from "../../../supabase/functions/_shared/videos.ts";

/** 스냅숏의 영상 한 건 — 함수 응답의 videos[]와 같은 다섯 필드(rules/exercise Video와 같은 모양) */
export type SnapshotVideo = ProxiedVideo;

export interface VideoSnapshot {
  /** 받은 시각(ISO 8601). null이면 빈 스냅숏 */
  fetchedAt: string | null;
  routes: Readonly<Record<VideoRouteTag, readonly SnapshotVideo[]>>;
}

export const EMPTY_VIDEO_SNAPSHOT: VideoSnapshot = Object.freeze({
  fetchedAt: null,
  routes: Object.freeze({ route_vaginal_delivery: [], route_cesarean_section: [] }),
});

export class VideoSnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VideoSnapshotError";
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const isRouteTag = (v: string): v is VideoRouteTag => (VIDEO_ROUTE_TAGS as readonly string[]).includes(v);

/** 경로 하나의 영상 목록 — 함수 응답과 같은 규칙(sanitizeVideoPayload)으로 다섯 필드만. 배열이 아니거나 한 항목이라도 틀리면 null. */
export function sanitizeRouteVideos(videos: unknown): SnapshotVideo[] | null {
  if (!Array.isArray(videos)) return null;
  return sanitizeVideoPayload({ count: videos.length, videos })?.videos ?? null;
}

/**
 * 스냅숏 검사 — 앱은 모듈을 읽을 때(정적 빌드) 부르므로 틀린 파일이면 빌드가 멈춘다. 수집 단계는 쓰기 전에 같은 검사를 거친다.
 * 맞으면 다섯 필드만 담은 새 객체, 틀리면 VideoSnapshotError.
 */
export function parseVideoSnapshot(raw: unknown): VideoSnapshot {
  if (!isRecord(raw)) throw new VideoSnapshotError("스냅숏이 객체가 아닙니다");
  for (const key of Object.keys(raw)) {
    if (key !== "fetchedAt" && key !== "routes") throw new VideoSnapshotError(`스냅숏에 모르는 항목: ${key}`);
  }
  const { fetchedAt, routes } = raw;
  if (fetchedAt !== null && !(typeof fetchedAt === "string" && isIsoTimestamp(fetchedAt))) {
    throw new VideoSnapshotError("fetchedAt은 null 또는 ISO 8601 시각(toISOString)이어야 합니다");
  }
  if (!isRecord(routes)) throw new VideoSnapshotError("routes가 객체가 아닙니다");
  for (const key of Object.keys(routes)) {
    if (!isRouteTag(key)) throw new VideoSnapshotError(`routes에 모르는 경로: ${key}`);
  }
  const out = {} as Record<VideoRouteTag, SnapshotVideo[]>;
  for (const tag of VIDEO_ROUTE_TAGS) {
    const videos = sanitizeRouteVideos(routes[tag]);
    if (videos === null) throw new VideoSnapshotError(`${tag} 영상 목록의 형식이 틀렸습니다`);
    out[tag] = videos;
  }
  const empties = VIDEO_ROUTE_TAGS.filter((tag) => out[tag].length === 0).length;
  if (fetchedAt === null && empties !== VIDEO_ROUTE_TAGS.length) {
    throw new VideoSnapshotError("fetchedAt이 null이면 두 경로 모두 빈 목록이어야 합니다");
  }
  if (fetchedAt !== null && empties > 0) {
    throw new VideoSnapshotError("받은 스냅숏은 두 경로 모두 영상이 있어야 합니다(한쪽만 있으면 요청 유무로 분만 방식이 드러난다)");
  }
  return { fetchedAt, routes: out };
}

function isIsoTimestamp(s: string): boolean {
  const t = Date.parse(s);
  return !Number.isNaN(t) && new Date(t).toISOString() === s;
}

/** 파일로 쓸 글자 — 경로는 VIDEO_ROUTE_TAGS 순서, 영상은 다섯 필드만(들여쓰기 2, 끝 줄바꿈 — youtube.generated.json과 같은 모양) */
export function serializeVideoSnapshot(snapshot: VideoSnapshot): string {
  const routes = Object.fromEntries(
    VIDEO_ROUTE_TAGS.map((tag) => [
      tag,
      snapshot.routes[tag].map((v) => ({ video_id: v.video_id, title: v.title, url: v.url, description: v.description, tags: [...v.tags] })),
    ]),
  );
  return `${JSON.stringify({ fetchedAt: snapshot.fetchedAt, routes }, null, 2)}\n`;
}

/**
 * 이 경로의 받아 둔 영상 — 서버가 준 순서 그대로. 빈 스냅숏이거나 모르는 태그면 null(그때는 함수에 묻는다).
 * 받은 스냅숏은 두 경로 모두 영상이 있으므로(parseVideoSnapshot) 어느 분만 방식이든 같이 null이 아니다.
 */
export function snapshotVideos(snapshot: VideoSnapshot, includeTag: string): readonly SnapshotVideo[] | null {
  if (snapshot.fetchedAt === null || !isRouteTag(includeTag)) return null;
  const videos = snapshot.routes[includeTag];
  return videos.length > 0 ? videos : null;
}
