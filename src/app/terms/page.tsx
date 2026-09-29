import type { Metadata } from "next";
import { CardColumn } from "@/components/shell/CardColumn";
import { TermsScreen } from "@/features/terms/TermsScreen";
import { TERMS_TEXT } from "@/features/terms/termsText";

// 이용약관(/terms/, 초안 — 법률 검토 전) — 누구나. 폰 = 폰 폭 기둥, PC = 배경 위 가운데 카드(components/shell/CardColumn).
// 앱 관문(features/flow/gate.ts)이 공개 주소로 늘 연다. robots는 루트 레이아웃 값을 그대로 물려받는다.
export const metadata: Metadata = {
  title: TERMS_TEXT.title,
};

export default function Page() {
  return (
    <CardColumn>
      <TermsScreen />
    </CardColumn>
  );
}
