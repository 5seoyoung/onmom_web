"use client";

// 홈의 작은 서버 저장 안내 — 동기화가 60초 넘게 실패 중일 때만(Supabase 일시 중지·네트워크). 막지 않는다(role=status).
// 상태·문구 규칙은 syncStatusView.ts. 설정 없는 빌드는 상태가 "off"라 아무것도 그리지 않는다.
// 다시 시도 버튼은 두지 않는다 — 엔진이 스스로 다시 시도하고(engine.ts), 수동 재시도는 설정 화면 몫이다.
//
// "실패가 시작된 시각"(errorSince)은 마지막 성공 뒤 첫 실패다 — 엔진이 재시도할 때마다 error → loading/pending → error로
// 상태를 바꾸므로 error가 "이어진" 시간을 세면 안내가 뜨지 않는다(재시도 간격 최대 60초 = 안내 지연). 타이머도 상태가 아니라
// errorSince에 매단다. 이 값은 이 화면(홈)에 머무는 동안만 기억한다 — 다른 탭에 갔다가 오면 60초를 다시 센다.

import { useEffect, useState } from "react";
import { CloudOff } from "lucide-react";
import { useSyncStatus } from "@/auth";
import { SYNC_STATUS_TEXT, homeSyncNoticeVisible, homeSyncNoticeWaitMs, nextErrorSince } from "./syncStatusView";

export function SyncStatusNotice() {
  const status = useSyncStatus();
  const [errorSince, setErrorSince] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  // 상태가 바뀔 때마다 "마지막 성공 뒤 첫 실패" 시각을 잇는다(재시도 중인 pending·loading은 그대로, 성공하면 null)
  useEffect(() => {
    const at = Date.now();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 외부 상태(동기화)가 바뀐 시각을 기록한다
    setErrorSince((prev) => nextErrorSince(status, prev, at));
  }, [status]);

  // errorSince가 정해지면 60초 뒤에 한 번 다시 그린다 — 그 사이 재시도로 상태가 바뀌어도 타이머는 살아 있다
  useEffect(() => {
    if (errorSince === null) return;
    const timer = setTimeout(() => setNow(Date.now()), homeSyncNoticeWaitMs(errorSince, Date.now()));
    return () => clearTimeout(timer);
  }, [errorSince]);

  if (!homeSyncNoticeVisible(status, errorSince, now)) return null;

  return (
    <p role="status" className="flex w-full items-start gap-2 rounded-button bg-state-watch/10 p-4 text-[0.8125rem] text-text-secondary">
      <CloudOff aria-hidden className="mt-0.5 size-4 shrink-0 text-state-watch" strokeWidth={2.5} />
      <span className="min-w-0 flex-1">{SYNC_STATUS_TEXT.homeError}</span>
    </p>
  );
}
