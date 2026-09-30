"use client";

// 기록 탭 — 이상 증상 빠른 기록(RecordFlowView.swift). AI 아님: 판정은 전부 rules/redflag 규칙 조회다.
// 입력 단계: 머리 → 폼 5카드 → [확인하기] → 오늘의 한 가지 질문 → 최근 기록(있을 때) → 면책
// 결과 단계: 머리 → 레드플래그 카드 + 가까운 산부인과 | 위험 신호 없음 카드 → [다시 입력] → 면책
// 기록은 결과와 무관하게 저장한다. 저장소를 읽기 전(hydrated=false)에는 제목만 그린다 — 기본값이 번쩍이지 않게.
//
// 폰: 위처럼 단계가 바뀌면 폼 자리에 결과가 온다(iOS 그대로).
// PC(lg 이상): 두 열 — 왼쪽 폼 + [확인하기], 오른쪽 결과·[다시 입력](결과가 있을 때) + 오늘의 한 가지 질문 + 최근 기록.
// 결과 단계에서도 PC는 폼을 보여 주되 잠근다(판정에 쓴 답 그대로) — [확인하기]는 사라지고, 고치려면 [다시 입력].
// 그래서 PC에서도 화면의 답과 결과가 늘 맞고, 같은 기록이 겹쳐 저장되지 않는다(폰·iOS와 같은 흐름).
// 결과 단계에서 폰에 숨기는 부분은 `hidden lg:flex`(display:none — 보이지도, 낭독되지도, 초점이 가지도 않음)라
// 폰 화면·낭독 순서는 이전과 같다.
// 결과가 뜨면 맨 위로 올리고 결과로 초점을 옮긴다 — PC에서도 결과가 오른쪽 열 맨 위라 스크롤 없이 보인다.
// 저장 실패(storageAvailable=false) 안내는 머리 아래(features/home/StorageWarning) — [확인하기]는 막지 않는다(iOS처럼 메모리에서 동작).
// 오늘의 질문 각주는 저장 위치에 맞게(서버 저장 빌드면 "동의를 받은 뒤 온맘 서버에" — recordView moodNoteFor).

import { useRef, useState } from "react";
import { useLocalDay } from "@/components/clock";
import { PAGE_FRAME } from "@/components/shell/pageFrame";
import { DisclaimerBanner, PrimaryButton, ScreenHeader, SecondaryButton, cx } from "@/components/ui";
import { isSupabaseConfigured } from "@/config";
import type { MoodAnswer } from "@/domain/types";
import { StorageWarning } from "@/features/home/StorageWarning";
import type { SymptomForm } from "@/rules/record";
import type { RedFlagResult } from "@/rules/redflag";
import { useAppStore } from "@/store/useAppStore";
import { MoodQuestionCard } from "./MoodQuestionCard";
import { RecentRecordsCard } from "./RecentRecordsCard";
import { RecordResult } from "./RecordResult";
import {
  INITIAL_SYMPTOM_FORM,
  RECORD_TEXT,
  moodCardModel,
  recentRecordRows,
  recordColumns,
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
  const resultRef = useRef<HTMLDivElement>(null);

  const ready = hydrated && today !== null;

  /**
   * 단계가 바뀌면(폰에서는 누른 버튼이 사라진다) 새 내용의 맨 위로 포커스와 스크롤을 옮긴다.
   * 결과가 뜰 때는 결과 묶음으로 — 폰에서는 본문 맨 위와 같은 자리이고, PC에서는 폼 옆 오른쪽 열 맨 위다.
   */
  function moveToTop(target: "body" | "result") {
    requestAnimationFrame(() => {
      const el = target === "result" ? (resultRef.current ?? bodyRef.current) : bodyRef.current;
      el?.focus({ preventScroll: true });
      window.scrollTo({ top: 0 });
    });
  }

  function runCheck() {
    const { newRecord, result: checked } = submitSymptomCheck(form, state.profile.deliveryDate, new Date());
    actions.addSymptomRecord(newRecord);
    setResult(checked);
    moveToTop("result");
  }

  function retry() {
    setResult(null);
    moveToTop("body");
  }

  const setNeighborhood = (value: string) => actions.updateProfile({ neighborhood: value });
  const answerMood = (questionID: number, answer: MoodAnswer) => actions.addMoodCheck({ questionID, answer });

  if (!ready) {
    return (
      <main className={cx("flex flex-1 flex-col gap-4 px-6 pt-2 pb-6", PAGE_FRAME.wide)}>
        <ScreenHeader title={RECORD_TEXT.title} />
      </main>
    );
  }

  const layout = recordLayout(result, state.symptomHistory.length);
  const columns = recordColumns(layout.phase);

  return (
    <main className={cx("flex flex-1 flex-col gap-4 px-6 pt-2 pb-6", PAGE_FRAME.wide)}>
      <ScreenHeader title={RECORD_TEXT.title} subtitle={recordSubtitle(state.profile, today) ?? undefined} />
      <StorageWarning />
      <div ref={bodyRef} tabIndex={-1} className={columns.body}>
        {/* 왼쪽 열 — 입력 폼. 결과 단계의 폰에서는 숨긴다(iOS: 결과가 폼 자리를 차지).
            결과 단계의 PC에서는 잠긴 채 보인다 — fieldset disabled가 안의 모든 입력을 막는다. */}
        <div className={columns.form}>
          <fieldset disabled={columns.formLocked} className="flex min-w-0 flex-col gap-4">
            <SymptomFormCards
              form={form}
              onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
              showsLochia={recordShowsLochia(state.profile.deliveryDate, today)}
              neighborhood={state.profile.neighborhood}
              onNeighborhoodChange={setNeighborhood}
              disabled={columns.formLocked}
            />
          </fieldset>
          {columns.showsSubmit ? <PrimaryButton onClick={runCheck}>{RECORD_TEXT.submit}</PrimaryButton> : null}
        </div>
        {/* 오른쪽 열 — 결과(있을 때) + 오늘의 질문 + 최근 기록 */}
        <div className={columns.side}>
          {layout.phase === "result" ? (
            <div ref={resultRef} tabIndex={-1} className="flex flex-col gap-4 focus:outline-none">
              <RecordResult
                redFlag={layout.redFlag}
                neighborhood={state.profile.neighborhood}
                onNeighborhoodChange={setNeighborhood}
              />
              <SecondaryButton onClick={retry}>{RECORD_TEXT.retry}</SecondaryButton>
            </div>
          ) : null}
          {/* 폰은 입력 단계에서만(iOS). PC는 결과 옆에서도 — 방금 남긴 기록이 최근 기록 맨 위에 보인다. */}
          <div className={columns.sideExtras}>
            <MoodQuestionCard
              model={moodCardModel(state.moodChecks, today, { serverStorage: isSupabaseConfigured() })}
              onAnswer={answerMood}
            />
            {layout.showsRecent ? <RecentRecordsCard rows={recentRecordRows(state.symptomHistory)} /> : null}
          </div>
        </div>
      </div>
      <DisclaimerBanner />
    </main>
  );
}
