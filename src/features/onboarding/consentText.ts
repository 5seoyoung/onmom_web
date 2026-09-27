// 온보딩 동의 단계 — 서버 저장 빌드(Supabase 설정 있음)의 문구. 개인정보보호법에 맞춘 초안이며 CPO·법률 검토 전이다.
// 설정이 없는 빌드(지금 배포)는 iOS 원문 동의(onboardingModel.ts ONBOARDING_TEXT.consent*)를 그대로 쓴다.
//
// 동의 구조 — docs/privacy/CONSENT_AND_POLICY_DRAFT.md
// - 필수 (a) 개인정보 수집·이용(법 §15②: 항목·목적·보유 기간·거부 권리와 불이익을 알린다)
// - 필수 (b) 민감정보(건강정보) 처리 — (a)와 따로 받는다(법 §23①1)
// - 필수 (c) 만 14세 이상 확인 — 14세 미만은 법정대리인 동의가 필요한데(법 §22의2) 그 절차를 두지 않는다
// - 안내 (d) AI 답변의 국외 이전(법 §28의8) — 여기서는 토글이 아니다. AI 기능이 처음 쓸 때 따로 묻는다. 새 필드를 두지 않는다.
// (a)~(c)에 모두 동의하면 profile.consentVersion = CURRENT_CONSENT_VERSION. 이 파일의 (a)~(c) 문구(와 머리의 부제·안내 3줄)를 바꾸면
// 그 판을 올려 모든 이용자에게 다시 받는다(domain/consent.ts) — consentStep.test.ts가 문구의 지문을 판에 묶어 두어, 판을 올리지 않고
// 문구만 바꾸면 테스트가 실패한다.
// 동의하지 않을 수도 있어야 한다(동의 여부를 고를 권리·삭제 권리 — 법 §4, §36, §37) — [동의하지 않고 나가기]는 확인 창을 거쳐
// 계정과 모든 데이터를 지우고 나간다(OnboardingFlow).
//
// 중요한 내용의 표시(법 §22②, 시행령 §17, 「개인정보 처리 방법에 관한 고시」 — 조항 번호는 검토 필요): 민감정보 항목, 보유·이용 기간,
// 받는 자와 그 목적은 다른 글자보다 20% 이상 크게(9pt 이상) + 굵게·밑줄로 알아보기 쉽게 — 그런 줄에 emphasis: true
// (ServerConsentStep이 16px·굵게·밑줄로 그림, 다른 전문 글자는 13px).
//
// 이 파일의 문구는 모두 웹 신규 문구 — CPO 확인 필요 (단, SERVER_CONSENT_TEXT.lines의 셋째 줄은 iOS 원문)

import {
  ACCESS_LOG_ITEMS,
  ACCOUNT_ITEMS,
  AI_TRANSFER_ITEMS,
  AI_USAGE_ITEMS,
  AI_USAGE_RETENTION_DAYS,
  HEALTH_ITEMS,
  RETENTION_TEXT,
  SETTING_ITEMS,
  STORAGE_REGION,
} from "@/features/privacy/dataItems";

/** 필수 동의 셋 — 모두 켜야 [온맘 시작하기]가 켜진다 */
export type RequiredConsentId = "personal" | "sensitive" | "age14";

export const REQUIRED_CONSENT_IDS: readonly RequiredConsentId[] = ["personal", "sensitive", "age14"];

/** "자세히"를 펼치면 보이는 한 줄 — 용어(수집 항목·이용 목적 …)와 내용 */
export interface ConsentDetailRow {
  term: string;
  text: string;
  /** 법이 "명확히 표시"하라는 중요한 내용(민감정보 항목·보유 기간·받는 자와 목적) — 크게·굵게·밑줄로 그린다(머리말 참고) */
  emphasis?: boolean;
}

export interface ConsentItemText<Id extends string = string> {
  id: Id;
  title: string;
  /** 토글 아래 늘 보이는 짧은 요약 */
  summary: string;
  /** "자세히" 안의 전문 */
  details: readonly ConsentDetailRow[];
}

