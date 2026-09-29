"use client";

import { LeaveSubPageHeader, useLeaveSubPage } from "@/features/profile/LeaveSubPage";
import { PRIVACY_BACK_FROM, privacyBackHref } from "@/features/privacy/privacyView";
import { useAppStore } from "@/store/useAppStore";

// /terms/ 머리 — 본문은 서버 컴포넌트(TermsScreen) 그대로.
// 이 화면을 여는 곳은 개인정보처리방침과 같다(서비스 소개 바닥글·설정) — 뒤로 규칙도 같은 것을 쓴다(features/privacy/privacyView.ts):
// 앞 기록이 그 화면이면 돌아가고(history back), 아니면(주소로 바로 들어옴 등) 로그인 상태로 정한 곳으로 replace한다.
// 온보딩 동의 옆에서는 이 주소로 오지 않고 시트(TermsDialog)로 연다 — 저장 전 입력이 사라지지 않게.
export function TermsHeader({ title, effective }: { title: string; effective: string }) {
  const { hydrated, isSignedIn, state } = useAppStore();
  const backHref = privacyBackHref({ hydrated, isSignedIn, hasOnboarded: state.hasOnboarded });
  const exit = useLeaveSubPage(backHref, PRIVACY_BACK_FROM);
  return <LeaveSubPageHeader title={title} subtitle={effective} backHref={backHref} onLeave={exit.leave} />;
}
