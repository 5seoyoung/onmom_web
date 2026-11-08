import type { MetadataRoute } from "next";
import { config } from "@/config";
import { robotsRules } from "@/features/meta/searchIndex";

// robots.txt — 빌드 때 NEXT_PUBLIC_SITE_INDEXABLE(config.siteIndexable)로 만든다(out/robots.txt). 내용·이유는 features/meta/searchIndex.ts.
// 꺼짐(기본)이면 모든 크롤러를 막고 링크 미리보기 봇만 허용한다. public/에 같은 이름의 파일을 두지 않는다(빌드 충돌).
// 정적 내보내기(output: "export")라 빌드 때 한 번만 만든다(요청 시각 API를 쓰지 않는다 — manifest.ts와 같다).
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return robotsRules({ indexable: config.siteIndexable, basePath: config.basePath, siteUrl: config.siteUrl });
}
