// 동기화 테스트용 가짜 서버(한 행) — 테스트에서만 쓴다(화면·번들에 들어가지 않음).

import type { PersistedState } from "@/domain/types";
import { STATE_SCHEMA_VERSION, type RemoteFetchResult, type RemoteRow, type RemoteStateStore, type RemoteWriteResult } from "./remote";

/** 서버 흉내 — 한 행, updated_at은 쓸 때마다 바뀐다. 호출은 기록해 두고, 실패·지연을 끼워 넣을 수 있다. */
export class FakeRemote implements RemoteStateStore {
  row: RemoteRow | null = null;
  private tick = 0;
  calls: string[] = [];
  failFetch = 0;
  failWrite = 0;
  /** 다음 fetch를 이 약속이 풀릴 때까지 붙잡는다 */
  holdFetch: Promise<void> | null = null;
  /** 다음 update 직전에 다른 기기가 먼저 쓴 것처럼 행을 바꾼다 */
  beforeNextUpdate: (() => void) | null = null;

  stamp(): string {
    this.tick += 1;
    return `2026-09-27T03:00:${String(this.tick).padStart(2, "0")}.000000+00:00`;
  }
  setServer(state: PersistedState, schemaVersion = STATE_SCHEMA_VERSION) {
    this.row = { state: JSON.parse(JSON.stringify(state)), schemaVersion, updatedAt: this.stamp() };
  }
  writes() {
    return this.calls.filter((c) => c !== "fetch");
  }
  serverState(): PersistedState {
    return this.row!.state as PersistedState;
  }

  async fetch(): Promise<RemoteFetchResult> {
    this.calls.push("fetch");
    if (this.holdFetch) {
      const h = this.holdFetch;
      this.holdFetch = null;
      await h;
    }
    if (this.failFetch > 0) {
      this.failFetch -= 1;
      return { ok: false };
    }
    return { ok: true, row: this.row ? { ...this.row } : null };
  }
  async insert(state: PersistedState): Promise<RemoteWriteResult> {
    this.calls.push("insert");
    if (this.failWrite > 0) {
      this.failWrite -= 1;
      return { ok: false, conflict: false };
    }
    if (this.row) return { ok: false, conflict: true };
    this.setServer(state);
    return { ok: true, updatedAt: this.row!.updatedAt };
  }
  async update(state: PersistedState, expected: string): Promise<RemoteWriteResult> {
    this.calls.push("update");
    if (this.beforeNextUpdate) {
      const f = this.beforeNextUpdate;
      this.beforeNextUpdate = null;
      f();
    }
    if (this.failWrite > 0) {
      this.failWrite -= 1;
      return { ok: false, conflict: false };
    }
    if (!this.row || this.row.updatedAt !== expected) return { ok: false, conflict: true };
    this.setServer(state);
    return { ok: true, updatedAt: this.row.updatedAt };
  }
}
