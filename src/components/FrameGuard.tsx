"use client";

// 클릭재킹 막기 — 루트 레이아웃이 앱 전체를 감싼다. 다른 사이트의 <iframe> 안이면 앱을 숨기고 맨 위 창을 온맘 주소로 옮겨 본다
// (판단·동작은 framing.ts, 숨김 규칙은 globals.css html[data-framed]).
//
// 처음부터 숨겨 두고 "프레임 밖"이 확인되면 보이는 방식은 쓰지 않는다. 그렇게 하려면 정적 HTML을 숨긴 채 내보내고 번들 스크립트가
// 하이드레이션한 뒤에야 보여야 하는데(인라인 스크립트는 CSP 해시 때문에 쓰지 않는다), 그러면 모든 사용자가 스크립트를 받을 때까지 빈
// 화면을 보고, 스크립트가 실패하면 영영 빈 화면이 된다. 대신 하이드레이션 커밋의 layout effect(그리기 전)에서 확인한다. 그 전의 정적
// HTML에는 보호된 화면이 없고(앱 관문이 저장소를 읽은 뒤에만 그린다) 버튼도 스크립트 없이는 움직이지 않아 겹쳐 누르게 할 것이 없다.
// 들어 있으면 같은 effect에서 바로 숨기고(그리기 전), 이어서 앱 트리를 걷어 낸다(다음 렌더부터 null — 눌릴 요소 자체가 없다).
// 그래서 프레임 밖의 사용자는 지금과 똑같이 보고(깜빡임 없음), 프레임 안에서는 하이드레이션된 화면이 한 번도 그려지지 않는다.

import { useLayoutEffect, useSyncExternalStore, type ReactNode } from "react";
import { breakOutOfFrame, FRAMED_ATTRIBUTE, isFramed } from "./framing";

const subscribe = () => () => undefined;
const getSnapshot = () => isFramed(window);
// 정적 HTML·하이드레이션 첫 렌더는 "들어 있지 않음" — 서버에는 창이 없다
const getServerSnapshot = () => false;

export function FrameGuard({ children }: { children: ReactNode }) {
  const framed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useLayoutEffect(() => {
    if (!isFramed(window)) return;
    document.documentElement.setAttribute(FRAMED_ATTRIBUTE, "");
    breakOutOfFrame(window);
  }, []);

  return framed ? null : children;
}
