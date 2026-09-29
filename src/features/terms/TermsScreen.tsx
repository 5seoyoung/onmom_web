import { TermsNote, TermsSections } from "./Terms";
import { TermsHeader } from "./TermsHeader";
import { termsDocument } from "./termsText";

// /terms/ — 이용약관 전체 화면(초안 — 법률 검토 전). 누구나 볼 수 있게 앱 관문이 이 주소는 늘 연다(features/flow/gate.ts).
// 서비스 소개 바닥글·설정 > 개인정보·안전에서 들어온다. 본문은 사용자 데이터를 쓰지 않는 정적 화면이라 서버 컴포넌트로 두고,
// 뒤로 링크가 있는 머리(TermsHeader)만 클라이언트다. 개인정보처리방침 화면(features/privacy/PrivacyPolicyScreen)과 같은 틀.
export function TermsScreen() {
  const terms = termsDocument();
  return (
    // 긴 본문 — 넓은 화면에서도 한 줄 길이가 42rem을 넘지 않게 가운데 기둥에 둔다(폰 기둥 30rem에서는 그대로)
    <main className="mx-auto flex w-full max-w-[42rem] flex-1 flex-col gap-6 px-6 pt-2 pb-10">
      <TermsHeader title={terms.title} effective={terms.effective} />
      <TermsNote terms={terms} />
      <TermsSections terms={terms} headingLevel="h2" />
    </main>
  );
}
