import type { Metadata } from "next";
import { robotsFor } from "@/config";
import { LandingPage } from "@/features/landing/LandingPage";
import { LANDING_META } from "@/features/landing/landingContent";
import { LANDING_OPEN_GRAPH } from "@/features/landing/shareMeta";

// 서비스 소개("/") — 공개 주소. 앱 관문은 이 주소를 저장소와 무관하게 늘 그린다(features/flow/gate.ts).
// robots는 robotsFor("landing") — NEXT_PUBLIC_SITE_INDEXABLE=true일 때만 이 화면의 색인을 허용한다(앱 화면은 루트 레이아웃의 noindex 그대로).
// 제목에 이미 이름이 있어 레이아웃의 제목 틀("%s · 온맘")을 건너뛴다(absolute). 공유 미리보기는 같은 제목·설명 + 로고 이미지(shareMeta.ts).
export const metadata: Metadata = {
  title: { absolute: LANDING_META.title },
  robots: robotsFor("landing"),
  description: LANDING_META.description,
  openGraph: LANDING_OPEN_GRAPH,
};

export default function Page() {
  return <LandingPage />;
}
