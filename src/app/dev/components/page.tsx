import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Briefcase, House } from "lucide-react";
import {
  Card,
  ChipFlow,
  DisclaimerBanner,
  EmptyState,
  EvidenceChip,
  EvidenceChipList,
  MeasurementField,
  NrsSlider,
  PrimaryButton,
  RedFlagCard,
  ScreenHeader,
  SecondaryButton,
  SectionTitle,
  SelectableGroup,
  SelectableRow,
  StatusBadge,
  StepIndicator,
  Toggle,
} from "@/components/ui";

// 개발용 컴포넌트 카탈로그 — 공용 UI를 모든 상태로 한 화면에 늘어놓는다.
// 사용자 화면이 아니다. 라벨은 "예시 …"로만 쓰고, 실제 건강 정보처럼 보이는 값은 넣지 않는다(원칙 3).
// 서버 컴포넌트 — 조작이 필요한 컴포넌트는 비제어(default…) 모드로 둔다.

export const metadata: Metadata = {
  title: "컴포넌트 카탈로그 (개발용)",
};

function Section({ name, source, children }: { name: string; source: string; children: ReactNode }) {
  const headingId = `sec-${name.replace(/[^A-Za-z]+/g, "-").toLowerCase()}`;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div>
        <h2 id={headingId} className="text-lg font-bold text-text-primary">
          {name}
        </h2>
        <p className="text-xs text-text-subtle">
          <code>{source}</code>
        </p>
      </div>
      {children}
    </section>
  );
}

function State({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-text-subtle">{label}</p>
      {children}
    </div>
  );
}

