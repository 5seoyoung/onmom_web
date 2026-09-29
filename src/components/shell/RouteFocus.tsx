"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

// 앱 안에서 화면이 바뀌면(사이드바·탭바 링크, [뒤로] 등) 초점을 본문 묶음(AppShell의 #app-content, tabIndex -1)으로 옮긴다.
// Next 앱 라우터는 이동 뒤 스크롤만 맨 위로 올리고 초점은 그대로 둔다(layout-router: "leaves focus untouched") —
// 키보드·스크린리더 사용자는 초점이 방금 누른 메뉴 링크에 남아 새 화면을 처음부터 다시 찾아야 한다.
// 본문 묶음에 초점을 두면 다음 Tab이 새 화면의 첫 컨트롤이고, 스크린리더는 새 화면 첫 줄부터 읽는다(라우트 안내는 Next의 route announcer가 따로 한다).
//
// 옮기지 않는 경우:
// - 처음 그릴 때(페이지를 새로 연 것 — 브라우저가 문서 처음에 둔다).
// - 화면이 스스로 초점을 정했을 때(글쓰기 본문·AI 상담 입력창·결과 제목 등 — 초점이 body나 메뉴(nav) 안이 아니면 그대로 둔다).
// - 주소만 같은 화면에서 바뀔 때(쿼리·해시)는 pathname이 같아 실행되지 않는다.
export function RouteFocus({ targetId }: { targetId: string }) {
  const pathname = usePathname();
  const previous = useRef<string | null>(null);

  useEffect(() => {
    if (previous.current === null) {
      previous.current = pathname;
      return;
    }
    if (previous.current === pathname) return;
    previous.current = pathname;

    const active = document.activeElement;
    const untouched = active === null || active === document.body || active.closest("nav") !== null;
    if (!untouched) return;
    // 스크롤은 라우터가 이미 맨 위로 올렸다 — 초점만 옮긴다.
    document.getElementById(targetId)?.focus({ preventScroll: true });
  }, [pathname, targetId]);

  return null;
}
