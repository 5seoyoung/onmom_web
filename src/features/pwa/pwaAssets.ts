// PWA 정적 자산의 주소 — 매니페스트·아이콘·서비스 워커(public/). 루트 레이아웃(메타데이터)과 등록 코드·테스트가 같은 값을 쓴다.
//
// Next의 메타데이터는 basePath를 붙여 주지 않는다(next/link·라우터만 붙인다). 그래서 주소마다 config.basePath를 앞에 붙인다(pwaAssetUrl).
// public/manifest.webmanifest 자체는 정적 파일이라 start_url·scope에 PRODUCTION_BASE_PATH가 그대로 적혀 있다 — 커스텀 도메인으로 옮기면
// 그 파일의 세 값(id·start_url·scope)을 "/"로 고친다(docs/PWA_AND_REMINDERS.md). pwa.test.ts가 매니페스트와 이 상수가 어긋나지 않는지 본다.

export const PWA_APP_TITLE = "온맘"; // 원문: LoginView.swift 브랜드명 — 홈 화면 아이콘 이름

/** GitHub Pages 프로젝트 페이지의 basePath — deploy.yml이 configure-pages 값으로 넣는 것과 같다. 매니페스트의 start_url·scope와 맞춘다. */
export const PRODUCTION_BASE_PATH = "/onmom_web";

export const MANIFEST_PATH = "/manifest.webmanifest";
export const SW_PATH = "/sw.js";

export const PWA_ICONS = {
  icon192: { path: "/icons/icon-192.png", size: 192 },
  icon512: { path: "/icons/icon-512.png", size: 512 },
  maskable192: { path: "/icons/icon-maskable-192.png", size: 192 },
  maskable512: { path: "/icons/icon-maskable-512.png", size: 512 },
  apple180: { path: "/icons/apple-touch-icon-180.png", size: 180 },
} as const;

export type PwaAssetKey = "manifest" | keyof typeof PWA_ICONS;

/** `${basePath}/manifest.webmanifest`, `${basePath}/icons/icon-192.png` … — basePath는 ""(커스텀 도메인) 또는 "/onmom_web". */
export function pwaAssetUrl(basePath: string, key: PwaAssetKey): string {
  const path = key === "manifest" ? MANIFEST_PATH : PWA_ICONS[key].path;
  return `${basePath}${path}`;
}

/** 서비스 워커 파일 주소 — public/sw.js는 자기 주소에서 basePath를 뗀다(하드코딩 없음). */
export function serviceWorkerUrl(basePath: string): string {
  return `${basePath}${SW_PATH}`;
}

/** 서비스 워커의 범위 — 사이트 전체(basePath 아래). 매니페스트 scope와 같다. */
export function serviceWorkerScope(basePath: string): string {
  return `${basePath}/`;
}
