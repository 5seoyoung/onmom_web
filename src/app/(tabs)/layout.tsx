import { TabBar } from "@/components/TabBar";

export default function TabsLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <div className="flex flex-1 flex-col">{children}</div>
      <TabBar />
    </>
  );
}
