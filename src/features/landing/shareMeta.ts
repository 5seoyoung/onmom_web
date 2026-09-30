// 문서 제목 틀과 공유 미리보기(Open Graph·트위터) — 루트 레이아웃(src/app/layout.tsx)과 서비스 소개(src/app/page.tsx)가 쓴다.
//
// 주소: 이미지·og:url은 상대 주소로 두고, 루트 레이아웃의 metadataBase(config.siteUrl = origin + basePath + "/")가 절대 주소로 바꾼다
//   (Next는 metadataBase의 경로 아래로 붙인다 — "/og-image.png" → https://5seoyoung.github.io/onmom_web/og-image.png).
//   커스텀 도메인으로 옮기면 NEXT_PUBLIC_SITE_URL과 BASE_PATH만 바꾸면 된다(config.siteUrlFrom).
// 문구: 새 문장을 만들지 않는다 — 제목·설명은 서비스 소개의 제목·설명(LANDING_META — APP_STORE.md 부제·설명 원문), 이름은 브랜드명.
// 이미지: public/og-image.png(1200×630) — 브랜드 로고(src/features/flow/brand-logo.png)를 2배로 키워 로고 배경색(#FDEFEB) 위 가운데에
//   둔 것(macOS sips — 다시 만드는 법은 docs/PWA_AND_REMINDERS.md §2-4). 로고 안에 "온맘" 글자가 있어 alt는 브랜드명.

import type { Metadata } from "next";
import { LANDING_META, LANDING_TEXT } from "./landingContent";

/** 화면 제목 틀 — "AI 상담 · 온맘". 이름이 이미 든 제목(서비스 소개·이용약관·관리자)은 absolute로 틀을 건너뛴다. */
export const TITLE_TEMPLATE = `%s · ${LANDING_TEXT.brand}`;

/** 공유 미리보기 이미지 — public/ 아래 파일(pwa.test.ts가 실제 크기를 확인한다) */
export const SHARE_IMAGE = {
  path: "/og-image.png",
  width: 1200,
  height: 630,
} as const;

type OpenGraph = NonNullable<Metadata["openGraph"]>;
type Twitter = NonNullable<Metadata["twitter"]>;

const IMAGE = { url: SHARE_IMAGE.path, width: SHARE_IMAGE.width, height: SHARE_IMAGE.height, alt: LANDING_TEXT.brand, type: "image/png" };

/**
 * 모든 화면의 기본 공유 미리보기 — 제목·설명은 넣지 않는다: Next가 화면의 title(틀 적용)·description으로 채운다.
 * (앱 화면은 noindex이고 정적 HTML에 사용자 데이터가 없다 — 링크를 공유하면 이름·이미지만 보인다.)
 */
export const BASE_OPEN_GRAPH: OpenGraph = {
  type: "website",
  locale: "ko_KR",
  siteName: LANDING_TEXT.brand,
  images: [IMAGE],
};

/** 트위터(X) 카드 — 큰 이미지. 제목·설명·이미지는 Next가 Open Graph 값으로 채운다. */
export const BASE_TWITTER: Twitter = { card: "summary_large_image" };

/** 서비스 소개("/")의 공유 미리보기 — 페이지의 openGraph는 레이아웃 것을 통째로 덮으므로 기본값을 다시 담는다 */
export const LANDING_OPEN_GRAPH: OpenGraph = {
  ...BASE_OPEN_GRAPH,
  url: "/",
  title: LANDING_META.title,
  description: LANDING_META.description,
};
