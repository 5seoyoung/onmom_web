// 내 데이터 내려받기(열람권) — 설정 > 내 데이터. 이 브라우저의 앱 상태(PersistedState) 전체를 JSON 파일로 준다.
// 근거: web/reference/docs/PRIVACY_POLICY.md §5(열람·수정), features/privacy/webPolicyText.ts 13절(열람·정정·삭제·처리정지·동의 철회).
//
// - 순수 함수(buildDataExport·exportFileName·serializeDataExport)는 스냅샷과 시각을 받는다 — 브라우저 API를 모른다(dataExport.test.ts).
// - 서버 저장(Supabase) 빌드에서도 스토어 스냅샷을 그대로 쓴다: 동기화 엔진이 서버와 합친 상태가 이 브라우저의 상태다(기록은 요청 없음).
// - 서버가 따로 가진 계정 정보(가입·로그인 시각, 카카오가 준 정보, AI 동의 기록 — serverAccount)는 화면이 내려받기 직전에 내 계정 것만
//   읽어(serverAccount.ts — Supabase Auth의 내 정보 + ai_consents 본인 행) 넘긴다(2026-11-12, 열람권 — 법률 사전 검토 D-15).
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
  /**
   * 내려받을 때 이 앱의 지금 안내 규칙·기분 문항 버전(src/rules/version.ts) — 감사 추적용.
   * 기록마다 그 기록을 남길 때의 버전은 state 안의 각 기록에 있다(SymptomRecord.rulesVersion·MoodCheckRecord.moodVersion, 옛 기록은 null).
   */
  rulesVersion: string;
  moodVersion: string;
  /**
   * 로그인 계정 — id는 앱 계정 id(게스트 "guest-…", 카카오 "kakao-<회원번호>"), serverUserId는 Supabase 계정 ID(UUID —
   * 문의·삭제 요청 때 알려 주는 값; 설정 없는 빌드·세션 없음이면 null). 닉네임은 넣지 않는다.
   */
  account: { id: string; provider: string; serverUserId: string | null } | null;
  /** 서버 저장 동의의 판·시각(profile에도 있지만 찾기 쉽게 따로) */
  consent: { accepted: boolean; version: string | null; acceptedAt: IsoDateTimeString | null };
  /**
   * 앱 상태 전체 — 프로필·산모수첩·증상 기록·기분 답·기록장(저장 형식 그대로, web/04_DATA_MODEL.md).
   * 지운 기록은 목록에 없고 deleted에 삭제 표시(id·지운 시각만 — store/tombstones)가 있다. 고친 기록은 고친 값과 고친 시각(updatedAt).
   */
  state: PersistedState;
  /**
   * 서버가 가진 계정 정보(2026-11-12, 법률 사전 검토 D-15·R-1 — 열람권 §35): 가입·마지막 로그인 시각, 로그인 방법별로 그 업체가 준 정보
   * (카카오: 회원번호·닉네임·이메일·프로필 사진 주소 등 — 받은 그대로), AI 답변 동의 기록. 서버 계정이 없거나 읽지 못하면 null.
   * 건강 기록은 state에 있다(서버 기록과 이 브라우저의 기록은 동기화로 같다). 로그인 토큰은 넣지 않는다.
   */
  serverAccount: ServerAccountInfo | null;
}

/** 서버 계정 정보 — Supabase Auth의 내 사용자 정보(auth.getUser)와 내 AI 동의 행(ai_consents, RLS 본인 행)에서 뽑는다 */
export interface ServerAccountInfo {
  id: string;
  /** 서버 계정 이메일(카카오 로그인 때 카카오가 준 이메일. 게스트·이메일 미동의는 null) */
  email: string | null;
  createdAt: IsoDateTimeString | null;
  lastSignInAt: IsoDateTimeString | null;
  isAnonymous: boolean;
  /** 로그인 방법마다 그 업체가 준 정보(identity_data) 그대로 — 열람권: 가공하지 않는다 */
  identities: { provider: string; createdAt: IsoDateTimeString | null; lastSignInAt: IsoDateTimeString | null; data: Record<string, unknown> }[];
  /** AI 답변 동의(민감정보 처리·국외 이전) — 철회했거나 동의한 적 없으면 null */
  aiConsent: {
    version: string;
    sensitiveAgreed: boolean;
    transferAgreed: boolean;
    acceptedAt: IsoDateTimeString | null;
    recordedAt: IsoDateTimeString | null;
  } | null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * supabase-js의 User 모양과 ai_consents 행 → ServerAccountInfo. 모르는 모양이면 null(지어내지 않는다).
 * identity_data는 그대로 싣되, 혹시 들어 있을 수 있는 토큰 이름의 칸(access_token·refresh_token·provider_token)은 뺀다.
 */
export function serverAccountFrom(user: unknown, aiConsentRow: unknown): ServerAccountInfo | null {
  if (!isRecord(user) || str(user.id) === null) return null;
  const identities = Array.isArray(user.identities) ? user.identities.filter(isRecord) : [];
  const ai = isRecord(aiConsentRow) && str(aiConsentRow.version) !== null ? aiConsentRow : null;
  return {
    id: user.id as string,
    email: str(user.email),
    createdAt: str(user.created_at),
    lastSignInAt: str(user.last_sign_in_at),
    isAnonymous: user.is_anonymous === true,
    identities: identities.map((i) => ({
      provider: str(i.provider) ?? "unknown",
      createdAt: str(i.created_at),
      lastSignInAt: str(i.last_sign_in_at),
      data: isRecord(i.identity_data)
        ? Object.fromEntries(Object.entries(i.identity_data).filter(([k]) => !/token/i.test(k)))
        : {},
    })),
    aiConsent:
      ai === null
        ? null
        : {
            version: ai.version as string,
            sensitiveAgreed: ai.sensitive_agreed === true,
            transferAgreed: ai.transfer_agreed === true,
            acceptedAt: str(ai.accepted_at),
            recordedAt: str(ai.recorded_at),
          },
  };
}

export function buildDataExport(
  snapshot: Pick<AppSnapshot, "state" | "account">,
  now: Date,
  /** Supabase 세션의 사용자 id(auth.users.id) — 화면이 읽어 넘긴다. 없으면 null. */
  serverUserId: string | null = null,
  /** 서버 계정 정보 — 화면이 내려받기 직전에 읽어 넘긴다(serverAccount.ts). 없으면 null. */
  serverAccount: ServerAccountInfo | null = null,
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
    serverAccount,
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
