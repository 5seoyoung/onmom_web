import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { ROUTES } from "@/routes";
import { ScreenHeader } from "./ScreenHeader";

export interface SubPageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** 뒤로 갈 곳 — 주소로 바로 들어온 경우에도 동작하도록 history.back() 대신 고정 경로를 쓴다. 기본은 홈 탭(ROUTES.home). */
  backHref?: string;
  backLabel?: string;
  action?: ReactNode;
}

// 탭 밖의 전체 화면(분석·가이드·약물·챗·지역·생활·지원사업·설정 등) 공통 머리 — 뒤로가기 + ScreenHeader.
export function SubPageHeader({ title, subtitle, backHref = ROUTES.home, backLabel = "뒤로", action }: SubPageHeaderProps) {
  return (
    <div className="flex flex-col">
      <Link
        href={backHref}
        className="-ml-2 inline-flex min-h-11 w-fit items-center gap-0.5 rounded-button px-2 text-[0.9375rem] font-medium text-text-secondary"
      >
        <ChevronLeft aria-hidden className="size-5" />
        {backLabel}
      </Link>
      <ScreenHeader title={title} subtitle={subtitle} action={action} />
    </div>
  );
}
