import type { PolicyDocument } from "./policy";

// 개인정보처리방침 본문 — 전체 화면(/privacy/)과 로그인·온보딩의 시트(PrivacyPolicyDialog)가 같이 쓴다.
// 어느 방침인지(iOS 원문 / 웹 초안)는 부모가 policy.ts activePolicy()로 골라 넘긴다.
// 부모는 세로 간격 lg(gap-6)로 늘어놓는다 — 제목·시행일·각 절 사이가 모두 lg(PrivacyPolicyView.swift:19).
// 글자: 제목 22 bold, 시행일 13, 절 제목 16 bold, 절 본문 16 textSecondary, 제목-본문 xs(PrivacyPolicyView.swift:21-24, 93-99).

/** 제목 + 시행일 — 시트에서만 쓴다(전체 화면은 SubPageHeader가 같은 글자를 그린다). */
export function PolicyTitleBlock({ policy }: { policy: PolicyDocument }) {
  return (
    <>
      <h2 className="text-[1.375rem] font-bold text-text-primary">{policy.title}</h2>
      <p className="text-[0.8125rem] text-text-secondary">{policy.effective}</p>
    </>
  );
}

/**
 * 본문 위 안내 — iOS 원문이면 "iOS 기준" 안내, 웹 초안이면 굵은 "초안 — 법률 검토 전" + 안내(CPO 확인 필요).
 * 초안 표시는 눈에 띄게 코랄 옅은 바탕에 둔다(글자는 짙은 색 — 대비).
 */
export function PolicyWebNote({ policy }: { policy: PolicyDocument }) {
  if (policy.draftLabel === null) {
    return <p className="rounded-chip bg-surface px-4 py-3 text-[0.8125rem] text-text-secondary">{policy.note}</p>;
  }
  return (
    <div className="flex flex-col gap-1 rounded-chip bg-coral-tint px-4 py-3 text-[0.8125rem]">
      <p className="font-bold text-neutral">{policy.draftLabel}</p>
      <p className="text-text-secondary">{policy.note}</p>
    </div>
  );
}

export function PolicySections({ policy, headingLevel }: { policy: PolicyDocument; headingLevel: "h2" | "h3" }) {
  const Heading = headingLevel;
  return (
    <>
      {policy.sections.map((s) => (
        <section key={s.title} className="flex flex-col gap-1">
          <Heading className="text-base font-bold text-text-primary">{s.title}</Heading>
          <p className="whitespace-pre-line text-base text-text-secondary">{s.body}</p>
        </section>
      ))}
    </>
  );
}
