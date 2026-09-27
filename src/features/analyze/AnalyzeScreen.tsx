"use client";

// 회복 단계 분석 — iOS AnalyzeFlowView.swift(폼 → 로딩 → 결과). 전체 화면 페이지, 뒤로 가기는 홈("/").
// [분석 시작]: 폼 값을 먼저 저장하고, 저장소에서 다시 읽은 값으로 분석한다(analyzeRun.ts, D10).
// 저장소를 읽기 전(hydrated=false)에는 제목·안내문만 그린다 — 기본값으로 채운 폼이 번쩍이지 않게.

import { useContext, useEffect, useRef, useState } from "react";
import { fetchVideos } from "@/api/video";
import { SubPageHeader } from "@/components/ui";
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
  | { kind: "loading" }
  | { kind: "result"; output: EngineOutput };

export function AnalyzeScreen() {
  const { hydrated, state, actions } = useAppStore();
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
    });
    moveFocusRef.current = true;
    setPhase({ kind: "loading" });
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
    <main className="flex flex-1 flex-col gap-4 px-6 pt-2 pb-6">
      <SubPageHeader
        title={ANALYZE_TEXT.title}
        // 안내문은 본문 크기 16(AnalyzeFlowView.swift:72-74) — SubPageHeader가 subtitleSize를 넘기지 않아 안쪽에서 키운다
        subtitle={phase.kind === "form" ? <span className="text-base">{ANALYZE_TEXT.intro}</span> : undefined}
      />
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
            <AnalyzeLoading />
          ) : (
            <AnalyzeResult
              model={analyzeResultModel(phase.output, isRedFlagActive(state.symptomHistory))}
              onRestart={handleRestart}
            />
          )}
        </div>
      ) : null}
    </main>
  );
}
