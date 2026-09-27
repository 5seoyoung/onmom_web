import {
  PRIVACY_POLICY_EFFECTIVE,
  PRIVACY_POLICY_SECTIONS,
  PRIVACY_POLICY_TITLE,
  PRIVACY_POLICY_WEB_NOTE,
} from "./policyText";

// 개인정보처리방침 본문 — 전체 화면(/privacy/)과 로그인·온보딩의 시트(PrivacyPolicyDialog)가 같이 쓴다.
// 부모는 세로 간격 lg(gap-6)로 늘어놓는다 — 제목·시행일·각 절 사이가 모두 lg(PrivacyPolicyView.swift:19).
// 글자: 제목 22 bold, 시행일 13, 절 제목 16 bold, 절 본문 16 textSecondary, 제목-본문 xs(PrivacyPolicyView.swift:21-24, 93-99).

/** 제목 + 시행일 — 시트에서만 쓴다(전체 화면은 SubPageHeader가 같은 글자를 그린다). */
export function PolicyTitleBlock() {
  return (
    <>
      <h2 className="text-[1.375rem] font-bold text-text-primary">{PRIVACY_POLICY_TITLE}</h2>
      <p className="text-[0.8125rem] text-text-secondary">{PRIVACY_POLICY_EFFECTIVE}</p>
    </>
  );
}

/** 웹 신규 안내 — 아래 방침이 iOS 기준임을 알린다(CPO 확인 필요). */
export function PolicyWebNote() {
  return <p className="rounded-chip bg-surface px-4 py-3 text-[0.8125rem] text-text-secondary">{PRIVACY_POLICY_WEB_NOTE}</p>;
}

export function PolicySections({ headingLevel }: { headingLevel: "h2" | "h3" }) {
  const Heading = headingLevel;
  return (
    <>
      {PRIVACY_POLICY_SECTIONS.map((s) => (
        <section key={s.title} className="flex flex-col gap-1">
          <Heading className="text-base font-bold text-text-primary">{s.title}</Heading>
          <p className="whitespace-pre-line text-base text-text-secondary">{s.body}</p>
        </section>
      ))}
    </>
  );
}
