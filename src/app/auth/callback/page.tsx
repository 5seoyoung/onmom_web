import { CardColumn } from "@/components/shell/CardColumn";
import { AuthCallbackScreen } from "@/features/flow/AuthCallbackScreen";

// 카카오 로그인에서 돌아오는 주소(/auth/callback/?code=…) — 공개 주소라 앱 관문이 막지 않는다.
// 정적 HTML에는 "로그인하고 있어요"만 있고, 세션 교환·동기화·이동은 브라우저에서 한다(features/flow/AuthCallbackScreen).
// 폰 = 폰 폭 기둥, PC = 배경 위 가운데 카드(components/shell/CardColumn).
export default function Page() {
  return (
    <CardColumn>
      <AuthCallbackScreen />
    </CardColumn>
  );
}
