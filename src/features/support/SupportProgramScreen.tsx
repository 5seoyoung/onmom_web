"use client";

// 지원사업 추천 — iOS SupportProgramView.swift.
// 순서: 안내문 → 모든 산모 공통 카드 → 6영역 체크리스트(16문항) → [추천 받기](1개 이상 체크 시) → 체크한 영역의 해결책 카드 → 하단 안내.
// 체크 상태는 이 화면에만 있고 저장하지 않는다(iOS @State와 같음). 사용자 저장 데이터를 읽지 않아 하이드레이션 대기가 없다.
import { useState } from "react";
import { flushSync } from "react-dom";
import { Circle, CircleCheck, Hand, SquareArrowUpRight } from "lucide-react";
import { EXTERNAL_LINK_PROPS } from "@/api/safeUrl";
import { Card, PrimaryButton, SectionTitle, SubPageHeader, cx } from "@/components/ui";
import {
  SUPPORT_DOMAINS,
  SUPPORT_TEXT,
  SUPPORT_UNIVERSAL,
  canRecommendSupport,
  toggleSupportQuestion,
  type SupportQuestion,
  type SupportSolution,
} from "@/rules/support";
import { supportLink, supportResultHeadingId, supportResultsView } from "./supportViewModel";

// 웹 신규 문구 — CPO 확인 필요: 새 탭으로 열리는 링크임을 스크린리더에 알리는 숨은 글자(화면에는 안 보임)
const NEW_TAB_HINT = " (새 창)";

export function SupportProgramScreen() {
  const [checked, setChecked] = useState<ReadonlySet<number>>(() => new Set<number>());
  const [recommended, setRecommended] = useState(false);

  const canRecommend = canRecommendSupport(checked);
  const results = supportResultsView(checked, recommended);

  const recommend = () => {
    // 결과가 버튼 아래에 새로 생긴다 — 키보드·스크린리더 사용자를 첫 결과 제목으로 옮긴다(보이는 동작은 iOS와 같음).
    flushSync(() => setRecommended(true));
    const first = supportResultsView(checked, true).domains[0];
    if (first) document.getElementById(supportResultHeadingId(first.id))?.focus();
  };

  return (
    // VStack(spacing: md) · 좌우 20 · 위 md · 끝 Spacer(minLength: lg) — SupportProgramView.swift:107-149
    <main className="flex flex-1 flex-col gap-4 px-5 pt-2 pb-10">
      <SubPageHeader title={SUPPORT_TEXT.title} backHref="/profile/" />

      <p className="text-[0.8125rem] text-text-subtle">{SUPPORT_TEXT.intro}</p>

      <SolutionCard title={SUPPORT_TEXT.universalTitle} solutions={[SUPPORT_UNIVERSAL]} />

      {SUPPORT_DOMAINS.map((domain) => (
        <Card key={domain.id}>
          <fieldset>
            {/* legend를 float로 빼서 일반 블록처럼 배치한다(카드 안 VStack spacing md) */}
            <SectionTitle as="legend" className="float-left mb-4 p-0">
              {domain.title}
            </SectionTitle>
            <div className="clear-both flex flex-col gap-4">
              {domain.questions.map((question) => (
                <QuestionRow
                  key={question.id}
                  question={question}
                  checked={checked.has(question.id)}
                  onToggle={() => setChecked((prev) => toggleSupportQuestion(prev, question.id))}
                />
              ))}
            </div>
          </fieldset>
        </Card>
      ))}

      <PrimaryButton disabled={!canRecommend} onClick={recommend}>
        {SUPPORT_TEXT.recommendButton}
      </PrimaryButton>

      {results.visible ? (
        <>
          {results.showNothingChecked ? (
            <p className="text-[0.8125rem] text-text-subtle">{SUPPORT_TEXT.nothingChecked}</p>
          ) : null}
          {results.domains.map((domain) => (
            <SolutionCard
              key={domain.id}
              title={domain.title}
              headingId={supportResultHeadingId(domain.id)}
              solutions={domain.solutions}
            />
          ))}
        </>
      ) : null}

      <p className="text-[0.6875rem] text-text-subtle">{SUPPORT_TEXT.footer}</p>
    </main>
  );
}

// 체크 문항 — SupportProgramView.swift:156-172. 진짜 체크박스(숨김) + 아이콘으로 상태를 보인다(모양이 달라 색만으로 구분하지 않음).
function QuestionRow({
  question,
  checked,
  onToggle,
}: {
  question: SupportQuestion;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="relative flex min-h-11 cursor-pointer items-start gap-2 rounded-chip has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary">
      <input type="checkbox" className="sr-only" checked={checked} onChange={onToggle} />
      <span aria-hidden className="flex h-6 w-[1.375rem] shrink-0 items-center justify-center">
        {checked ? (
          <CircleCheck className="size-[1.375rem] fill-primary text-white" />
        ) : (
          <Circle className="size-[1.375rem] text-divider" />
        )}
      </span>
      <span className="min-w-0 flex-1 text-base text-text-primary">{question.text}</span>
    </label>
  );
}

// 해결책 카드 — SupportProgramView.swift:175-189 (SectionTitle + 행, 간격 sm)
function SolutionCard({
  title,
  headingId,
  solutions,
}: {
  title: string;
  /** 추천 결과 카드만 — [추천 받기] 뒤 초점을 받을 수 있게 id·tabIndex를 단다 */
  headingId?: string;
  solutions: readonly SupportSolution[];
}) {
  return (
    <Card className="flex flex-col gap-2">
      <SectionTitle id={headingId} tabIndex={headingId ? -1 : undefined} className="rounded-chip">
        {title}
      </SectionTitle>
      <ul className="flex flex-col gap-2">
        {solutions.map((solution) => (
          <li key={solution.name}>
            <SolutionRow solution={solution} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

// 해결책 행 — SupportProgramView.swift:191-209. 공식 링크가 있는 항목만 행 전체가 링크이고 화살표 아이콘이 붙는다.
function SolutionRow({ solution }: { solution: SupportSolution }) {
  const link = supportLink(solution.url);
  const content = (
    <>
      <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-coral-tint text-primary">
        <Hand className="size-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[0.9375rem] font-semibold text-text-primary">{solution.name}</span>
        <span className="text-[0.8125rem] text-text-subtle">{solution.note}</span>
      </span>
      {/* Spacer(minLength: sm) — HStack spacing md와 합쳐 글자 오른쪽에 최소 24 */}
      <span aria-hidden className="w-2 shrink-0" />
      {link ? <SquareArrowUpRight aria-hidden className="size-5 shrink-0 text-divider" /> : null}
    </>
  );
  const rowClass = "flex w-full items-center gap-4";

  if (!link) return <div className={rowClass}>{content}</div>;
  if (link.kind === "tel") {
    return (
      <a href={link.href} className={cx(rowClass, "relative min-h-11 rounded-chip")}>
        {content}
      </a>
    );
  }
  return (
    <a href={link.href} {...EXTERNAL_LINK_PROPS} className={cx(rowClass, "relative min-h-11 rounded-chip")}>
      {content}
      <span className="sr-only">{NEW_TAB_HINT}</span>
    </a>
  );
}
