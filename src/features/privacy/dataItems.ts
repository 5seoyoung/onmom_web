// 온맘이 처리하는 개인정보 항목·보유 기간 — 웹 처리방침(webPolicyText.ts)과 온보딩 동의(onboarding/consentText.ts)가
// 같은 글자를 쓰도록 한 곳에 둔다(두 문서가 서로 다른 항목을 말하지 않게).
//
// 항목은 실제 저장 상태(domain/types.ts PersistedState·UserProfile)와 Supabase 로그인 계정(auth.users·identities)에서 뽑았다.
// 상태에 필드를 더하면 여기도 고친다(privacy/webPolicy.test.ts가 UserProfile·MaternityRecord 필드를 대조한다).
// 동의 (a)(b)가 쓰는 글자(계정·건강·설정·접속 기록·AI 이용 항목, 보유 기간, 저장 위치)를 바꾸면 동의 판(domain/consent.ts)을 올린다.
//
// 모두 웹 신규 문구 — CPO 확인 필요 (2026-11-06 시행판에서 새로 쓰거나 고친 줄에는 따로 표시를 달았다)

/** 계정 정보 — 게스트 = Supabase 익명 사용자, 카카오 = Supabase 카카오 로그인(동의항목: docs/SUPABASE_SETUP.md A-7) */
export const ACCOUNT_ITEMS =
  "이용자 식별자(게스트는 임의로 만든 식별자, 카카오 로그인은 카카오 회원번호와 카카오에서 제공에 동의한 닉네임·카카오계정(이메일)·프로필 사진 주소)";

/**
 * 건강 정보(민감정보) — 산모수첩 7항목 이름은 회복 단계 분석 화면(analyzeModel.ts CLINICAL_TOGGLES)의 말을 줄여 썼다.
 * 증상 기록은 체크 항목을 하나씩 적지 않고 "위험 증상 체크 항목"으로 묶어 쓴다(2026-11-06) — 기록 화면의 확인 항목(다량 출혈·임신중독증 신호·
 * 자신을 해치고 싶은 생각 같은 새 항목 포함)이 늘어도 동의 글자가 그대로 덮도록. 기록마다 남는 안내 규칙의 판(SymptomRecord.rulesVersion)과
 * 기분 문항의 판(MoodCheckRecord.moodVersion)도 기록의 일부라 함께 적는다(domain/types.ts).
 */
// 웹 신규 문구 — CPO 확인 필요 (2026-11-06 판: 증상 기록을 체크 항목 묶음으로, 규칙·문항의 판)
export const HEALTH_ITEMS =
  "출산일, 분만 방식, 수유 여부, 키·현재 체중·임신 전 체중, 산모수첩 확인 항목 7개(첫 출산 여부, 임신성 당뇨, 임신중독증·고혈압, 분만 시 출혈 과다, 산후 빈혈, 골반통·치골결합 통증, 복직근 이개), 증상 기록(오로·발열·통증 정도·위험 증상 체크 항목, 확인된 병원 신호, 기록 시각, 그때 쓴 안내 규칙의 판), 오늘의 질문(기분) 답변과 그 문항의 판, 기록장 글과 메모";

/**
 * 서비스 설정 정보 — 건강 정보가 아닌 프로필 값과 동의 기록. "동의한 내용과 일시"는 서버 저장 동의(profile.consentVersion·consentAcceptedAt
 * → user_states 칸)와 AI 답변 동의(public.ai_consents의 판·동의 시각·두 동의 — supabase/migrations/0010_ai_consents.sql·0012_ai_consents_withdraw.sql)를 함께 덮는다.
 * 둘 다 계정을 삭제할 때까지 보관한다(RETENTION_TEXT — 계정 삭제로 함께 지워진다). AI 답변 동의는 철회하면 그때 지운다(처리방침 5절). src/api/aiConsentsSql.test.ts가 확인한다.
 */
export const SETTING_ITEMS = "회복 목표, 복직 예정일, 내 동네(입력한 경우), 동의한 내용과 일시";

/** 자동으로 생기는 접속 기록 — Supabase(로그인·서버)·GitHub Pages(웹 호스팅)가 보안·장애 대응용으로 남긴다 */
export const ACCESS_LOG_ITEMS = "접속 기록(IP 주소, 브라우저 정보, 접속 일시)";

/**
 * AI 상담 이용 기록 — Edge Function chat이 부를 때마다 "누가(사용자 id)·언제" 한 줄을 남긴다(supabase/migrations/0003_llm_usage.sql).
 * 질문·답은 남기지 않는다. 한도 계산에만 쓰고 2일이 지나면 지운다(보유 기간: AI_USAGE_RETENTION_DAYS).
 */
export const AI_USAGE_ITEMS = "AI 상담 이용 시각(이용 한도 계산용)";

