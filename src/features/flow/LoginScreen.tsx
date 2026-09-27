"use client";

// 로그인 — LoginView.swift. 위 여백 · 로고/이름/한 줄 소개 · 아래 여백 · 버튼 묶음(간격 lg).
// 웹 차이(제품 결정 D2): Apple 로그인 없음. 카카오 로그인은 서버가 있어야 해서 버튼을 끄고 "준비 중"을 붙인다.
// [게스트로 시작] → 계정이 생기면 앱 관문(AppGate)이 온보딩(또는 이미 마쳤으면 홈)으로 보낸다.

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { SecondaryButton } from "@/components/ui";
import { useAppStore } from "@/store/useAppStore";
import { PrivacyPolicyDialog } from "@/features/privacy/PrivacyPolicyDialog";
import { BrandLogo } from "./BrandLogo";

const TEXT = {
  brand: "온맘", // 원문: LoginView.swift:26
  tagline: "산모의 회복을, 하나의 흐름으로", // 원문: LoginView.swift:28
  kakao: "카카오로 시작하기", // 원문: LoginView.swift:45
  // 웹 신규 문구 — CPO 확인 필요 (D2: 카카오 로그인은 백엔드 전까지 비활성)
  kakaoPending: "준비 중",
  guest: "게스트로 시작", // 원문: LoginView.swift:65
  consent: "로그인 시 개인정보·민감정보 처리 방침에 동의하게 됩니다.", // 원문: LoginView.swift:77
  policy: "개인정보처리방침 보기", // 원문: LoginView.swift:79
} as const;

export function LoginScreen() {
  const { actions } = useAppStore();
  const [policyOpen, setPolicyOpen] = useState(false);

  return (
    <main className="flex flex-1 flex-col gap-6 bg-background">
      <div aria-hidden className="flex-1" />
      <div className="flex flex-col items-center gap-2 px-6 text-center">
        <BrandLogo size="login" />
        <h1 className="text-[2.125rem] leading-tight font-bold text-primary">{TEXT.brand}</h1>
        <p className="text-base text-text-secondary">{TEXT.tagline}</p>
      </div>
      <div aria-hidden className="flex-1" />

      <div className="flex flex-col gap-4 px-6 pb-8">
        {/* 카카오 옐로 #FEE500 · 글자 rgb(0.15, 0.11, 0.05) — LoginView.swift:47-53 */}
        <button
          type="button"
          disabled
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-button bg-[#FEE500] px-4 py-4 text-[1.0625rem] font-semibold text-[#261C0D] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <MessageCircle aria-hidden className="size-5 fill-current" />
          <span>{TEXT.kakao}</span>
          <span className="rounded-full bg-[#261C0D]/10 px-2 py-0.5 text-xs font-semibold">{TEXT.kakaoPending}</span>
        </button>

        <SecondaryButton onClick={() => actions.signInGuest()}>{TEXT.guest}</SecondaryButton>

        <div className="flex flex-col items-center text-center">
          <p className="text-[0.8125rem] text-text-secondary">{TEXT.consent}</p>
          <button
            type="button"
            onClick={() => setPolicyOpen(true)}
            aria-haspopup="dialog"
            className="-mt-2 inline-flex min-h-11 items-center rounded-button px-2 text-xs font-semibold text-primary"
          >
            {TEXT.policy}
          </button>
        </div>
      </div>

      <PrivacyPolicyDialog open={policyOpen} onClose={() => setPolicyOpen(false)} />
    </main>
  );
}
