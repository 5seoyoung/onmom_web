"use client";

// 앱 관문 — 로그인 안 함 → /login/, 온보딩 전 → /onboarding/, 그 외 → 메인(RootView.swift:10-17).
// 루트 레이아웃의 <StoreProvider> 안에서 모든 화면을 감싼다. 판단은 gate.ts(순수 함수).
//
// - 저장소를 읽기 전(정적 HTML·첫 렌더)에는 보호된 화면을 그리지 않는다 — 로그인 전 사용자에게
//   메인 화면이나 기본값이 번쩍이지 않게. 개인정보처리방침·/dev/*는 늘 그린다.
// - 주소가 어긋나면 router.replace로 맞춘다(뒤로 가기에 잘못된 주소가 남지 않게). 그동안은 아무것도 그리지 않는다.
// - usePathname·router는 basePath(/onmom_web)를 알아서 떼고 붙인다.

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { rootScreenFor } from "@/store/appStore";
import { useAppStore } from "@/store/useAppStore";
import { gateDecision } from "./gate";

export function AppGate({ children }: { children?: ReactNode }) {
  const store = useAppStore();
  const pathname = usePathname();
  const router = useRouter();
  const decision = gateDecision(rootScreenFor(store), pathname);
  const redirectTo = decision.kind === "redirect" ? decision.to : null;

  useEffect(() => {
    if (redirectTo !== null) router.replace(redirectTo);
  }, [redirectTo, router]);

  if (decision.kind !== "render") return null;
  return <>{children}</>;
}
