"use client";

// 회복 단계 분석 — iOS AnalyzeFlowView.swift(폼 → 로딩 → 결과). 전체 화면 페이지, 뒤로 가기는 홈 탭(ROUTES.home).
// [분석 시작]: 폼 값을 먼저 저장하고, 저장소에서 다시 읽은 값으로 분석한다(analyzeRun.ts, D10).
// 저장소를 읽기 전(hydrated=false)에는 제목·안내문만 그린다 — 기본값으로 채운 폼이 번쩍이지 않게.
// PC(lg 이상) 틀은 pageFrame: 폼·로딩은 읽기 화면(최대 48rem), 결과는 격자 화면(앱 본문 폭 전체 — 묶음을 나란히). 폰은 이전과 같다.
// 둘 다 왼쪽 정렬·같은 위 여백 — 폼 → 결과로 넘어가도 머리(뒤로·제목)가 제자리에 있고, 다른 화면과 위치가 같다.
// 더 깊은 화면(홈의 분석 카드에서 들어옴)이라 PC에서도 [뒤로]가 맨 위 줄에 있다.
//
// 영상 조회(콜드스타트, 05 §0 — features/exercise/videoLoad.ts): 로딩이 8초를 넘거나 자동 재시도에 들어가면 로딩 화면 아래에
// "서버를 깨우는 중이에요 — 조금만 기다려 주세요"(COLD_START_TEXT — 시간 약속은 없다). 오프라인(navigator.onLine=false)이면 결과의 영상 실패 문구를 오프라인 안내로 바꾼다.
// 저장 실패(storageAvailable=false) 안내는 머리 아래(features/home/StorageWarning) — [분석 시작]은 막지 않는다.

import { useContext, useEffect, useRef, useState } from "react";
import { fetchVideos } from "@/api/video";
import { PAGE_FRAME } from "@/components/shell/pageFrame";
import { SubPageHeader, cx } from "@/components/ui";
import { COLD_START_NOTICE_MS, COLD_START_TEXT } from "@/features/exercise/videoLoad";
import { StorageWarning } from "@/features/home/StorageWarning";
import { useOnline } from "@/features/home/useOnline";
import type { EngineOutput } from "@/rules/recovery";
import { isRedFlagActive } from "@/rules/record";
import { getBrowserStore } from "@/store/browserStore";
import { StoreContext } from "@/store/StoreProvider";
import { useAppStore } from "@/store/useAppStore";
import { AnalyzeForm, AnalyzeLoading } from "./AnalyzeForm";
import { AnalyzeResult } from "./AnalyzeResult";
import {
  ANALYZE_TEXT,
  analyzePhaseKey,
  analyzeResultModel,
  formValuesFromSaved,
  type AnalyzeFormValues,
} from "./analyzeModel";
import { saveAndAnalyze } from "./analyzeRun";

type Phase =
  /** formKey가 바뀌면 폼을 새로 만들어 저장된 값으로 다시 채운다(iOS restart → prefillForm) */
  | { kind: "form"; formKey: number; error: string | null }
  /** waking: 영상 서버가 8초 넘게 답이 없거나 자동 재시도 중 — "서버를 깨우는 중" 안내(콜드스타트, 05 §0) */
  | { kind: "loading"; waking: boolean }
  | { kind: "result"; output: EngineOutput };

/** 로딩 중이면 콜드스타트 안내를 켠다(다른 단계로 넘어갔으면 그대로) */
function markWaking(phase: Phase): Phase {
  return phase.kind === "loading" && !phase.waking ? { kind: "loading", waking: true } : phase;
}

