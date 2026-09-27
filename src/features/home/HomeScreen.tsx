"use client";

// 홈 — 회복 대시보드(HomeView.swift). 위에서 아래로:
// 상단 바 · 히어로 · 오늘의 회복 상태 · [마음 연계] · 회복 단계 분석 · [회복 지표] · [지금 회복 단계] · [체중 목표]
// · 이상 증상 빠른 기록 · 면책. [ ]는 조건이 맞을 때만 그린다(homeViewModel).
// 저장소를 읽기 전(정적 HTML·첫 렌더)에는 데이터 카드를 그리지 않는다 — 기본값이 번쩍이지 않게.

import { useMemo, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";
import {
  AnalyzeEntryCard,
  HeroCard,
  HomeFooter,
  HomeTopBar,
  MetricsCard,
  MoodSupportCard,
  QuickRecordButton,
  RecoveryStateCard,
  StageCard,
  WeightPlanCard,
} from "./HomeCards";
import { buildHomeViewModel } from "./homeViewModel";
import { useNow } from "./useNow";

export function HomeScreen() {
  const { hydrated, state, actions } = useAppStore();
  const nowMs = useNow();
  const ready = hydrated && nowMs > 0;
  const vm = useMemo(() => (ready ? buildHomeViewModel(state, new Date(nowMs)) : null), [ready, state, nowMs]);
  const analyzeLinkRef = useRef<HTMLAnchorElement>(null);

  function snoozeMoodCard() {
    actions.snoozeMoodCard();
    // 누른 버튼이 카드와 함께 사라진다 — 키보드·스크린리더 사용자의 위치를 바로 다음 카드로 옮긴다.
    analyzeLinkRef.current?.focus();
  }

  return (
    <main className="flex flex-1 flex-col gap-4 px-5 pb-6 pt-2">
      <HomeTopBar />
      {vm ? (
        <>
          <HeroCard dayCount={vm.dayCount} chips={vm.heroChips} />
          <RecoveryStateCard model={vm.recoveryState} />
          {vm.showMoodCard ? <MoodSupportCard onSnooze={snoozeMoodCard} /> : null}
          <AnalyzeEntryCard ref={analyzeLinkRef} />
          {vm.metrics ? (
            <MetricsCard items={vm.metrics.items} relativeTime={vm.metrics.relativeTime} recordDate={vm.metrics.recordDate} />
          ) : null}
          {vm.stageCard ? <StageCard card={vm.stageCard} /> : null}
          {vm.weightPlan ? <WeightPlanCard plan={vm.weightPlan} /> : null}
          <QuickRecordButton />
          <HomeFooter />
        </>
      ) : null}
    </main>
  );
}
