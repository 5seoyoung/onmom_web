// 영상 조회의 콜드스타트 대응 — 운동 탭·회복 단계 분석이 함께 쓴다(05 §0 콜드스타트, 검수 #57).
//
// 영상 서버(Render 무료 인스턴스)는 잠들어 있으면 첫 응답이 21~32초 걸린다. 첫 시도가 시간 초과·연결 실패·서버 오류(5xx)로
// 끝나면 더 긴 타임아웃으로 **한 번만** 자동으로 다시 시도한다(05 §0: 영상 8초, 재시도 35초). 4xx는 다시 해도 같으므로 하지 않고,
// 사용자가 화면을 떠나(abort) 끝난 요청도 다시 하지 않는다. 그래도 실패면 화면의 [다시 시도] 버튼 몫이다.
// 적용 범위는 영상 조회만이다(검수 #57: /chat·약물에 넣으면 위기 폴백 답이 늦어질 수 있다).
// api/http.ts는 여전히 자동 재시도를 하지 않는다 — 재시도는 이 호출자가 결정한다.
//
// 8초가 지나도 응답이 없으면 스피너 옆에 "서버를 깨우는 중이에요 — 조금만 기다려 주세요"를 보인다(05 §0 콜드스타트 안내).
// 05 §0의 "(최대 30초)"는 쓰지 않는다 — 지킬 수 없는 약속이기 때문이다: Supabase(Edge Function) 빌드에서는 첫 시도가
// 45초(api/video.ts VIDEO_PROXY_TIMEOUT_MS — 함수가 영상 서버를 40초 기다린다)까지 가고, 그 뒤 재시도 35초가 더 붙는다.
// 직접 호출 빌드(NEXT_PUBLIC_VIDEO_URL)도 8초 + 35초라 30초를 넘는다.
//
// 빌드 때 받아 둔 목록(STATUS Q14 ①): 배포 워크플로가 빌드 전에 두 경로의 목록을 받아 src/content/videos.generated.json에 쓴다
// (scripts/videos-fetch.mjs, 형식은 videoSnapshot.ts). 그 목록이 있으면 loadVideos·운동 탭은 요청 없이 바로 쓴다 — 서버가 잠들어도
// 기다리지 않고, 분만 경로 태그가 기기 밖으로 나가지 않는다. 받지 못한 빌드(저장소의 빈 목록 — 내 컴퓨터·VIDEO_API_URL 없음·서버 실패)는
// 위 조회(fetchVideosWithRetry)를 그대로 한다. 목록은 두 경로가 함께 있거나 함께 없다(videoSnapshot.ts — 요청 유무로 분만 방식이 드러나지 않게).
// 목록은 배포마다 새로 받으므로(main push + 매일 03:30 KST) 영상 서버보다 최대 하루쯤 늦을 수 있다.

import type { FetchVideosOptions, FetchVideosResult } from "@/api/video";
import snapshotJson from "@/content/videos.generated.json";
import type { Video } from "@/rules/exercise";
import { parseVideoSnapshot, snapshotVideos, type VideoSnapshot } from "./videoSnapshot";

/** 응답 없이 이만큼 지나면 "서버를 깨우는 중" 안내(05 §0 콜드스타트) */
export const COLD_START_NOTICE_MS = 8_000;
/** 웹 신규 문구 — CPO 확인 필요 (05 §0 "서버를 깨우는 중(최대 30초)"를 화면 말투로 — 시간 약속은 뺐다, 위 설명) */
export const COLD_START_TEXT = "서버를 깨우는 중이에요 - 조금만 기다려 주세요";
/** 자동 재시도 때의 타임아웃(05 §0 "재시도 시 35초") */
export const VIDEO_RETRY_TIMEOUT_MS = 35_000;

export type FetchVideosFn = (includeTag: string, opts?: FetchVideosOptions) => Promise<FetchVideosResult>;

/**
 * 첫 실패 뒤 한 번 더 시도할지 — 시간 초과·연결 실패(network)와 서버 오류(5xx: 함수 프록시의 502 upstream_timeout 포함)만.
 * 미설정·4xx(잘못된 요청·없는 주소)는 다시 해도 같다.
 */
export function shouldRetryVideoFetch(res: FetchVideosResult): boolean {
  if (res.ok || res.kind === "notConfigured") return false;
  if (res.kind === "network") return true;
  return res.status === undefined || res.status >= 500;
}

export interface FetchVideosWithRetryOptions {
  signal?: AbortSignal;
  /** 재시도 때의 타임아웃 — 기본 35초 */
  retryTimeoutMs?: number;
  /** 재시도를 시작할 때(화면이 "서버를 깨우는 중" 안내를 켤 수 있게) */
  onRetry?: () => void;
}

/**
 * 영상 조회 + 자동 재시도 1회. 예외(fetchVideos가 던진 TypeError 등)는 그대로 올린다 — 호출자가 지금처럼 처리한다.
 * signal이 끊긴 뒤에는 다시 시도하지 않고 첫 결과(aborted)를 그대로 돌려준다.
 */
export async function fetchVideosWithRetry(
  fetchVideos: FetchVideosFn,
  includeTag: string,
  opts: FetchVideosWithRetryOptions = {},
): Promise<FetchVideosResult> {
  const first = await fetchVideos(includeTag, { signal: opts.signal });
  if (!shouldRetryVideoFetch(first) || opts.signal?.aborted) return first;
  opts.onRetry?.();
  return fetchVideos(includeTag, { signal: opts.signal, timeoutMs: opts.retryTimeoutMs ?? VIDEO_RETRY_TIMEOUT_MS });
}

// MARK: - 빌드 때 받아 둔 목록

/** 이 빌드에 실린 운동 영상 목록(빌드 전 수집). 형식이 틀리면 모듈을 읽을 때(정적 빌드) 멈춘다 — 수집 단계는 같은 검사를 거쳐 쓴다. */
export const VIDEO_SNAPSHOT: VideoSnapshot = parseVideoSnapshot(snapshotJson);

/** 이 경로의 받아 둔 영상(서버가 준 순서 그대로) — 받지 못한 빌드거나 모르는 태그면 null(그때는 조회한다). 같은 빌드에서는 늘 같은 배열이다. */
export function snapshotVideosFor(includeTag: string, snapshot: VideoSnapshot = VIDEO_SNAPSHOT): readonly Video[] | null {
  return snapshotVideos(snapshot, includeTag);
}

export interface LoadVideosOptions extends FetchVideosWithRetryOptions {
  /** 받아 둔 목록 — 기본은 이 빌드의 VIDEO_SNAPSHOT(테스트가 바꾼다) */
  snapshot?: VideoSnapshot;
}

/**
 * 영상 목록 — 받아 둔 목록에 이 경로 영상이 있으면 그것(요청 없음, onRetry도 부르지 않는다), 없으면 fetchVideosWithRetry 그대로.
 * 회복 단계 분석(analyzeRun)이 쓴다. 운동 탭은 같은 판단을 그리기 전에 한다(snapshotVideosFor — 불러오는 중을 한 번도 그리지 않게).
 */
export async function loadVideos(
  fetchVideos: FetchVideosFn,
  includeTag: string,
  opts: LoadVideosOptions = {},
): Promise<FetchVideosResult> {
  const { snapshot, ...retryOpts } = opts;
  const videos = snapshotVideosFor(includeTag, snapshot);
  if (videos !== null) return { ok: true, videos: [...videos] };
  return fetchVideosWithRetry(fetchVideos, includeTag, retryOpts);
}
