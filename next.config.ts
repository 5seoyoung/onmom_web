import type { NextConfig } from "next";

// GitHub Pages는 정적 파일만 서빙한다 → 서버 기능(API 라우트·미들웨어·SSR) 없이 `out/`만 만든다.
// 프로젝트 페이지(5seoyoung.github.io/onmom_web)는 하위 경로라 BASE_PATH="/onmom_web",
// 커스텀 도메인을 붙이면 BASE_PATH="" — 배포 워크플로가 actions/configure-pages 값으로 주입한다.
const basePath = process.env.BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
