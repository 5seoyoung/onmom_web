// 서비스 소개("/")의 문구와 구성 — 렌더(LandingPage.tsx)와 떼어 둔 순수 데이터. landingContent.test.ts가 검사한다.
//
// 문구 출처(원칙 5)
// - `원문: APP_STORE.md …` — App Store 제출 문안(web/reference/docs/APP_STORE.md, CPO 작성). 앱이 실제로 하는 일만 적은 글이라
//   그대로 옮겼다. 앱 설명은 문단 단위로 나눴을 뿐 글자는 바꾸지 않았다.
// - `원문: File.swift:LINE` — iOS 화면 문구 그대로.
// - `웹 신규 문구 — CPO 확인 필요` — 웹에 맞게 고쳤거나(인수인계 README에서 옮긴 줄 포함) 새로 쓴 줄.
//
// 가짜 데이터 금지(원칙 3): 이용자 수·평점·후기·통계·예시 화면을 넣지 않는다. 서버가 없는 기능은 "준비 중"이라고 쓴다.
//
// 빌드마다 사실이 달라지는 문장(LandingBuild) — 카카오 로그인(Supabase)·AI 서버(LLM)·산부인과 찾기(카카오 JS 키)는
// 배포 설정(NEXT_PUBLIC_*)으로 켜진다. 켜진 빌드에서 거짓이 되는 문장은 그 빌드용 문구(whenKakaoLogin·whenLlm)로 바꿔 쓴다.

import type { RootScreen } from "@/store/appStore";
import { ROUTES } from "@/routes";

export const LANDING_TEXT = {
  brand: "온맘", // 원문: LoginView.swift:26
  tagline: "산후 회복, 하루 1분 기록으로", // 원문: APP_STORE.md §1 부제
  eyebrow: "엄마의 산후 회복 케어앱", // 원문: OnboardingFlowView.swift:114
  promo:
    "산후 회복은 사람마다 다릅니다. 온맘은 출산일과 분만 방식에 맞춰 지금 할 수 있는 운동과 피해야 할 동작을 정리하고, 오로·발열·통증을 1분 만에 기록해 병원에 가야 할 신호를 알려드려요.", // 원문: APP_STORE.md §2
  welcome: "산모의 건강한 회복을\n온맘이 함께합니다.", // 원문: OnboardingFlowView.swift:118
  start: "시작하기", // 원문: OnboardingFlowView.swift:66
  // 웹 신규 문구 — CPO 확인 필요 (로그인·온보딩을 마친 사람에게 보이는 시작 버튼)
  openApp: "내 회복 기록 열기",
  // 웹 신규 문구 — CPO 확인 필요 (히어로 보조 버튼 — 아래 소개로 이동)
  learnMore: "서비스 알아보기",
  // 웹 신규 문구 — CPO 확인 필요 (web/README.md "이 서비스가 무엇인가" 첫 문장 그대로)
  mission: "출산 후 퇴원부터 산후 6주 검진까지, 아무도 산모의 회복을 확인하지 않는 공백을 메우는 서비스입니다.",

  featuresEyebrow: "주요 기능", // 웹 신규 문구 — CPO 확인 필요 (섹션 이름·머리 메뉴)
  featuresTitle: "출산 후, 지금 나에게 맞는 회복은 무엇일까요?", // 원문: APP_STORE.md §3
  featuresIntro:
    "온맘은 산모의 출산일과 분만 방식에 맞춰 회복 단계를 정리해 드립니다. 검증된 산후 관리 지침을 기준으로, 지금 할 수 있는 운동과 아직 이른 운동을 나눠 보여줘요.", // 원문: APP_STORE.md §3

  stepsTitle: "이용 방법", // 웹 신규 문구 — CPO 확인 필요 (섹션 이름·머리 메뉴)
  principlesTitle: "온맘이 지키는 것", // 웹 신규 문구 — CPO 확인 필요 (섹션 이름·머리 메뉴)

  ctaTitle: "산모의 회복을, 하나의 흐름으로", // 원문: LoginView.swift:28
  // 웹 신규 문구 — CPO 확인 필요 (지금 웹에서 되는 로그인 방법 — D2. 카카오 로그인이 꺼진 빌드)
  ctaNote: "지금은 게스트로 시작할 수 있어요. 카카오 로그인은 준비 중이에요.",
  // 웹 신규 문구 — CPO 확인 필요 (카카오 로그인이 켜진 빌드 — NEXT_PUBLIC_SUPABASE_URL·PUBLISHABLE_KEY)
  ctaNoteKakao: "게스트 또는 카카오 계정으로 시작할 수 있어요.",

  privacy: "개인정보처리방침", // 원문: MoreView.swift:78
  copyright: "© 온맘", // 웹 신규 문구 — CPO 확인 필요 (바닥글)
} as const;

