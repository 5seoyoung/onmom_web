"use client"; // [뒤로] 클릭 처리(방문 기록 읽기)

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useRef, type MouseEvent, type ReactNode } from "react";
import { ROUTES } from "@/routes";
import { cx } from "./cx";
import { readHistorySnapshot } from "./historySnapshot";
import { ScreenHeader } from "./ScreenHeader";
import { canLeaveWithHistoryBack } from "./subPageExit";

export interface SubPageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /**
   * 뒤로 갈 곳(부모 화면) — 기본은 홈 탭(ROUTES.home). 바로 앞 방문 기록이 이 화면이면 history.back()으로 돌아가고
   * (방문 기록에 같은 화면이 두 번 남지 않게 — subPageExit.ts), 아니면(주소로 바로 들어옴 등) 링크대로 이 주소로 이동한다.
   */
  backHref?: string;
  backLabel?: string;
  action?: ReactNode;
  /**
   * 사이드바에 바로 있는 화면("더보기" 서비스 7개)이면 true — PC(lg 이상, 사이드바가 보일 때)에서는 [뒤로]를 숨긴다.
   * 사이드바가 길잡이라 [뒤로]가 겹치고, 화면마다 제목 높이가 달라 보이지 않게 한다. 폰·태블릿에서는 그대로 보인다.
   * 더 깊은 화면(프로필 편집·글쓰기·글 상세·분석)은 넘기지 않는다 — PC에서도 같은 자리(맨 위 줄)에 [뒤로]가 있다.
   */
  hideBackWithSidebar?: boolean;
}

// 탭 밖의 전체 화면(분석·가이드·약물·챗·지역·생활·지원사업·설정 등) 공통 머리 — 뒤로가기 + ScreenHeader.
// PC 위치(왼쪽 선·위 여백)는 화면의 <main>이 components/shell/pageFrame.ts로 맞춘다.
export function SubPageHeader({
  title,
  subtitle,
  backHref = ROUTES.home,
  backLabel = "뒤로",
  action,
  hideBackWithSidebar = false,
}: SubPageHeaderProps) {
  const leaving = useRef(false);

  function handleBackClick(e: MouseEvent<HTMLAnchorElement>) {
    // 새 탭 열기·다른 처리(LeaveSubPageHeader가 먼저 가로챔)는 그대로
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (leaving.current) {
      e.preventDefault(); // back()이 끝나기 전 두 번째 누름 — 두 칸 가거나 부모를 또 쌓지 않게
      return;
    }
    if (!canLeaveWithHistoryBack(readHistorySnapshot(backHref))) return; // 링크대로 부모로
    e.preventDefault();
    leaving.current = true;
    window.history.back();
  }

  return (
    <div className="flex flex-col">
      <Link
        href={backHref}
        onClick={handleBackClick}
        className={cx(
          "-ml-2 inline-flex min-h-11 w-fit items-center gap-0.5 rounded-button px-2 text-[0.9375rem] font-medium text-text-secondary",
          hideBackWithSidebar && "lg:hidden",
        )}
      >
        <ChevronLeft aria-hidden className="size-5" />
        {backLabel}
      </Link>
      <ScreenHeader title={title} subtitle={subtitle} action={action} />
    </div>
  );
}