export default function ComponentCatalogPage() {
  return (
    <main className="flex flex-1 flex-col gap-10 px-5 py-6">
      <p className="rounded-chip border border-dashed border-text-subtle/40 bg-surface p-3 text-[0.8125rem] text-text-secondary">
        개발용 카탈로그예요. 모든 라벨은 예시이고 실제 기록·판정이 아니에요.
      </p>

      <Section name="ScreenHeader" source="RecordFlowView.swift:146-158">
        <State label="부제 caption">
          <ScreenHeader title="예시 화면 제목" subtitle="예시 부제" />
        </State>
        <State label="부제 body">
          <ScreenHeader title="예시 화면 제목" subtitle="예시 안내 문장" subtitleSize="body" />
        </State>
        <State label="부제 없음 + action">
          <ScreenHeader title="예시 화면 제목" action={<span className="text-[0.8125rem] text-primary">예시 버튼</span>} />
        </State>
      </Section>

      <Section name="Card · SectionTitle" source="Components.swift:88-113">
        <Card className="flex flex-col gap-2">
          <SectionTitle>예시 소제목</SectionTitle>
          <p className="text-base text-text-primary">예시 본문</p>
        </Card>
      </Section>

      <Section name="PrimaryButton · SecondaryButton" source="Components.swift:3-41">
        <State label="Primary 활성">
          <PrimaryButton>예시 버튼</PrimaryButton>
        </State>
        <State label="Primary 비활성">
          <PrimaryButton disabled>예시 버튼</PrimaryButton>
        </State>
        <State label="Secondary">
          <SecondaryButton>예시 버튼</SecondaryButton>
        </State>
      </Section>

      <Section name="SelectableRow · SelectableGroup" source="Components.swift:43-86">
        <SelectableGroup label="예시 선택 묶음">
          <SelectableRow icon={House} title="예시 선택지 (선택됨)" name="catalog-select" value="a" defaultChecked />
          <SelectableRow icon={Briefcase} title="예시 선택지" subtitle="예시 부제" name="catalog-select" value="b" />
          <SelectableRow icon={House} title="예시 선택지 (비활성)" name="catalog-select" value="c" disabled />
        </SelectableGroup>
      </Section>

      <Section name="Toggle" source="RecordFlowView.swift:168-199, :246-254">
        <Card className="flex flex-col gap-2">
          <Toggle label="예시 토글 (꺼짐)" />
          <hr className="border-divider" />
          <Toggle label="예시 토글 (켜짐)" defaultChecked />
          <hr className="border-divider" />
          <Toggle
            label={<span className="font-semibold">예시 토글 + 설명</span>}
            description="예시 설명"
          />
          <hr className="border-divider" />
          <Toggle label="예시 위험 토글 (alert, 켜짐)" variant="alert" defaultChecked />
          <hr className="border-divider" />
          <Toggle label="예시 토글 (비활성)" disabled />
        </Card>
      </Section>

      <Section name="NrsSlider" source="RecordFlowView.swift:202-215">
        <Card className="flex flex-col gap-4">
          <NrsSlider label="예시 슬라이더 (0)" />
          <NrsSlider label="예시 슬라이더 (5)" defaultValue={5} />
          <NrsSlider label="예시 슬라이더 (비활성)" defaultValue={10} disabled />
        </Card>
      </Section>

      <Section name="MeasurementField" source="Components.swift:115-143">
        <Card className="flex flex-col">
          <MeasurementField label="예시 입력 (0 → placeholder)" />
          <hr className="border-divider" />
          <MeasurementField label="예시 입력 (값 있음)" defaultValue={12.5} />
        </Card>
      </Section>

      <Section name="StatusBadge" source="HomeView.swift:482-497, ExerciseView.swift:197-214">
        <State label="metric (12%) — 기본 라벨">
          <div className="flex flex-wrap gap-2">
            <StatusBadge status="normal" />
            <StatusBadge status="watch" />
            <StatusBadge status="alert" />
          </div>
        </State>
        <State label="exercise (15%) — 라벨 지정">
          <div className="flex flex-wrap gap-2">
            <StatusBadge status="normal" variant="exercise" label="예시 라벨" />
            <StatusBadge status="watch" variant="exercise" label="예시 라벨" />
            <StatusBadge status="alert" variant="exercise" label="예시 라벨" />
          </div>
        </State>
      </Section>

      <Section name="EvidenceChip · ChipFlow" source="AnalyzeComponents.swift:42-113">
        <State label="근거 설명 칩 / 출처(src:) 칩">
          <ChipFlow>
            <EvidenceChip token="예시 근거" />
            <EvidenceChip token="src:예시 출처" />
          </ChipFlow>
        </State>
        <State label="줄바꿈 (EvidenceChipList)">
          <EvidenceChipList
            tokens={["예시 근거 1", "src:예시 출처 1", "예시 근거 2", "src:예시 출처 2", "예시 근거 3", "src:예시 출처 3"]}
          />
        </State>
        <State label="inverse (빨간 카드 위)">
          <div className="rounded-card bg-state-alert p-4">
            <EvidenceChipList tokens={["예시 근거", "src:예시 출처"]} tone="inverse" />
          </div>
        </State>
      </Section>

      <Section name="DisclaimerBanner" source="AnalyzeComponents.swift:117-138">
        <Card>
          <DisclaimerBanner />
        </Card>
      </Section>

      <Section name="RedFlagCard" source="AnalyzeResultView.swift:202-239">
        <State label="severity immediate">
          <RedFlagCard severity="immediate" message="예시 문구 — 실제 판정이 아니에요" chips={["예시 근거", "src:예시 출처"]} />
        </State>
        <State label="severity urgent, 칩 없음">
          <RedFlagCard severity="urgent" message="예시 문구 — 실제 판정이 아니에요" />
        </State>
      </Section>

      <Section name="StepIndicator" source="OnboardingFlowView.swift:85-97">
        <State label="1/4">
          <StepIndicator current={0} total={4} label="예시 단계" />
        </State>
        <State label="3/4">
          <StepIndicator current={2} total={4} label="예시 단계" />
        </State>
      </Section>

      <Section name="EmptyState" source="CommunityView.swift:69-75, ExerciseView.swift:59-62">
        <State label="card">
          <EmptyState message="예시 빈 상태 문장" />
        </State>
        <State label="plain + 행동">
          <EmptyState message="예시 빈 상태 문장" variant="plain">
            <SecondaryButton>예시 버튼</SecondaryButton>
          </EmptyState>
        </State>
      </Section>
    </main>
  );
}
