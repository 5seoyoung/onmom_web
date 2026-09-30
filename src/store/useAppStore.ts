"use client";

// 화면에서 앱 상태를 읽고 바꾸는 훅.
//
//   const { hydrated, state, account, displayName, actions } = useAppStore();
//   if (!hydrated) return null; // 저장소를 읽기 전 — 잘못된 데이터를 번쩍이지 않게
//
// 서버 렌더링(정적 export)과 하이드레이션 첫 렌더는 hydrated=false인 초기 상태를 본다.

import { useContext, useSyncExternalStore } from "react";
import { displayName, type Account } from "./account";
import type { AppActions, AppSnapshot } from "./appStore";
import { getBrowserStore } from "./browserStore";
import { StoreContext } from "./StoreProvider";

export interface AppStoreView extends AppSnapshot {
  isSignedIn: boolean;
  /** 계정 표시 이름 — 닉네임 → "게스트"/"카카오 사용자"/"사용자" */
  displayName: string;
  actions: AppActions;
}

/** 여러 탭 보호로 버린 이 탭의 쓰기 수(appStore.discardedWrites) — 서버 렌더링·하이드레이션 첫 렌더는 0. */
export function useDiscardedWrites(): number {
  const store = useContext(StoreContext) ?? getBrowserStore();
  return useSyncExternalStore(store.subscribe, store.discardedWrites, () => 0);
}

export function useAppStore(): AppStoreView {
  const store = useContext(StoreContext) ?? getBrowserStore();
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const account: Account | null = snap.account;
  return {
    ...snap,
    isSignedIn: account !== null,
    displayName: displayName(account),
    actions: store.actions,
  };
}
