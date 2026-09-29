"use client";

// 약물·음식 체크 — SubstanceCheckView.swift를 옮긴 화면(01 §3-10, substance.png).
// 큐레이션 표(출처 표기) 우선, 표에 없는 항목만 LLM 서버에 묻는다 — 서버가 설정돼 있을 때만(지금은 표만).
// AI 답의 출처는 앱이 확인한 것이 아니다 — 확인된 표 출처 칩(돋보기·primary)과 다른 중립 칩으로 그리고, 화면 낭독에는
// "AI가 제시한 출처"로 읽힌다(substanceModel substanceResultChips — 원칙 4, DEV_NOTES §3 CPO 7 결정 전 기본값).
// 서버에 처음 묻기 전에 AI 국외 이전 동의를 받는다(features/chat/aiConsent.ts): 동의 전에는 표만 보고, 표에 없는 항목이면
// 결과 아래에 동의 카드를 띄운다. [동의하고 계속하기]면 같은 항목을 AI에 다시 묻는다.
// 진단·처방이 아니다.

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { LoaderCircle, Search } from "lucide-react";
import { llmComplete } from "@/api/llm";
import { PAGE_FRAME } from "@/components/shell/pageFrame";
import { Card, ChipFlow, DisclaimerBanner, EvidenceChip, PrimaryButton, SubPageHeader, cx } from "@/components/ui";
import { isLLMBackendConfigured } from "@/config";
import { postpartumDayCount } from "@/domain/date";
import { AiConsentCard } from "@/features/chat/AiConsentCard";
import { aiMode, useAiConsent } from "@/features/chat/aiConsent";
import { substanceHeader, type SubstanceResult } from "@/rules/substance";
import { useAppStore } from "@/store/useAppStore";
import {
  canCheckSubstance,
  checkSubstance,
  createLatestOnly,
  shouldOfferAiConsent,
  substanceDeps,
  substanceLlmContext,
  substanceResultChips,
  verdictBadge,
} from "./substanceModel";
import { ROUTES } from "@/routes";

// 원문: SubstanceCheckView.swift:34
const PLACEHOLDER = "예: 타이레놀, 카페인, 이부프로펜";
// 원문: SubstanceCheckView.swift:41
const SUBMIT_LABEL = "확인하기";
// 원문: SubstanceCheckView.swift:56
const TITLE = "약물·음식 체크";
// 웹 신규 문구 — CPO 확인 필요 (조회 중 스피너의 화면 낭독용 이름. 화면에는 보이지 않는다)
const LOADING_SR_LABEL = "확인하고 있어요";
// 웹 신규 문구 — CPO 확인 필요 (AI가 답에 제시한 출처 칩 앞에 화면 낭독용으로만 붙는다 — 공용 출처 칩의 "출처: "와 구분. 화면에는 보이지 않는다)
export const AI_SOURCE_SR_PREFIX = "AI가 제시한 출처: ";

