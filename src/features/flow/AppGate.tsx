"use client";

// 앱 관문 — 로그인 안 함 → /login/, 온보딩 전 → /onboarding/, 그 외 → 메인 홈 탭 /home/(RootView.swift:10-17).
// 서버 저장(Supabase)이 설정된 빌드에서 온보딩을 마쳤지만 지금 판의 동의가 없으면 → /onboarding/?consent=1(동의 단계만).
// 루트 레이아웃의 <StoreProvider> 안에서 모든 화면을 감싼다. 판단은 gate.ts(순수 함수).
//
// - 공개 주소(서비스 소개 /, 개인정보처리방침, 로그인 콜백, 관리자 화면)는 저장소와 무관하게 늘 그린다.
// - 저장소를 읽기 전(정적 HTML·첫 렌더)에는 보호된 화면을 그리지 않는다 — 로그인 전 사용자에게
//   메인 화면이나 기본값이 번쩍이지 않게.
// - 주소가 어긋나면 router.replace로 맞춘다(뒤로 가기에 잘못된 주소가 남지 않게). 그동안은 아무것도 그리지 않는다.
// - usePathname·router는 basePath(/onmom_web)를 알아서 떼고 붙인다.
// - 사용자 관리(Supabase)가 설정돼 있으면 여기서 한 번 세션을 이어받는다(useAuthSession — 다시 방문한 사용자의 로그인·서버 동기화,
//   예전 브라우저 전용 게스트를 익명 계정으로 옮기기(앱 화면에서만 — 공개 주소에서는 하지 않는다), 로그아웃 감지).
//   로그인 콜백(/auth/callback/)은 그 화면이 스스로 처리한다.
//   설정이 없으면 아무것도 안 한다.

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthSession } from "@/auth/useAuth";
import { rootScreenFor } from "@/store/appStore";
import { useAppStore } from "@/store/useAppStore";
import { gateDecision, routeKindFor } from "./gate";

export function AppGate({ children }: { children?: ReactNode }) {
  const store = useAppStore();
  const pathname = usePathname();
  const router = useRouter();
  // 게스트를 익명 계정으로 옮기는 것은 앱 화면에서만 — 공개 화면(소개·개인정보처리방침·관리자)을 연 것만으로는 서버에 계정을 만들지 않는다.
  useAuthSession(pathname, routeKindFor(pathname) !== "public");
  const decision = gateDecision(rootScreenFor(store), pathname);
  const redirectTo = decision.kind === "redirect" ? decision.to : null;

  useEffect(() => {
    if (redirectTo !== null) router.replace(redirectTo);
  }, [redirectTo, router]);

  if (decision.kind !== "render") return null;
  return <>{children}</>;
}
