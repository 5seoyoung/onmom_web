import type { Metadata } from "next";
import Link from "next/link";
import { CardColumn } from "@/components/shell/CardColumn";
import { primaryButtonClass, secondaryButtonClass } from "@/components/ui/Buttons";
import { BrandLogo } from "@/features/flow/BrandLogo";
import { ROUTES } from "@/routes";

// 없는 주소 — 정적 내보내기에서는 out/404.html이 되고 GitHub Pages가 모르는 주소마다 이 파일을 준다.
// 앱 관문(features/flow/gate.ts)은 모르는 주소를 main으로 보므로 로그인 전이면 /login/으로 옮겨지고, 로그인·온보딩을 마친 사람과
// 스크립트 없는 방문자(크롤러)만 이 화면을 본다. 서버 컴포넌트 — 사용자 데이터를 쓰지 않는다.
// 폭은 로그인·처리방침과 같은 카드 기둥(CardColumn). 검색에 나오지 않게 noindex(루트 레이아웃 값과 같지만 404는 늘 막는다).
export const NOT_FOUND_TEXT = {
  // 웹 신규 문구 — CPO 확인 필요 (iOS에는 없는 화면. 주소로 들어오는 웹에만 있다)
  title: "페이지를 찾을 수 없어요",
  // 웹 신규 문구 — CPO 확인 필요
  body: "주소가 바뀌었거나 잘못 입력됐을 수 있어요.",
  // 웹 신규 문구 — CPO 확인 필요 (앱 홈 탭 /home/ 으로. 로그인 전이면 관문이 로그인으로 보낸다)
  home: "홈으로",
  // 웹 신규 문구 — CPO 확인 필요 (서비스 소개 "/" 로)
  landing: "서비스 소개 보기",
} as const;

export const metadata: Metadata = {
  title: NOT_FOUND_TEXT.title,
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <CardColumn>
      <main className="flex flex-1 flex-col justify-center gap-8 px-6 py-10">
        <div className="flex flex-col items-center gap-4 text-center">
          <BrandLogo size="login" />
          <h1 className="text-2xl font-bold text-neutral">{NOT_FOUND_TEXT.title}</h1>
          <p className="text-base text-text-secondary">{NOT_FOUND_TEXT.body}</p>
        </div>
        <div className="flex flex-col gap-3">
          <Link href={ROUTES.home} className={primaryButtonClass}>
            {NOT_FOUND_TEXT.home}
          </Link>
          <Link href={ROUTES.landing} className={secondaryButtonClass}>
            {NOT_FOUND_TEXT.landing}
          </Link>
        </div>
      </main>
    </CardColumn>
  );
}
