import type { Metadata } from "next";
import { robotsFor } from "@/config";
import { LandingPage } from "@/features/landing/LandingPage";
import { LANDING_META, LANDING_TEXT } from "@/features/landing/landingContent";

// 서비스 소개("/") — 공개 주소. 앱 관문은 이 주소를 저장소와 무관하게 늘 그린다(features/flow/gate.ts).
// robots는 robotsFor("landing") — NEXT_PUBLIC_SITE_INDEXABLE=true일 때만 이 화면의 색인을 허용한다(앱 화면은 루트 레이아웃의 noindex 그대로).
export const metadata: Metadata = {
  title: LANDING_META.title,
  robots: robotsFor("landing"),
  description: LANDING_META.description,
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: LANDING_TEXT.brand,
    title: LANDING_META.title,
    description: LANDING_META.description,
  },
};

export default function Page() {
  return <LandingPage />;
}
