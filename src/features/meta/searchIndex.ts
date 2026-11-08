// 검색 노출 — 빌드 때 만드는 robots.txt·sitemap.xml의 내용(src/app/robots.ts·sitemap.ts가 이 함수를 부른다). docs/SECURITY.md "검색 노출".
//
// 스위치는 하나다: NEXT_PUBLIC_SITE_INDEXABLE(config.siteIndexable). 화면마다의 robots 메타(config.robotsFor)와 같은 목록
// (config.SEARCH_INDEX_ROUTES — 시작 주소·처리방침·약관)을 쓴다.
// - 꺼짐(기본, 1.0 공개 전): 예전 정적 public/robots.txt와 같은 규칙 — 모든 크롤러 Disallow: /, 링크 미리보기 봇만 Allow: /.
//   sitemap.xml은 항목 없이(빈 urlset), robots.txt에 Sitemap 줄도 없다.
// - 켜짐: "*" 그룹이 목록의 주소만 끝까지 정확히(`$`) 허용하고 나머지는 계속 Disallow: /(앱 화면·정적 파일·RSC 조각 .txt). Sitemap 줄과
//   sitemap.xml에 목록의 절대 주소(config.siteUrl — NEXT_PUBLIC_SITE_URL)를 싣는다.
// 링크 미리보기 봇은 늘 허용한다 — 카카오톡·X·페이스북·슬랙이 공유 카드(OG 메타데이터)를 그리려면 페이지를 읽어야 하고, 이 봇들은 검색 색인을
// 만들지 않는다(검색 노출은 "*" 그룹과 화면마다의 noindex가 막는다).
// GitHub 프로젝트 페이지(하위 경로)에서는 크롤러가 도메인 루트의 robots.txt만 읽으므로 이 파일은 전용 도메인(onmomcare.app, basePath "")에서
// 효력이 있다. 켜짐의 Allow 주소에는 basePath를 붙인다(하위 경로 빌드에서도 주소가 맞게).

import type { MetadataRoute } from "next";
import { SEARCH_INDEX_ROUTES } from "@/config";

/** 공유 카드를 그리는 링크 미리보기 봇 — 색인을 만들지 않으므로 늘 허용한다 */
export const LINK_PREVIEW_BOTS: readonly string[] = ["kakaotalk-scrap", "Twitterbot", "facebookexternalhit", "Slackbot-LinkExpanding"];

/** 빌드 때 정해지는 값 — src/app/robots.ts·sitemap.ts는 config에서 읽어 넘긴다(테스트는 값을 바꿔 넘긴다) */
export interface SearchIndexInput {
  /** NEXT_PUBLIC_SITE_INDEXABLE === "true" */
  indexable: boolean;
  /** 이 빌드의 basePath("" 또는 "/onmom_web") */
  basePath: string;
  /** 사이트 주소(origin + basePath + "/", config.siteUrl) */
  siteUrl: string;
}

/** robots.txt 규칙(Next가 robots.txt 글로 바꾼다) */
export function robotsRules({ indexable, basePath, siteUrl }: SearchIndexInput): MetadataRoute.Robots {
  const previewBots = { userAgent: [...LINK_PREVIEW_BOTS], allow: "/" };
  if (!indexable) return { rules: [previewBots, { userAgent: "*", disallow: "/" }] };
  const base = basePath.replace(/\/+$/, "");
  return {
    rules: [
      previewBots,
      // 주소 끝의 $ — 그 주소만(아래 파일·조각·쿼리 붙은 주소는 Disallow: /가 막는다). 더 긴 규칙이 이기므로 순서와 무관하다.
      { userAgent: "*", allow: SEARCH_INDEX_ROUTES.map((route) => `${base}${route}$`), disallow: "/" },
    ],
    sitemap: new URL("sitemap.xml", siteUrl).href,
  };
}

/** sitemap.xml 항목 — 꺼짐이면 없음. 마지막 수정일은 넣지 않는다(빌드가 매일 돌아 날짜만 바뀐다). */
export function sitemapEntries({ indexable, siteUrl }: Omit<SearchIndexInput, "basePath">): MetadataRoute.Sitemap {
  if (!indexable) return [];
  return SEARCH_INDEX_ROUTES.map((route) => ({ url: new URL(route.replace(/^\//, ""), siteUrl).href }));
}
