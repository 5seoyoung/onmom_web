"use client";

// 홈 — 회복 대시보드(HomeView.swift). 위에서 아래로:
// 상단 바 · 히어로 · 오늘의 회복 상태 · [마음 연계] · 회복 단계 분석 · [회복 지표] · [지금 회복 단계] · [체중 목표]
// · 이상 증상 빠른 기록 · 면책. [ ]는 조건이 맞을 때만 그린다(homeViewModel).
// 저장소를 읽기 전(정적 HTML·첫 렌더)에는 데이터 카드를 그리지 않는다 — 기본값이 번쩍이지 않게.
//
// 폰: 한 줄로 위 순서 그대로. PC(lg 이상): 카드를 두 열로 나눈다 — 왼쪽 "오늘"(히어로·회복 상태·마음·분석),
// 오른쪽 "자세히·기록"(지표·단계·체중·빠른 기록). 열은 DOM에서도 왼쪽 묶음 → 오른쪽 묶음 순서라
// 읽는 순서·Tab 순서가 iOS 카드 순서와 같다(보이는 위치만 두 열). 상단 바·면책은 전체 폭.
// 열 묶음은 폰에서도 같은 간격(gap-4)의 세로 flex라 폰 화면은 이전과 같다.
// PC 틀은 pageFrame(탭 화면) — 좌우는 PC에서만 다른 화면과 같은 24(폰은 HomeView의 20 그대로).

import { useMemo, useRef } from "react";
import { PAGE_FRAME } from "@/components/shell/pageFrame";
import { cx } from "@/components/ui";
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

/** PC(lg)에서 두 열. 폰에서는 세로 한 줄(간격 16 = main과 같은 gap-4). */
const HOME_COLUMNS_CLASS = "flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start";
const HOME_COLUMN_CLASS = "flex min-w-0 flex-col gap-4";

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
    <main className={cx("flex flex-1 flex-col gap-4 px-5 pb-6 pt-2", PAGE_FRAME.wide)}>
      <HomeTopBar />
      {vm ? (
        <>
          <div className={HOME_COLUMNS_CLASS}>
            <div className={HOME_COLUMN_CLASS}>
              <HeroCard dayCount={vm.dayCount} chips={vm.heroChips} />
              <RecoveryStateCard model={vm.recoveryState} />
              {vm.showMoodCard ? <MoodSupportCard onSnooze={snoozeMoodCard} /> : null}
              <AnalyzeEntryCard ref={analyzeLinkRef} />
            </div>
            <div className={HOME_COLUMN_CLASS}>
              {vm.metrics ? (
                <MetricsCard items={vm.metrics.items} relativeTime={vm.metrics.relativeTime} recordDate={vm.metrics.recordDate} />
              ) : null}
              {vm.stageCard ? <StageCard card={vm.stageCard} /> : null}
              {vm.weightPlan ? <WeightPlanCard plan={vm.weightPlan} /> : null}
              <QuickRecordButton />
            </div>
          </div>
          <HomeFooter />
        </>
      ) : null}
    </main>
  );
}
