"use client";

import { useEffect, useRef } from "react";
import { primaryButtonClass, secondaryButtonClass } from "@/components/ui/Buttons";
import { config } from "@/config";
import { ROUTES } from "@/routes";
import { BrandLogo } from "@/features/flow/BrandLogo";
import { CardColumn } from "./CardColumn";

// 오류 경계 화면 — src/app/error.tsx(화면 안 오류)와 src/app/global-error.tsx(루트 레이아웃 오류)가 같은 모양을 쓴다.
// 정직한 상태 표시(web/README 원칙 3): 무엇이 잘못됐는지 지어내지 않고, 다시 시도와 홈으로 가는 길만 준다.
// 오류 내용(error.message·stack)은 화면에도 콘솔에도 내지 않는다 — 앱 상태(건강 기록)가 섞여 있을 수 있다(web/07 §2 민감정보 로그 금지).
// 앱 상태 훅(useAppStore)은 쓰지 않는다 — 저장소 쪽 오류로 여기 왔을 수도 있다.
// 홈 링크는 <a href>로 둔다(next/link 없이): global-error에서는 루트 레이아웃이 없어 라우터 문맥을 기대할 수 없고,
// 새로 여는 편이 오류 상태를 확실히 벗어난다. basePath(/onmom_web)는 여기서 붙인다.

export const ERROR_SCREEN_TEXT = {
  // 웹 신규 문구 — CPO 확인 필요 (화면을 그리다 예외가 났을 때. iOS에는 해당 화면 없음)
  title: "문제가 생겼어요",
  // 웹 신규 문구 — CPO 확인 필요 (기록은 화면을 그리다 난 오류로 지워지지 않는다 — 브라우저 저장소·서버 사본 그대로)
  body: "잠시 후 다시 시도해 주세요. 기록은 이 브라우저에 그대로 있어요.",
  retry: "다시 시도", // 원문: ExerciseView.swift:184
  // 웹 신규 문구 — CPO 확인 필요 (앱 홈 탭 /home/ 으로 — 서비스 소개 "/"가 아니다, DEV_NOTES §4)
  home: "홈으로",
} as const;

export interface ErrorScreenProps {
  /** Next 오류 경계의 retry()(또는 reset()) — 경계 안을 다시 그린다 */
  onRetry: () => void;
}

// 폭은 404·로그인과 같은 카드 기둥(CardColumn — 폰 = 폰 폭 기둥, PC = 가운데 카드).
// 나타나면 초점을 제목(h1, tabIndex -1)으로 옮긴다 — 누르던 버튼이 사라져 초점이 <body>로 떨어지면 스크린리더가 아무것도 읽지 않고
// 키보드 순서도 처음으로 돌아간다. 제목으로 옮기면 "문제가 생겼어요"를 읽고, 다음 Tab이 [다시 시도]다.
// 제목은 컨트롤이 아니라 링을 그리지 않는다(focus:outline-none 유틸리티가 base 층의 :focus-visible 링을 이긴다 — globals.css).
export function ErrorScreen({ onRetry }: ErrorScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <CardColumn>
      <main className="flex flex-1 flex-col justify-center gap-8 px-6 py-10">
        <div className="flex flex-col items-center gap-4 text-center">
          <BrandLogo size="login" />
          <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold text-neutral focus:outline-none">
            {ERROR_SCREEN_TEXT.title}
          </h1>
          <p className="text-base text-text-secondary">{ERROR_SCREEN_TEXT.body}</p>
        </div>
        <div className="flex flex-col gap-3">
          <button type="button" onClick={onRetry} className={primaryButtonClass}>
            {ERROR_SCREEN_TEXT.retry}
          </button>
          <a href={`${config.basePath}${ROUTES.home}`} className={secondaryButtonClass}>
            {ERROR_SCREEN_TEXT.home}
          </a>
        </div>
      </main>
    </CardColumn>
  );
}