// 웹 신규 문구 — CPO 확인 필요 (서버 저장 빌드의 동의 단계 머리·안내·버튼)
export const SERVER_CONSENT_TEXT = {
  // 제목은 iOS 원문 그대로(ONBOARDING_TEXT.consentTitle "데이터 이용에 동의해주세요") — 여기에는 부제부터 둔다.
  // iOS 부제 "건강 정보는 민감정보라 기기 밖으로 내보내지 않는 걸 원칙으로 해요."는 서버 저장 빌드에서 사실이 아니다.
  subtitle: `건강 정보는 민감정보라, 동의를 받은 뒤에만 온맘 서버(${STORAGE_REGION})에 저장해요.`,
  /** 안내 3줄 — 아이콘은 iOS와 같은 자리(자물쇠 방패 · 밖으로 나가는 화살표 · 구급상자) */
  lines: [
    `기록은 온맘 서버(${STORAGE_REGION})에 저장 · 설정에서 언제든 삭제`,
    "운동 영상을 받을 때 분만 방식만 영상 서버로 전송",
    "위험 신호가 확인되면 의료진 상담 안내", // 원문: OnboardingFlowView.swift:313
  ],
  requiredBadge: "필수",
  /** (d) AI 국외 이전 머리 표시 — 여기서는 고를 것이 없어(스위치 없음) "선택"이 아니라 "안내"(법 §22③ 필수·선택 구분을 흐리지 않게) */
  noticeBadge: "안내",
  more: "자세히",
  /** 동의하지 않기 — 계정과 모든 데이터를 지우고 나간다(확인 창을 거친다). 처음 온보딩·다시 동의 모두 */
  decline: "동의하지 않고 나가기",
  /** 다시 동의(?consent=1) — 부제 아래 한 줄 */
  reconsentNote: "개인정보 처리 방식이 바뀌어 다시 동의를 받아요.",
  /** 다시 동의의 아래 버튼(처음 온보딩은 iOS 원문 "온맘 시작하기") */
  reconsentButton: "동의하고 계속하기",
  /** 필수 동의 목록의 스크린리더 이름(보이지 않음) */
  requiredGroupLabel: "필수 동의 항목",
} as const;

