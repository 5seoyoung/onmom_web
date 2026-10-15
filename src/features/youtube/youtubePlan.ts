// 운동 탭 "유튜브 추천 영상" 화면 모델 — 큐레이션 목록(영상 서버)과 같은 규칙(rules/exercise)으로 거른다.
// - 운동 탭이 플랜을 보일 때만(게이트 "plan"): 분만 방식·출산일이 있고, 최근 기록에 레드플래그가 없을 때. 레드플래그면 아무것도 없다.
// - 큐레이션 목록의 "가능" 카드와 같은 조건만 보인다: 그 단계가 열리는 주차가 됐고(startWeek), 산모수첩 소견으로 막힌 단계가 아님
//   (blockedBuckets). 잠긴 영상은 아예 싣지 않는다 — 외부 영상은 잠금 안내 없이 숨긴다.
// - 영상에 분만 방식이 정해져 있으면 그 분만 방식에만.
// - 순서는 큐레이션 목록과 같게 단계순, 같으면 영상 ID순(exercisePlan).
// 보일 영상이 없으면 null — 제목도 그리지 않는다.

import { safeExternalUrl } from "@/api/safeUrl";
import type { DeliveryMethod, MaternityRecord } from "@/domain/types";
import type { ExerciseGate } from "@/features/exercise/exerciseModel";
import { blockedBuckets, bucketByKey, startWeek, type StageBucket } from "@/rules/exercise";
import { THUMBNAIL_HOST, watchUrl } from "./youtubeCore.mjs";
import type { CatalogVideo } from "./youtubeCore.mjs";

export const YOUTUBE_TEXT = {
  heading: "유튜브 추천 영상", // 웹 신규 문구 — CPO 확인 필요
  // 웹 신규 문구 — CPO 확인 필요. content.json에 그대로 맞는 문장이 없어(운동을 멈추라는 안내 없음) 새로 썼다 — 의학적 효과는 말하지 않는다.
  disclaimer: "온맘이 고른 외부 유튜브 채널의 영상이에요. 따라 하다가 통증이나 출혈이 늘면 바로 멈추세요.",
  // 웹 신규 문구 — CPO 확인 필요. 화면에는 보이지 않고 스크린리더가 링크 이름 끝에 읽는다(새 탭에서 유튜브가 열린다).
  opensInNewTab: "유튜브 새 탭에서 열기",
} as const;

export interface YouTubeCardModel {
  videoId: string;
  title: string;
  channelTitle: string;
  /** 단계 제목(규칙의 단계 이름 그대로) */
  stageTitle: string;
  /** safeExternalUrl을 거친 youtube.com 주소 */
  href: string;
  /** https://i.ytimg.com/… 이 아니면 null — 이미지 없이 자리만 그린다 */
  thumbnail: string | null;
}

export interface YouTubeSectionModel {
  heading: string;
  disclaimer: string;
  count: number;
  cards: YouTubeCardModel[];
  opensInNewTab: string;
}

/** 미리보기 주소 — https + i.ytimg.com만 */
export function safeThumbnailUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === THUMBNAIL_HOST && u.port === "" && u.username === "" ? u.href : null;
  } catch {
    return null;
  }
}

export function youtubeSection(
  videos: readonly CatalogVideo[],
  /** 운동 탭 본문 분기 — "plan"일 때만 그린다(레드플래그·분만 방식/출산일 없음이면 null) */
  gate: ExerciseGate,
  delivery: DeliveryMethod | null,
  week: number | null,
  maternity: MaternityRecord,
): YouTubeSectionModel | null {
  if (gate !== "plan" || delivery === null || week === null || videos.length === 0) return null;
  const blocked = blockedBuckets(maternity);
  const items: { bucket: StageBucket; card: YouTubeCardModel }[] = [];
  for (const v of videos) {
    const bucket = bucketByKey(v.stageKey);
    if (bucket === null) continue;
    if (v.delivery !== null && v.delivery !== delivery) continue;
    if (week < startWeek(bucket, delivery) || blocked[bucket.key] !== undefined) continue;
    const href = safeExternalUrl(watchUrl(v.videoId));
    if (href === null) continue;
    items.push({
      bucket,
      card: { videoId: v.videoId, title: v.title, channelTitle: v.channelTitle, stageTitle: bucket.title, href, thumbnail: safeThumbnailUrl(v.thumbnail) },
    });
  }
  if (items.length === 0) return null;
  items.sort((a, b) => a.bucket.order - b.bucket.order || (a.card.videoId < b.card.videoId ? -1 : a.card.videoId > b.card.videoId ? 1 : 0));
  return {
    heading: YOUTUBE_TEXT.heading,
    disclaimer: YOUTUBE_TEXT.disclaimer,
    count: items.length,
    cards: items.map((i) => i.card),
    opensInNewTab: YOUTUBE_TEXT.opensInNewTab,
  };
}
