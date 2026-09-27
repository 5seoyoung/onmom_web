import type { Metadata, Viewport } from "next";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";
import { StoreProvider } from "@/store/StoreProvider";
import { AppGate } from "@/features/flow/AppGate";

export const metadata: Metadata = {
  title: "온맘",
  description: "엄마의 산후 회복 케어 — 퇴원부터 산후 6주 검진까지",
  robots: { index: false, follow: false }, // 1.0 공개 전까지 검색 노출 막기
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F9FAFB",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">
        {/* 앱 상태(브라우저 저장소)는 여기서 한 번 연결한다. 레이아웃은 서버 컴포넌트로 두고 Provider만 클라이언트 경계다.
            저장소는 마운트 후 첫 구독 때 읽으므로 정적 HTML에는 사용자 데이터가 들어가지 않는다. */}
        <StoreProvider>
          {/* 앱 관문 — 로그인 전 → /login/, 온보딩 전 → /onboarding/, 그 외 → 홈 탭 /home/(RootView.swift:10-17).
              저장소를 읽기 전에는 보호된 화면을 그리지 않는다(서비스 소개 /·개인정보처리방침·로그인 콜백은 늘 연다).
              폭은 여기서 정하지 않는다 — 서비스 소개는 전체 폭, 앱은 components/shell/AppShell(폰 = 폰 폭 기둥, PC = 사이드바),
              로그인·온보딩·처리방침은 components/shell/CardColumn(폰 = 폰 폭 기둥, PC = 가운데 카드). */}
          <AppGate>{children}</AppGate>
        </StoreProvider>
      </body>
    </html>
  );
}
