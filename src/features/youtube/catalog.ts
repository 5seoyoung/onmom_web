// 유튜브 추천 영상 목록 — 빌드 때 정해진다(정적 JSON). 브라우저는 YouTube API를 부르지 않고, 미리보기 이미지(i.ytimg.com)만 불러온다.
//
// - 허용 목록(src/content/youtube-allowlist.json): CPO·임상 자문이 승인한 채널·영상. 형식은 모듈을 읽을 때(정적 빌드) 검사해
//   틀리면 빌드가 멈춘다(youtubeCore.mjs parseAllowlist).
// - 생성 목록(src/content/youtube.generated.json): 빌드 전 수집 단계(scripts/youtube-fetch.mjs)가 쓴다. 저장소에는 빈 목록을 둔다 —
//   키가 없는 빌드(내 컴퓨터·e2e)는 늘 같은 결과(유튜브 목록 없음, 요청 없음).
// - 실제로 싣는 것은 두 파일을 다시 맞춘 결과(resolveCatalog)뿐이다. 허용 목록에서 빠진 영상은 낡은 생성 파일에 남아 있어도 보이지 않는다.
// - Supabase 설정이 있는 빌드에서만 켠다(youtubeActiveFor): 미리보기 이미지를 주는 Google(YouTube)은 웹 처리방침 초안(webPolicyText.ts)에만
//   적혀 있고, 그 초안은 Supabase 빌드에서만 보인다(features/privacy/policy.ts activePolicy). Supabase가 없는 빌드(지금 공개 사이트)는
//   iOS 처리방침 원문을 보이는데 거기에는 Google이 없다 — 그 빌드에서는 영상이 실려 있어도 목록·요청이 없다.
// YOUTUBE_ACTIVE가 false면 운동 탭에 목록이 없고(YOUTUBE_SHOWN_VIDEOS가 빈 목록), CSP img-src에 i.ytimg.com을 넣지 않으며(src/csp.ts),
// 처리방침에 Google을 적지 않는다.

import { isSupabaseConfigured } from "@/config";
import content from "@/content";
import allowlistJson from "@/content/youtube-allowlist.json";
import generatedJson from "@/content/youtube.generated.json";
import { orderedStageKeys, parseAllowlist, parseCatalog, resolveCatalog } from "./youtubeCore.mjs";
import type { CatalogVideo, YouTubeAllowlist } from "./youtubeCore.mjs";

const STAGE_KEYS = orderedStageKeys(content.stage_buckets);

export const YOUTUBE_ALLOWLIST: YouTubeAllowlist = parseAllowlist(allowlistJson, STAGE_KEYS);

/** 이 빌드에 실린 유튜브 추천 영상(분만 방식·주차·산모수첩 게이팅 전, 빌드 종류와 상관없이) — 화면은 YOUTUBE_SHOWN_VIDEOS를 쓴다 */
export const YOUTUBE_VIDEOS: readonly CatalogVideo[] = resolveCatalog(parseCatalog(generatedJson, STAGE_KEYS), YOUTUBE_ALLOWLIST);

/**
 * 유튜브 추천 영상을 켜는가 — 실을 영상이 하나라도 있고, Google(YouTube 미리보기)을 적은 웹 처리방침 초안을 보이는 빌드일 때만.
 * webPolicyShown은 activePolicy()가 웹 초안을 고르는 조건과 같다(Supabase 설정 — youtubeGate.test.ts가 둘을 함께 확인한다).
 */
export function youtubeActiveFor(videoCount: number, webPolicyShown: boolean): boolean {
  return videoCount > 0 && webPolicyShown;
}

/** 빌드 플래그 — 운동 탭 목록·CSP의 i.ytimg.com(components/CspMeta.tsx)·처리방침의 Google 줄(features/privacy/policy.ts)이 이 값을 따른다. */
export const YOUTUBE_ACTIVE: boolean = youtubeActiveFor(YOUTUBE_VIDEOS.length, isSupabaseConfigured());

/** 운동 탭에 싣는 영상 — 켜지지 않은 빌드(YOUTUBE_ACTIVE false — Supabase 없음·영상 없음)면 빈 목록 */
export const YOUTUBE_SHOWN_VIDEOS: readonly CatalogVideo[] = YOUTUBE_ACTIVE ? YOUTUBE_VIDEOS : [];
