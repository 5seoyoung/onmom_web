import type { MetadataRoute } from "next";
import { config } from "@/config";
import { webManifest } from "@/features/pwa/pwaAssets";

// 웹 앱 매니페스트(홈 화면 추가) — 빌드 때 이 빌드의 basePath로 만든다(out/manifest.webmanifest). 내용은 pwaAssets.webManifest.
// Next가 이 파일을 보고 모든 화면에 <link rel="manifest" href="${basePath}/manifest.webmanifest">를 넣는다.
// 정적 내보내기(output: "export")라 빌드 때 한 번만 만든다(요청 시각 API를 쓰지 않는다).
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return webManifest(config.basePath);
}
