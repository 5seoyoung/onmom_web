"use client";

// 화면에서 쓰는 "이 계정의 서버 세션이 있는가"(serverSession.ts). 설정 > 알림이 토글을 보일지 정할 때 쓴다.
// 설정 없는 빌드·로그아웃·저장된 세션 없음이면 요청 없이 "none". 저장된 세션이 있으면 supabase-js에서 한 번 읽는다(네트워크 없음 —
// 만료된 토큰이면 supabase-js가 갱신을 시도한다). 계정이 바뀌거나 동기화가 켜지고 꺼질 때(세션 복원·익명 계정으로 옮김·로그아웃) 다시 읽는다.

import { useEffect, useState } from "react";
import { isSupabaseConfigured } from "@/config";
import { useAppStore } from "@/store/useAppStore";
import { getSupabaseClient, hasStoredAuthSession } from "./client";
import { accountFromSessionUser } from "./kakaoAccount";
import { serverSessionStatus, type ServerSessionStatus, type SessionRead } from "./serverSession";
import { useSyncStatus } from "./useAuth";

/** 저장된 세션의 사용자 → 앱 계정 id. 읽지 못하면 "error"(모른다 — 토글을 잠근 채 둔다). */
async function readSessionAccount(): Promise<Exclude<SessionRead, undefined>> {
  try {
    const client = await getSupabaseClient();
    if (!client) return "error";
    const { data, error } = await client.auth.getSession();
    if (data.session) return { accountId: accountFromSessionUser(data.session.user)?.id ?? null };
    return error ? "error" : null;
  } catch {
    return "error";
  }
}

export function useServerSession(): ServerSessionStatus {
  const { account } = useAppStore();
  const accountId = account?.id ?? null;
  const configured = isSupabaseConfigured();
  const syncOff = useSyncStatus() === "off";
  // 읽기만(localStorage) — 화면은 저장소를 읽은 뒤(hydrated)에만 그려지므로 정적 HTML과 어긋나지 않는다
  const storedSession = configured && accountId !== null && hasStoredAuthSession();
  const key = `${accountId ?? ""}|${syncOff ? "off" : "on"}`;
  const [read, setRead] = useState<{ key: string; session: SessionRead } | null>(null);

  useEffect(() => {
    if (!storedSession) return;
    let cancelled = false;
    void readSessionAccount().then((session) => {
      if (!cancelled) setRead({ key, session });
    });
    return () => {
      cancelled = true;
    };
  }, [storedSession, key]);

  // 다른 계정·다른 동기화 상태에서 읽은 값은 쓰지 않는다(다시 읽는 동안은 checking)
  return serverSessionStatus({ configured, accountId, storedSession, session: read?.key === key ? read.session : undefined });
}
