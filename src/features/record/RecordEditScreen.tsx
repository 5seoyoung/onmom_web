"use client";

// 증상 기록 수정 — 전체 기록 > [수정](/record/edit/?id=…). 웹 전용(LAUNCH_CHECKLIST 7-4).
// 그 기록의 답을 기록 탭과 같은 폼 카드(SymptomFormCards — 내 동네 칸은 뺀다, 프로필 값이라)로 보이고, [저장]을 누르면 고친 답으로
// 지금 규칙을 다시 돌린다(rules/record rebuildSymptomRecord — 기록 시각·산후 일수는 그대로, 결과·규칙 버전은 새로). 바뀐 것이 없으면 [저장]을 잠근다.
// 저장한 뒤에는 기록 탭의 결과와 같은 안내(RecordResult — 119·위기 상담·즉시 내원, 가까운 산부인과, "바로 병원에 가야 하는 신호" 목록)를 보인다 —
// 고친 기록이 가장 최근 기록이면 홈·운동 탭도 그 결과를 본다. 결과로 포커스를 옮긴다.
// 주소: 정적 export라 쿼리로 id를 넘긴다(useSearchParams는 Suspense 안에서만 — 머리는 정적 HTML에 들어간다).
// 기록이 없으면(다른 탭·기기에서 지움, 주소가 틀림) "삭제된 기록이에요."

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PAGE_FRAME } from "@/components/shell/pageFrame";
import { PrimaryButton, SecondaryButton, cx } from "@/components/ui";
import type { SymptomRecord } from "@/domain/types";
import { StorageWarning } from "@/features/home/StorageWarning";
import { LeaveSubPageHeader, useLeaveSubPage, type SubPageExit } from "@/features/profile/LeaveSubPage";
import { rebuildSymptomRecord, type SymptomForm } from "@/rules/record";
import { ROUTES } from "@/routes";
import { useAppStore } from "@/store/useAppStore";
import { useDraftField } from "@/store/useDraftField";
import { RecordResult } from "./RecordResult";
import { RECORD_HISTORY_TEXT, recordEditModel, recordedAtLine, sameSymptomForm } from "./recordHistoryView";
import { resultCards } from "./recordView";
import { SymptomFormCards } from "./SymptomFormCards";

export function RecordEditScreen() {
  const exit = useLeaveSubPage(ROUTES.recordHistory);
  return (
    // PC 틀은 pageFrame(읽기 화면). 더 깊은 화면이라 PC에서도 [취소]가 맨 위 줄에 있다.
    <main className={cx("flex flex-1 flex-col gap-4 px-6 pt-2 pb-6", PAGE_FRAME.reading)}>
      <LeaveSubPageHeader
        title={RECORD_HISTORY_TEXT.editTitle}
        backHref={ROUTES.recordHistory}
        backLabel={RECORD_HISTORY_TEXT.cancel}
        onLeave={exit.leave}
      />
      <StorageWarning />
      <Suspense fallback={null}>
        <EditFromQuery exit={exit} />
      </Suspense>
    </main>
  );
}

function EditFromQuery({ exit }: { exit: SubPageExit }) {
  const id = useSearchParams().get("id");
  const { hydrated, state } = useAppStore();
  // 저장한 뒤의 결과 — 그사이 다른 탭이 기록을 지워도 방금 본 안내는 그대로 둔다
  const [saved, setSaved] = useState<ReturnType<typeof rebuildSymptomRecord> | null>(null);
  if (!hydrated) return null;
  if (saved !== null) return <SavedResult result={saved.result} onBack={exit.leave} />;

  const record = id ? state.symptomHistory.find((r) => r.id === id) : undefined;
  if (record === undefined) {
    return <p className="p-8 text-base text-text-secondary">{RECORD_HISTORY_TEXT.editMissing}</p>;
  }
  // 기록이 바뀌면(다른 기록으로 이동) 폼을 새로 시작한다
  return <EditForm key={record.id} record={record} onSaved={setSaved} />;
}

function EditForm({ record, onSaved }: { record: SymptomRecord; onSaved: (r: ReturnType<typeof rebuildSymptomRecord>) => void }) {
  const { actions } = useAppStore();
  const model = recordEditModel(record);
  const [form, setForm] = useState<SymptomForm>(model.initialForm);
  const changed = !sameSymptomForm(form, model.initialForm);

  function save() {
    if (!changed) return;
    const rebuilt = rebuildSymptomRecord(record, form);
    actions.updateSymptomRecord(record.id, rebuilt.values);
    onSaved(rebuilt);
    requestAnimationFrame(() => window.scrollTo({ top: 0 }));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-[0.9375rem] font-semibold text-text-primary">
          <time dateTime={model.iso}>{recordedAtLine(model.dateText)}</time>
        </p>
        <p className="text-[0.8125rem] text-text-secondary">{RECORD_HISTORY_TEXT.editNote}</p>
      </div>
      <SymptomFormCards
        form={form}
        onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
        showsLochia={model.showsLochia}
        showsNeighborhood={false}
      />
      <PrimaryButton onClick={save} disabled={!changed}>
        {RECORD_HISTORY_TEXT.save}
      </PrimaryButton>
    </div>
  );
}

function SavedResult({ result, onBack }: { result: ReturnType<typeof rebuildSymptomRecord>["result"]; onBack: () => void }) {
  const { state, actions } = useAppStore();
  const ref = useRef<HTMLDivElement>(null);
  // 결과의 가까운 산부인과는 기록 탭과 같은 프로필의 내 동네(입력이 멈추면 저장 — store/useDraftField)
  const neighborhood = useDraftField(state.profile.neighborhood, (value) => actions.updateProfile({ neighborhood: value }));
  // 기록 탭의 결과와 같은 고르기(recordView resultCards·recordLayout) — 병원 신호가 있을 때만 가까운 산부인과
  const cards = resultCards(result);
  const showsClinics = cards.some((c) => c.severity !== "crisis");
  // 누른 [저장]이 사라졌으니 결과로 초점을 옮긴다(처음 그릴 때 한 번)
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="flex flex-col gap-4 focus:outline-none"
      onBlur={neighborhood.flush}
    >
      <p role="status" className="text-[0.9375rem] font-semibold text-text-primary">
        {RECORD_HISTORY_TEXT.editSaved}
      </p>
      <RecordResult cards={cards} showsClinics={showsClinics} neighborhood={neighborhood.value} onNeighborhoodChange={neighborhood.change} />
      <SecondaryButton onClick={onBack}>{RECORD_HISTORY_TEXT.backToHistory}</SecondaryButton>
    </div>
  );
}
