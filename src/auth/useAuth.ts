"use client";

// 화면에서 쓰는 로그인·동기화 훅.
//
//   useAuthSession(pathname, allowGuestUpgrade) — 앱 관문(AppGate)이 한 번 부른다: 다시 방문한 사용자의 세션 복원·동기화
//                               (예전 브라우저 전용 게스트는 앱 화면에서만 익명 계정으로 옮긴다), 계정 변화 감시
//   useSyncStatus()           — "off" | "loading" | "waitingConsent" | "pending" | "synced" | "error" | "outdated"
//   useAccountSession()       — 로그인 화면: signInGuest()·signInWithKakao()
//                               설정 화면: signOut()·deleteAccount()·signInWithKakao()(게스트의 카카오 계정 연결)
//
// 설정(NEXT_PUBLIC_SUPABASE_*)이 없으면 아무것도 하지 않는다(네트워크 없음) — signInGuest는 지금처럼 이 브라우저 전용 게스트.

import { useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { isSupabaseConfigured } from "@/config";
import { isPathWithin, ROUTES } from "@/routes";
import type { AppStore } from "@/store/appStore";
import { getBrowserStore } from "@/store/browserStore";
import { StoreContext } from "@/store/StoreProvider";
import {
  authSession,
  type AccountSyncStatus,
  type DeleteAccountResult,
  type GuestSignInResult,
  type KakaoSignInResult,
  type SignOutResult,
} from "./session";

function useStore(): AppStore {
  return useContext(StoreContext) ?? getBrowserStore();
}

/**
 * allowGuestUpgrade — 게스트(예전 브라우저 전용 게스트 등)를 Supabase 익명 계정으로 옮겨도 되는 화면인가. 앱 화면만 true —
 * 공개 화면(소개·개인정보처리방침·관리자)을 연 것만으로 익명 계정(계정 ID·접속 기록·IP)을 만들거나 사람 확인 스크립트를 부르지 않는다.
 * 이미 있는 세션을 이어받는 것은 어느 화면에서나 한다.
 */
export function useAuthSession(pathname: string | null, allowGuestUpgrade: boolean) {
  const store = useStore();
  const onCallback = isPathWithin(pathname, ROUTES.authCallback);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    return authSession.watch(store);
  }, [store]);

  useEffect(() => {
    // 콜백 화면은 스스로 세션을 만든다 — 그 뒤 다른 화면으로 가면 여기서 이어받는다(이미 동기화 중이면 그대로).
    // 페이지를 열 때 스토어마다 한 번(탭 이동마다 다시 하지 않게 — 공개 화면에서 앱 화면으로 오면 게스트 옮기기만 한 번 더).
    // 세션을 확인하지 못했으면(오프라인 등) 온라인이 되거나 잠시 뒤 다시 한다 — session.ts ensureRestored.
    if (!isSupabaseConfigured() || onCallback) return;
    authSession.ensureRestored(store, { allowGuestUpgrade });
  }, [store, onCallback, allowGuestUpgrade]);
}

export function useSyncStatus(): AccountSyncStatus {
  return useSyncExternalStore(authSession.subscribeSyncStatus, authSession.syncStatus, () => "off");
}

export interface AccountSessionActions {
  /** [게스트로 시작] — 설정이 있으면 익명 계정(실패하면 이 브라우저 전용), 없으면 지금처럼 이 브라우저 전용 게스트 */
  signInGuest(): Promise<GuestSignInResult>;
  /** [카카오로 시작하기]·[카카오 계정 연결] — 게스트의 익명 계정이면 연결, 아니면 로그인. 성공하면 카카오 화면으로 이동한다. */
  signInWithKakao(): Promise<KakaoSignInResult>;
  /**
   * 로그아웃 — 카카오: 기다리는 변경을 올리고(최대 8초) 로그아웃한 뒤 이 브라우저의 기록 사본을 지운다.
   * 올리지 못했으면 { ok: false, reason: "unsynced" } — 경고 뒤 signOut({ force: true })면 기록을 남긴 채 로그아웃.
   * 설정이 있는 빌드의 게스트는 { ok: false, reason: "guest" }(로그아웃 대신 연결·삭제).
   */
  signOut(opts?: { force?: boolean }): Promise<SignOutResult>;
  /** 계정 삭제 — 서버 계정(카카오·익명 게스트)은 서버 행·계정을 먼저 지우고, 성공했을 때만 이 브라우저를 비운다. */
  deleteAccount(): Promise<DeleteAccountResult>;
}

export function useAccountSession(): AccountSessionActions {
  const store = useStore();
  return useMemo(
    () => ({
      signInGuest: () => authSession.signInGuest(store),
      signInWithKakao: () => authSession.signInWithKakao(store),
      signOut: (opts) => authSession.signOut(store, opts),
      deleteAccount: () => authSession.deleteAccount(store),
    }),
    [store],
  );
}
