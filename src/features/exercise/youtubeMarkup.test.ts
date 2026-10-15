// 운동 탭 "유튜브 추천 영상" 마크업(서버 렌더로 확인) — 목록 구조, 링크 이름에 제목, 새 탭(opener·Referer 없음), 44px 이상,
// 미리보기는 늦게·Referer 없이. 영상은 시험용 가짜 값(fixture)이다.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EXTERNAL_LINK_PROPS } from "@/api/safeUrl";
import type { MaternityRecord } from "@/domain/types";
import { thumbnailUrl } from "@/features/youtube/youtubeCore.mjs";
import type { CatalogVideo } from "@/features/youtube/youtubeCore.mjs";
import { YOUTUBE_TEXT, youtubeSection } from "@/features/youtube/youtubePlan";
import { YouTubeSection } from "./YouTubeSection";

const M: MaternityRecord = { isPrimiparous: true, gdm: false, anemia: false, heavyBleeding: false, preeclampsia: false, pelvicPain: false, diastasisRecti: false };

function video(videoId: string, title: string, stageKey: string): CatalogVideo {
  return { videoId, channelId: "UCtestChannelAAAAAAAAAAA", title, channelTitle: "시험 채널 <b>", publishedAt: "2026-09-01T00:00:00Z", stageKey, delivery: null, thumbnail: thumbnailUrl(videoId) };
}

const section = youtubeSection(
  [video("testVid0001", "산후 복식호흡 & 이완", "recovery_priority"), video("testVid0002", "골반저근 운동", "pelvic_floor")],
  "plan",
  "vaginal",
  8,
  M,
)!;
const html = renderToStaticMarkup(h(YouTubeSection, { section }));
const count = (needle: string) => html.split(needle).length - 1;

describe("유튜브 추천 영상 마크업", () => {
  it("섹션 = 제목(h2)으로 이름 붙은 section + 안내 한 줄 + 목록(ul > li)", () => {
    expect(html).toMatch(/^<section aria-labelledby="([^"]+)"[^>]*><h2 id="\1"/);
    expect(html).toContain(`>${YOUTUBE_TEXT.heading}</span>`);
    expect(html).toContain(">2</span>");
    expect(html).toContain(YOUTUBE_TEXT.disclaimer);
    expect(count("<ul")).toBe(1);
    expect(count("<li")).toBe(2);
  });

  it("카드마다 링크 하나 — youtube.com watch, 새 탭, noopener noreferrer, 44px 이상", () => {
    const links = html.match(/<a [^>]*>/g) ?? [];
    expect(links).toHaveLength(2);
    expect(links[0]).toContain('href="https://www.youtube.com/watch?v=testVid0001"');
    for (const a of links) {
      expect(a).toContain(`target="${EXTERNAL_LINK_PROPS.target}"`);
      expect(a).toContain(`rel="${EXTERNAL_LINK_PROPS.rel}"`);
      expect(a).toContain("min-h-11");
    }
  });

  it("링크 이름 = 제목(먼저) + 채널 이름 + 단계 + '새 탭' 안내(스크린리더) — 글자는 이스케이프된다", () => {
    const first = html.match(/<a [^>]*>([\s\S]*?)<\/a>/)![1];
    const text = first.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    expect(text).toBe(`산후 복식호흡 &amp; 이완 시험 채널 &lt;b&gt; 회복 우선기 ${YOUTUBE_TEXT.opensInNewTab}`);
    expect(first).toContain(`<span class="sr-only">${YOUTUBE_TEXT.opensInNewTab}</span>`);
  });

  it("미리보기 — i.ytimg.com, 장식(alt 빈 값), 늦게 불러오기, Referer 없음, 크기 지정", () => {
    const imgs = html.match(/<img [^>]*>/g) ?? [];
    expect(imgs).toHaveLength(2);
    for (const img of imgs) {
      expect(img).toMatch(/src="https:\/\/i\.ytimg\.com\/vi\/testVid000[12]\/mqdefault\.jpg"/);
      expect(img).toContain('alt=""');
      expect(img).toContain('loading="lazy"');
      expect(img).toContain('referrerPolicy="no-referrer"');
      expect(img).toContain('width="320"');
      expect(img).toContain('height="180"');
    }
  });

  it("글자는 자르지 않는다(150% 글자 크기에서도 줄바꿈) — 미리보기 폭은 카드 폭의 비율", () => {
    expect(html).not.toContain("line-clamp");
    expect(html).not.toContain("truncate");
    expect(html).toContain("w-[36%]");
  });

  it("미리보기 주소가 없으면 이미지 없이 자리만", () => {
    const noThumb = renderToStaticMarkup(h(YouTubeSection, { section: { ...section, cards: [{ ...section.cards[0], thumbnail: null }] } }));
    expect(noThumb).not.toContain("<img");
    expect(noThumb).toContain("<svg");
  });
});