/** 문서 제목·설명·공유 미리보기(Open Graph) — src/app/page.tsx가 metadata로 내보낸다. 검색 노출 막기(robots)는 루트 레이아웃 것을 그대로 받는다. */
export const LANDING_META = {
  // 웹 신규 문구 — CPO 확인 필요 (브라우저 탭 제목 = 이름 + APP_STORE.md §1 부제)
  title: `${LANDING_TEXT.brand} — ${LANDING_TEXT.tagline}`,
  description: LANDING_TEXT.promo,
} as const;

/** 섹션 앵커 — 머리 메뉴(PC)와 [서비스 알아보기]가 쓴다. */
export const SECTION_ID = {
  about: "about",
  features: "features",
  steps: "how-it-works",
  principles: "principles",
} as const;

/** 머리 메뉴(PC 폭에서만 보임) */
export const NAV_ITEMS: ReadonlyArray<{ id: string; label: string }> = [
  { id: SECTION_ID.features, label: LANDING_TEXT.featuresEyebrow },
  { id: SECTION_ID.steps, label: LANDING_TEXT.stepsTitle },
  { id: SECTION_ID.principles, label: LANDING_TEXT.principlesTitle },
];

/** 아이콘 이름 — LandingPage.tsx가 lucide 아이콘으로 바꾼다(이 파일은 React를 모른다). */
export type LandingIcon =
  | "exercise"
  | "record"
  | "question"
  | "guide"
  | "support"
  | "storage"
  | "notDevice"
  | "rules"
  | "noScore"
  | "sources";

/** 이 빌드에서 켜진 서버 기능 — 배포 설정(NEXT_PUBLIC_*)으로 정해진다(src/config.ts). */
export interface LandingBuild {
  /** 가까운 산부인과 찾기(카카오 JS 키, D6) */
  clinicSearchReady: boolean;
  /** 카카오 로그인 + 서버 저장(Supabase) — config.isSupabaseConfigured */
  kakaoLoginReady: boolean;
  /**
   * AI 서버 — config.isLLMBackendConfigured. 켜지면 AI 상담이 대화와 산모 정보(산후 주차·분만 방식·수유 여부,
   * features/chat/chatModel.ts chatLlmContext)를 함께 보내고, 약물·음식 체크의 표에 없는 항목은 AI가 답한다(rules/substance.ts).
   */
  llmReady: boolean;
}

/** 지금 배포 기준(서버 기능이 하나도 없는 빌드) — 문단의 기본 문구(text)가 사실인 조건 */
export const BARE_BUILD: LandingBuild = { clinicSearchReady: false, kakaoLoginReady: false, llmReady: false };

export interface LandingParagraph {
  /** 기본 문구 — 서버 기능이 하나도 켜지지 않은 빌드(BARE_BUILD)에서 사실인 문장 */
  text: string;
  /**
   * 이 문단이 설명하는 기능이 서버·키 없이는 동작하지 않을 때 — 빌드 설정에 없으면 옆에 "준비 중" 줄을 붙인다.
   * clinicSearch: 가까운 산부인과 찾기(카카오 JS 키, D6)
   */
  requires?: "clinicSearch";
  /** 카카오 로그인(= Supabase 서버 저장)이 켜진 빌드에서 대신 쓰는 문구 — AI 켜짐 여부와 무관하게 이것이 쓰인다 */
  whenKakaoLogin?: string;
  /** AI 서버가 켜진 빌드에서 대신 쓰는 문구 — 기본 문구 중 AI가 켜지면 거짓이 되는 부분을 뺀 것 */
  whenLlm?: string;
}

/**
 * 이 빌드에서 보일 문구 — 카카오 로그인(서버 저장) 문구가 AI 문구보다 먼저다. 한 문단에 둘이 함께 있으면
 * 카카오 문구가 AI 켜짐에서도 사실이어야 한다(landingContent.test.ts가 확인).
 */
export function paragraphText(p: LandingParagraph, build: LandingBuild): string {
  if (build.kakaoLoginReady && p.whenKakaoLogin !== undefined) return p.whenKakaoLogin;
  if (build.llmReady && p.whenLlm !== undefined) return p.whenLlm;
  return p.text;
}

