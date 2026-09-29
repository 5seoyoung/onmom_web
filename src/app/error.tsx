"use client"; // 오류 경계는 클라이언트 컴포넌트여야 한다(node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md)

import { ErrorScreen } from "@/components/shell/ErrorScreen";

// 화면(page·하위 layout)을 그리다 예외가 나면 빈 페이지 대신 이 화면 — 루트 레이아웃(StoreProvider·AppGate) 안에서 그려진다.
// 루트 레이아웃 자체의 오류는 global-error.tsx가 받는다.
// error 인자는 받지만 쓰지 않는다: 내용(message·stack)에 앱 상태가 섞여 있을 수 있어 화면·콘솔 어디에도 내지 않는다(web/07 §2).
// retry()는 경계 안을 다시 그린다(Next 16: reset() 대신 권장). 정적 내보내기(output: "export")에서도 클라이언트 경계라 그대로 동작한다.
export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorScreen onRetry={retry} />;
}
