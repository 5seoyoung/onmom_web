import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { ROUTES } from "@/routes";
import { cx } from "./cx";
import { ScreenHeader } from "./ScreenHeader";

export interface SubPageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** 뒤로 갈 곳 — 주소로 바로 들어온 경우에도 동작하도록 history.back() 대신 고정 경로를 쓴다. 기본은 홈 탭(ROUTES.home). */
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
  return (
    <div className="flex flex-col">
      <Link
        href={backHref}
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
