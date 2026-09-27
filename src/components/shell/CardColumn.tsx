import type { ReactNode } from "react";

// 로그인·온보딩·개인정보처리방침 페이지의 틀 — 앱 껍데기(사이드바) 없이 한 기둥만.
// - 폰·태블릿(lg 미만): 지금까지와 같은 폰 폭 기둥(최대 30rem 가운데, 화면 높이 가득).
// - PC(lg 이상): 배경 위 가운데 카드 모양 기둥(최대 28rem, 둥근 모서리·옅은 테·그림자), 위아래 여백.
//   카드는 최소 높이를 가져 로그인 화면의 위아래 빈칸(flex-1)이 숨 쉴 자리를 남긴다. 내용이 길면(처리방침) 카드가 늘어난다.
//   overflow: clip은 스크롤 영역을 만들지 않아, 온보딩의 아래 고정 버튼(sticky)이 그대로 화면 아래에 붙는다.
export function CardColumn({ children }: { children?: ReactNode }) {
  return (
    <div className="flex min-h-dvh w-full flex-col bg-background lg:px-6 lg:py-16">
      <div className="mx-auto flex w-full max-w-[30rem] flex-1 flex-col bg-background lg:max-w-[28rem] lg:min-h-[min(44rem,calc(100dvh_-_8rem))] lg:flex-none lg:overflow-clip lg:rounded-[1.75rem] lg:shadow-[0_0.5rem_2.5rem_rgba(25,31,40,0.08)] lg:ring-1 lg:ring-neutral/[0.06]">
        {children}
      </div>
    </div>
  );
}
