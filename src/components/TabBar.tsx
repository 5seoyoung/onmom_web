"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NAV_TEXT, APP_TABS, isNavItemActive } from "@/components/shell/appNav";

// 하단 탭 5개(01 §2). iOS 탭바처럼 화면 아래에 떠 있는 둥근 막대 —
// 활성 탭 = 코랄 아이콘·라벨 + 옅은 회색 알약 배경, 나머지 = 진한 아이콘. 라벨 11(06 §4).
// 폰·태블릿 전용 — PC(lg 이상)에서는 숨기고 왼쪽 사이드바(components/shell/SideNav)가 같은 탭을 보여 준다.
export function TabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label={APP_NAV_TEXT.navLabel}
      className="pointer-events-none sticky bottom-0 z-10 px-4 pt-2 pb-[max(env(safe-area-inset-bottom),0.75rem)] lg:hidden"
    >
      <ul className="pointer-events-auto grid grid-cols-5 gap-1 rounded-full bg-surface/90 p-1.5 shadow-[0_0.25rem_1.5rem_rgba(25,31,40,0.12)] ring-1 ring-neutral/5 backdrop-blur-md">
        {APP_TABS.map(({ href, label, Icon }) => {
          const active = isNavItemActive(pathname, href); // 기록장 탭은 글쓰기·글 상세에서도 켜진다
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-full ${
                  active ? "bg-divider text-primary" : "text-neutral"
                }`}
              >
                <Icon aria-hidden className="size-6" strokeWidth={2.1} />
                <span className={`text-[0.6875rem] ${active ? "font-semibold" : "font-medium"}`}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