/** 마지막 권유의 안내 줄 — 지금 쓸 수 있는 로그인 방법 */
export function ctaNoteFor(build: Pick<LandingBuild, "kakaoLoginReady">): string {
  return build.kakaoLoginReady ? LANDING_TEXT.ctaNoteKakao : LANDING_TEXT.ctaNote;
}

export interface LandingSection {
  icon: LandingIcon;
  /** 기본 제목 — 서버 기능이 하나도 켜지지 않은 빌드(BARE_BUILD)에서 사실인 말 */
  title: string;
  /** 카카오 로그인(= Supabase 서버 저장)이 켜진 빌드에서 대신 쓰는 제목 — 그리는 쪽은 sectionTitle로 고른다 */
  titleWhenKakaoLogin?: string;
  body: ReadonlyArray<LandingParagraph>;
}

/** 이 빌드에서 보일 카드 제목 — 문단(paragraphText)과 같은 규칙: 서버 저장 빌드면 그 빌드용 제목 */
export function sectionTitle(s: Pick<LandingSection, "title" | "titleWhenKakaoLogin">, build: Pick<LandingBuild, "kakaoLoginReady">): string {
  return build.kakaoLoginReady && s.titleWhenKakaoLogin !== undefined ? s.titleWhenKakaoLogin : s.title;
}

