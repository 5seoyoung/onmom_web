"use client";

// 설정 → 프로필 편집 — iOS ProfileEditView(MoreView.swift:146-280).
// 카드 3장: 기본 정보(출산일 · 분만 방식 · 목표(+복직 예정일) · 내 동네 · 모유수유) → 체중(선택) → 재활 고려사항 7토글.
// 저장된 값으로 시작하고, [저장] 때 프로필·산모수첩을 한 번에 바꾼 뒤 설정으로 돌아간다. [취소]는 버리고 돌아간다.
// 저장은 [저장] 버튼으로만 한다 — iOS는 툴바 [저장]만 저장하고 TextField의 Return은 아무것도 하지 않는다(MoreView.swift:176-181).
// 그래서 폼에 제출 버튼을 두지 않는다: 입력 칸이 여럿이라 Enter·모바일 완료 키의 암묵적 제출이 일어나지 않는다(HTML 규칙).
// 돌아가기는 시트를 닫듯 — 앱 안에서 왔으면 뒤로(설정이 방문 기록에 두 번 쌓이지 않게), 주소로 바로 왔으면 설정으로 replace.
// 출산일은 비울 수 없고 오늘보다 뒤일 수 없다 — 네이티브 입력 검증(required·max)을 [저장] 때 직접 불러 알린다(D11·D12).
// PC(넓은 화면, 컨테이너 쿼리 48rem 이상): 왼쪽 기본 정보, 오른쪽 체중·재활 고려사항, [저장]은 오른쪽 아래.
// 폰 기둥(최대 30rem)에서는 카드 3장 + [저장]이 한 줄로 쌓인다(iOS 순서 그대로 — 읽는 순서·탭 순서도 같다).

import { useId, useRef, useState } from "react";
import { PAGE_FRAME } from "@/components/shell/pageFrame";
import { Card, MeasurementField, PrimaryButton, SectionTitle, Toggle, cx } from "@/components/ui";
import { toLocalDateString } from "@/domain/date";
import type { MaternityRecord } from "@/domain/types";
import { useAppStore } from "@/store/useAppStore";
import { DELIVERY_TITLE } from "@/rules/exercise";
import { GOAL_TITLE } from "@/features/profile/profileView";
import { useNowMs } from "@/features/profile/useNow";
import { LeaveSubPageHeader, useLeaveSubPage, type SubPageExit } from "@/features/profile/LeaveSubPage";
import {
  DELIVERY_OPTIONS,
  GOAL_OPTIONS,
  MATERNITY_TOGGLES,
  PROFILE_EDIT_TEXT,
  SETTINGS_HREF,
  draftFromState,
  draftProblem,
  draftToPatches,
  showsReturnToWork,
  type ProfileDraft,
} from "./settingsView";

export function ProfileEditScreen() {
  const { hydrated, isSignedIn, state } = useAppStore();
  const nowMs = useNowMs();
  const exit = useLeaveSubPage(SETTINGS_HREF);

  return (
    // VStack(spacing: md) · 좌우 lg · 위 md — MoreView.swift:160-168
    // PC 틀은 pageFrame(격자 화면 — 두 열 폼). 더 깊은 화면이라 PC에서도 [취소]가 맨 위 줄에 있다.
    <main className={cx("@container flex flex-1 flex-col gap-4 px-6 pt-2 pb-10", PAGE_FRAME.wide)}>
      <LeaveSubPageHeader
        title={PROFILE_EDIT_TEXT.title}
        backHref={SETTINGS_HREF}
        backLabel={PROFILE_EDIT_TEXT.cancel}
        onLeave={exit.leave}
      />
      {hydrated && isSignedIn && nowMs !== null ? (
        // 한 번만 저장값을 읽어 초안으로 — 편집 중에는 초안만 바뀐다(MoreView.swift:184-189)
        <ProfileEditForm
          initial={draftFromState(state.profile, state.maternity)}
          today={toLocalDateString(new Date(nowMs))}
          exit={exit}
        />
      ) : null}
    </main>
  );
}

