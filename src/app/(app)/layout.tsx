import { AppShell } from "@/components/shell/AppShell";

// 로그인과 온보딩을 마친 뒤의 앱 화면 묶음(탭 5개 + 하위 화면). 주소에는 "(app)"이 들어가지 않는다.
// 앱 관문(루트 레이아웃의 AppGate)이 이 묶음의 모든 주소를 "main"으로 보고 지킨다(features/flow/gate.ts).
// 껍데기(AppShell): 폰·태블릿 = 폰 폭 기둥, PC(lg 이상) = 왼쪽 사이드바 + 넓은 본문.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}
