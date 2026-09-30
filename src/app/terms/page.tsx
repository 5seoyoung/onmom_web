import type { Metadata } from "next";
import { CardColumn } from "@/components/shell/CardColumn";
import { TermsScreen } from "@/features/terms/TermsScreen";
import { TERMS_TEXT } from "@/features/terms/termsText";

// 이용약관(/terms/, 초안 — 법률 검토 전) — 누구나. 폰 = 폰 폭 기둥, PC = 배경 위 가운데 카드(components/shell/CardColumn).
// 앱 관문(features/flow/gate.ts)이 공개 주소로 늘 연다. robots는 루트 레이아웃 값을 그대로 물려받는다.
// 제목("온맘 이용약관")에 이미 이름이 있어 레이아웃의 제목 틀("%s · 온맘")을 건너뛴다(absolute).
export const metadata: Metadata = {
  title: { absolute: TERMS_TEXT.title },
};

export default function Page() {
  return (
    <CardColumn>
      <TermsScreen />
    </CardColumn>
  );
}
