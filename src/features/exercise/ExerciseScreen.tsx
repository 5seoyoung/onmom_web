"use client";

// 운동 탭 — iOS ExerciseView.swift. 무엇을 보여줄지는 exerciseModel.ts가 정하고, 여기서는 그리기만 한다.
// 저장소를 읽기 전(hydrated=false)에는 제목만 그린다 — 기본값(분만 방식 없음 등)이 번쩍이지 않게.

import { useEffect, useState } from "react";
import { fetchVideos } from "@/api/video";
import { PAGE_FRAME } from "@/components/shell/pageFrame";
import { ScreenHeader, cx } from "@/components/ui";
import type { DeliveryMethod, MaternityRecord, PersistedState } from "@/domain/types";
import { StorageWarning } from "@/features/home/StorageWarning";
import { useOnline } from "@/features/home/useOnline";
import { EXERCISE_TEXT, isRedFlagActive, routeTag } from "@/rules/exercise";
import { useAppStore } from "@/store/useAppStore";
import { ExerciseBodyView, NeedsProfileBlock, RedFlagBlock } from "./ExerciseBlocks";
import { COLD_START_NOTICE_MS, fetchVideosWithRetry } from "./videoLoad";
import {
  NEEDS_DELIVERY_DATE_TEXT,
  VIDEO_LOAD_THROWN,
  exerciseBody,
  exerciseGate,
  exerciseSubtitle,
  exerciseWeek,
  videoLoadFromResult,
  type VideoLoad,
} from "./exerciseModel";

export function ExerciseScreen() {
  const { hydrated, state } = useAppStore();
  return (
    // 좌우 lg(24) · 위 sm(8) · 항목 간격 md(16) — ExerciseView.swift:30-44. PC 틀은 pageFrame(탭 화면)
    <main className={cx("flex flex-1 flex-col gap-4 px-6 pt-2 pb-6", PAGE_FRAME.wide)}>
      {hydrated ? <ExerciseContent state={state} /> : <ScreenHeader title={EXERCISE_TEXT.headerTitle} />}
    </main>
  );
}

function ExerciseContent({ state }: { state: PersistedState }) {
  // 산후 주차는 브라우저에서 계산한다(빌드 시각이 박히지 않게). 이 컴포넌트는 hydrated 뒤에만 마운트된다.
  const [now] = useState(() => new Date());
  const { deliveryMethod: delivery, deliveryDate } = state.profile;
  const week = exerciseWeek(deliveryDate, now);
  const gate = exerciseGate(delivery, deliveryDate, isRedFlagActive(state.symptomHistory));
  const subtitle = exerciseSubtitle(delivery, week);

  return (
    <>
      <ScreenHeader title={EXERCISE_TEXT.headerTitle} subtitle={subtitle ?? undefined} />
      <StorageWarning />
      {gate === "needsDelivery" ? (
        <NeedsProfileBlock title={EXERCISE_TEXT.needsDeliveryTitle} body={EXERCISE_TEXT.needsDeliveryBody} />
      ) : gate === "redFlag" ? (
        <RedFlagBlock />
      ) : gate === "needsDeliveryDate" ? (
        <NeedsProfileBlock title={NEEDS_DELIVERY_DATE_TEXT.title} body={NEEDS_DELIVERY_DATE_TEXT.body} />
      ) : delivery !== null && week !== null ? (
        <PlanBody delivery={delivery} week={week} maternity={state.maternity} />
      ) : null}
    </>
  );
}

// MARK: - 영상 조회 + 본문
//
// 콜드스타트(05 §0, videoLoad.ts): 8초가 지나도 응답이 없거나 자동 재시도에 들어가면 스피너 아래 "서버를 깨우는 중이에요 — 조금만 기다려 주세요"
// (시간 약속은 없다 — 프록시 빌드는 첫 시도 45초 + 재시도 35초까지 간다, videoLoad.ts).
// 첫 실패(시간 초과·연결 실패·5xx)는 한 번 자동으로 다시 시도하고, 그래도 실패면 [다시 시도] 카드.
// 오프라인(navigator.onLine=false)이면 실패 문구를 오프라인 안내로 바꾼다.

function PlanBody({ delivery, week, maternity }: { delivery: DeliveryMethod; week: number; maternity: MaternityRecord }) {
  const tag = routeTag(delivery);
  const online = useOnline();
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${tag}#${attempt}`;
  // 결과를 요청 키와 함께 둔다 — 키가 바뀌면(분만 방식 변경·다시 시도) 결과가 올 때까지 "불러오는 중"
  const [result, setResult] = useState<{ key: string; load: VideoLoad } | null>(null);
  // "서버를 깨우는 중" 안내를 켠 요청 키 — 다른 요청의 안내가 남지 않게 키로 비교한다
  const [wakingKey, setWakingKey] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const wake = () => setWakingKey(requestKey);
    const noticeTimer = setTimeout(wake, COLD_START_NOTICE_MS);
    fetchVideosWithRetry(fetchVideos, tag, { signal: controller.signal, onRetry: wake })
      .then(videoLoadFromResult, () => VIDEO_LOAD_THROWN)
      .then((load) => {
        if (!controller.signal.aborted) setResult({ key: requestKey, load });
      });
    return () => {
      clearTimeout(noticeTimer);
      controller.abort();
    };
  }, [tag, requestKey]);

  const load = result !== null && result.key === requestKey ? result.load : null;
  const body = exerciseBody(load, delivery, week, maternity, { waking: wakingKey === requestKey, offline: !online });
  return <ExerciseBodyView body={body} onRetry={() => setAttempt((n) => n + 1)} />;
}
