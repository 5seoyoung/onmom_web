import { POLICY_EDITION_TEXT } from "./editions";
import type { PolicyDocument } from "./policy";
import type { PolicySection } from "./policyText";

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
 * 본문 위 안내 — iOS 원문이면 "iOS 기준" 안내, 웹 방침이면 굵은 상태 표시("시범 운영 중") + 안내(CPO 확인 필요).
 * 상태 표시는 눈에 띄게 코랄 옅은 바탕에 둔다(글자는 짙은 색 — 대비).
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

type HeadingLevel = "h2" | "h3" | "h4";
const NEXT_LEVEL: Record<HeadingLevel, HeadingLevel> = { h2: "h3", h3: "h4", h4: "h4" };

function SectionList({ sections, headingLevel }: { sections: readonly PolicySection[]; headingLevel: HeadingLevel }) {
  const Heading = headingLevel;
  return (
    <>
      {sections.map((s) => (
        <section key={s.title} className="flex flex-col gap-1">
          <Heading className="text-base font-bold text-text-primary">{s.title}</Heading>
          <p className="whitespace-pre-line text-base text-text-secondary">{s.body}</p>
        </section>
      ))}
    </>
  );
}

export function PolicySections({ policy, headingLevel }: { policy: PolicyDocument; headingLevel: "h2" | "h3" }) {
  return <SectionList sections={policy.sections} headingLevel={headingLevel} />;
}

/** 접기 제목(summary) — 44px 이상 누를 곳. display는 기본(list-item) 그대로 둬 브라우저의 열림 삼각형이 남는다 */
const SUMMARY_CLASS = "min-h-11 cursor-pointer py-2.5 text-[0.9375rem] font-semibold text-primary-text";

/**
 * 시행을 앞둔 새 판 안내 — 본문 위. 바뀌는 내용 요약은 늘 보이고, 새 판 전문은 접어 둔다(<details> — 스크립트 없이 열린다).
 * 새 판이 없으면 아무것도 그리지 않는다.
 */
export function PolicyUpcomingNotice({ policy, headingLevel }: { policy: PolicyDocument; headingLevel: "h2" | "h3" }) {
  const upcoming = policy.upcoming;
  if (upcoming === null) return null;
  const Heading = headingLevel;
  const date = upcoming.effective.replace(/^시행일:\s*/, "");
  return (
    <section aria-labelledby={`policy-upcoming-${headingLevel}`} className="flex flex-col gap-2 rounded-chip bg-surface px-4 py-3 ring-1 ring-divider">
      <Heading id={`policy-upcoming-${headingLevel}`} className="text-base font-bold text-text-primary">
        {POLICY_EDITION_TEXT.upcomingTitle}
      </Heading>
      <p className="text-[0.9375rem] text-text-secondary">{POLICY_EDITION_TEXT.upcomingLead(date)}</p>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-[0.9375rem] text-text-secondary">
        {upcoming.changes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <details className="flex flex-col">
        <summary className={SUMMARY_CLASS}>{POLICY_EDITION_TEXT.upcomingFull}</summary>
        <div className="flex flex-col gap-6 pt-2">
          <p className="text-[0.8125rem] text-text-secondary">{upcoming.effective}</p>
          <SectionList sections={upcoming.sections} headingLevel={NEXT_LEVEL[headingLevel]} />
        </div>
      </details>
    </section>
  );
}

/** 지난 판 — 본문 아래. 판마다 적용 기간을 접기 제목으로, 그때의 표시·안내·전문을 그대로. 지난 판이 없으면 그리지 않는다. */
export function PolicyPreviousEditions({ policy, headingLevel }: { policy: PolicyDocument; headingLevel: "h2" | "h3" }) {
  if (policy.previous.length === 0) return null;
  const Heading = headingLevel;
  return (
    <section aria-labelledby={`policy-previous-${headingLevel}`} className="flex flex-col gap-2 border-t border-divider pt-6">
      <Heading id={`policy-previous-${headingLevel}`} className="text-base font-bold text-text-primary">
        {POLICY_EDITION_TEXT.previousTitle}
      </Heading>
      <p className="text-[0.9375rem] text-text-secondary">{POLICY_EDITION_TEXT.previousLead}</p>
      {policy.previous.map((e) => (
        <details key={e.id} className="flex flex-col">
          <summary className={SUMMARY_CLASS}>{e.period}</summary>
          <div className="flex flex-col gap-6 pt-2">
            <p className="text-[0.8125rem] text-text-secondary">
              {e.effective} · {e.draftLabel}
            </p>
            <p className="text-[0.8125rem] text-text-secondary">{e.note}</p>
            <SectionList sections={e.sections} headingLevel={NEXT_LEVEL[headingLevel]} />
          </div>
        </details>
      ))}
    </section>
  );
}
