// 내 데이터 내려받기에 넣을 서버 계정 정보(dataExport serverAccount) — 내려받기 버튼을 누른 그때 내 계정 것만 읽는다.
//   1) Supabase Auth의 내 사용자 정보(auth.getUser — 서버에 묻는다. 세션의 사본이 아니라 서버가 지금 가진 값)
//   2) 내 AI 답변 동의 행(public.ai_consents — RLS가 본인 행만 보여 준다, 0010·0012)
// 둘 중 하나라도 못 읽으면 null을 돌려준다 — 화면은 기록만 담은 파일을 만들고 "서버 계정 정보는 담지 못했어요"를 알린다(지어내지 않는다).
// 응답·오류를 콘솔에 남기지 않는다(개인정보).

import type { SupabaseClient } from "@supabase/supabase-js";
import { serverAccountFrom, type ServerAccountInfo } from "./dataExport";

/** 이 모듈이 쓰는 supabase-js의 부분 — 시험은 이 모양의 가짜를 넘긴다 */
export interface ServerAccountPorts {
  getUser(): Promise<{ user: unknown; failed: boolean }>;
  /** 내 AI 동의 행(없으면 row null) */
  aiConsentRow(userId: string): Promise<{ row: unknown; failed: boolean }>;
}

export function serverAccountPortsFrom(client: SupabaseClient): ServerAccountPorts {
  return {
    async getUser() {
      const { data, error } = await client.auth.getUser();
      return { user: data.user ?? null, failed: error !== null || data.user === null };
    },
    async aiConsentRow(userId) {
      const { data, error } = await client
        .from("ai_consents")
        .select("version, sensitive_agreed, transfer_agreed, accepted_at, recorded_at")
        .eq("user_id", userId)
        .maybeSingle();
      return { row: data ?? null, failed: error !== null };
    },
  };
}

export async function fetchServerAccountInfo(ports: ServerAccountPorts): Promise<ServerAccountInfo | null> {
  try {
    const { user, failed } = await ports.getUser();
    if (failed) return null;
    const info = serverAccountFrom(user, null);
    if (info === null) return null;
    const consent = await ports.aiConsentRow(info.id);
    if (consent.failed) return null;
    return serverAccountFrom(user, consent.row);
  } catch {
    return null;
  }
}