function ProfileEditForm({ initial, today, exit }: { initial: ProfileDraft; today: string; exit: SubPageExit }) {
  const { actions } = useAppStore();
  const formRef = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState(initial);
  const ids = {
    deliveryDate: useId(),
    returnToWork: useId(),
    returnToWorkHint: useId(),
    neighborhood: useId(),
    deliveryName: useId(),
    goalName: useId(),
  };

  function set<K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }
  function setFlag(key: keyof MaternityRecord, value: boolean) {
    setDraft((d) => ({ ...d, maternity: { ...d.maternity, [key]: value } }));
  }

  function handleSave() {
    // [취소]·[저장]을 이미 눌러 떠나는 중이면 다시 저장하지 않는다
    if (exit.isLeaving()) return;
    // 네이티브 검증(출산일 required·max)을 먼저 알리고, 저장 직전에 한 번 더 확인한다
    const form = formRef.current;
    if (form && !form.reportValidity()) return;
    if (draftProblem(draft, today)) return;
    const { profile, maternity } = draftToPatches(draft);
    actions.updateProfile(profile);
    actions.updateMaternity(maternity);
    exit.leave();
  }

  return (
    // 제출은 막아 둔다(암묵적 제출이 어떤 경로로든 오면 무시) — 저장은 아래 [저장] 버튼의 onClick만
    // 넓은 화면: 2열 — 기본 정보가 두 줄에 걸치고, 오른쪽 둘째 줄(1fr)이 남는 높이를 받아 카드 사이가 벌어지지 않는다
    <form
      ref={formRef}
      onSubmit={(e) => e.preventDefault()}
      noValidate
      className="flex flex-col gap-4 @3xl:grid @3xl:grid-cols-2 @3xl:grid-rows-[auto_1fr_auto] @3xl:items-start @3xl:gap-x-6"
    >
      {/* 기본 정보 — 간격 md (MoreView.swift:194-235) */}
      <Card as="section" aria-labelledby="edit-basics" className="flex flex-col gap-4 @3xl:row-span-2">
        <SectionTitle id="edit-basics">{PROFILE_EDIT_TEXT.basics}</SectionTitle>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <label htmlFor={ids.deliveryDate} className="text-base text-text-primary">
            {PROFILE_EDIT_TEXT.deliveryDate}
          </label>
          <input
            id={ids.deliveryDate}
            type="date"
            required
            max={today}
            value={draft.deliveryDate}
            onChange={(e) => set("deliveryDate", e.target.value)}
            className="min-h-11 rounded-button bg-background px-3 text-base text-text-primary"
          />
        </div>

        <SegmentedChoice
          legend={PROFILE_EDIT_TEXT.deliveryMethod}
          name={ids.deliveryName}
          options={DELIVERY_OPTIONS.map((v) => ({ value: v, label: DELIVERY_TITLE[v] }))}
          value={draft.deliveryMethod}
          onChange={(v) => set("deliveryMethod", v)}
        />

        <SegmentedChoice
          legend={PROFILE_EDIT_TEXT.goal}
          name={ids.goalName}
          options={GOAL_OPTIONS.map((v) => ({ value: v, label: GOAL_TITLE[v] }))}
          value={draft.goal}
          onChange={(v) => set("goal", v)}
        />

        {showsReturnToWork(draft.goal) ? (
          // 복직 예정일 (선택) — 온보딩 2단계와 같은 문구(OnboardingFlowView.swift:226-252). 비우면 저장하지 않는다.
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <label htmlFor={ids.returnToWork} className="text-sm font-medium text-text-secondary">
                {PROFILE_EDIT_TEXT.returnToWork}
              </label>
              <p id={ids.returnToWorkHint} className="text-[0.8125rem] text-text-secondary">
                {draft.returnToWorkDate === ""
                  ? PROFILE_EDIT_TEXT.returnToWorkHintEmpty
                  : PROFILE_EDIT_TEXT.returnToWorkHintSet}
              </p>
            </div>
            <input
              id={ids.returnToWork}
              type="date"
              aria-describedby={ids.returnToWorkHint}
              value={draft.returnToWorkDate}
              onChange={(e) => set("returnToWorkDate", e.target.value)}
              className="min-h-11 rounded-button bg-background px-3 text-base text-text-primary"
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.neighborhood} className="text-base text-text-secondary">
            {PROFILE_EDIT_TEXT.neighborhood}
          </label>
          <input
            id={ids.neighborhood}
            type="text"
            value={draft.neighborhood}
            onChange={(e) => set("neighborhood", e.target.value)}
            placeholder={PROFILE_EDIT_TEXT.neighborhoodPlaceholder}
            autoComplete="off"
            className="min-h-11 w-full rounded-button bg-background px-4 py-2.5 text-base text-text-primary placeholder:text-text-subtle"
          />
        </div>

        <Toggle
          label={<span className="font-semibold">{PROFILE_EDIT_TEXT.breastfeeding}</span>}
          checked={draft.isBreastfeeding}
          onCheckedChange={(v) => set("isBreastfeeding", v)}
        />
      </Card>

      {/* 체중 (선택) — 간격 sm, 필드 사이 구분선 (MoreView.swift:238-252) */}
      <Card as="section" aria-labelledby="edit-weight" className="flex flex-col gap-2">
        <SectionTitle id="edit-weight">{PROFILE_EDIT_TEXT.weight}</SectionTitle>
        <p className="text-[0.8125rem] text-text-secondary">{PROFILE_EDIT_TEXT.weightHelp}</p>
        <MeasurementField
          label={PROFILE_EDIT_TEXT.height}
          value={draft.heightCm}
          onValueChange={(v) => set("heightCm", v)}
        />
        <hr className="border-divider" />
        <MeasurementField
          label={PROFILE_EDIT_TEXT.currentWeight}
          value={draft.currentWeightKg}
          onValueChange={(v) => set("currentWeightKg", v)}
        />
        <hr className="border-divider" />
        <MeasurementField
          label={PROFILE_EDIT_TEXT.preWeight}
          value={draft.prePregnancyWeightKg}
          onValueChange={(v) => set("prePregnancyWeightKg", v)}
        />
      </Card>

      {/* 재활 고려사항 — 토글 라벨 15 medium (MoreView.swift:255-277) */}
      <Card as="section" aria-labelledby="edit-maternity" className="flex flex-col gap-2">
        <SectionTitle id="edit-maternity">{PROFILE_EDIT_TEXT.maternity}</SectionTitle>
        <p className="text-[0.8125rem] text-text-secondary">{PROFILE_EDIT_TEXT.maternityHelp}</p>
        {MATERNITY_TOGGLES.map(({ key, label }) => (
          <Toggle
            key={key}
            label={<span className="text-[0.9375rem] font-medium">{label}</span>}
            checked={draft.maternity[key]}
            onCheckedChange={(v) => setFlag(key, v)}
          />
        ))}
      </Card>

      {/* iOS는 내비게이션 막대의 [저장]. 웹은 긴 폼 끝에 둔다(위로 다시 올라가지 않게). */}
      <PrimaryButton type="button" onClick={handleSave} className="@3xl:col-start-2">
        {PROFILE_EDIT_TEXT.save}
      </PrimaryButton>
    </form>
  );
}

