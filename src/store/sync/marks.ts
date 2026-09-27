// 동기화가 이 브라우저에 남기는 표시 두 가지. 둘 다 "onmom.web." 접두라 계정 삭제·다른 실제 계정 로그인(eraseAll)이 함께 지운다.
//
// 1) 마지막으로 서버와 맞춘 프로필·산모수첩 — onmom.web.sync.base.v1
//    다음에 페이지를 열 때 첫 합치기의 기준(merge.ts base)으로 쓴다. 올리기 전에 탭이 닫혀도(휴대폰은 자주 그렇다)
//    이 브라우저에서 고친 칸을 서버 값으로 되돌리지 않게. 기록(증상·기분·글)은 id로 합쳐서 기준이 필요 없다 — 그래서 두 칸만 둔다.
// 2) 서버 저장 동의 — onmom.web.sync.consent.v1
//    - consentVersion: 이 계정으로 "서버 저장" 동의 문구에 동의한 판. 문구가 바뀌면 SERVER_STORAGE_CONSENT_VERSION을 올려
//      예전 동의로는 올리지 않게 한다(감사 #20). 온보딩 3단계의 profile.consentAccepted("내 기기에만 저장")는 서버 저장 동의가 아니다(감사 #15).
//    - adopted: 게스트·주인 없는 기록을 이 카카오 계정으로 가져왔다(state.ts bindToAccount). 공용 PC에서는 다른 사람의
//      기록일 수 있으므로, 서버 저장 동의를 받기 전에는 서버 행에 섞지 않는다.
//
// 모든 접근은 try/catch — 저장소를 못 쓰면 "기준 없음·동의 없음"으로 본다(= 서버로 보내지 않는 쪽).

import type { MaternityRecord, UserProfile } from "@/domain/types";
import { decodeMaternity, decodeProfile, isRecord } from "../decode";
import type { StorageLike } from "../persistence";

export const SYNC_BASE_KEY = "onmom.web.sync.base.v1";
export const SYNC_CONSENT_KEY = "onmom.web.sync.consent.v1";

/**
 * 서버 저장 동의 문구의 판 — CPO가 온보딩의 서버 저장 동의 문구를 바꾸면 1 올린다.
 * 올리면 이전 판에 동의한 브라우저는 다시 동의할 때까지 새 기록을 올리지 않는다(서버에 이미 있는 행은 그대로).
 */
export const SERVER_STORAGE_CONSENT_VERSION = 1;

/** 합치기 기준 — 마지막으로 서버와 같았던 프로필·산모수첩 */
export interface SyncBase {
  profile: UserProfile;
  maternity: MaternityRecord;
}

export interface SyncConsentState {
  /** 이 계정으로 지금 판의 서버 저장 동의를 받았다 */
  given: boolean;
  /** 게스트·주인 없는 기록을 가져왔고 아직 동의를 받지 않았다 — 서버 행에 섞지 않는다 */
  adopted: boolean;
}

export interface SyncMarks {
  loadBase(accountId: string): SyncBase | null;
  /** null이면 지운다(서버에 행이 없다) */
  saveBase(accountId: string, base: SyncBase | null): void;
  consent(accountId: string): SyncConsentState;
  /** 서버 저장 동의를 받았다(지금 판) — 가져온 기록도 이 동의로 올린다 */
  acceptConsent(accountId: string): void;
  /** 게스트·주인 없는 기록을 이 계정으로 가져온다 — 이 브라우저의 이전 동의 표시는 버린다 */
  markAdopted(accountId: string): void;
}

const NO_CONSENT: SyncConsentState = Object.freeze({ given: false, adopted: false });

export function createStorageSyncMarks(getStorage: () => StorageLike | null): SyncMarks {
  function read(key: string): unknown {
    try {
      const text = getStorage()?.getItem(key) ?? null;
      return text === null ? null : (JSON.parse(text) as unknown);
    } catch {
      return null;
    }
  }
  function write(key: string, value: unknown | null) {
    try {
      const s = getStorage();
      if (!s) return;
      if (value === null) s.removeItem(key);
      else s.setItem(key, JSON.stringify(value));
    } catch {
      // 못 쓰면 다음 페이지에서 기준·동의가 없는 것으로 본다(보내지 않는 쪽)
    }
  }
  function consentRecord(accountId: string): { consentVersion: number | null; adopted: boolean } | null {
    const raw = read(SYNC_CONSENT_KEY);
    if (!isRecord(raw) || raw.accountId !== accountId) return null;
    const v = raw.consentVersion;
    return { consentVersion: typeof v === "number" && Number.isInteger(v) ? v : null, adopted: raw.adopted === true };
  }

  return {
    loadBase(accountId) {
      const raw = read(SYNC_BASE_KEY);
      if (!isRecord(raw) || raw.accountId !== accountId || !isRecord(raw.profile) || !isRecord(raw.maternity)) return null;
      return { profile: decodeProfile(raw.profile), maternity: decodeMaternity(raw.maternity) };
    },
    saveBase(accountId, base) {
      write(SYNC_BASE_KEY, base === null ? null : { accountId, profile: base.profile, maternity: base.maternity });
    },
    consent(accountId) {
      const r = consentRecord(accountId);
      if (r === null) return NO_CONSENT;
      const given = r.consentVersion !== null && r.consentVersion >= SERVER_STORAGE_CONSENT_VERSION;
      return { given, adopted: !given && r.adopted };
    },
    acceptConsent(accountId) {
      write(SYNC_CONSENT_KEY, { accountId, consentVersion: SERVER_STORAGE_CONSENT_VERSION, adopted: false });
    },
    markAdopted(accountId) {
      write(SYNC_CONSENT_KEY, { accountId, consentVersion: null, adopted: true });
    },
  };
}
