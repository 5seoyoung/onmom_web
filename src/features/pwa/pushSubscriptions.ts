// 푸시 구독의 서버 저장 — public.push_subscriptions(supabase/migrations/0004_push_reminders.sql). 한 끝점(endpoint) = 한 행, 기기마다 하나.
// 행 수준 보안(RLS)이 본인 행만 읽고 쓰게 막고, user_id는 서버가 auth.uid()로 채운다(브라우저가 보내지 않는다).
// 저장하는 것은 푸시 끝점·암호화 키·시간대뿐이다 — 건강 데이터는 없다. 알림 본문도 서버의 고정 문구(_shared/reminders.ts)뿐이다.

import { getSupabaseClient } from "@/auth/client";
import { PUSH_SUBSCRIPTIONS_TABLE, type PushSubscriptionRow } from "./reminderModel";

export type SaveSubscriptionResult = { ok: true } | { ok: false; reason: "noClient" | "noSession" | "failed" };

/** 구독을 저장한다(같은 끝점이 있으면 키·시간대를 갱신). Supabase 설정이 없거나 로그인 세션이 없으면 저장하지 않는다. */
export async function savePushSubscription(row: PushSubscriptionRow): Promise<SaveSubscriptionResult> {
  const client = await getSupabaseClient();
  if (!client) return { ok: false, reason: "noClient" };
  try {
    const { data } = await client.auth.getSession();
    if (!data.session) return { ok: false, reason: "noSession" };
    const { error } = await client.from(PUSH_SUBSCRIPTIONS_TABLE).upsert(row, { onConflict: "endpoint" });
    return error ? { ok: false, reason: "failed" } : { ok: true };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/**
 * 끝점의 행이 이 사용자에게 있는가 — 설정 화면의 "켜짐" 확인용(서버가 보낼 곳이 없는 켜짐은 없다).
 * RLS가 본인 행만 보여 주므로 다른 사용자의 행이면 false. 확인하지 못하면(설정 없음·세션 없음·오프라인·오류) null.
 */
export async function hasPushSubscriptionRow(endpoint: string): Promise<boolean | null> {
  const client = await getSupabaseClient();
  if (!client) return null;
  try {
    const { data: auth } = await client.auth.getSession();
    if (!auth.session) return null;
    const { data, error } = await client.from(PUSH_SUBSCRIPTIONS_TABLE).select("endpoint").eq("endpoint", endpoint).maybeSingle();
    if (error) return null;
    return data !== null;
  } catch {
    return null;
  }
}

/** 끝점의 행을 지운다(본인 행만 — RLS). 실패해도 던지지 않는다: 브라우저 구독을 풀면 서버가 다음 발송 때 410으로 지운다. */
export async function deletePushSubscription(endpoint: string): Promise<boolean> {
  const client = await getSupabaseClient();
  if (!client) return false;
  try {
    const { error } = await client.from(PUSH_SUBSCRIPTIONS_TABLE).delete().eq("endpoint", endpoint);
    return !error;
  } catch {
    return false;
  }
}