/** 주요 기능 — App Store 앱 설명의 ■ 여섯 항목(순서 그대로). */
export const FEATURES: ReadonlyArray<LandingSection> = [
  {
    icon: "exercise",
    title: "회복 주차에 맞는 운동", // 원문: APP_STORE.md §3
    body: [
      {
        // 원문: APP_STORE.md §3
        text: '자연분만과 제왕절개는 운동을 시작할 수 있는 시기가 다릅니다. 온맘은 출산일에서 계산한 회복 주차를 기준으로 지금 가능한 운동만 열어 줍니다. 아직 이른 운동은 "몇 주차부터 열리는지"를 함께 알려드려요.',
      },
      {
        // 원문: APP_STORE.md §3
        text: "복직근 이개, 임신중독증, 골반통처럼 운동을 제한해야 하는 소견을 입력하면 해당하는 동작을 추천에서 빼고 이유를 알려드립니다.",
      },
    ],
  },
  {
    icon: "record",
    title: "1분 이상 증상 기록", // 원문: APP_STORE.md §3
    body: [
      {
        // 원문: APP_STORE.md §3
        text: "오로(분비물), 발열, 통증을 기록하면 즉시 병원에 가야 할 신호인지 확인해 드려요. 위험 신호가 확인되면 운동 추천을 멈추고 병원 방문을 먼저 안내합니다.",
      },
    ],
  },
  {
    icon: "question",
    title: "오늘의 한 가지 질문", // 원문: APP_STORE.md §3
    body: [
      {
        // 원문: APP_STORE.md §3
        text: "매일 한 가지 가벼운 질문에 답해요. 힘든 날이 이어지면 이야기 나눌 곳(정신건강복지센터 등)을 알려드려요. 점수를 매기거나 진단하지 않아요.",
      },
      {
        // 원문: APP_STORE.md §3
        text: "내 동네를 입력하면 가까운 산부인과를 거리순으로 찾아 전화·길찾기로 연결해 드려요.",
        requires: "clinicSearch",
      },
    ],
  },
  {
    icon: "guide",
    title: "검증된 산후 회복 가이드", // 원문: APP_STORE.md §3
    body: [
      {
        // 원문: APP_STORE.md §3
        text: "2023 임산부수첩(보건복지부·인구보건복지협회)과 ACOG 지침을 근거로 산욕기 회복, 오로 변화, 회음부·절개부 관리, 수유, 영양, 정신건강을 안내합니다. 모든 항목에 출처를 표시해요.",
      },
      {
        // 원문: APP_STORE.md §3
        text: '수유 중 약과 음식이 안전한지도 확인할 수 있습니다. 근거가 확인되지 않은 항목은 "확인된 정보 없음"이라고 정직하게 알려드려요.',
      },
    ],
  },
  {
    icon: "support",
    title: "내 상황에 맞는 지원사업", // 원문: APP_STORE.md §3
    body: [
      {
        // 원문: APP_STORE.md §3
        text: "경제적 부담, 돌봄, 산후우울 등 해당되는 항목을 체크하면 정부·지자체 지원사업을 안내해 드립니다.",
      },
    ],
  },
  {
    icon: "storage",
    // 웹 신규 문구 — CPO 확인 필요 (APP_STORE.md "건강 정보는 내 기기에" → 웹은 브라우저 저장. 설정 없는 빌드(지금 배포) 그대로)
    title: "건강 정보는 이 브라우저에",
    // 웹 신규 문구 — CPO 확인 필요 (서버 저장 빌드 — 게스트·카카오 모두 온보딩 동의 뒤 서버(서울 리전)에 저장한다.
    // LandingPage가 sectionTitle(section, build)로 그려야 이 빌드에서 보인다)
    titleWhenKakaoLogin: "건강 정보는 동의한 뒤에만 저장해요",
    body: [
      {
        // 웹 신규 문구 — CPO 확인 필요 (APP_STORE.md §3 문장에서 "게스트로 시작하면"을 더하고 "이 기기에만" → "이 브라우저에만")
        text: "게스트로 시작하면 증상 기록, 오늘의 질문 답변, 산모수첩 확인 항목, 체중, 기록장 글은 이 브라우저에만 저장되며 서버로 전송되지 않습니다. 언제든 설정에서 계정과 모든 데이터를 삭제할 수 있어요.",
        // 웹 신규 문구 — CPO 확인 필요 (서버 저장 빌드 — 2026-09-28 결정: 게스트는 Supabase 익명 계정이라 게스트·카카오 모두
        // 온보딩 동의(onboarding/consentText.ts) 뒤 서버(서울 리전)에 저장한다. AI 서버가 켜져도 이 문구가 우선한다(paragraphText) —
        // "서버로 전송되지 않습니다"를 말하지 않으므로 AI 켜짐에도 사실이다)
        whenKakaoLogin:
          "게스트로 시작해도, 카카오로 로그인해도 증상 기록, 오늘의 질문 답변, 산모수첩 확인 항목, 체중, 기록장 글은 동의를 받은 뒤 온맘 서버(대한민국 서울)에 저장돼요. 언제든 설정에서 계정과 모든 데이터를 삭제할 수 있어요.",
        // 웹 신규 문구 — CPO 확인 필요 (AI 연결 시 문구: AI 상담·약물 체크가 입력한 글과 산후 주차·수유 여부 등을
        // 서버로 보내므로(features/chat/chatModel.ts chatLlmContext, features/substance/substanceModel.ts substanceLlmContext)
        // "서버로 전송되지 않습니다"를 뺐다. 나머지 글자는 위와 같다)
        whenLlm:
          "게스트로 시작하면 증상 기록, 오늘의 질문 답변, 산모수첩 확인 항목, 체중, 기록장 글은 이 브라우저에만 저장됩니다. 언제든 설정에서 계정과 모든 데이터를 삭제할 수 있어요.",
      },
      {
        // 웹 신규 문구 — CPO 확인 필요 (웹 저장 방향 08 "서버(계정 API)" — 카카오 로그인이 꺼진 빌드라 '예정'으로)
        text: "카카오 로그인은 준비 중이에요. 로그인이 열리면 동의를 받은 뒤 기록을 서버에 저장해, 여러 기기에서 이어 쓸 수 있게 할 예정이에요.",
        // 웹 신규 문구 — CPO 확인 필요 (서버 저장 빌드. 게스트는 그 브라우저의 로그인 정보로만 다시 열 수 있어 여러 기기는 카카오만)
        whenKakaoLogin: "카카오로 로그인하면 다른 기기에서도 기록을 이어 쓸 수 있어요.",
      },
    ],
  },
];

/** 이용 방법 — 실제 흐름(온보딩 출산 정보 → 기록 탭 → 회복 단계 분석·운동 탭) 순서. */
export const STEPS: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: "출산 정보를 알려주세요", // 원문: OnboardingFlowView.swift:138
    body: "출산일과 분만 방식에 따라 회복 관리 루트가 달라져요.", // 원문: OnboardingFlowView.swift:139
  },
  {
    title: "이상 증상 빠른 기록", // 원문: RecordFlowView.swift:150 · HomeView.swift:468
    body: "오로·통증·발열을 기록하면 상태를 알려드려요.", // 원문: HomeView.swift:197
  },
  {
    title: "회복 단계 분석", // 원문: HomeView.swift:335
    // 원문: APP_STORE.md §3 (앱 설명 첫 문단 끝 문장 + ■ 1분 이상 증상 기록 둘째 문장)
    body: "지금 할 수 있는 운동과 아직 이른 운동을 나눠 보여줘요. 위험 신호가 확인되면 운동 추천을 멈추고 병원 방문을 먼저 안내합니다.",
  },
];

