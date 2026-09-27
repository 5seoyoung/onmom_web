import type { ReactNode } from "react";
import { APP_NAV_TEXT } from "./appNav";
import { SideNav } from "./SideNav";

// 로그인·온보딩을 마친 뒤 앱 화면(src/app/(app))의 껍데기 — 기기 폭에 맞춘다.
//
// - 폰(md 48rem 미만): 지금까지와 같은 폰 폭 기둥(최대 30rem 가운데, 세로 flex).
//   탭 화면은 기둥 안 아래에 떠 있는 탭바((app)/(tabs)/layout.tsx), 하위 화면은 뒤로 머리만 있는 전체 화면.
// - 태블릿(md 이상 lg 64rem 미만): 같은 모양, 기둥만 36rem으로 넓힌다(820px 세로 태블릿에서 좌우가 덜 비게).
// - PC(lg 이상): 왼쪽에 화면 높이 사이드바(SideNav) + 오른쪽 본문. 본문은 최대 64rem 가운데, 좌우 넉넉한 여백.
//   탭바는 숨는다. 본문 안의 칸 나눔은 각 화면이 정한다.
//   위아래 여백은 두지 않는다 — 화면이 자기 위아래 여백을 갖고, AI 상담처럼 창 높이(h-dvh)를 채우는 화면은
//   여기서 여백을 더하면 창보다 길어져 페이지가 한 번 더 스크롤되고 입력창이 잘린다.
//
// 화면마다 자기 <main>을 그리므로 여기서는 <main>을 두지 않는다(랜드마크 중복 방지).
// 사이드바가 본문보다 앞에 있어 PC 키보드 사용자를 위해 "본문 바로가기"를 둔다(초점을 받을 때만 보임, lg 이상만).
export const APP_CONTENT_ID = "app-content";

export function AppShell({ children }: { children?: ReactNode }) {
  return (
    <div className="lg:flex">
      <a
        href={`#${APP_CONTENT_ID}`}
        className="sr-only max-lg:hidden focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-button focus:bg-surface focus:px-4 focus:text-sm focus:font-semibold focus:text-neutral focus:shadow-[0_0.25rem_1.5rem_rgba(25,31,40,0.12)]"
      >
        {APP_NAV_TEXT.skipToContent}
      </a>
      <SideNav />
      <div
        id={APP_CONTENT_ID}
        tabIndex={-1}
        className="mx-auto flex min-h-dvh w-full max-w-[30rem] flex-col bg-background focus:outline-none md:max-w-[36rem] lg:max-w-[64rem] lg:min-w-0 lg:flex-1 lg:px-8"
      >
        {children}
      </div>
    </div>
  );
}
