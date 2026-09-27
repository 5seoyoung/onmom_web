import { PolicySections, PolicyWebNote } from "./PrivacyPolicy";
import { PrivacyPolicyHeader } from "./PrivacyPolicyHeader";

// /privacy/ — 설정에서 푸시로 여는 전체 화면(MoreView.swift:76, PrivacyPolicyView(showsCloseButton: false)).
// 누구나 볼 수 있게 앱 관문이 이 주소는 늘 연다(features/flow/gate.ts) — 서비스 소개에서도 들어온다.
// 뒤로 = 앞 화면(서비스 소개·설정)으로 돌아간다. 주소로 바로 들어왔으면 앱을 쓰는 사람은 설정, 그 밖은 서비스 소개(privacyView.ts).
// 본문은 사용자 데이터를 쓰지 않는 정적 화면이라 서버 컴포넌트로 두고, 뒤로 링크가 있는 머리만 클라이언트다.
export function PrivacyPolicyScreen() {
  return (
    // 긴 본문 — 넓은 화면에서도 한 줄 길이가 42rem을 넘지 않게 가운데 기둥에 둔다(폰 기둥 30rem에서는 그대로)
    <main className="mx-auto flex w-full max-w-[42rem] flex-1 flex-col gap-6 px-6 pt-2 pb-10">
      <PrivacyPolicyHeader />
      <PolicyWebNote />
      <PolicySections headingLevel="h2" />
    </main>
  );
}
