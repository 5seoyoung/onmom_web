import type { MetadataRoute } from "next";
import { config } from "@/config";
import { sitemapEntries } from "@/features/meta/searchIndex";

// sitemap.xml — 빌드 때 NEXT_PUBLIC_SITE_INDEXABLE(config.siteIndexable)로 만든다(out/sitemap.xml). 내용·이유는 features/meta/searchIndex.ts.
// 꺼짐(기본)이면 항목이 없다(빈 urlset — robots.txt도 이 파일을 가리키지 않는다). 켜면 시작 주소·처리방침·약관의 절대 주소(NEXT_PUBLIC_SITE_URL).
// 정적 내보내기(output: "export")라 빌드 때 한 번만 만든다(요청 시각 API를 쓰지 않는다 — manifest.ts와 같다).
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries({ indexable: config.siteIndexable, siteUrl: config.siteUrl });
}
