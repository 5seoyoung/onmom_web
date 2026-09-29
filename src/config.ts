// 백엔드 연동 설정 — 서버 주소를 바꾸는 유일한 지점(iOS AppConfig.swift).
// 빈 값이면 그 기능은 "준비 중"을 정직하게 표시하고, 규칙 기반 기능(기록·분석·가이드·지원사업·기분)은 그대로 동작한다.
//
// ⚠️ 정적 사이트(GitHub Pages)라 NEXT_PUBLIC_* 값은 전부 브라우저 번들에 그대로 들어간다 = 공개값.
//    비밀(카카오 REST 키·client secret·Anthropic 키·Admin 키)은 여기 두지 않는다 — 백엔드가 보유한다.
//    ONMOM_APP_KEY도 웹에서는 비밀이 아니다(누구나 번들에서 읽을 수 있음). 인증 수단으로 기대하지 않는다.

function url(v: string | undefined): string | null {
  const s = (v ?? "").trim().replace(/\/+$/, "");
  return s.length > 0 ? s : null;
}

export const config = {
  /** Video DB — GET /videos?include=&exclude=&limit= */
  videoURL: url(process.env.NEXT_PUBLIC_VIDEO_URL),
  /** LLM 서비스 — POST /chat (AI 상담·약물 체크의 미등재 항목). 지금은 미배포라 비워 둔다. */
  llmURL: url(process.env.NEXT_PUBLIC_LLM_URL),
  /** 계정 API — /auth/register, /auth/withdraw, /me/state. 비우면 브라우저 저장만. */
  accountURL: url(process.env.NEXT_PUBLIC_ACCOUNT_URL),
  /** x-onmom-key 헤더 값 — 공개값. 온맘 백엔드 origin으로 가는 요청에만 붙인다(카카오 등 제3자에 붙이지 말 것). */
  appKey: (process.env.NEXT_PUBLIC_ONMOM_APP_KEY ?? "").trim() || null,
  /** 카카오 JavaScript 키 — 공개값(카카오 개발자 콘솔에서 사이트 도메인 제한). REST 키는 여기 두지 않는다. */
  kakaoJsKey: (process.env.NEXT_PUBLIC_KAKAO_JS_KEY ?? "").trim() || null,
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  /**
   * Supabase 프로젝트 주소(https://<ref>.supabase.co) — 카카오 로그인 + 사용자별 서버 저장(docs/SUPABASE_SETUP.md).
   * 이 값과 아래 키가 둘 다 있어야 켜진다. 비면 카카오 버튼은 "준비 중"이고 Supabase로 요청을 보내지 않는다.
   */
  supabaseUrl: url(process.env.NEXT_PUBLIC_SUPABASE_URL),
  /**
   * Supabase 공개 키(Publishable key `sb_publishable_…` 또는 예전 anon 키) — 번들에 들어가는 공개값이다.
   * 데이터는 행 수준 보안(RLS: 본인 행만)이 지킨다. secret 키·service_role 키는 절대 넣지 않는다(넣으면 빌드가 멈춘다).
   * 변수 이름은 Supabase Connect 화면과 같은 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. 예전 이름(…_ANON_KEY)도 받는다.
   */
  supabaseAnonKey: publicSupabaseKey(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ),
  /**
   * Cloudflare Turnstile 사이트 키(공개값) — 게스트(Supabase 익명 로그인)의 봇 막기(src/auth/turnstile.ts).
   * Supabase 대시보드의 CAPTCHA(Turnstile 비밀 키)와 함께 켠다. 비밀 키는 여기 두지 않는다.
   */
  turnstileSiteKey: (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "").trim() || null,
  /**
   * AI 상담 스위치 — "true"일 때만 켠다(Supabase가 설정된 빌드에서만 뜻이 있다). Anthropic 키(Supabase 함수 비밀)와
   * 처리방침·동의 문구가 준비된 뒤에 켠다(docs/LAUNCH_CHECKLIST.md 5단계). 기본은 꺼짐.
   */
  aiChatEnabled: (process.env.NEXT_PUBLIC_AI_CHAT_ENABLED ?? "").trim() === "true",
  /**
   * 웹 푸시(매일 리마인더)의 VAPID 공개 키 — 공개값(브라우저가 구독할 때 applicationServerKey로 쓴다).
   * scripts/generate-vapid.mjs가 만든 한 쌍 중 공개 키만 여기에, 비밀 키는 Supabase 함수 비밀값(VAPID_PRIVATE_KEY)에만(docs/PWA_AND_REMINDERS.md).
   * Supabase 설정과 이 값이 둘 다 있어야 설정 화면의 알림 토글이 켜진다(isReminderConfigured). 비면 "준비 중".
   * 형식이 틀리면(65바이트 비압축 P-256 공개 키의 base64url이 아님) 빌드가 멈춘다 — 동작하지 않는 토글을 내보내지 않게.
   */
  vapidPublicKey: vapidPublicKey(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
  /**
   * 검색 노출 — "true"면 서비스 소개(/)만 색인을 허용하고, 나머지 화면은 계속 noindex(robotsFor). 기본은 전부 noindex(1.0 공개 전).
   */
  siteIndexable: (process.env.NEXT_PUBLIC_SITE_INDEXABLE ?? "").trim() === "true",
} as const;

/** 매일 리마인더(웹 푸시)를 켤 수 있는가 — 구독을 저장할 Supabase와 VAPID 공개 키가 둘 다 있을 때만. */
export const isReminderConfigured = () => isSupabaseConfigured() && config.vapidPublicKey !== null;

/**
 * 화면별 robots 메타 — 서비스 소개("landing")만 NEXT_PUBLIC_SITE_INDEXABLE=true일 때 색인을 허용한다.
 * 앱 화면("app")은 정적 HTML에 내용이 없고(관문이 저장소를 읽기 전에는 그리지 않음) 건강 기록 화면이라 늘 noindex.
 * 루트 레이아웃은 "app"을 쓰고, 서비스 소개 페이지(src/app/page.tsx)가 "landing"으로 덮어쓴다.
 */
export function robotsFor(page: "landing" | "app"): { index: boolean; follow: boolean } {
  const index = page === "landing" && config.siteIndexable;
  return { index, follow: index };
}

/** VAPID 공개 키 모양 — 비압축 P-256 공개 키(0x04 + 64바이트)의 base64url = 87자, 첫 글자 "B". */
export function isVapidPublicKeyShape(key: string): boolean {
  return /^B[A-Za-z0-9_-]{86}$/.test(key);
}

function vapidPublicKey(v: string | undefined): string | null {
  const key = (v ?? "").trim();
  if (key.length === 0) return null;
  if (!isVapidPublicKeyShape(key)) {
    throw new Error(
      "NEXT_PUBLIC_VAPID_PUBLIC_KEY 형식이 틀립니다. scripts/generate-vapid.mjs가 출력한 공개 키(87자, B로 시작)를 그대로 넣으세요. 비밀 키를 넣지 않았는지도 확인하세요.",
    );
  }
  return key;
}

/**
 * Supabase Edge Functions 주소(https://<ref>.supabase.co/functions/v1) — 영상 프록시(videos)·AI 상담(chat).
 * Supabase가 설정되지 않았으면 null(함수를 부르지 않는다).
 */
export function supabaseFunctionsUrl(): string | null {
  return isSupabaseConfigured() ? `${config.supabaseUrl}/functions/v1` : null;
}

/** 운동 영상 — Supabase가 있으면 Edge Function "videos"를 거치고, 없으면 예전처럼 NEXT_PUBLIC_VIDEO_URL을 직접 부른다. */
export const isVideoBackendConfigured = () => isSupabaseConfigured() || config.videoURL !== null;
/**
 * AI 상담·약물 체크의 AI 답 — Supabase가 있으면 Edge Function "chat"을 쓰고 스위치(NEXT_PUBLIC_AI_CHAT_ENABLED)가 켜졌을 때만,
 * 없으면 예전처럼 NEXT_PUBLIC_LLM_URL이 있을 때만.
 */
export const isLLMBackendConfigured = () => (isSupabaseConfigured() ? config.aiChatEnabled : config.llmURL !== null);
export const isAccountBackendConfigured = () => config.accountURL !== null;
/** 카카오 로그인·서버 저장(Supabase)을 켤 수 있는가 — 주소와 공개 키가 둘 다 있을 때만. */
export const isSupabaseConfigured = () => config.supabaseUrl !== null && config.supabaseAnonKey !== null;

/**
 * Supabase 키가 비밀 키처럼 보이면 true — `sb_secret_…`, 또는 JWT의 role이 service_role.
 * 이런 키는 RLS를 건너뛰어 모든 사용자의 건강 기록을 읽고 지울 수 있다. 정적 번들에 들어가면 누구나 꺼내 쓴다.
 */
export function isSecretSupabaseKey(key: string): boolean {
  if (key.startsWith("sb_secret_")) return true;
  const parts = key.split(".");
  if (parts.length !== 3) return false;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "="))) as unknown;
    return typeof json === "object" && json !== null && (json as { role?: unknown }).role === "service_role";
  } catch {
    return false;
  }
}

/** 공개 키만 받는다. 비밀 키면 빌드(정적 페이지 생성)가 여기서 멈춰 번들이 배포되지 않는다. */
function publicSupabaseKey(v: string | undefined): string | null {
  const key = (v ?? "").trim();
  if (key.length === 0) return null;
  if (isSecretSupabaseKey(key)) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY(또는 …_ANON_KEY)에 비밀 키(secret·service_role)가 들어 있습니다. 공개 키(Publishable 또는 anon)로 바꾸고, 이 비밀 키는 Supabase 대시보드에서 바로 폐기하세요.",
    );
  }
  return key;
}
