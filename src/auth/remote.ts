// 서버 저장소의 Supabase 구현 — public.user_states 한 행(supabase/migrations/0001_user_states.sql).
// 행 수준 보안(RLS)이 "본인 행만" 읽고 쓰게 막는다. 여기서 user_id를 거르는 것은 편의일 뿐 보안 수단이 아니다.
// updated_at은 서버 트리거가 매긴다 — 쓰기 조건(eq updated_at)으로 다른 기기의 쓰기를 덮지 않는다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PersistedState } from "@/domain/types";
import { STATE_SCHEMA_VERSION, type RemoteStateStore, type RemoteWriteResult } from "@/store/sync/remote";

export const USER_STATES_TABLE = "user_states";
/** Postgres unique_violation — 행이 이미 있다(다른 기기가 먼저 만들었다) */
const UNIQUE_VIOLATION = "23505";

interface Row {
  state: unknown;
  schema_version: unknown;
  updated_at: unknown;
}

function updatedAtOf(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function createSupabaseRemote(client: SupabaseClient, userId: string): RemoteStateStore {
  const table = () => client.from(USER_STATES_TABLE);

  function written(data: unknown): RemoteWriteResult {
    const row = Array.isArray(data) ? data[0] : data;
    const updatedAt = updatedAtOf((row as Partial<Row> | null | undefined)?.updated_at);
    return updatedAt === null ? { ok: false, conflict: Array.isArray(data) && data.length === 0 } : { ok: true, updatedAt };
  }

  return {
    async fetch() {
      try {
        const { data, error } = await table().select("state, schema_version, updated_at").eq("user_id", userId).maybeSingle<Row>();
        if (error) return { ok: false };
        if (data === null) return { ok: true, row: null };
        const updatedAt = updatedAtOf(data.updated_at);
        if (updatedAt === null) return { ok: false };
        const schemaVersion = typeof data.schema_version === "number" ? data.schema_version : STATE_SCHEMA_VERSION;
        return { ok: true, row: { state: data.state, schemaVersion, updatedAt } };
      } catch {
        return { ok: false };
      }
    },

    async insert(state: PersistedState) {
      try {
        const { data, error } = await table()
          .insert({ user_id: userId, state, schema_version: STATE_SCHEMA_VERSION })
          .select("updated_at")
          .single();
        if (error) return { ok: false, conflict: error.code === UNIQUE_VIOLATION };
        return written(data);
      } catch {
        return { ok: false, conflict: false };
      }
    },

    async update(state: PersistedState, expectedUpdatedAt: string) {
      try {
        // 조건부 쓰기 — 그사이 다른 기기가 썼으면 updated_at이 달라 0행이 바뀐다(= 충돌).
        const { data, error } = await table()
          .update({ state, schema_version: STATE_SCHEMA_VERSION })
          .eq("user_id", userId)
          .eq("updated_at", expectedUpdatedAt)
          .select("updated_at");
        if (error) return { ok: false, conflict: false };
        return written(data ?? []);
      } catch {
        return { ok: false, conflict: false };
      }
    },
  };
}
