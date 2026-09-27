"use client";

// 하위 화면 떠나기 — 판단은 subPageExit.ts. 여기는 브라우저 값을 읽어 back() 또는 replace(부모)로 이동한다.

import { useMemo, useRef, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { SubPageHeader, type SubPageHeaderProps } from "@/components/ui";
import { canLeaveWithHistoryBack, type HistorySnapshot } from "./subPageExit";

interface NavigationLike {
  currentEntry: { index: number } | null;
  entries(): Array<{ url: string | null }>;
}

function readHistorySnapshot(parentHref: string): HistorySnapshot {
  const snapshot: HistorySnapshot = {
    currentUrl: window.location.href,
    documentEntryUrl: null,
    basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
    parentHref,
  };
  try {
    const entry = performance.getEntriesByType("navigation")[0];
    snapshot.documentEntryUrl = entry?.name ?? null;
  } catch {
    // 성능 API가 없으면 모름(null) — 부모 주소로 replace한다
  }
  const nav = (window as Window & { navigation?: NavigationLike }).navigation;
  const current = nav?.currentEntry;
  if (nav && current && typeof nav.entries === "function") {
    try {
      const prev = current.index > 0 ? nav.entries()[current.index - 1] : undefined;
      snapshot.previousEntryUrl = prev?.url ?? null;
    } catch {
      // entries()를 못 읽으면 대체 판단(documentEntryUrl)으로
    }
  }
  return snapshot;
}

export interface SubPageExit {
  /** 이 화면을 떠나 부모로 — 앱 안에서 들어왔으면 back(), 아니면 replace(parentHref). 한 번만 움직인다. */
  leave(): void;
  /** 이미 떠나는 중인가 — 떠난 뒤의 등록·저장을 막는 데 쓴다(이동이 끝나기 전 두 번째 누름). */
  isLeaving(): boolean;
}

/**
 * 하위 화면 떠나기. 한 화면에서 한 번만 움직인다 — 두 번 누르면 back()이 두 칸 가 버리므로.
 * 취소·등록·저장이 같은 객체를 써서 [취소] 뒤의 [저장] 같은 늦은 누름도 막는다.
 */
export function useLeaveSubPage(parentHref: string): SubPageExit {
  const router = useRouter();
  const leaving = useRef(false);
  return useMemo(
    () => ({
      leave() {
        if (leaving.current) return;
        leaving.current = true;
        if (canLeaveWithHistoryBack(readHistorySnapshot(parentHref))) router.back();
        else router.replace(parentHref);
      },
      isLeaving: () => leaving.current,
    }),
    [router, parentHref],
  );
}

/**
 * SubPageHeader 그대로 + 뒤로 링크(취소·뒤로)를 누르면 onLeave(= 화면의 useLeaveSubPage)로 떠난다.
 * 화면의 다른 떠나기(등록·저장)와 같은 함수를 받아 한 번만 움직이게 한다.
 * 링크는 그대로 두어(새 탭 열기·주소 복사·JS 전 동작) 보통 클릭만 가로챈다.
 */
export function LeaveSubPageHeader({
  onLeave,
  ...props
}: SubPageHeaderProps & { backHref: string; onLeave: () => void }) {
  function handleClickCapture(e: MouseEvent<HTMLDivElement>) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const link = (e.target as Element).closest("a");
    // SubPageHeader의 첫 링크가 뒤로 링크다(제목 옆 action은 버튼)
    if (!link || link !== e.currentTarget.querySelector("a")) return;
    e.preventDefault(); // next/link는 defaultPrevented면 이동하지 않는다
    onLeave();
  }

  return (
    <div onClickCapture={handleClickCapture}>
      <SubPageHeader {...props} />
    </div>
  );
}
