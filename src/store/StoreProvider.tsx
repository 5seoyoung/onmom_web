"use client";

// 앱 상태 Provider — 루트 레이아웃에서 한 번 감싼다. store를 넘기지 않으면 브라우저 싱글턴(localStorage)을 쓴다.
// Provider가 없어도 useAppStore는 같은 싱글턴으로 동작한다. 테스트·미리보기에서는 메모리 저장소 스토어를 넘긴다.

import { createContext, type ReactNode } from "react";
import type { AppStore } from "./appStore";
import { getBrowserStore } from "./browserStore";

export const StoreContext = createContext<AppStore | null>(null);

export function StoreProvider({ children, store }: { children?: ReactNode; store?: AppStore }) {
  return <StoreContext.Provider value={store ?? getBrowserStore()}>{children}</StoreContext.Provider>;
}
