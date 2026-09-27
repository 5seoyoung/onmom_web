import type { Metadata, Viewport } from "next";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";
import { StoreProvider } from "@/store/StoreProvider";

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
          {/* 모바일 우선 — 태블릿·데스크톱에서도 폰 폭(최대 480px) 중앙 유지 */}
          <div className="mx-auto flex min-h-dvh w-full max-w-[30rem] flex-col bg-background">{children}</div>
        </StoreProvider>
      </body>
    </html>
  );
}
