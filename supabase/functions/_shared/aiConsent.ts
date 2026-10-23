// Edge Function chat 공용 — AI 답변 국외 이전 동의의 판과 서버 기록(Deno·vitest·웹이 함께 읽는다. cors.ts 머리말 참고).
//
// 동의는 AI 상담·약물 체크가 서버(LLM)에 처음 묻기 전에 받는다(웹 src/features/chat/aiConsent.ts·AiConsentCard.tsx).
// - 웹: [동의하고 계속하기]를 누르면 이 브라우저에 남기고(localStorage), 이 계정의 서버 세션이 있으면 public.ai_consents에
//   판·동의 시각을 한 줄 남긴다(supabase/migrations/0008_ai_consents.sql — 본인 행만, RLS).
// - 함수 chat: 로그인 확인 뒤, 한도를 쓰거나 LLM을 부르기 전에 그 사용자 행의 판이 지금 판(AI_CONSENT_VERSION)인지 본다 — 아니면(행 없음·예전 판)
//   403 ai_consent_required. 웹은 그 답을 받으면 이 계정의 동의를 지우고 동의 카드를 다시 띄운다.
// 판은 이 한 곳에만 둔다 — 웹(src/features/chat/aiConsent.ts)은 이 값을 다시 내보내고, 함수(chat/handler.ts)는 이 값과 비교한다.
// 가져오는 것이 없는 순수 모듈이다(웹 번들에도 그대로 들어간다).

/**
 * 동의 글자의 판 — 동의 카드(AiConsentCard의 제목·첫 문장)나 전문(consentText.ts AI_TRANSFER_NOTICE.details)을 바꾸면 올린다.
 * src/features/chat/aiConsent.test.ts가 글자의 지문을 판에 묶어 두어, 판을 올리지 않고 글자만 바꾸면 테스트가 실패한다.
 * 올리면 서버에 남은 예전 판의 행도 지금 판이 아니게 되어, 함수가 403으로 막고 웹이 모두에게 다시 묻는다.
 * .2: 동의 카드를 "안내"에서 "동의 요청"으로(제목·첫 문장) 바꾸고 전문을 펼쳐 보이게 함(AI 기능을 켜기 전 — 이 판에 동의한 이용자 없음).
 */
export const AI_CONSENT_VERSION = "web-2026-09-28.2";

/** 동의 기록 표(0008_ai_consents.sql) — 사용자당 한 행(user_id 기본 키) */
export const AI_CONSENTS_TABLE = "ai_consents";

/** 함수 chat이 지금 판의 동의 기록을 찾지 못했을 때의 실패 코드(403) — 웹이 이 코드로 동의 카드를 다시 띄운다 */
export const AI_CONSENT_REQUIRED_CODE = "ai_consent_required";

/** 판 글자 수 상한 — 0008의 check(char_length(version) between 1 and 64)와 같다(aiConsentsSql.test.ts) */
export const AI_CONSENT_VERSION_MAX_CHARS = 64;
