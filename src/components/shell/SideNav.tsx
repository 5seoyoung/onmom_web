"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui/cx";
import brandLogo from "@/features/flow/brand-logo.png";
import { ROUTES } from "@/routes";
import { APP_NAV_TEXT, APP_TABS, isNavItemActive, SERVICE_LINKS } from "./appNav";

// PC(lg 이상) 왼쪽 사이드바 — 폰의 하단 탭바 대신. 화면 높이에 붙어(sticky) 본문과 따로 스크롤된다.
// 위에서 아래로: 로고·온맘(→ 소개 페이지) · 탭 5개 · "더보기" 서비스 7개(프로필 허브와 같은 순서) · 의료기기 아님 면책.
// 활성 항목 = 코랄 글자 + 옅은 코랄 배경 + 굵게 + aria-current(색만으로 알리지 않는다).
// lg 미만에서는 display:none이라 낭독·키보드 순서에서도 빠진다.
// 창 높이가 낮으면(52rem 이하 — 1366×768 노트북 브라우저 등) 로고·묶음·면책 사이 여백만 줄여 메뉴 12개가 한 화면에 들어오게 한다.
// 항목 높이(2.75rem)는 줄이지 않는다. 그래도 넘치면 사이드바만 따로 스크롤된다.

const SERVICES_LABEL_ID = "side-nav-services-label";

const itemBase =
  "flex min-h-11 items-center gap-3 rounded-button px-3 transition-[color,background-color] motion-reduce:transition-none";
const itemActive = "bg-coral-tint font-semibold text-primary";
const itemIdle = "text-text-primary hover:bg-divider";

export function SideNav() {
  const pathname = usePathname();

  return (
    <div className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col overflow-y-auto border-r border-neutral/[0.06] bg-surface lg:flex">
      <div className="px-4 pt-6 pb-5 [@media(max-height:52rem)]:pt-3 [@media(max-height:52rem)]:pb-2">
        <Link href={ROUTES.landing} className="inline-flex min-h-11 items-center gap-2.5 rounded-button px-2">
          <Image src={brandLogo} alt="" aria-hidden width={36} height={36} className="size-9 shrink-0 rounded-[0.625rem] object-contain" />
          <span className="text-[1.375rem] font-bold text-primary">{APP_NAV_TEXT.brand}</span>
        </Link>
      </div>

      <nav aria-label={APP_NAV_TEXT.navLabel} className="flex flex-col gap-6 px-3 [@media(max-height:52rem)]:gap-3">
        <ul className="flex flex-col gap-1 [@media(max-height:52rem)]:gap-0.5">
          {APP_TABS.map(({ href, label, Icon }) => {
            const active = isNavItemActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cx(itemBase, "text-[0.9375rem]", active ? itemActive : cx(itemIdle, "font-medium"))}
                >
                  <Icon aria-hidden className="size-5 shrink-0" strokeWidth={active ? 2.3 : 2} />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-col gap-1">
          <p id={SERVICES_LABEL_ID} className="px-3 pb-1 text-xs font-semibold tracking-wide text-text-secondary">
            {APP_NAV_TEXT.servicesLabel}
          </p>
          <ul aria-labelledby={SERVICES_LABEL_ID} className="flex flex-col gap-0.5">
            {SERVICE_LINKS.map(({ key, href, label }) => {
              const active = isNavItemActive(pathname, href);
              return (
                <li key={key}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cx(itemBase, "text-sm", active ? itemActive : itemIdle)}
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      <p className="mt-auto px-6 pt-8 pb-6 text-xs leading-relaxed text-text-secondary [@media(max-height:52rem)]:py-4">
        {APP_NAV_TEXT.disclaimer}
      </p>
    </div>
  );
}