interface SegmentedChoiceProps<T extends string> {
  legend: string;
  name: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  /** null이면 아무것도 고르지 않은 상태(저장된 값이 없음) — 기본값을 골라 두지 않는다 */
  value: T | null;
  onChange: (value: T) => void;
}

// iOS Picker(.segmented) — 라벨 16 textSecondary 위, 회색 트랙 안의 흰 선택 칸(MoreView.swift:202-221).
// 실제 라디오 입력이라 스크린리더·키보드(화살표)가 선택 상태를 안다. 선택 칸은 배경·그림자·굵기로 함께 구분한다.
function SegmentedChoice<T extends string>({ legend, name, options, value, onChange }: SegmentedChoiceProps<T>) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-base text-text-secondary">{legend}</legend>
      <div className="grid grid-cols-2 gap-0.5 rounded-[0.5625rem] bg-divider p-0.5 forced-colors:border forced-colors:border-[CanvasText]">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex min-h-11 cursor-pointer items-center justify-center rounded-[0.4375rem] px-2 text-center text-[0.8125rem] font-medium text-text-primary has-checked:bg-surface has-checked:font-semibold has-checked:shadow-[0_0.1875rem_0.5rem_rgb(0_0_0/0.12)] has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-primary forced-colors:has-checked:outline-2 forced-colors:has-checked:outline-[Highlight]"
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
