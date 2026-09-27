"use client";

// 서비스 소개 머리의 로고 링크 — 서비스 소개에서 누르면 맨 위로(부드럽게, 움직임 줄이기면 바로), 다른 곳에서는 보통 링크.
// 판단은 landingTop.ts. 정적 HTML에는 보통 <a href="/">로 들어가 JS 전에도 서비스 소개로 간다.
// 초점은 로고에 그대로 둔다 — 머리가 화면 위에 붙어 있어(sticky) 맨 위로 올라간 뒤 다음 Tab이 머리 메뉴로 이어진다.

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { ROUTES } from "@/routes";
import { landingScrollBehavior, shouldScrollToLandingTop, urlWithoutHash } from "./landingTop";

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function LandingHomeLink({ className, children }: { className: string; children: ReactNode }) {
  const pathname = usePathname();

  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    if (!shouldScrollToLandingTop(pathname, e)) return; // 다른 화면·새 탭 — Link가 평소대로 이동
    e.preventDefault(); // next/link는 defaultPrevented면 이동하지 않는다
    window.scrollTo({ top: 0, behavior: landingScrollBehavior(prefersReducedMotion()) });
    const clean = urlWithoutHash(window.location);
    // 네이티브 history API는 Next 라우터와 맞물린다(usePathname 등이 따라온다) — 방문 기록은 늘리지 않는다
    if (clean !== null) window.history.replaceState(null, "", clean);
  }

  return (
    <Link href={ROUTES.landing} onClick={onClick} className={className}>
      {children}
    </Link>
  );
}
