// 문서 제목 틀과 공유 미리보기(Open Graph·트위터) — 루트 레이아웃(src/app/layout.tsx)과 시작 주소(src/app/page.tsx)가 쓴다.
//
// 시작 주소("/")는 화면 없이 로그인(또는 앱 홈)으로 옮기기만 하지만, 링크를 공유하면 이 주소의 제목·설명·이미지로 미리보기 카드가 그려진다.
// 주소: 이미지·og:url은 상대 주소로 두고, 루트 레이아웃의 metadataBase(config.siteUrl = origin + basePath + "/")가 절대 주소로 바꾼다
//   (Next는 metadataBase의 경로 아래로 붙인다 — "/og-image.png" → https://5seoyoung.github.io/onmom_web/og-image.png).
//   커스텀 도메인으로 옮기면 NEXT_PUBLIC_SITE_URL과 BASE_PATH만 바꾸면 된다(config.siteUrlFrom).
// 문구: 새 문장을 만들지 않는다 — 이름은 브랜드명, 부제·설명은 App Store 제출 문안(web/reference/docs/APP_STORE.md, CPO 작성) 원문.
//   (예전 서비스 소개 화면의 제목·설명을 그대로 옮겼다 — 소개 화면은 2026-10-14 CPO 결정으로 없앴다.)
// 이미지: public/og-image.png(1200×630) — 브랜드 로고(src/features/flow/brand-logo.png)를 2배로 키워 로고 배경색(#FDEFEB) 위 가운데에
//   둔 것(macOS sips — 다시 만드는 법은 docs/PWA_AND_REMINDERS.md §2-4). 로고 안에 "온맘" 글자가 있어 alt는 브랜드명.

import type { Metadata } from "next";

export const SHARE_TEXT = {
  brand: "온맘", // 원문: LoginView.swift:26
  tagline: "산후 회복, 하루 1분 기록으로", // 원문: APP_STORE.md §1 부제
  promo:
    "산후 회복은 사람마다 다릅니다. 온맘은 출산일과 분만 방식에 맞춰 지금 할 수 있는 운동과 피해야 할 동작을 정리하고, 오로·발열·통증을 1분 만에 기록해 병원에 가야 할 신호를 알려드려요.", // 원문: APP_STORE.md §2
} as const;

/** 시작 주소("/")의 문서 제목·설명 — src/app/page.tsx가 metadata로 내보낸다. */
export const ROOT_META = {
  // 웹 신규 문구 — CPO 확인 필요 (브라우저 탭 제목 = 이름 + APP_STORE.md §1 부제)
  title: `${SHARE_TEXT.brand} - ${SHARE_TEXT.tagline}`,
  description: SHARE_TEXT.promo,
} as const;

/** 화면 제목 틀 — "AI 상담 · 온맘". 이름이 이미 든 제목(시작 주소·이용약관·관리자)은 absolute로 틀을 건너뛴다. */
export const TITLE_TEMPLATE = `%s · ${SHARE_TEXT.brand}`;

/** 공유 미리보기 이미지 — public/ 아래 파일(pwa.test.ts가 실제 크기를 확인한다) */
export const SHARE_IMAGE = {
  path: "/og-image.png",
  width: 1200,
  height: 630,
} as const;

type OpenGraph = NonNullable<Metadata["openGraph"]>;
type Twitter = NonNullable<Metadata["twitter"]>;

const IMAGE = { url: SHARE_IMAGE.path, width: SHARE_IMAGE.width, height: SHARE_IMAGE.height, alt: SHARE_TEXT.brand, type: "image/png" };

/**
 * 모든 화면의 기본 공유 미리보기 — 제목·설명은 넣지 않는다: Next가 화면의 title(틀 적용)·description으로 채운다.
 * (앱 화면은 noindex이고 정적 HTML에 사용자 데이터가 없다 — 링크를 공유하면 이름·이미지만 보인다.)
 */
export const BASE_OPEN_GRAPH: OpenGraph = {
  type: "website",
  locale: "ko_KR",
  siteName: SHARE_TEXT.brand,
  images: [IMAGE],
};

/** 트위터(X) 카드 — 큰 이미지. 제목·설명·이미지는 Next가 Open Graph 값으로 채운다. */
export const BASE_TWITTER: Twitter = { card: "summary_large_image" };

/** 시작 주소("/")의 공유 미리보기 — 페이지의 openGraph는 레이아웃 것을 통째로 덮으므로 기본값을 다시 담는다 */
export const ROOT_OPEN_GRAPH: OpenGraph = {
  ...BASE_OPEN_GRAPH,
  url: "/",
  title: ROOT_META.title,
  description: ROOT_META.description,
};