/** 온맘이 지키는 것 — 인수인계 README의 절대 원칙을 이용자에게 보이는 말로(원칙 1·2·4 + 기분 질문). */
export const PRINCIPLES: ReadonlyArray<LandingSection> = [
  {
    icon: "notDevice",
    title: "의료기기가 아니에요", // 웹 신규 문구 — CPO 확인 필요 (README 원칙 1)
    body: [
      // 원문: content.json disclaimers.home_footer에서 "온맘은 의료기기가 아니며,"(제목과 겹침)만 뺐다
      { text: "제공되는 정보는 참고용입니다. 진단·치료에 관한 판단은 반드시 의료진과 상담하세요." },
    ],
  },
  {
    icon: "rules",
    title: "판정은 정해진 규칙이 해요", // 웹 신규 문구 — CPO 확인 필요 (README 원칙 2)
    body: [
      {
        // 웹 신규 문구 — CPO 확인 필요 (README "이 서비스가 무엇인가" — "미리 정해둔 규칙으로 …", "AI는 판단하지 않습니다")
        text: "병원에 가야 할 신호인지, 지금 주차에 할 수 있는 운동이 무엇인지는 미리 정해 둔 규칙으로 안내해요. AI는 판단하지 않아요.",
        // 웹 신규 문구 — CPO 확인 필요 (AI 연결 시 문구: 약물·음식 체크의 표에 없는 항목은 AI가 판정을 내므로(rules/substance.ts)
        // "AI는 판단하지 않아요."를 뺐다. 병원 신호·운동은 AI가 켜져도 규칙만 판단한다)
        whenLlm: "병원에 가야 할 신호인지, 지금 주차에 할 수 있는 운동이 무엇인지는 미리 정해 둔 규칙으로 안내해요.",
      },
    ],
  },
  {
    icon: "noScore",
    title: "점수를 매기거나 진단하지 않아요", // 원문: APP_STORE.md §3
    body: [
      // 웹 신규 문구 — CPO 확인 필요 (README 원칙 1 "진단·질환명 추정·점수·등급을 내지 않는다. '즉시 병원 확인이 필요한 신호'까지만 말한다")
      { text: "질환명을 추정하거나 등급을 내지 않고, 즉시 병원 확인이 필요한 신호까지만 알려드려요." },
    ],
  },
  {
    icon: "sources",
    // 웹 신규 문구 — CPO 확인 필요 (README 원칙 4. "모든 안내에 출처"는 출처가 아직 없는 병원 신호 3개(DEV_NOTES §3 임상 1) 때문에 쓰지 않았다)
    title: "출처를 함께 표시해요",
    body: [
      // 웹 신규 문구 — CPO 확인 필요 (APP_STORE.md §3 "모든 항목에 출처를 표시해요"에 '회복 가이드의'를 붙였다 — 떼어 놓으면 모든 안내로 읽힌다)
      { text: "회복 가이드의 모든 항목에 출처를 표시해요." },
      // 웹 신규 문구 — CPO 확인 필요 (README 원칙 4 "출처가 없는 항목은 출처를 지어내지 않고 근거 설명만 둔다")
      { text: "출처가 확인되지 않은 내용에 출처를 지어 붙이지 않아요." },
    ],
  },
];

/**
 * [시작하기] 버튼이 어디로 가고 무엇이라 쓰는지 — 앱 관문(rootScreenFor)과 같은 판단.
 * 저장소를 읽기 전(정적 HTML·첫 렌더)과 로그인 전은 [시작하기] → 로그인. 온보딩 중이면 온보딩을 이어 한다.
 * "consent"(온보딩을 마쳤지만 지금 판의 동의가 없음 — 서버 저장 빌드)는 앱을 쓰는 사람이라 [내 회복 기록 열기] → 앱 홈.
 * 다시 동의 화면으로 보내는 것은 앱 관문이 한다(주소를 여기서 따로 정하지 않는다).
 */
export function startAction(screen: RootScreen): { href: string; label: string; opensApp: boolean } {
  switch (screen) {
    case "main":
    case "consent":
      return { href: ROUTES.home, label: LANDING_TEXT.openApp, opensApp: true };
    case "onboarding":
      return { href: ROUTES.onboarding, label: LANDING_TEXT.start, opensApp: false };
    case "loading":
    case "login":
      return { href: ROUTES.login, label: LANDING_TEXT.start, opensApp: false };
  }
}
