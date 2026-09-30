import { resolve } from "node:path";
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
  // 빌드 뒤 단계 — out/을 다 쓴 다음 HTML마다 인라인 스크립트 해시를 CSP 메타 script-src에 넣는다(src/csp.ts). 어느 방법으로 빌드해도
  // (npm run build·npm run e2e·npx next build) 돈다. 실패하면 빌드가 실패한다. 경로는 저장소 루트(next build를 실행하는 곳) 기준.
  adapterPath: resolve("scripts/csp-hash.mjs"),
};

export default nextConfig;
