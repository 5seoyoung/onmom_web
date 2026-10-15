// 유튜브 추천 영상 목록 — 빌드 때 정해진다(정적 JSON). 브라우저는 YouTube API를 부르지 않고, 미리보기 이미지(i.ytimg.com)만 불러온다.
//
// - 허용 목록(src/content/youtube-allowlist.json): CPO·임상 자문이 승인한 채널·영상. 형식은 모듈을 읽을 때(정적 빌드) 검사해
//   틀리면 빌드가 멈춘다(youtubeCore.mjs parseAllowlist).
// - 생성 목록(src/content/youtube.generated.json): 빌드 전 수집 단계(scripts/youtube-fetch.mjs)가 쓴다. 저장소에는 빈 목록을 둔다 —
//   키가 없는 빌드(내 컴퓨터·e2e)는 늘 같은 결과(유튜브 목록 없음, 요청 없음).
// - 실제로 싣는 것은 두 파일을 다시 맞춘 결과(resolveCatalog)뿐이다. 허용 목록에서 빠진 영상은 낡은 생성 파일에 남아 있어도 보이지 않는다.
// YOUTUBE_ACTIVE가 false면 운동 탭에 목록이 없고, CSP img-src에 i.ytimg.com을 넣지 않으며(src/csp.ts), 처리방침에 Google을 적지 않는다.

import content from "@/content";
import allowlistJson from "@/content/youtube-allowlist.json";
import generatedJson from "@/content/youtube.generated.json";
import { orderedStageKeys, parseAllowlist, parseCatalog, resolveCatalog } from "./youtubeCore.mjs";
import type { CatalogVideo, YouTubeAllowlist } from "./youtubeCore.mjs";

const STAGE_KEYS = orderedStageKeys(content.stage_buckets);

export const YOUTUBE_ALLOWLIST: YouTubeAllowlist = parseAllowlist(allowlistJson, STAGE_KEYS);

/** 이 빌드의 유튜브 추천 영상(분만 방식·주차·산모수첩 게이팅 전) */
export const YOUTUBE_VIDEOS: readonly CatalogVideo[] = resolveCatalog(parseCatalog(generatedJson, STAGE_KEYS), YOUTUBE_ALLOWLIST);

/** 빌드 플래그 — 실을 영상이 하나라도 있는가. 운동 탭 목록·CSP의 i.ytimg.com·처리방침의 Google 줄이 이 값을 따른다. */
export const YOUTUBE_ACTIVE: boolean = YOUTUBE_VIDEOS.length > 0;
