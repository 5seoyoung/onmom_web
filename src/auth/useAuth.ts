"use client";

// 화면에서 쓰는 로그인·동기화 훅.
//
//   useAuthSession(pathname)  — 앱 관문(AppGate)이 한 번 부른다: 다시 방문한 카카오 사용자의 세션 복원·동기화, 계정 변화 감시
//   useSyncStatus()           — "off" | "loading" | "waitingConsent" | "pending" | "synced" | "error" | "outdated"
//   useAccountSession()       — 설정 화면용: signOut()·deleteAccount() (서버 동기화·삭제까지 처리)
//                               온보딩용: acceptServerStorageConsent() (서버 저장 동의를 받았을 때)
//
// 설정(NEXT_PUBLIC_SUPABASE_*)이 없으면 아무것도 하지 않는다(네트워크 없음).

import { useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { isSupabaseConfigured } from "@/config";
import { isPathWithin, ROUTES } from "@/routes";
import type { AppStore } from "@/store/appStore";
import { getBrowserStore } from "@/store/browserStore";
import { StoreContext } from "@/store/StoreProvider";
import { authSession, type AccountSyncStatus, type DeleteAccountResult, type SignOutResult } from "./session";

function useStore(): AppStore {
  return useContext(StoreContext) ?? getBrowserStore();
}

export function useAuthSession(pathname: string | null) {
  const store = useStore();
  const onCallback = isPathWithin(pathname, ROUTES.authCallback);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    return authSession.watch(store);
  }, [store]);

  useEffect(() => {
    // 콜백 화면은 스스로 세션을 만든다 — 그 뒤 다른 화면으로 가면 여기서 이어받는다(이미 동기화 중이면 그대로).
    // 페이지를 열 때 스토어마다 한 번(탭 이동마다 다시 하지 않게). 세션을 확인하지 못했으면(오프라인 등) 온라인이 되거나
    // 잠시 뒤 다시 한다 — session.ts ensureRestored.
    if (!isSupabaseConfigured() || onCallback) return;
    authSession.ensureRestored(store);
  }, [store, onCallback]);
}

export function useSyncStatus(): AccountSyncStatus {
  return useSyncExternalStore(authSession.subscribeSyncStatus, authSession.syncStatus, () => "off");
}

export interface AccountSessionActions {
  /**
   * 로그아웃 — 게스트: 지금과 같다(기록은 남음). 카카오: 기다리는 변경을 올리고(최대 8초) 로그아웃한 뒤 이 브라우저의 기록 사본을 지운다.
   * 올리지 못했으면 { ok: false, reason: "unsynced" } — 경고 뒤 signOut({ force: true })면 기록을 남긴 채 로그아웃.
   */
  signOut(opts?: { force?: boolean }): Promise<SignOutResult>;
  /** 계정 삭제 — 카카오: 서버 행·계정을 먼저 지우고, 성공했을 때만 이 브라우저를 비운다. 실패하면 아무것도 지우지 않는다. */
  deleteAccount(): Promise<DeleteAccountResult>;
  /**
   * 서버 저장 동의를 받았다 — 온보딩 3단계(카카오 계정)의 서버 저장 동의, 또는 가져온 게스트 기록의 다시 동의 화면이 부른다.
   * 이 뒤부터 이 카카오 계정의 기록을 서버로 올린다. 카카오 계정이 아니거나 설정이 없으면 false.
   */
  acceptServerStorageConsent(): boolean;
}

export function useAccountSession(): AccountSessionActions {
  const store = useStore();
  return useMemo(
    () => ({
      signOut: (opts) => authSession.signOut(store, opts),
      deleteAccount: () => authSession.deleteAccount(store),
      acceptServerStorageConsent: () => authSession.acceptServerStorageConsent(store),
    }),
    [store],
  );
}
