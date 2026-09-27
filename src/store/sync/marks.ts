// 동기화가 이 브라우저에 남기는 표시 두 가지. 둘 다 "onmom.web." 접두라 계정 삭제·다른 실제 계정 로그인(eraseAll)이 함께 지운다.
//
// 1) 마지막으로 서버와 맞춘 프로필·산모수첩 — onmom.web.sync.base.v1
//    다음에 페이지를 열 때 첫 합치기의 기준(merge.ts base)으로 쓴다. 올리기 전에 탭이 닫혀도(휴대폰은 자주 그렇다)
//    이 브라우저에서 고친 칸을 서버 값으로 되돌리지 않게. 기록(증상·기분·글)은 id로 합쳐서 기준이 필요 없다 — 그래서 두 칸만 둔다.
// 2) 가져온 기록 — onmom.web.sync.adopted.v1
//    이 브라우저에 남아 있던 다른 사람일 수 있는 기록(로그아웃한 게스트·주인 없는 기록)을 새로 로그인한 계정으로 가져온 시각.
//    공용 PC에서는 남의 기록일 수 있으므로, 이 시각 뒤에 이 브라우저에서 다시 동의를 받기 전에는 서버로 보내지 않는다(engine.ts).
//    같은 사람임이 분명한 경우(게스트가 카카오 계정을 연결, 게스트가 익명 계정으로 옮겨 감)는 남기지 않는다(src/auth/session.ts).
//
// 서버 저장 동의 자체는 여기가 아니라 상태의 프로필에 있다(profile.consentVersion·consentAcceptedAt — domain/consent.ts).
// 모든 접근은 try/catch — 저장소를 못 쓰면 기준은 없는 것으로 보고, 가져온 기록 표시는 이 페이지 메모리에 둔다(보내지 않는 쪽).

import type { IsoDateTimeString, MaternityRecord, UserProfile } from "@/domain/types";
import { decodeMaternity, decodeProfile, isRecord } from "../decode";
import type { StorageLike } from "../persistence";

export const SYNC_BASE_KEY = "onmom.web.sync.base.v1";
export const SYNC_ADOPTED_KEY = "onmom.web.sync.adopted.v1";

/** 합치기 기준 — 마지막으로 서버와 같았던 프로필·산모수첩 */
export interface SyncBase {
  profile: UserProfile;
  maternity: MaternityRecord;
}

export interface SyncMarks {
  loadBase(accountId: string): SyncBase | null;
  /** null이면 지운다(서버에 행이 없다) */
  saveBase(accountId: string, base: SyncBase | null): void;
  /** 같은 서버 행의 계정 id가 바뀌었다(게스트가 카카오 계정을 연결) — 기준을 새 id로 옮긴다(없으면 지운다) */
  moveBase(fromAccountId: string, toAccountId: string): void;
  /** 이 계정으로 다른 사람일 수 있는 기록을 가져온 시각(아직 다시 동의받지 않음) — 없으면 null */
  adoptedAt(accountId: string): IsoDateTimeString | null;
  /** 기록을 이 계정으로 가져온다 — 이 시각 뒤의 동의가 있어야 올린다 */
  markAdopted(accountId: string, at: IsoDateTimeString): void;
  /** 가져온 뒤 다시 동의를 받았다 */
  clearAdopted(accountId: string): void;
}

export function createStorageSyncMarks(getStorage: () => StorageLike | null): SyncMarks {
  function read(key: string): unknown {
    try {
      const text = getStorage()?.getItem(key) ?? null;
      return text === null ? null : (JSON.parse(text) as unknown);
    } catch {
      return null;
    }
  }
  /** false = 저장하지 못했다 */
  function write(key: string, value: unknown | null): boolean {
    try {
      const s = getStorage();
      if (!s) return false;
      if (value === null) s.removeItem(key);
      else s.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false; // 기준은 다음 페이지에서 없는 것으로 본다
    }
  }
  /**
   * 가져온 기록 표시를 저장하지 못했을 때(사생활 보호 모드 등) 이 페이지에서만 기억한다 —
   * 저장이 막혔다고 가져온 기록을 동의 없이 올리지 않게.
   */
  let adoptedInMemory: { accountId: string; at: IsoDateTimeString } | null = null;
  function loadBase(accountId: string): SyncBase | null {
    const raw = read(SYNC_BASE_KEY);
    if (!isRecord(raw) || raw.accountId !== accountId || !isRecord(raw.profile) || !isRecord(raw.maternity)) return null;
    return { profile: decodeProfile(raw.profile), maternity: decodeMaternity(raw.maternity) };
  }

  return {
    loadBase,
    saveBase(accountId, base) {
      write(SYNC_BASE_KEY, base === null ? null : { accountId, profile: base.profile, maternity: base.maternity });
    },
    moveBase(fromAccountId, toAccountId) {
      const base = loadBase(fromAccountId);
      write(SYNC_BASE_KEY, base === null ? null : { accountId: toAccountId, profile: base.profile, maternity: base.maternity });
    },
    adoptedAt(accountId) {
      const raw = read(SYNC_ADOPTED_KEY);
      if (isRecord(raw) && raw.accountId === accountId && typeof raw.at === "string" && !Number.isNaN(Date.parse(raw.at))) return raw.at;
      return adoptedInMemory?.accountId === accountId ? adoptedInMemory.at : null;
    },
    markAdopted(accountId, at) {
      adoptedInMemory = write(SYNC_ADOPTED_KEY, { accountId, at }) ? null : { accountId, at };
    },
    clearAdopted(accountId) {
      if (adoptedInMemory?.accountId === accountId) adoptedInMemory = null;
      const raw = read(SYNC_ADOPTED_KEY);
      if (isRecord(raw) && raw.accountId === accountId) write(SYNC_ADOPTED_KEY, null);
    },
  };
}