export function SubstanceCheckScreen() {
  const { hydrated, state, account } = useAppStore();
  const { consented, accept } = useAiConsent(account?.id ?? null);
  /** 이번 방문에 AI 국외 이전 동의를 거절했다 — 이 화면을 떠나면 다음에 다시 묻는다 */
  const [declined, setDeclined] = useState(false);
  const mode = aiMode({ aiAvailable: isLLMBackendConfigured(), consented, declined });
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SubstanceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const latest = useRef(createLatestOnly());
  const inflight = useRef<AbortController | null>(null);
  /** 결과 자리(조회 중 표시·결과 카드를 담는 곳 — 늘 그려져 있다). 동의 카드가 사라질 때 초점을 여기로 옮긴다 */
  const resultRef = useRef<HTMLDivElement>(null);
  const leadId = useId();
  const noteId = useId();

  // 화면을 떠나면 진행 중인 LLM 요청을 끊고, 늦게 온 결과는 버린다.
  useEffect(() => {
    const seq = latest.current;
    return () => {
      seq.cancel();
      inflight.current?.abort();
    };
  }, []);

  function run(event?: FormEvent) {
    event?.preventDefault();
    if (!canCheckSubstance(query)) return;
    lookup(query, mode === "on");
  }

  /** 한 번의 조회 — useAi면 표에 없는 항목을 서버(LLM)에 묻는다 */
  function lookup(text: string, useAi: boolean) {
    // 이전 조회가 진행 중이면 취소 — 느린 이전 응답이 새 결과를 덮지 않게(SubstanceCheckView.swift:94-95)
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;
    const token = latest.current.begin();
    setLoading(true);

    const now = new Date();
    const deps = substanceDeps({
      llmConfigured: useAi,
      complete: llmComplete,
      isBreastfeeding: state.profile.isBreastfeeding,
      dayCount: postpartumDayCount(state.profile.deliveryDate, now),
      context: useAi ? substanceLlmContext(state.profile, now) : null,
      signal: controller.signal,
    });
    void checkSubstance(text, deps).then((r) => {
      if (!latest.current.isCurrent(token)) return;
      inflight.current = null;
      setResult(r);
      setLoading(false);
    });
  }

  // 동의 카드는 고르는 순간 사라진다 — 누른 버튼과 함께 초점이 <body>로 떨어지지 않게 결과 자리로 옮긴다
  // (화면 낭독기는 이어서 조회 중·새 결과를 읽고, 키보드는 결과 아래에서 이어 간다. 입력창이 아니라 결과로 — 폰에서 키보드가 올라와
  // 결과를 가리지 않게. AI 상담은 입력창이 자리다 — ChatScreen onAcceptAi/onDeclineAi).
  function focusResult() {
    resultRef.current?.focus({ preventScroll: true });
  }

  function onAcceptAi() {
    accept();
    // 방금 "정보 부족"이 나온 항목을 AI에 다시 묻는다
    if (result) lookup(result.query, true);
    focusResult();
  }

  function onDeclineAi() {
    setDeclined(true);
    focusResult();
  }

  const header = substanceHeader(state.profile.isBreastfeeding);
  const offerAiConsent = !loading && shouldOfferAiConsent(result, mode);

  return (
    // PC 틀은 pageFrame(읽기 화면 — 최대 48rem, 왼쪽 정렬): 입력과 결과가 한눈에, 머리 위치는 다른 화면과 같다. 폰 기둥(30rem)에서는 그대로.
    <main className={cx("flex flex-1 flex-col px-6 pt-2 pb-6", PAGE_FRAME.reading)}>
      <SubPageHeader title={TITLE} backHref={ROUTES.profile} hideBackWithSidebar />

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

          <div ref={resultRef} tabIndex={-1} aria-live="polite" className="rounded-card">
            {loading ? (
              <div role="status" className="flex justify-center py-6">
                <LoaderCircle aria-hidden className="size-6 text-primary motion-safe:animate-spin" />
                <span className="sr-only">{LOADING_SR_LABEL}</span>
              </div>
            ) : result ? (
              <SubstanceResultCard result={result} />
            ) : null}
          </div>

          {offerAiConsent ? <AiConsentCard onAccept={onAcceptAi} onDecline={onDeclineAi} /> : null}

          <DisclaimerBanner />
        </div>
      ) : null}
    </main>
  );
}

// 결과 카드 — 입력어(16 bold) · 판정 배지(13 semibold 캡슐) / 설명(13) / 칩(SubstanceCheckView.swift:69-88). 테스트가 따로 그려 본다.
export function SubstanceResultCard({ result }: { result: SubstanceResult }) {
  const badge = verdictBadge(result.verdict);
  const chips = substanceResultChips(result);
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
      {/* LLM 답이 섞일 수 있다 — plain text로만 렌더(검수 #51) */}
      <p className="text-[0.8125rem] text-text-secondary">{result.detail}</p>
      <ChipFlow>
        {chips.map((chip, i) =>
          chip.kind === "aiSource" ? (
            <AiSourceChip key={`${i}-ai-${chip.text}`} text={chip.text} />
          ) : (
            <EvidenceChip key={`${i}-${chip.token}`} token={chip.token} />
          ),
        )}
      </ChipFlow>
    </Card>
  );
}

// AI가 제시한 출처 — 확인된 출처 칩(돋보기·primary 10%)이 아니라 근거 설명 칩과 같은 중립 톤에 점선 테두리(검증되지 않음).
// 글자는 LLM이 준 출처 이름 그대로(plain text). 색·모양만으로 구분하지 않게 숨은 접두를 읽어 준다.
function AiSourceChip({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-dashed border-text-subtle/60 bg-background px-2 py-1 text-xs font-medium text-text-secondary">
      <span className="sr-only">{AI_SOURCE_SR_PREFIX}</span>
      {text}
    </span>
  );
}
