// 서버 저장소 경계 — 동기화 엔진은 이 인터페이스만 안다(Supabase 구현: src/auth/remote.ts, 테스트: 가짜 구현).
// 한 계정 = 한 행(user_states). 행에는 앱 상태 JSON 전체와 마지막 수정 시각(updated_at)이 있다.
// 모든 함수는 예외를 던지지 않고 결과 값으로 실패를 알린다.

import type { PersistedState } from "@/domain/types";

/**
 * 서버에 올리는 상태 JSON의 형식 번호. 형식을 바꾸면 올리고, 더 높은 번호의 행은 읽기만 한다(옛 웹이 새 형식을 덮지 않게 — engine.ts "outdated").
 * - 1: 처음 형식(2026-09-28).
 * - 2: 지운 기록의 삭제 표시(deleted)와 고친 시각(updatedAt)을 더함(2026-11-08, LAUNCH_CHECKLIST 7-4). 형식 1만 아는 웹은 두 칸을 모르고
 *   합치며 지운 기록을 되살리고 고친 시각을 떨어뜨린다 — 그래서 형식 2의 행은 읽기만 하고(새로 고침 안내), 쓰지 않는다.
 *   이 웹은 형식 1의 행도 그대로 읽는다(두 칸이 없으면 지운 기록·고친 기록이 없는 것). DB 제약은 schema_version >= 1뿐이라(0001) 마이그레이션이 필요 없다.
 */
export const STATE_SCHEMA_VERSION = 2;

export interface RemoteRow {
  /** 저장된 상태 JSON(해석 전) */
  state: unknown;
  schemaVersion: number;
  /** 서버가 매긴 마지막 수정 시각 — 다음 쓰기의 조건(낙관적 동시성) */
  updatedAt: string;
}

export type RemoteFetchResult = { ok: true; row: RemoteRow | null } | { ok: false };

/** conflict = 다른 기기가 먼저 썼다(조건 불일치·이미 행이 있음) → 다시 읽고 합친 뒤 재시도 */
export type RemoteWriteResult = { ok: true; updatedAt: string } | { ok: false; conflict: boolean };

export interface RemoteStateStore {
  /** 내 행 읽기 — 없으면 row: null */
  fetch(): Promise<RemoteFetchResult>;
  /** 내 행 처음 만들기 — 이미 있으면 conflict */
  insert(state: PersistedState): Promise<RemoteWriteResult>;
  /** 내 행 바꾸기 — 서버의 updated_at이 expectedUpdatedAt일 때만. 아니면(0행) conflict */
  update(state: PersistedState, expectedUpdatedAt: string): Promise<RemoteWriteResult>;
}
