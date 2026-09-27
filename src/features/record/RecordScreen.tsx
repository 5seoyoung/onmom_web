"use client";

// 기록 탭 — 이상 증상 빠른 기록(RecordFlowView.swift). AI 아님: 판정은 전부 rules/redflag 규칙 조회다.
// 입력 단계: 머리 → 폼 5카드 → [확인하기] → 오늘의 한 가지 질문 → 최근 기록(있을 때) → 면책
// 결과 단계: 머리 → 레드플래그 카드 + 가까운 산부인과 | 위험 신호 없음 카드 → [다시 입력] → 면책
// 기록은 결과와 무관하게 저장한다. 저장소를 읽기 전(hydrated=false)에는 제목만 그린다 — 기본값이 번쩍이지 않게.

import { useRef, useState } from "react";
import { DisclaimerBanner, PrimaryButton, ScreenHeader, SecondaryButton } from "@/components/ui";
import type { MoodAnswer } from "@/domain/types";
import type { SymptomForm } from "@/rules/record";
import type { RedFlagResult } from "@/rules/redflag";
import { useAppStore } from "@/store/useAppStore";
import { useLocalDay } from "./localDay";
import { MoodQuestionCard } from "./MoodQuestionCard";
import { RecentRecordsCard } from "./RecentRecordsCard";
import { RecordResult } from "./RecordResult";
import {
  INITIAL_SYMPTOM_FORM,
  RECORD_TEXT,
  moodCardModel,
  recentRecordRows,
  recordLayout,
  recordShowsLochia,
  recordSubtitle,
  submitSymptomCheck,
} from "./recordView";
import { SymptomFormCards } from "./SymptomFormCards";

export function RecordScreen() {
  const { hydrated, state, actions } = useAppStore();
  const today = useLocalDay();
  // 폼 값은 [다시 입력] 뒤에도 남는다(iOS @State — result만 비운다)
  const [form, setForm] = useState<SymptomForm>(INITIAL_SYMPTOM_FORM);
  const [result, setResult] = useState<RedFlagResult | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const ready = hydrated && today !== null;

  /** 단계가 바뀌면 누른 버튼이 사라진다 — 새 내용의 맨 위로 포커스와 스크롤을 옮긴다. */
  function moveToTop() {
    requestAnimationFrame(() => {
      bodyRef.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0 });
    });
  }

  function runCheck() {
    const { newRecord, result: checked } = submitSymptomCheck(form, state.profile.deliveryDate, new Date());
    actions.addSymptomRecord(newRecord);
    setResult(checked);
    moveToTop();
  }

  function retry() {
    setResult(null);
    moveToTop();
  }

  const setNeighborhood = (value: string) => actions.updateProfile({ neighborhood: value });
  const answerMood = (questionID: number, answer: MoodAnswer) => actions.addMoodCheck({ questionID, answer });

  if (!ready) {
    return (
      <main className="flex flex-1 flex-col gap-4 px-6 pt-2 pb-6">
        <ScreenHeader title={RECORD_TEXT.title} />
      </main>
    );
  }

  const layout = recordLayout(result, state.symptomHistory.length);

  return (
    <main className="flex flex-1 flex-col gap-4 px-6 pt-2 pb-6">
      <ScreenHeader title={RECORD_TEXT.title} subtitle={recordSubtitle(state.profile, today) ?? undefined} />
      <div ref={bodyRef} tabIndex={-1} className="flex flex-col gap-4 focus:outline-none">
        {layout.phase === "result" ? (
          <>
            <RecordResult
              redFlag={layout.redFlag}
              neighborhood={state.profile.neighborhood}
              onNeighborhoodChange={setNeighborhood}
            />
            <SecondaryButton onClick={retry}>{RECORD_TEXT.retry}</SecondaryButton>
          </>
        ) : (
          <>
            <SymptomFormCards
              form={form}
              onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
              showsLochia={recordShowsLochia(state.profile.deliveryDate, today)}
              neighborhood={state.profile.neighborhood}
              onNeighborhoodChange={setNeighborhood}
            />
            <PrimaryButton onClick={runCheck}>{RECORD_TEXT.submit}</PrimaryButton>
            <MoodQuestionCard model={moodCardModel(state.moodChecks, today)} onAnswer={answerMood} />
            {layout.showsRecent ? <RecentRecordsCard rows={recentRecordRows(state.symptomHistory)} /> : null}
          </>
        )}
      </div>
      <DisclaimerBanner />
    </main>
  );
}
