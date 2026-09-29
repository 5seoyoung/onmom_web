"use client"; // 오류 경계는 클라이언트 컴포넌트여야 한다

import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";
import { ErrorScreen } from "@/components/shell/ErrorScreen";

// 루트 레이아웃(src/app/layout.tsx — StoreProvider·AppGate)을 그리다 예외가 나면 레이아웃을 통째로 대신한다.
// 그래서 <html>·<body>와 전역 스타일·글꼴을 스스로 갖춘다(error.md "Global Error"). metadata는 클라이언트 경계라 내보낼 수 없어 <title>로 둔다.
// error 인자는 화면·콘솔 어디에도 내지 않는다(web/07 §2 민감정보 로그 금지).
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">
        <title>온맘</title>
        <ErrorScreen onRetry={retry} />
      </body>
    </html>
  );
}
