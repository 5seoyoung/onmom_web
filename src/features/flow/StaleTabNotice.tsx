"use client";

// 여러 탭 보호로 이 탭의 쓰기를 버렸을 때 한 번 알리는 안내(규칙·문구는 staleTabNoticeView.ts).
// 앱 관문(AppGate)이 모든 화면 위에 한 번 둔다 — 쓰기를 버린 뒤 관문이 로그인 화면(또는 바뀐 계정의 화면)으로 옮겨도 사라지지 않게.
// 화면 맨 위에 떠 있고(아래 내용을 밀지 않음), 낭독은 조용히(role="status"). 영역은 늘 있어 안내가 생길 때 읽힌다.
// 사용자 데이터를 쓰지 않는다(버린 수만). 정적 HTML·하이드레이션 첫 렌더에서는 늘 비어 있다(서버 스냅샷 0).

import { useState } from "react";
import { Info, X } from "lucide-react";
import { useDiscardedWrites } from "@/store/useAppStore";
import { STALE_TAB_TEXT, staleTabNoticeVisible } from "./staleTabNoticeView";

export function StaleTabNotice() {
  const discarded = useDiscardedWrites();
  // 마지막으로 닫았을 때의 버린 수 — 그 뒤 또 버리면 다시 보인다
  const [dismissedAt, setDismissedAt] = useState(0);
  const visible = staleTabNoticeVisible(discarded, dismissedAt);

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-[max(0.75rem,env(safe-area-inset-top))]"
    >
      {visible ? (
        <div className="pointer-events-auto flex w-full max-w-[28rem] items-start gap-2 rounded-button border border-divider bg-surface p-4 shadow-[0_0.25rem_1.5rem_rgb(0_0_0/0.10)]">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-text-secondary" strokeWidth={2.5} />
          <p className="min-w-0 flex-1 text-[0.8125rem] text-text-primary">{STALE_TAB_TEXT.message}</p>
          <button
            type="button"
            onClick={() => setDismissedAt(discarded)}
            aria-label={STALE_TAB_TEXT.dismiss}
            className="-m-2 flex size-11 shrink-0 items-center justify-center rounded-full text-text-secondary"
          >
            <X aria-hidden className="size-4" strokeWidth={2.5} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
