"use client";

import { useState } from "react";
import { TermsDialog } from "./TermsDialog";
import { hasTermsText, TERMS_TEXT } from "./termsText";

// "이용약관 보기" — 온보딩 동의 단계에서 개인정보처리방침 전문 보기 옆에 두는 글자 버튼. 누르면 시트(TermsDialog)로 연다.
// 시트 상태를 스스로 들고 있어 온보딩 화면은 이 컴포넌트를 한 줄 두기만 한다(features/onboarding의 변경을 최소로).
// 약관 본문이 없는 빌드(hasTermsText가 false)면 아무것도 그리지 않는다 — 빈 화면을 링크하지 않는다.
export function TermsSheetLink({ className }: { className: string }) {
  const [open, setOpen] = useState(false);
  if (!hasTermsText()) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className={className}>
        {TERMS_TEXT.openLink}
      </button>
      <TermsDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
