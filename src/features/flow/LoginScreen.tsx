"use client";

// 로그인 — LoginView.swift. 위 여백 · 로고/이름/한 줄 소개 · 아래 여백 · 버튼 묶음(간격 lg).
// 웹 차이: Apple 로그인 없음(D2).
// 카카오 로그인은 Supabase 설정(NEXT_PUBLIC_SUPABASE_URL·ANON_KEY)이 있을 때만 켜진다 — docs/SUPABASE_SETUP.md.
//   켜짐: 누르면 카카오 동의 화면으로 이동 → /auth/callback/ 에서 로그인을 마친다(features/flow/AuthCallbackScreen).
//   꺼짐: 버튼을 끄고 "준비 중"을 붙인다(D2, 네트워크 없음).
// [게스트로 시작] → 계정이 생기면 앱 관문(AppGate)이 온보딩(또는 이미 마쳤으면 홈)으로 보낸다.
// 폭: 폰 = 폰 폭 기둥, PC = 가운데 카드(페이지의 CardColumn). 카드 안에서는 위아래 빈칸(flex-1)이 로고를 가운데 둔다.

import Link from "next/link";
import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { signInWithKakao } from "@/auth";
import { SecondaryButton } from "@/components/ui";
import { isSupabaseConfigured } from "@/config";
import { ROUTES } from "@/routes";
import { useAppStore } from "@/store/useAppStore";
import { PrivacyPolicyDialog } from "@/features/privacy/PrivacyPolicyDialog";
import { BrandLogo } from "./BrandLogo";

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
  policy: "개인정보처리방침 보기", // 원문: LoginView.swift:79
} as const;

export function LoginScreen() {
  const { actions } = useAppStore();
  const [policyOpen, setPolicyOpen] = useState(false);
  // 빌드 때 정해지는 값(NEXT_PUBLIC_*)이라 서버 HTML과 브라우저가 같다.
  const kakaoEnabled = isSupabaseConfigured();
  const [signingIn, setSigningIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // 카카오 화면에서 [뒤로]로 돌아오면(bfcache 복원) 버튼을 다시 켠다.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setSigningIn(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  async function startKakao() {
    setSigningIn(true);
    setLoginError(null);
    const result = await signInWithKakao();
    if (result.ok) return; // 브라우저가 카카오 동의 화면으로 이동한다 — 버튼은 꺼 둔다(두 번 누르기 방지)
    setSigningIn(false);
    setLoginError(LOGIN_TEXT.kakaoFailed);
  }

  return (
    <main className="flex flex-1 flex-col gap-6 bg-background">
      <div aria-hidden className="flex-1" />
      <div className="flex flex-col items-center gap-2 px-6 text-center">
        {/* 로고·온맘을 누르면 소개 페이지로 */}
        <h1 className="text-[2.125rem] leading-tight font-bold text-primary">
          <Link href={ROUTES.landing} className="flex flex-col items-center gap-2 rounded-card">
            <BrandLogo size="login" />
            {LOGIN_TEXT.brand}
          </Link>
        </h1>
        <p className="text-base text-text-secondary">{LOGIN_TEXT.tagline}</p>
      </div>
      <div aria-hidden className="flex-1" />

      <div className="flex flex-col gap-4 px-6 pb-8 lg:px-8 lg:pb-10">
        {/* 카카오 옐로 #FEE500 · 글자 rgb(0.15, 0.11, 0.05) — LoginView.swift:47-53 */}
        <button
          type="button"
          disabled={!kakaoEnabled || signingIn}
          aria-busy={signingIn || undefined}
          onClick={kakaoEnabled ? () => void startKakao() : undefined}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-button bg-[#FEE500] px-4 py-4 text-[1.0625rem] font-semibold text-[#261C0D] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <MessageCircle aria-hidden className="size-5 fill-current" />
          <span>{LOGIN_TEXT.kakao}</span>
          {!kakaoEnabled ? <span className="rounded-full bg-[#261C0D]/10 px-2 py-0.5 text-xs font-semibold">{LOGIN_TEXT.kakaoPending}</span> : null}
        </button>

        {/* LoginView.swift:59-62 — 오류는 카카오 버튼 바로 아래, 13 stateAlert. 색만으로 알리지 않게 role="alert"로 읽힌다. */}
        {loginError !== null ? (
          <p role="alert" className="text-center text-[0.8125rem] text-state-alert">
            {loginError}
          </p>
        ) : null}

        <SecondaryButton onClick={() => actions.signInGuest()}>{LOGIN_TEXT.guest}</SecondaryButton>

        <div className="flex flex-col items-center text-center">
          <p className="text-[0.8125rem] text-text-secondary">{LOGIN_TEXT.consent}</p>
          <button
            type="button"
            onClick={() => setPolicyOpen(true)}
            aria-haspopup="dialog"
            className="-mt-2 inline-flex min-h-11 items-center rounded-button px-2 text-xs font-semibold text-primary"
          >
            {LOGIN_TEXT.policy}
          </button>
        </div>
      </div>

      <PrivacyPolicyDialog open={policyOpen} onClose={() => setPolicyOpen(false)} />
    </main>
  );
}
