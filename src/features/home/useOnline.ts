"use client";

// 브라우저가 온라인인가 — navigator.onLine + online/offline 이벤트(useSyncExternalStore).
// 규칙 기능(기록·분석·가이드·지원사업·기분)은 오프라인에서도 그대로 동작한다(05 §3, 08 §4).
// 서버가 필요한 화면(운동 영상·분석의 영상·가까운 산부인과)은 실패했을 때 일반 "연결 실패" 대신 오프라인임을 말한다.
// navigator.onLine이 true라도 실제로 연결이 안 될 수 있으므로(포털 로그인 등) 여기서는 "false면 확실히 오프라인"으로만 쓴다 —
// true일 때 요청을 미리 막지 않는다. 서버 렌더링·하이드레이션 첫 렌더는 true(정적 HTML에 오프라인 문구가 박히지 않게).
// 공용 훅이 아니라 이 기능 폴더의 도우미다(운동·분석·산부인과도 여기서 가져다 쓴다 — DEV_NOTES §5 공용 후보).

import { useSyncExternalStore } from "react";

/** 오프라인일 때 서버가 필요한 기능의 실패 문구 — 웹 신규 문구 — CPO 확인 필요 (05 §3 오프라인 동작, 08 §4) */
export const OFFLINE_TEXT = "오프라인이에요 — 인터넷에 연결되면 다시 시도해 주세요";

function subscribe(listener: () => void): () => void {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

/** navigator.onLine — 값을 모르면(없는 브라우저) 온라인으로 본다. */
export function readOnline(nav: { onLine?: boolean } | undefined = typeof navigator === "undefined" ? undefined : navigator): boolean {
  return nav?.onLine !== false;
}

const getSnapshot = () => readOnline();
const getServerSnapshot = () => true;

/** true = 온라인(또는 알 수 없음), false = 확실히 오프라인 */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
