"use client";

// 서비스 소개의 시작 버튼 — 로그인 전 [시작하기] → /login/, 온보딩 중 [시작하기] → /onboarding/,
// 로그인·온보딩을 마쳤으면 [내 회복 기록 열기] → /home/ (landingContent.ts startAction).
//
// 정적 HTML과 하이드레이션 첫 렌더는 저장소를 읽기 전이라 늘 로그인 전 모양이다. 읽은 뒤 바뀔 때 버튼 폭이 흔들리지 않게
// 두 문구를 같은 격자 칸에 겹쳐 두고(폭 = 긴 쪽), 지금 아닌 쪽은 숨긴다(visibility: hidden — 접근성 이름에서도 빠진다).

import Link from "next/link";
import { cx } from "@/components/ui";
import { rootScreenFor } from "@/store/appStore";
import { useAppStore } from "@/store/useAppStore";
import { LANDING_TEXT, startAction } from "./landingContent";

function useStartAction() {
  return startAction(rootScreenFor(useAppStore()));
}

export function StartLink({ className }: { className: string }) {
  const action = useStartAction();
  const showOpen = action.opensApp;

  return (
    <Link href={action.href} className={className}>
      <span className="grid justify-items-center">
        <span aria-hidden={showOpen || undefined} className={cx("[grid-area:1/1]", showOpen && "invisible")}>
          {LANDING_TEXT.start}
        </span>
        <span aria-hidden={!showOpen || undefined} className={cx("[grid-area:1/1]", !showOpen && "invisible")}>
          {LANDING_TEXT.openApp}
        </span>
      </span>
    </Link>
  );
}

/**
 * 시작 버튼 옆 안내 줄(시작 방법) — 처음 오는 사람에게만 필요하다. 이미 앱을 쓰는 사람([내 회복 기록 열기])에게는
 * 숨기되 자리는 그대로 둔다(visibility: hidden — 버튼이 위아래로 움직이지 않게, 스크린리더에서도 빠진다).
 * 정적 HTML·하이드레이션 첫 렌더에서는 보인다.
 */
export function StartNote({ text, className }: { text: string; className: string }) {
  const hidden = useStartAction().opensApp;
  return (
    <p aria-hidden={hidden || undefined} className={cx(className, hidden && "invisible")}>
      {text}
    </p>
  );
}
