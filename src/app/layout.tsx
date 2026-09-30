import type { Metadata, Viewport } from "next";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";
import { config, robotsFor } from "@/config";
import { CspMeta } from "@/components/CspMeta";
import { StoreProvider } from "@/store/StoreProvider";
import { AppGate } from "@/features/flow/AppGate";
import { BASE_OPEN_GRAPH, BASE_TWITTER, TITLE_TEMPLATE } from "@/features/landing/shareMeta";
import { PwaClient } from "@/features/pwa/PwaClient";
import { PWA_APP_TITLE, PWA_ICONS, pwaAssetUrl } from "@/features/pwa/pwaAssets";

// PWA(홈 화면 추가) — 매니페스트·아이콘·iOS 메타. 메타데이터의 주소에는 Next가 basePath를 붙여 주지 않으므로 여기서 붙인다(pwaAssetUrl).
// 매니페스트 자체(public/manifest.webmanifest)는 정적 파일이라 start_url·scope에 /onmom_web이 적혀 있다 — 도메인을 바꾸면 그 파일도 고친다
// (docs/PWA_AND_REMINDERS.md).
// 공유 미리보기(Open Graph·트위터)의 절대 주소는 metadataBase(config.siteUrl — origin + basePath, 기본 https://5seoyoung.github.io/onmom_web/)
// 아래로 붙는다(features/landing/shareMeta.ts). 아이콘·매니페스트 주소는 metadataBase를 쓰지 않아 위처럼 basePath를 직접 붙인다.
export const metadata: Metadata = {
  metadataBase: new URL(config.siteUrl),
  // 화면 제목은 "AI 상담 · 온맘"처럼 — 제목이 없는 화면은 "온맘"
  title: { default: "온맘", template: TITLE_TEMPLATE },
  description: "엄마의 산후 회복 케어 — 퇴원부터 산후 6주 검진까지",
  openGraph: BASE_OPEN_GRAPH,
  twitter: BASE_TWITTER,
  // 1.0 공개 전까지 검색 노출 막기. NEXT_PUBLIC_SITE_INDEXABLE=true여도 앱 화면은 noindex — 서비스 소개(src/app/page.tsx)만 robotsFor("landing")로 연다.
  robots: robotsFor("app"),
  manifest: pwaAssetUrl(config.basePath, "manifest"),
  icons: {
    icon: [
      { url: pwaAssetUrl(config.basePath, "icon192"), sizes: "192x192", type: "image/png" },
      { url: pwaAssetUrl(config.basePath, "icon512"), sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: pwaAssetUrl(config.basePath, "apple180"), sizes: `${PWA_ICONS.apple180.size}x${PWA_ICONS.apple180.size}`, type: "image/png" }],
  },
  appleWebApp: { capable: true, title: PWA_APP_TITLE, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F9FAFB",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <head>
        {/* 보안 정책(CSP) — GitHub Pages는 헤더를 못 붙여 메타로 싣는다. 설정된 기능의 출처만 들어간다(src/csp.ts, docs/SECURITY.md).
            운영 빌드에서만(개발 서버는 eval·HMR이 필요). 인라인 스크립트는 해시로만 허용 — next build 뒤 scripts/csp-hash.mjs가 페이지마다
            해시를 넣고 메타를 <meta charset> 바로 뒤로 옮긴다. 메타는 정적 HTML에만 있고 브라우저에서는 다시 그리지 않는다(까닭은 CspMeta). */}
        <CspMeta />
      </head>
      <body className="min-h-full">
        {/* 앱 상태(브라우저 저장소)는 여기서 한 번 연결한다. 레이아웃은 서버 컴포넌트로 두고 Provider만 클라이언트 경계다.
            저장소는 마운트 후 첫 구독 때 읽으므로 정적 HTML에는 사용자 데이터가 들어가지 않는다. */}
        <StoreProvider>
          {/* 앱 관문 — 로그인 전 → /login/, 온보딩 전 → /onboarding/, 그 외 → 홈 탭 /home/(RootView.swift:10-17).
              저장소를 읽기 전에는 보호된 화면을 그리지 않는다(서비스 소개 /·개인정보처리방침·로그인 콜백은 늘 연다).
              폭은 여기서 정하지 않는다 — 서비스 소개는 전체 폭, 앱은 components/shell/AppShell(폰 = 폰 폭 기둥, PC = 사이드바),
              로그인·온보딩·처리방침은 components/shell/CardColumn(폰 = 폰 폭 기둥, PC = 가운데 카드). */}
          <AppGate>{children}</AppGate>
          {/* PWA — 운영 빌드에서만 서비스 워커(public/sw.js)를 등록하고, 계정이 바뀌면 이 브라우저의 푸시 구독을 맞춘다
              (로그아웃·계정 삭제 = 해지, 다른 계정으로 전환 = 새 계정의 행으로 다시 저장). 화면은 그리지 않는다. */}
          <PwaClient />
        </StoreProvider>
      </body>
    </html>
  );
}
