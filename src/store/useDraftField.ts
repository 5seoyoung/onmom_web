"use client";

// 프로필의 글자 칸(내 동네)을 입력하는 동안 — 화면에는 입력한 글자를 바로 보이고, 저장은 입력이 멈춘 뒤 한 번(draftSaver.ts).
// 칸을 떠날 때(blur)·검색할 때(submit)는 부르는 화면이 flush를 부르고, 화면을 떠날 때(unmount)·탭이 가려질 때(닫기 직전)는 여기서 저장한다.
// 저장하지 않은 입력이 없으면 저장된 값을 그대로 보인다 — 다른 탭·서버 동기화가 바꾼 값도 따라간다.

import { useCallback, useEffect, useState } from "react";
import { createDraftSaver, DRAFT_SAVE_DELAY_MS } from "./draftSaver";

export interface DraftField {
  /** 칸에 보일 값 — 저장하지 않은 입력이 있으면 그것, 없으면 저장된 값 */
  value: string;
  /** 입력이 바뀌었다(onChange) */
  change(value: string): void;
  /** 기다리는 입력을 지금 저장한다(칸을 떠남·검색) */
  flush(): void;
}

export function useDraftField(stored: string, save: (value: string) => void, delayMs: number = DRAFT_SAVE_DELAY_MS): DraftField {
  const [draft, setDraft] = useState<string | null>(null);
  const [saver] = useState(() => createDraftSaver(null, delayMs));
  // 마지막으로 받은 저장 함수 — 저장은 렌더 뒤(타이머·이벤트)에 일어나므로 그때의 것을 쓴다
  useEffect(() => {
    saver.setSave((value) => {
      save(value);
      setDraft(null); // 저장했다 — 이제 저장된 값을 보인다
    });
  });

  useEffect(() => {
    const flush = () => saver.flush();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") saver.flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      saver.flush(); // 화면을 떠난다 — 기다리던 입력을 저장한다
    };
  }, [saver]);

  const change = useCallback(
    (value: string) => {
      setDraft(value);
      saver.change(value);
    },
    [saver],
  );

  return { value: draft ?? stored, change, flush: saver.flush };
}
