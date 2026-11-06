// Edge Function chat 공용 — AI 답변 동의의 판과 서버 기록(Deno·vitest·웹이 함께 읽는다. cors.ts 머리말 참고).
//
// 동의는 AI 상담이 서버(LLM)에 처음 묻기 전에 받는다(웹 src/features/chat/aiConsent.ts·AiConsentCard.tsx). 시범 동안 카카오 계정만 — 익명 게스트에게는
// 묻지 않고, 함수는 동의를 읽기 전에 403 ai_login_required로 끝낸다(chat/handler.ts).
// - 웹: 민감정보 처리·국외 이전을 각각 켠 뒤 [동의하고 계속하기]를 누르면 이 브라우저에 남기고, 이 계정의 서버 세션이 있으면 public.ai_consents에
//   판·동의 시각·두 동의를 한 줄 남긴다(supabase/migrations/0010_ai_consents.sql·0012_ai_consents_withdraw.sql — 본인 행만, RLS). 서버 시각은 표가 스스로 적는다.
// - 함수 chat: 로그인 확인 뒤, 한도를 쓰거나 LLM을 부르기 전에 그 사용자 행이 지금 판이고 두 동의가 모두 있는지 본다(isCurrentAiConsent) —
//   아니면(행 없음·철회·예전 판·한쪽만) 403 ai_consent_required. 웹은 그 답을 받으면 이 계정의 동의를 지우고 동의 카드를 다시 띄운다.
// - 철회: 설정 > 내 데이터가 서버 행과 브라우저 기록을 지운다(웹 aiConsentRecord.ts withdrawAiConsent). 행이 없으면 함수가 막는다.
// 판은 이 한 곳에만 둔다 — 웹(src/features/chat/aiConsent.ts)은 이 값을 다시 내보내고, 함수(chat/handler.ts)는 이 값과 비교한다.
// 가져오는 것이 없는 순수 모듈이다(웹 번들에도 그대로 들어간다).

/**
 * 동의 글자의 판 — 동의 카드(AiConsentCard의 제목·첫 문장)나 두 동의의 요약·전문(consentText.ts AI_CONSENT_ITEMS)을 바꾸면 올린다.
 * src/features/chat/aiConsent.test.ts가 글자의 지문을 판에 묶어 두어, 판을 올리지 않고 글자만 바꾸면 테스트가 실패한다.
 * 올리면 서버에 남은 예전 판의 행도 지금 판이 아니게 되어, 함수가 403으로 막고 웹이 모두에게 다시 묻는다.
 * .2(web-2026-09-28): 동의 카드를 "안내"에서 "동의 요청"으로(제목·첫 문장) 바꾸고 전문을 펼쳐 보이게 함(AI 기능을 켜기 전 — 이 판에 동의한 이용자 없음).
 * web-2026-11-06.1: 민감정보 처리·국외 이전을 따로 받는 두 동의, 상담만·카카오 계정만, 실제 전송 항목(최근 메시지 20개)·연락처·보유 기간(AI를 켜는 판).
 */
export const AI_CONSENT_VERSION = "web-2026-11-06.1";

/** 동의 기록 표(0010_ai_consents.sql) — 사용자당 한 행(user_id 기본 키) */
export const AI_CONSENTS_TABLE = "ai_consents";

/** 함수 chat이 지금 판의 동의 기록을 찾지 못했을 때의 실패 코드(403) — 웹이 이 코드로 동의 카드를 다시 띄운다 */
export const AI_CONSENT_REQUIRED_CODE = "ai_consent_required";

/** 시범 동안 익명 게스트가 AI를 부를 때의 실패 코드(403) — 웹은 앱 안내로 답하고 카카오 연결을 권한다(동의 카드를 띄우지 않는다) */
export const AI_LOGIN_REQUIRED_CODE = "ai_login_required";

/** 판 글자 수 상한 — 0010의 check(char_length(version) between 1 and 64)와 같다(aiConsentsSql.test.ts) */
export const AI_CONSENT_VERSION_MAX_CHARS = 64;

/** 함수가 읽는 동의 기록 한 줄 — public.ai_consents의 version·sensitive_agreed·transfer_agreed */
export interface AiConsentRecord {
  version: string;
  sensitiveAgreed: boolean;
  transferAgreed: boolean;
}

/** AI를 불러도 되는 동의인가 — 행이 있고, 지금 판이고, 민감정보 처리·국외 이전 두 동의가 모두 있어야 한다(한쪽만이면 동의가 아니다) */
export function isCurrentAiConsent(record: AiConsentRecord | null): boolean {
  return record !== null && record.version === AI_CONSENT_VERSION && record.sensitiveAgreed && record.transferAgreed;
}
