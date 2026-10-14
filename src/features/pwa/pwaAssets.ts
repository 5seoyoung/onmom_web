// PWA 자산의 주소와 웹 앱 매니페스트 — 아이콘·서비스 워커는 public/, 매니페스트는 빌드 때 만든다(src/app/manifest.ts → out/manifest.webmanifest).
// 루트 레이아웃(메타데이터)과 등록 코드·테스트가 같은 값을 쓴다.
//
// Next의 메타데이터는 basePath를 붙여 주지 않는다(next/link·라우터만 붙인다). 그래서 주소마다 config.basePath를 앞에 붙인다(pwaAssetUrl).
// 매니페스트의 id·start_url·scope는 이 빌드의 basePath로 만든다(webManifest) — 커스텀 도메인(BASE_PATH="")으로 옮겨도 고칠 파일이 없다.
// <link rel="manifest">는 Next가 app/manifest.ts를 보고 `${basePath}/manifest.webmanifest`로 넣는다.

import { APP_DESCRIPTION } from "@/features/meta/shareMeta";
import { ROUTES } from "@/routes";

export const PWA_APP_TITLE = "온맘"; // 원문: LoginView.swift 브랜드명 — 홈 화면 아이콘 이름

/** GitHub Pages 프로젝트 페이지의 basePath — deploy.yml이 configure-pages 값으로 넣는 것과 같다(공유 주소 기본값·테스트의 운영 주소). */
export const PRODUCTION_BASE_PATH = "/onmom_web";

/** 홈 화면 아이콘·스플래시 배경 — 앱 배경(globals.css --color-background)과 같다 */
export const PWA_BACKGROUND_COLOR = "#F9FAFB";

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

/** 웹 앱 매니페스트의 아이콘 — 매니페스트 주소 기준 상대 경로(icons/…)라 basePath와 무관하다. */
const MANIFEST_ICONS = [
  { icon: PWA_ICONS.icon192, purpose: "any" },
  { icon: PWA_ICONS.icon512, purpose: "any" },
  { icon: PWA_ICONS.maskable192, purpose: "maskable" },
  { icon: PWA_ICONS.maskable512, purpose: "maskable" },
] as const;

/** 웹 앱 매니페스트 필드 중 여기서 쓰는 것(Next MetadataRoute.Manifest와 같은 모양) */
export interface WebManifest {
  id: string;
  name: string;
  short_name: string;
  description: string;
  lang: string;
  dir: "ltr";
  start_url: string;
  scope: string;
  display: "standalone";
  background_color: string;
  theme_color: string;
  icons: Array<{ src: string; sizes: string; type: string; purpose: "any" | "maskable" }>;
}

/**
 * 이 빌드의 웹 앱 매니페스트 — basePath는 ""(커스텀 도메인) 또는 "/onmom_web".
 * id·scope = basePath + "/"(서비스 워커 범위와 같다), start_url = basePath + ROUTES.home. id는 설치된 앱을 알아보는 값이라 운영
 * 주소(/onmom_web/)에서는 예전 정적 파일과 같은 값이어야 한다(pwa.test.ts).
 */
export function webManifest(basePath: string): WebManifest {
  return {
    id: serviceWorkerScope(basePath),
    name: PWA_APP_TITLE,
    short_name: PWA_APP_TITLE,
    description: APP_DESCRIPTION,
    lang: "ko",
    dir: "ltr",
    start_url: `${basePath}${ROUTES.home}`,
    scope: serviceWorkerScope(basePath),
    display: "standalone",
    background_color: PWA_BACKGROUND_COLOR,
    theme_color: PWA_BACKGROUND_COLOR,
    icons: MANIFEST_ICONS.map(({ icon, purpose }) => ({ src: icon.path.slice(1), sizes: `${icon.size}x${icon.size}`, type: "image/png", purpose })),
  };
}