/** (a)(b)(c) — 화면 순서 그대로 */
export const REQUIRED_CONSENTS: readonly ConsentItemText<RequiredConsentId>[] = [
  {
    id: "personal",
    title: "개인정보 수집·이용 동의",
    summary: "로그인과 기록 저장에 필요한 계정 정보를 모아 써요. 계정을 삭제하면 바로 지워요.",
    details: [
      { term: "수집 항목", text: `${ACCOUNT_ITEMS}, ${SETTING_ITEMS}, ${ACCESS_LOG_ITEMS}, (AI 상담을 쓴 경우) ${AI_USAGE_ITEMS}` },
      {
        term: "이용 목적",
        // 법 §15②1 — 모은 항목마다 쓰임이 목적에 들어 있어야 한다: 내 동네(카카오 장소 검색)·복직 예정일/회복 목표(홈의 남은 기간)·AI 이용 시각(한도)
        text: "이용자 식별과 로그인 유지, 기록 저장과 여러 기기에서 이어 쓰기, 가까운 산부인과 찾기(내 동네)·복직까지 남은 기간 표시 등 서비스 제공, AI 상담 이용 한도 계산, 계정 삭제 등 요청 처리와 문의 응대, 보안과 장애 대응",
      },
      { term: "보유 기간", text: RETENTION_TEXT, emphasis: true },
      // 접속 기록은 온맘이 아니라 각 업체(Supabase·GitHub)가 남긴다 — 계정 삭제로 바로 지워지지 않는다(처리방침 5절과 같은 뜻)
      { term: "접속 기록 보유 기간", text: "접속 기록은 각 서비스 제공 업체가 정한 기간 동안 보관된 뒤 삭제돼요.", emphasis: true },
      {
        term: "AI 상담 이용 시각 보유 기간",
        text: `AI 상담 이용 시각은 이용 한도 계산에만 쓰고 ${AI_USAGE_RETENTION_DAYS}일이 지나면 자동으로 삭제돼요.`,
        emphasis: true,
      },
      {
        term: "저장 위치",
        text: `Supabase 서버(${STORAGE_REGION} 리전). 처리를 맡기는 업체와 국외 이전은 개인정보처리방침에서 볼 수 있어요.`,
      },
      {
        term: "게스트 이용",
        text: "게스트 기록은 이 브라우저에 남은 로그인 정보로만 다시 열 수 있어요. 브라우저의 사이트 데이터를 지우면 서버에 저장된 게스트 기록을 다시 열 수 없어요.",
      },
      {
        term: "동의 거부 권리",
        text: "동의하지 않을 수 있어요. 다만 서비스 이용에 꼭 필요한 정보라, 동의하지 않으면 온맘을 이용할 수 없어요.",
      },
    ],
  },
  {
    id: "sensitive",
    title: "민감정보(건강정보) 처리 동의",
    summary: "출산일·분만 방식·증상 기록 같은 건강 정보를 회복 안내와 기록 보관에 써요.",
    details: [
      { term: "처리 항목", text: HEALTH_ITEMS, emphasis: true },
      {
        term: "이용 목적",
        text: "회복 주차 계산, 즉시 병원 확인이 필요한 신호 안내, 회복 단계에 맞는 운동 안내, 기록 보관과 여러 기기에서 이어 쓰기",
      },
      { term: "보유 기간", text: RETENTION_TEXT, emphasis: true },
      { term: "열람 제한", text: "온맘 운영자는 건강 기록 내용을 보지 않아요. 관리 화면에는 집계 수치와 계정 정보만 보여요." },
      {
        term: "동의 거부 권리",
        text: "동의하지 않을 수 있어요. 다만 건강 정보 없이는 회복 안내를 할 수 없어, 동의하지 않으면 온맘을 이용할 수 없어요.",
      },
    ],
  },
  {
    id: "age14",
    title: "만 14세 이상이에요",
    summary: "만 14세 미만은 온맘을 이용할 수 없어요.",
    details: [
      {
        term: "이유",
        text: "만 14세 미만 아동의 개인정보를 처리하려면 법정대리인의 동의가 필요해요. 온맘은 법정대리인 동의 절차를 두지 않아 만 14세 미만은 이용할 수 없어요.",
      },
    ],
  },
];

/** (d) AI 답변의 국외 이전 — 안내만(토글 없음). 동의는 AI 기능이 처음 쓸 때 받는다. */
export const AI_TRANSFER_NOTICE: ConsentItemText<"aiTransfer"> = {
  id: "aiTransfer",
  title: "AI 상담 이용 시 국외 이전 안내",
  summary: "AI 답변을 쓰는 기능은 처음 쓸 때 따로 동의를 받아요. 동의하지 않아도 온맘에 담긴 안내로 답해요.",
  details: [
    { term: "이전받는 자", text: "Anthropic, PBC (미국)", emphasis: true },
    { term: "해당 기능", text: "AI 상담, 약물·음식 체크에서 안전표에 없는 항목" },
    { term: "이전 항목", text: AI_TRANSFER_ITEMS, emphasis: true },
    { term: "이전 시기·방법", text: "질문을 보낼 때마다 온맘 서버를 거쳐 암호화된 통신(HTTPS)으로 전송" },
    // 받는 자의 이용 목적도 중요한 내용(시행령 §17 — 검토 필요)
    { term: "이용 목적", text: "AI 답변 생성", emphasis: true },
    { term: "보유 기간", text: "Anthropic의 API 데이터 보관 정책에 따른 기간", emphasis: true },
    { term: "거부 방법", text: "처음 쓸 때 묻는 동의에 동의하지 않으면 보내지 않아요. 이때는 온맘에 담긴 안내로만 답해요." },
  ],
};
