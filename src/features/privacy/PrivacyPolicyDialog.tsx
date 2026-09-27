"use client";

import { useEffect, useId, useRef } from "react";
import { PolicySections, PolicyTitleBlock, PolicyWebNote } from "./PrivacyPolicy";
import { PRIVACY_POLICY_CLOSE, PRIVACY_POLICY_NAV_TITLE } from "./policyText";

export interface PrivacyPolicyDialogProps {
  open: boolean;
  onClose: () => void;
}

// 개인정보처리방침 시트 — 로그인(LoginView.swift:88)·온보딩 동의(OnboardingFlowView.swift:311)의 .sheet.
// 주소를 옮기지 않고 띄운다: 온보딩 입력값은 동의 전이라 저장하지 않고 화면에만 들고 있으므로, 페이지를 떠나면 사라진다.
// 네이티브 <dialog>.showModal() — 포커스 가두기·Esc 닫기·뒤 화면 비활성을 브라우저가 맡는다.
// 위쪽 막대: 가운데 제목 "개인정보처리방침", 오른쪽 [닫기](PrivacyPolicyView.swift:72-79).
// PC(lg 이상 화면): 아래에서 올라오는 시트 대신 화면 가운데의 둥근 창(최대 40rem 폭 · 48rem 높이, 안에서 스크롤).
export function PrivacyPolicyDialog({ open, onClose }: PrivacyPolicyDialogProps) {
  if (!open) return null;
  return <PolicySheet onClose={onClose} />;
}

function PolicySheet({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    // 시트가 떠 있는 동안 뒤 화면이 같이 스크롤되지 않게
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // Esc·[닫기] 모두 close 이벤트로 모인다
      onClose={onClose}
      // 시트 바깥(어두운 배경)을 누르면 닫는다 — 본문이 시트를 꽉 채우므로 대상이 dialog 자신이면 배경이다
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
      className="fixed inset-0 mx-auto mt-auto mb-0 h-[calc(100dvh-2.5rem)] max-h-none w-full max-w-[30rem] overflow-y-auto overscroll-contain rounded-t-card bg-background p-0 text-text-primary backdrop:bg-neutral/40 lg:mb-auto lg:h-[min(48rem,calc(100dvh-4rem))] lg:max-w-[40rem] lg:rounded-card"
    >
      <div className="sticky top-0 z-10 grid min-h-14 grid-cols-[1fr_auto_1fr] items-center border-b border-divider bg-background px-4">
        <span aria-hidden />
        {/* 대화상자 이름(aria-labelledby). 본문 제목(h2 "온맘 개인정보처리방침")과 겹치지 않게 제목 요소로 두지 않는다. */}
        <p id={titleId} className="text-[1.0625rem] font-semibold text-text-primary">
          {PRIVACY_POLICY_NAV_TITLE}
        </p>
        <button
          type="button"
          onClick={() => ref.current?.close()}
          className="-mr-2 min-h-11 justify-self-end rounded-button px-2 text-[1.0625rem] font-semibold text-primary"
        >
          {PRIVACY_POLICY_CLOSE}
        </button>
      </div>
      <div className="flex flex-col gap-6 p-6 pb-10">
        <PolicyTitleBlock />
        <PolicyWebNote />
        <PolicySections headingLevel="h3" />
      </div>
    </dialog>
  );
}
