"use client";

// 저장 실패 안내 — 브라우저에 기록을 저장하지 못할 때(사생활 보호 모드·용량 초과) 탭 화면 맨 위에 띄운다.
// 표시 규칙·닫음 기억은 storageWarningView.ts. 입력·[확인하기]·[등록]은 막지 않는다(iOS처럼 메모리에서는 그대로 동작) — 알리기만 한다.
// 홈·기록·운동·기록장·프로필·회복 단계 분석 화면이 함께 쓴다(앱 껍데기는 이 기능 폴더 밖이라 화면마다 둔다).
// 닫음은 sessionStorage에 적고, 그것도 막힌 환경이면 storageWarningView.ts의 모듈 변수가 페이지 수명 동안 기억한다 —
// 화면마다 따로 마운트되므로 컴포넌트 state만으로는 다른 화면으로 옮길 때 다시 뜬다.

import { useEffect, useState } from "react";
import { TriangleAlert, X } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import {
  STORAGE_WARNING_TEXT,
  browserSessionStorage,
  readStorageWarningDismissed,
  storageWarningVisible,
  writeStorageWarningDismissed,
} from "./storageWarningView";

export function StorageWarning() {
  const { hydrated, storageAvailable } = useAppStore();
  // 세션 저장소는 마운트 뒤에 읽는다(정적 HTML·하이드레이션 첫 렌더와 어긋나지 않게)
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 브라우저 저장소는 마운트 뒤에만 읽을 수 있다
    setDismissed(readStorageWarningDismissed(browserSessionStorage()));
  }, []);

  if (!storageWarningVisible({ hydrated, storageAvailable, dismissed })) return null;

  function dismiss() {
    writeStorageWarningDismissed(browserSessionStorage());
    setDismissed(true);
  }

  return (
    // 화면 위에 붙어 따라온다(sticky) — 저장 실패는 화면 아래에서 입력하다가 생기므로(오늘의 질문·기록장 댓글) 맨 위에만 두면 보지 못한다.
    // 바깥 상자는 앱 배경색으로 아래 내용이 비치지 않게 하고, 안쪽 카드가 경고 틴트를 갖는다.
    <div className="sticky top-0 z-10 -my-1 bg-background py-1">
      <div role="status" className="flex w-full items-start gap-2 rounded-button bg-state-watch/10 p-4">
        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-state-watch" strokeWidth={2.5} />
        <p className="min-w-0 flex-1 text-[0.8125rem] text-text-secondary">{STORAGE_WARNING_TEXT.message}</p>
        <button
          type="button"
          onClick={dismiss}
          aria-label={STORAGE_WARNING_TEXT.dismiss}
          className="-m-2 flex size-11 shrink-0 items-center justify-center rounded-full text-text-secondary"
        >
          <X aria-hidden className="size-4" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
