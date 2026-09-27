import { CardColumn } from "@/components/shell/CardColumn";
import { OnboardingFlow } from "@/features/onboarding/OnboardingFlow";

// 폰 = 폰 폭 기둥, PC = 배경 위 가운데 카드(components/shell/CardColumn).
export default function Page() {
  return (
    <CardColumn>
      <OnboardingFlow />
    </CardColumn>
  );
}
