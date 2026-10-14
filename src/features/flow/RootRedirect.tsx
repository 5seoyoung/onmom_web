"use client";

// 시작 주소("/") — 화면 없이 옮기기만 한다(서비스 소개 화면은 2026-10-14 CPO 결정으로 없앴다. 앱은 로그인에서 시작한다).
// - 저장소를 읽기 전(정적 HTML·첫 렌더)에는 앱 관문과 같은 불러오는 중 표시(GateLoading)만 — 다른 화면이 번쩍이지 않게.
// - 읽은 뒤: 로그인 전 → /login/, 로그인했으면(게스트 포함) → 앱 홈 /home/(gate.ts rootPathFor). 온보딩 중·다시 동의가 필요한
//   사람은 앱 홈에서 관문(AppGate)이 온보딩(또는 다시 동의)으로 옮긴다.
// - router.replace — 뒤로 가기에 "/"가 남지 않는다. 옮기는 동안에도 같은 표시라 화면이 바뀌지 않는다.
// 앱 관문은 "/"를 공개 주소로 보고 이 컴포넌트를 그대로 그린다(features/flow/gate.ts) — 두 곳이 함께 옮기지 않는다.
// 스크립트가 없을 때의 로그인 링크는 페이지(src/app/page.tsx)의 <noscript>에 있다.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { rootScreenFor } from "@/store/appStore";
import { useAppStore } from "@/store/useAppStore";
import { GateLoading } from "./AppGate";
import { rootPathFor } from "./gate";

export function RootRedirect() {
  const store = useAppStore();
  const router = useRouter();
  const to = rootPathFor(rootScreenFor(store));

  useEffect(() => {
    if (to !== null) router.replace(to);
  }, [to, router]);

  return <GateLoading />;
}
