"use client";

// 약물·음식 체크 — SubstanceCheckView.swift를 옮긴 화면(01 §3-10, substance.png).
// 출처 표기가 있는 큐레이션 표만 본다. AI는 쓰지 않는다(2026-11-06 대표 결정, 사전 검토 H5·D-10): 표에 없는 항목은 "정보 부족"으로 끝나고 서버로 아무것도 보내지 않는다.
// 진단·처방이 아니다.

import { useId, useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { PAGE_FRAME } from "@/components/shell/pageFrame";
import { Card, ChipFlow, DisclaimerBanner, EvidenceChip, PrimaryButton, SubPageHeader, cx } from "@/components/ui";
import { substanceHeader, type SubstanceResult } from "@/rules/substance";
import { useAppStore } from "@/store/useAppStore";
import { SUBSTANCE_TEXT, canCheckSubstance, checkSubstance, substanceResultChips, verdictBadge } from "./substanceModel";
import { ROUTES } from "@/routes";

// 원문: SubstanceCheckView.swift:34
const PLACEHOLDER = "예: 타이레놀, 카페인, 이부프로펜";
// 원문: SubstanceCheckView.swift:41
const SUBMIT_LABEL = "확인하기";

export function SubstanceCheckScreen() {
  const { hydrated, state } = useAppStore();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SubstanceResult | null>(null);
  const leadId = useId();
  const noteId = useId();

  function run(event?: FormEvent) {
    event?.preventDefault();
    if (!canCheckSubstance(query)) return;
    setResult(checkSubstance(query));
  }

  const header = substanceHeader(state.profile.isBreastfeeding);

  return (
    // PC 틀은 pageFrame(읽기 화면 — 최대 48rem, 왼쪽 정렬): 입력과 결과가 한눈에, 머리 위치는 다른 화면과 같다. 폰 기둥(30rem)에서는 그대로.
    <main className={cx("flex flex-1 flex-col px-6 pt-2 pb-6", PAGE_FRAME.reading)}>
      <SubPageHeader title={SUBSTANCE_TEXT.title} backHref={ROUTES.profile} hideBackWithSidebar />

      {/* 저장소를 읽기 전에는 수유 여부를 모른다 — 기본값 문구를 번쩍이지 않게 그리지 않는다 */}
      {hydrated ? (
        <div className="flex flex-col gap-4 pt-2">
          <div className="flex flex-col gap-1">
            <p id={leadId} className="text-base text-text-secondary">
              {header.lead}
            </p>
            {header.note ? (
              <p id={noteId} className="text-[0.8125rem] text-text-subtle-aa">
                {header.note}
              </p>
            ) : null}
          </div>

          <form role="search" onSubmit={run} className="flex flex-col gap-4">
            {/* iOS 카드 높이(약 61pt)에 맞춰 위아래 패딩만 8로 줄인다 — 입력창 44 + 8·8. 좌우는 Card 기본 20 그대로.
                Tailwind v4는 padding 뒤에 padding-block을 내보내므로 py-2가 Card의 p-5를 확실히 덮는다. */}
            <Card className="flex items-center gap-2 py-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus-ring">
              <Search aria-hidden className="size-5 shrink-0 text-text-secondary" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={PLACEHOLDER}
                aria-labelledby={leadId}
                aria-describedby={header.note ? noteId : undefined}
                enterKeyHint="search"
                autoComplete="off"
                spellCheck={false}
                className="min-h-11 w-full min-w-0 appearance-none bg-transparent text-base text-text-primary placeholder:text-text-subtle-aa focus-visible:outline-none [&::-webkit-search-cancel-button]:appearance-none"
              />
            </Card>
            <PrimaryButton type="submit" disabled={!canCheckSubstance(query)}>
              {SUBMIT_LABEL}
            </PrimaryButton>
          </form>

          <div aria-live="polite" className="rounded-card">
            {result ? <SubstanceResultCard result={result} /> : null}
          </div>

          <DisclaimerBanner />
        </div>
      ) : null}
    </main>
  );
}

// 결과 카드 — 입력어(16 bold) · 판정 배지(13 semibold 캡슐) / 설명(13) / 칩(SubstanceCheckView.swift:69-88). 테스트가 따로 그려 본다.
export function SubstanceResultCard({ result }: { result: SubstanceResult }) {
  const badge = verdictBadge(result.verdict);
  return (
    <Card as="section" className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0 text-base font-bold text-text-primary">{result.query}</h2>
        <span
          className={cx(
            "inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[0.8125rem] font-semibold",
            badge.className,
          )}
        >
          {badge.label}
        </span>
      </div>
      <p className="text-[0.8125rem] text-text-secondary">{result.detail}</p>
      <ChipFlow>
        {substanceResultChips(result).map((token, i) => (
          <EvidenceChip key={`${i}-${token}`} token={token} />
        ))}
      </ChipFlow>
    </Card>
  );
}
