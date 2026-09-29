// 브라우저 방문 기록 읽기 — 하위 화면 떠나기 판단(subPageExit.ts)의 입력. 브라우저에서만 부른다(클릭 처리 중).

import type { HistorySnapshot } from "./subPageExit";

interface NavigationLike {
  currentEntry: { index: number } | null;
  entries(): Array<{ url: string | null }>;
}

export function readHistorySnapshot(parentHref: string): HistorySnapshot {
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
    // 성능 API가 없으면 모름(null) — 부모 주소로 이동한다
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
