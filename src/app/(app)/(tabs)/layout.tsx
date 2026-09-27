import { TabBar } from "@/components/TabBar";

// 탭 화면 5개 — 폰·태블릿은 화면 아래에 떠 있는 탭바, PC(lg 이상)는 탭바를 숨기고 사이드바(AppShell)가 대신한다.
export default function TabsLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <div className="flex flex-1 flex-col">{children}</div>
      <TabBar />
    </>
  );
}
