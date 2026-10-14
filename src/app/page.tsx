import type { Metadata } from "next";
import { config, robotsFor } from "@/config";
import { RootRedirect } from "@/features/flow/RootRedirect";
import { ROOT_META, ROOT_OPEN_GRAPH } from "@/features/meta/shareMeta";
import { ROUTES } from "@/routes";

// 시작 주소("/") — 화면 없이 로그인(로그인 전) 또는 앱 홈(로그인 후)으로 옮긴다(features/flow/RootRedirect). 앱은 로그인에서 시작한다
// (서비스 소개 화면은 2026-10-14 CPO 결정으로 없앴다). 앱 관문은 이 주소를 공개 주소로 보고 그대로 그린다(features/flow/gate.ts).
// 메타데이터는 남긴다 — 이 주소를 공유하면 제목·설명·이미지로 미리보기 카드가 그려진다(features/meta/shareMeta.ts).
// 제목에 이미 이름이 있어 레이아웃의 제목 틀("%s · 온맘")을 건너뛴다(absolute). 트위터 카드는 레이아웃의 BASE_TWITTER를 물려받는다.
// robots는 robotsFor("root") — NEXT_PUBLIC_SITE_INDEXABLE=true일 때만 이 주소의 색인을 허용한다(기본은 noindex, 앱 화면은 늘 noindex).

const ROOT_TEXT = {
  // 웹 신규 문구 — CPO 확인 필요 (스크립트가 꺼진 브라우저에만 보이는 로그인 링크)
  noscriptLogin: "로그인 화면으로",
} as const;

export const metadata: Metadata = {
  title: { absolute: ROOT_META.title },
  robots: robotsFor("root"),
  description: ROOT_META.description,
  openGraph: ROOT_OPEN_GRAPH,
};

export default function Page() {
  return (
    <>
      <RootRedirect />
      {/* 스크립트가 없으면 옮겨 주지 못한다 — 불러오는 중 표시를 덮고 로그인 링크를 보인다. <noscript> 안은 next/link 대신 basePath를 붙인 주소. */}
      <noscript>
        <div className="fixed inset-0 flex items-center justify-center bg-background p-6">
          <a
            href={`${config.basePath}${ROUTES.login}`}
            className="inline-flex min-h-11 items-center rounded-button px-3 text-base font-semibold text-primary-text underline underline-offset-2"
          >
            {ROOT_TEXT.noscriptLogin}
          </a>
        </div>
      </noscript>
    </>
  );
}
