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
} as const;

export const isVideoBackendConfigured = () => config.videoURL !== null;
export const isLLMBackendConfigured = () => config.llmURL !== null;
export const isAccountBackendConfigured = () => config.accountURL !== null;
