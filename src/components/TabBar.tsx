"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookHeart, ClipboardPen, House, PersonStanding, UserRound } from "lucide-react";

// 하단 탭 5개(01 §2). 활성 탭 = 코랄 아이콘 + 연한 코랄 원 배경, 라벨 11(06 §4).
const TABS = [
  { href: "/", label: "홈", Icon: House },
  { href: "/exercise/", label: "운동", Icon: PersonStanding },
  { href: "/record/", label: "기록", Icon: ClipboardPen },
  { href: "/journal/", label: "기록장", Icon: BookHeart },
  { href: "/profile/", label: "프로필", Icon: UserRound },
] as const;

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav aria-label="주요 메뉴" className="sticky bottom-0 z-10 border-t border-divider bg-surface pb-[env(safe-area-inset-bottom)]">
      <ul className="grid grid-cols-5">
        {TABS.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href.replace(/\/$/, ""));
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className="flex min-h-14 flex-col items-center justify-center gap-0.5 py-1.5"
              >
                <span className={`flex size-8 items-center justify-center rounded-full ${active ? "bg-coral-tint text-primary" : "text-text-subtle"}`}>
                  <Icon aria-hidden className="size-5" />
                </span>
                <span className={`text-[0.6875rem] ${active ? "font-semibold text-primary" : "text-text-subtle"}`}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
