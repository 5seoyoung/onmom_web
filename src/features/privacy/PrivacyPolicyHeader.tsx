"use client";

import { LeaveSubPageHeader, useLeaveSubPage } from "@/features/profile/LeaveSubPage";
import { useAppStore } from "@/store/useAppStore";
import { PRIVACY_BACK_FROM, privacyBackHref } from "./privacyView";

// /privacy/ 머리 — 본문은 서버 컴포넌트(PrivacyPolicyScreen) 그대로.
// [뒤로]: 앞 기록이 이 화면을 여는 곳(서비스 소개·설정, PRIVACY_BACK_FROM)이면 그 화면으로 돌아가고(history back),
// 아니면(주소로 바로 들어옴 등) 로그인 상태로 정한 곳(privacyBackHref)으로 replace한다.
// 제목·시행일 줄은 부모(서버 컴포넌트)가 이 빌드의 방침에서 골라 넘긴다.
export function PrivacyPolicyHeader({ title, effective }: { title: string; effective: string }) {
  const { hydrated, isSignedIn, state } = useAppStore();
  const backHref = privacyBackHref({ hydrated, isSignedIn, hasOnboarded: state.hasOnboarded });
  const exit = useLeaveSubPage(backHref, PRIVACY_BACK_FROM);
  return (
    <LeaveSubPageHeader
      title={title}
      subtitle={effective}
      backHref={backHref}
      onLeave={exit.leave}
    />
  );
}
