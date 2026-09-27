import { SubPageHeader } from "@/components/ui";
import { PolicySections, PolicyWebNote } from "./PrivacyPolicy";
import { PRIVACY_POLICY_EFFECTIVE, PRIVACY_POLICY_TITLE } from "./policyText";

// /privacy/ — 설정에서 푸시로 여는 전체 화면(MoreView.swift:76, PrivacyPolicyView(showsCloseButton: false)).
// 로그인·온보딩에서도 열 수 있게 앱 관문이 이 주소는 늘 연다(features/flow/gate.ts).
// 뒤로 = 설정. 로그인 전이면 관문이 /settings/를 /login/으로 보낸다.
// 사용자 데이터를 쓰지 않는 정적 화면이라 서버 컴포넌트로 둔다.
export function PrivacyPolicyScreen() {
  return (
    <main className="flex flex-1 flex-col gap-6 px-6 pt-2 pb-10">
      <SubPageHeader title={PRIVACY_POLICY_TITLE} subtitle={PRIVACY_POLICY_EFFECTIVE} backHref="/settings/" />
      <PolicyWebNote />
      <PolicySections headingLevel="h2" />
    </main>
  );
}
