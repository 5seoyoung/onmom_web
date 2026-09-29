import type { TermsDocument } from "./termsText";

// 이용약관 본문 — 전체 화면(/terms/)과 온보딩 동의 옆 시트(TermsDialog)가 같이 쓴다.
// 글자·간격은 개인정보처리방침 본문(features/privacy/PrivacyPolicy.tsx)과 같다: 제목 22 bold, 작성일 13, 절 제목 16 bold,
// 절 본문 16 textSecondary(PrivacyPolicyView.swift:21-24, 93-99). 부모가 세로 간격 lg(gap-6)로 늘어놓는다.

/** 제목 + 작성일 — 시트에서만 쓴다(전체 화면은 머리(TermsHeader)가 같은 글자를 그린다). */
export function TermsTitleBlock({ terms }: { terms: TermsDocument }) {
  return (
    <>
      <h2 className="text-[1.375rem] font-bold text-text-primary">{terms.title}</h2>
      <p className="text-[0.8125rem] text-text-secondary">{terms.effective}</p>
    </>
  );
}

/** 본문 위 안내 — 굵은 "초안 — 법률 검토 전" + 안내. 웹 처리방침 초안과 같은 모양(코랄 옅은 바탕, 짙은 글자). */
export function TermsNote({ terms }: { terms: TermsDocument }) {
  return (
    <div className="flex flex-col gap-1 rounded-chip bg-coral-tint px-4 py-3 text-[0.8125rem]">
      <p className="font-bold text-neutral">{terms.draftLabel}</p>
      <p className="text-text-secondary">{terms.note}</p>
    </div>
  );
}

export function TermsSections({ terms, headingLevel }: { terms: TermsDocument; headingLevel: "h2" | "h3" }) {
  const Heading = headingLevel;
  return (
    <>
      {terms.sections.map((s) => (
        <section key={s.title} className="flex flex-col gap-1">
          <Heading className="text-base font-bold text-text-primary">{s.title}</Heading>
          <p className="whitespace-pre-line text-base text-text-secondary">{s.body}</p>
        </section>
      ))}
    </>
  );
}
