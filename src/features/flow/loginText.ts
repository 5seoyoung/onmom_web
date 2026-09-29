// 로그인 화면 문구 — LoginView.swift 원문. 화면(LoginScreen.tsx)은 여기서 고른 문구만 쓴다.

import { OFFLINE_TEXT } from "@/features/home/useOnline";

export const LOGIN_TEXT = {
  brand: "온맘", // 원문: LoginView.swift:26
  tagline: "산모의 회복을, 하나의 흐름으로", // 원문: LoginView.swift:28
  kakao: "카카오로 시작하기", // 원문: LoginView.swift:45
  // 웹 신규 문구 — CPO 확인 필요 (D2: 카카오 로그인은 Supabase 설정 전까지 비활성)
  kakaoPending: "준비 중",
  /** 카카오 동의 화면으로 보내지 못했을 때 */
  kakaoFailed: "카카오 로그인 창을 열지 못했어요. 잠시 후 다시 시도해주세요.", // 원문: KakaoLoginService.swift:29
  guest: "게스트로 시작", // 원문: LoginView.swift:65
  consent: "로그인 시 개인정보·민감정보 처리 방침에 동의하게 됩니다.", // 원문: LoginView.swift:77
  // 웹 신규 문구 — CPO 확인 필요 (서버 저장 빌드의 로그인 화면 안내 — 동의가 아니라 알림만. 민감정보(건강 정보)는 법 §23①1에 따라
  // 온보딩 동의 단계에서 따로 받으므로 "로그인하면 동의하게 된다"는 원문(:77)을 쓰지 않는다)
  consentNotice: "건강 정보는 따로 동의를 받은 뒤에만 서버에 저장돼요.",
  policy: "개인정보처리방침 보기", // 원문: LoginView.swift:79
} as const;

/**
 * [개인정보처리방침 보기] 위의 한 줄.
 * - 설정 없는 빌드(지금 배포 — 기록은 이 브라우저에만): iOS 원문 그대로.
 * - 서버 저장 빌드(Supabase 설정 있음): 알림만 — 로그인·게스트 시작을 민감정보 처리 동의로 보지 않는다(동의는 온보딩 동의 단계).
 */
export function loginConsentText(supabaseConfigured: boolean): string {
  return supabaseConfigured ? LOGIN_TEXT.consentNotice : LOGIN_TEXT.consent;
}

/**
 * 카카오 동의 화면으로 보내지 못했을 때의 안내 — 원문(KakaoLoginService.swift:29). 브라우저가 확실히 오프라인이면(로그인 번들을
 * 받지 못해 실패하는 흔한 경우) 다른 서버 기능과 같은 오프라인 안내(features/home/useOnline OFFLINE_TEXT)로 말한다.
 */
export function kakaoFailedMessage(online: boolean): string {
  return online ? LOGIN_TEXT.kakaoFailed : OFFLINE_TEXT;
}