export function AnalyzeScreen() {
  const { hydrated, state, actions } = useAppStore();
  const online = useOnline();
  // 저장 직후의 값을 읽으려고 스토어 스냅샷에 직접 접근한다(useAppStore와 같은 스토어).
  const store = useContext(StoreContext) ?? getBrowserStore();

  const [phase, setPhase] = useState<Phase>({ kind: "form", formKey: 0, error: null });
  const formKeyRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const moveFocusRef = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // 화면을 떠나면 진행 중인 영상 조회를 끊는다
  useEffect(() => () => controllerRef.current?.abort(), []);

  // 단계가 바뀌면(폼 → 로딩 → 결과, 다시 분석하기) 맨 위로 올리고 새 내용으로 초점을 옮긴다.
  // 감싸는 div는 단계마다 key가 달라 새로 만들어진다 — 같은 div에 focus()를 다시 부르면 아무 일도 일어나지 않아
  // (로딩 때 이미 초점이 있다) 스크린리더가 결과가 떴다는 걸 듣지 못한다. 결과 맨 위(면책·병원 확인 카드)부터 읽힌다.
  useEffect(() => {
    if (!moveFocusRef.current) return;
    moveFocusRef.current = false;
    window.scrollTo({ top: 0 });
    contentRef.current?.focus({ preventScroll: true });
  }, [phase]);

  // 로딩이 8초를 넘으면 콜드스타트 안내(문구는 AnalyzeLoading이 그린다). 단계가 바뀌면 타이머를 버린다.
  const loading = phase.kind === "loading";
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setPhase(markWaking), COLD_START_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [loading]);

  async function handleSubmit(values: AnalyzeFormValues) {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    // saveAndAnalyze는 첫 await 전에 저장을 끝낸다 — 로딩 화면이 뜰 때 이미 저장돼 있다.
    const pending = saveAndAnalyze(values, {
      actions,
      readSaved: () => {
        const saved = store.getSnapshot().state;
        return { profile: saved.profile, maternity: saved.maternity };
      },
      fetchVideos,
      now: () => new Date(),
      signal: controller.signal,
      onVideoRetry: () => setPhase(markWaking),
    });
    moveFocusRef.current = true;
    setPhase({ kind: "loading", waking: false });
    const outcome = await pending;
    if (controller.signal.aborted) return;
    moveFocusRef.current = true;
    if (outcome.ok) {
      setPhase({ kind: "result", output: outcome.output });
    } else {
      formKeyRef.current += 1;
      setPhase({ kind: "form", formKey: formKeyRef.current, error: outcome.message });
    }
  }

  function handleRestart() {
    formKeyRef.current += 1;
    moveFocusRef.current = true;
    setPhase({ kind: "form", formKey: formKeyRef.current, error: null });
  }

  return (
    // 좌우 lg(24) — AnalyzeFlowView.swift:129-130 · AnalyzeResultView.swift:38-39
    <main className={cx("flex flex-1 flex-col gap-4 px-6 pt-2 pb-6", phase.kind === "result" ? PAGE_FRAME.wide : PAGE_FRAME.reading)}>
      <SubPageHeader
        title={ANALYZE_TEXT.title}
        // 안내문은 본문 크기 16(AnalyzeFlowView.swift:72-74) — SubPageHeader가 subtitleSize를 넘기지 않아 안쪽에서 키운다
        subtitle={phase.kind === "form" ? <span className="text-base">{ANALYZE_TEXT.intro}</span> : undefined}
      />
      <StorageWarning />
      {hydrated ? (
        <div
          key={analyzePhaseKey(phase)}
          ref={contentRef}
          tabIndex={-1}
          className="flex flex-1 flex-col outline-none"
        >
          {phase.kind === "form" ? (
            <AnalyzeForm
              key={phase.formKey}
              initial={formValuesFromSaved(state.profile, state.maternity)}
              error={phase.error}
              onSubmit={handleSubmit}
            />
          ) : phase.kind === "loading" ? (
            <AnalyzeLoading notice={phase.waking ? COLD_START_TEXT : null} />
          ) : (
            <AnalyzeResult
              model={analyzeResultModel(phase.output, isRedFlagActive(state.symptomHistory), { offline: !online })}
              onRestart={handleRestart}
            />
          )}
        </div>
      ) : null}
    </main>
  );
}
