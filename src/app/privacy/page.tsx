import type { Metadata } from "next";
import { CardColumn } from "@/components/shell/CardColumn";
import { robotsFor } from "@/config";
import { PrivacyPolicyScreen } from "@/features/privacy/PrivacyPolicyScreen";
import { ROUTES } from "@/routes";

// 폰 = 폰 폭 기둥, PC = 배경 위 가운데 카드(components/shell/CardColumn).
// robots는 robotsFor(ROUTES.privacy) — NEXT_PUBLIC_SITE_INDEXABLE=true일 때만 색인(기본 noindex). 제목은 레이아웃 기본값 그대로.
export const metadata: Metadata = {
  robots: robotsFor(ROUTES.privacy),
};

export default function Page() {
  return (
    <CardColumn>
      <PrivacyPolicyScreen />
    </CardColumn>
  );
}
