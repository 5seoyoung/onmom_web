// 내 데이터 내려받기(열람권) — 설정 > 내 데이터. 이 브라우저의 앱 상태(PersistedState) 전체를 JSON 파일로 준다.
// 근거: web/reference/docs/PRIVACY_POLICY.md §5(열람·수정), features/privacy/webPolicyText.ts 13절(열람·정정·삭제·처리정지·동의 철회).
//
// - 순수 함수(buildDataExport·exportFileName·serializeDataExport)는 스냅샷과 시각을 받는다 — 브라우저 API를 모른다(dataExport.test.ts).
// - 서버 저장(Supabase) 빌드에서도 스토어 스냅샷을 그대로 쓴다: 동기화 엔진이 서버와 합친 상태가 이 브라우저의 상태다. 네트워크 요청 없음.
// - 건강 정보가 들어 있는 파일이다 — 어디에도 로그를 남기지 않고, 파일은 이용자의 기기로만 간다(Blob 다운로드).
// - account.name(카카오 닉네임 — 계정 표시용)은 넣지 않는다. 계정은 id·provider·serverUserId만. 다만 기록장 글·댓글의
//   authorName(작성 당시 표시 이름 스냅샷 — store/state.ts WriteMeta)은 상태의 일부라 state 안에 그대로 들어간다(열람권: 있는 그대로).
// - serverUserId = Supabase 계정 ID(auth.users.id, UUID). 이용자가 문의로 삭제를 요청할 때 관리자가 계정을 찾는 값이다
//   (0005_admin_tools.sql 머리 주석). account.id("kakao-<회원번호>"·"guest-<…>")는 앱 계정 id라 관리자 함수가 받지 않는다.
//   설정 없는 빌드·세션 없음이면 null(지어내지 않는다).

import type { IsoDateTimeString, PersistedState } from "@/domain/types";
import { toLocalDateString } from "@/domain/date";
import { MOOD_VERSION, RULES_VERSION } from "@/rules/version";
import type { AppSnapshot } from "@/store/appStore";

/** 파일 형식의 이름·판 — 나중에 가져오기(import)를 만들 때 이 값으로 구분한다 */
export const DATA_EXPORT_FORMAT = "onmom.web.export.v1";

export interface DataExport {
  format: typeof DATA_EXPORT_FORMAT;
  /** 내려받은 시각(ISO) */
  exportedAt: IsoDateTimeString;
  /** 기록의 판정에 쓰인 규칙의 판(src/rules/version.ts) — 감사 추적용 */
  rulesVersion: string;
  moodVersion: string;
  /**
   * 로그인 계정 — id는 앱 계정 id(게스트 "guest-…", 카카오 "kakao-<회원번호>"), serverUserId는 Supabase 계정 ID(UUID —
   * 문의·삭제 요청 때 알려 주는 값; 설정 없는 빌드·세션 없음이면 null). 닉네임은 넣지 않는다.
   */
  account: { id: string; provider: string; serverUserId: string | null } | null;
  /** 서버 저장 동의의 판·시각(profile에도 있지만 찾기 쉽게 따로) */
  consent: { accepted: boolean; version: string | null; acceptedAt: IsoDateTimeString | null };
  /** 앱 상태 전체 — 프로필·산모수첩·증상 기록·기분 답·기록장(저장 형식 그대로, web/04_DATA_MODEL.md) */
  state: PersistedState;
}

export function buildDataExport(
  snapshot: Pick<AppSnapshot, "state" | "account">,
  now: Date,
  /** Supabase 세션의 사용자 id(auth.users.id) — 화면이 읽어 넘긴다. 없으면 null. */
  serverUserId: string | null = null,
): DataExport {
  const { state, account } = snapshot;
  return {
    format: DATA_EXPORT_FORMAT,
    exportedAt: now.toISOString(),
    rulesVersion: RULES_VERSION,
    moodVersion: MOOD_VERSION,
    account: account === null ? null : { id: account.id, provider: account.provider, serverUserId },
    consent: {
      accepted: state.profile.consentAccepted,
      version: state.profile.consentVersion,
      acceptedAt: state.profile.consentAcceptedAt,
    },
    state,
  };
}

/** "온맘-내기록-2026-09-28.json" — 로컬 날짜 */
export function exportFileName(now: Date): string {
  return `온맘-내기록-${toLocalDateString(now)}.json`;
}

/** 사람이 열어 볼 수 있게 들여쓴 JSON */
export function serializeDataExport(data: DataExport): string {
  return JSON.stringify(data, null, 2);
}

/**
 * 브라우저에서 파일로 내려받기 — Blob → 임시 주소 → 링크 클릭. 성공하면 true, 실패(오래된 브라우저·차단)면 false.
 * 파일은 이용자의 기기로만 간다(요청 없음). 관리자 화면의 CSV 내려받기도 이 함수를 쓴다.
 */
export function downloadTextFile(filename: string, text: string, mime: string): boolean {
  try {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    // 클릭이 끝난 뒤 주소를 거둔다(바로 거두면 일부 브라우저가 내려받기를 시작하지 못한다)
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
    return true;
  } catch {
    return false;
  }
}
