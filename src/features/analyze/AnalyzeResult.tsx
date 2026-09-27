// 분석 결과 — iOS AnalyzeResultView.swift. 무엇을 그릴지는 analyzeResultModel(analyzeModel.ts)이 정한다.

import Link from "next/link";
import { useId } from "react";
import { ChevronRight, CircleAlert, CircleCheck, CircleX, Hourglass } from "lucide-react";
import { EXTERNAL_LINK_PROPS } from "@/api/safeUrl";
import {
  Card,
  DisclaimerBanner,
  EvidenceChipList,
  RedFlagCard,
  SecondaryButton,
  SectionTitle,
  cx,
  primaryButtonClass,
} from "@/components/ui";
import { FilledOctagonAlert } from "@/features/exercise/FilledOctagonAlert";
import type { AnalysisTone } from "@/rules/recovery";
import type { AnalyzeResultModel, RecGroupModel, ResultVideos } from "./analyzeModel";

export interface AnalyzeResultProps {
  model: AnalyzeResultModel;
  onRestart: () => void;
}

export function AnalyzeResult({ model, onRestart }: AnalyzeResultProps) {
  return (
    // 항목 간격 md(16) — AnalyzeResultView.swift:17
    <div className="flex flex-col gap-4">
      <DisclaimerBanner />

      {model.hospitalSignal !== null ? (
        <RedFlagCard
          severity={model.hospitalSignal.severity}
          message={model.hospitalSignal.messagePatient}
          chips={model.hospitalSignal.evidenceChips}
        />
      ) : null}

      <ProfileCard profile={model.profile} />

      {model.blocks.map((block) =>
        block.kind === "group" ? (
          <RecGroup key={block.group.key} group={block.group} />
        ) : (
          <ExerciseStoppedCard key="exercise-stopped" title={block.title} body={block.body} />
        ),
      )}

      {model.videos !== null ? <VideoSection videos={model.videos} /> : null}

      {/* 하단 액션 — 위 sm(8), 간격 sm(8)(AnalyzeResultView.swift:191-197) */}
      <div className="flex flex-col gap-2 pt-2">
        <Link href="/" className={primaryButtonClass}>
          {model.done}
        </Link>
        <SecondaryButton onClick={onRestart}>{model.restart}</SecondaryButton>
      </div>
    </div>
  );
}

// MARK: - 프로필 요약 (AnalyzeResultView.swift:47-74)

function ProfileCard({ profile }: { profile: AnalyzeResultModel["profile"] }) {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-xl font-bold text-neutral">{profile.stage}</h2>
          <p className="text-[0.8125rem] text-text-secondary">{profile.subtitle}</p>
        </div>
        <span className="shrink-0 rounded-full bg-background px-2.5 py-1 text-xs font-semibold text-text-secondary">
          {profile.source}
        </span>
      </div>
      <hr className="border-divider" />
      <p className="text-[0.8125rem] text-text-secondary">{profile.note}</p>
    </Card>
  );
}

// MARK: - 가능 / 주의 / 금지 (AnalyzeResultView.swift:78-120)

// Tailwind가 클래스를 찾을 수 있게 조합을 전부 적어 둔다. 색만으로 구분하지 않도록 제목(가능/주의/금지)과 아이콘 모양도 다르다.
const TONE: Record<AnalysisTone, { Icon: typeof CircleCheck; icon: string; count: string; dot: string }> = {
  normal: { Icon: CircleCheck, icon: "fill-state-normal", count: "bg-state-normal/15 text-state-normal", dot: "bg-state-normal" },
  accent: { Icon: CircleAlert, icon: "fill-accent", count: "bg-accent/15 text-accent", dot: "bg-accent" },
  alert: { Icon: CircleX, icon: "fill-state-alert", count: "bg-state-alert/15 text-state-alert", dot: "bg-state-alert" },
};

function RecGroup({ group }: { group: RecGroupModel }) {
  const headingId = useId();
  const tone = TONE[group.tone];
  const last = group.items.length - 1;
  return (
    <Card as="section" aria-labelledby={headingId} className="flex flex-col gap-4">
      <h2 id={headingId} className="flex items-center gap-1.5">
        <tone.Icon aria-hidden className={cx("size-5 shrink-0 text-surface", tone.icon)} />
        <span className="text-base font-bold text-neutral">{group.title}</span>
        <span className={cx("rounded-full px-1.75 py-0.5 text-[0.8125rem] font-semibold", tone.count)}>{group.items.length}</span>
      </h2>
      <ul className="flex flex-col gap-4">
        {group.items.map((item, idx) => (
          <li key={item.item} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-2">
                <span aria-hidden className={cx("size-1.5 shrink-0 rounded-full", tone.dot)} />
                <span className="text-base font-semibold text-text-primary">{item.label}</span>
              </p>
              <EvidenceChipList tokens={item.evidenceChips} />
            </div>
            {idx !== last ? <hr className="border-divider" /> : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** 레드플래그 중 '가능' 자리 — 홈 "운동 안내를 멈췄어요" 카드 모양(HomeView.swift:386-400, D1) */
function ExerciseStoppedCard({ title, body }: { title: string; body: string }) {
  return (
    <Card className="flex items-start gap-4">
      <FilledOctagonAlert className="size-5" shapeClassName="fill-state-alert" markClassName="stroke-surface" />
      <div className="flex min-w-0 flex-col gap-0.75">
        <h2 className="text-base font-semibold text-text-primary">{title}</h2>
        <p className="text-[0.8125rem] text-text-secondary">{body}</p>
      </div>
    </Card>
  );
}

// MARK: - 추천 운동 영상 (AnalyzeResultView.swift:124-187)

function VideoSection({ videos }: { videos: ResultVideos }) {
  if (videos.kind === "info") {
    // 영상 자리의 상태 안내 — 실패를 빈 화면으로 숨기지 않는다
    return (
      <Card className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-[0.9375rem] font-semibold text-text-secondary">
          <Hourglass aria-hidden className="size-4.5 shrink-0" />
          {videos.title}
        </h2>
        <p className="text-[0.8125rem] text-text-secondary">{videos.body}</p>
      </Card>
    );
  }
  return (
    <Card as="section" className="flex flex-col gap-4">
      <SectionTitle>{videos.title}</SectionTitle>
      <ul className="flex flex-col gap-4">
        {videos.videos.map((v) => {
          const inner = (
            <>
              <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-[0.625rem] bg-secondary/25">
                <PlayMark />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[0.9375rem] font-semibold text-text-primary">{v.title}</span>
                <span className="text-[0.8125rem] text-text-secondary">{v.reason}</span>
              </span>
            </>
          );
          return (
            <li key={v.id}>
              {v.href !== null ? (
                <a href={v.href} {...EXTERNAL_LINK_PROPS} className="flex min-h-11 items-center gap-4 rounded-button">
                  {inner}
                  <ChevronRight aria-hidden className="size-5 shrink-0 text-divider" />
                </a>
              ) : (
                // 링크로 만들 수 없는 주소(허용되지 않은 호스트·http 등) — 정보만 보이고 누를 수 없다
                <div className="flex min-h-11 items-center gap-4">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** play.circle.fill — 코랄 원 + 흰 삼각형(24) */
function PlayMark() {
  return (
    <span className="flex size-6 items-center justify-center rounded-full bg-primary">
      <span className="ml-0.5 size-0 border-y-[0.375rem] border-l-[0.5625rem] border-y-transparent border-l-white" />
    </span>
  );
}