/** AI 상담 이용 기록의 보유 기간(일) — 0003_llm_usage.sql llm_consume_quota의 `interval '2 days'`와 같아야 한다 */
export const AI_USAGE_RETENTION_DAYS = 2;

/**
 * AI 요청 한 번에 함께 보내는 같은 대화의 최근 메시지 수(이전 질문·AI 답 포함) — 웹 src/api/llm.ts LLM_FUNCTION_MAX_MESSAGES,
 * 서버 supabase/functions/_shared/chat.ts CHAT_MAX_MESSAGES와 같아야 한다(webPolicy.test.ts).
 */
export const AI_CONTEXT_MAX_MESSAGES = 20;

/**
 * AI 답변(Anthropic)으로 보내는 것 — 실제로 보내는 그대로(src/api/llm.ts functionMessages·chatModel.ts chatLlmContext): 같은 대화의 최근 메시지 + 최소 맥락 3개.
 * 처리방침 6절 ①·14절과 AI 동의 카드(onboarding/consentText.ts AI_CONSENT_ITEMS — 지문에 묶여 있다)가 같은 글자를 쓴다. 바꾸면 AI_CONSENT_VERSION을 올린다.
 */
// 웹 신규 문구 — CPO 확인 필요 (2026-11-06: "질문 내용"이 실제 전송보다 좁아 고침 — 사전 검토 H4, AI-3)
export const AI_TRANSFER_ITEMS = `대화 내용(같은 대화의 최근 메시지 최대 ${AI_CONTEXT_MAX_MESSAGES}개, 이전 AI 답변 포함), 산후 주차, 분만 방식, 수유 여부`;

/**
 * 매일 리마인더(웹 푸시) 구독 — 알림을 켠 기기(브라우저)마다 한 행(supabase/migrations/0004_push_reminders.sql push_subscriptions).
 * 켠 경우에만 생기고, 끄거나 계정을 삭제하면 바로 지운다. 건강 데이터는 없다(알림 문구도 고정 — docs/PWA_AND_REMINDERS.md).
 */
export const PUSH_ITEMS = "브라우저 푸시 구독 주소·암호화 키·시간대";

/**
 * 서버에 기록을 한 번도 저장하지 않은(동의 전에 멈춘 등) 게스트 계정을 자동으로 지우는 기준(일) —
 * supabase/migrations/0006_anon_cleanup.sql의 `interval '30 days'`와 같아야 한다(anonCleanupSql.test.ts).
 */
export const ANON_CLEANUP_DAYS = 30;

/** 서버 저장 위치 — Supabase 프로젝트(서울 리전) */
export const STORAGE_REGION = "대한민국 서울";

/**
 * 데이터베이스 백업에 남는 사본의 보관 상한(일) — Supabase Pro 요금제의 일일 백업 보관 7일(요금 표). 2026-11 Pro 전환 예정이고,
 * 무료 요금제는 백업이 없어 "최대 7일"은 어느 쪽이든 맞다. PITR을 켜거나 보관이 더 긴 요금제로 바꾸면 이 값과 문구를 함께 고친다.
 */
export const BACKUP_RETENTION_DAYS = 7;

/**
 * 관리자 기록(public.admin_audit — 관리 화면의 조회·CSV 내려받기·계정 삭제) 보존 기간(년) —
 * supabase/migrations/0009_admin_access_log.sql의 `interval '2 years'`와 같아야 한다(webPolicy.test.ts).
 */
export const ADMIN_LOG_RETENTION_YEARS = 2;

/**
 * 서비스 개선 통계(관리 화면의 집계)에서 숨기는 칸의 기준 — 이 수보다 적은 사람이 든 칸은 보이지 않는다(개인을 알아볼 수 없게).
 * 처리방침 3절·동의 (b)의 "5명 미만인 칸은 숨김"과 같은 값 — 관리자 통계 화면(src/features/admin)도 이 값을 써야 한다.
 */
export const STATS_MIN_GROUP_SIZE = 5;

/**
 * 보유 기간 — 계정 삭제 = 서버 행 + 로그인 계정 즉시 삭제(delete_my_account()).
 * 백업은 BACKUP_RETENTION_DAYS(7일 — Supabase Pro 일일 백업, 무료 요금제는 백업 없음)의 상한(2026-11-06 판 — 예전 판은 30일로 적었다).
 */
// 웹 신규 문구 — CPO 확인 필요 (2026-11-06 판: 백업 7일)
export const RETENTION_TEXT = `계정을 삭제할 때까지 보관해요. 계정을 삭제하면 서버의 기록과 로그인 계정을 바로 삭제하고, 백업에 남은 사본은 ${BACKUP_RETENTION_DAYS}일 안에 삭제돼요.`;
