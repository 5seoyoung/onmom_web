// 홈 카드들 — HomeView.swift의 각 카드를 옮긴 표시 전용 컴포넌트. 무엇을 그릴지는 homeViewModel이 정한다.
// 크기·간격은 Swift 값(pt)을 rem으로(16pt = 1rem). 아이콘은 장식이라 aria-hidden, 뜻은 글자로 전한다.

import Link from "next/link";
import type { Ref } from "react";
import {
  BadgeCheck,
  ChevronRight,
  CirclePlus,
  Eye,
  Footprints,
  Heart,
  MessageCircle,
  Phone,
  ScanText,
  SquarePen,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { Card, EvidenceChipList, StatusBadge, cx } from "@/components/ui";
import type { HomeStageCard } from "@/rules/exercise";
import type { RecoveryMetric } from "@/rules/redflag";
import type { WeightPlan } from "@/rules/weight";
import {
  HOME_CHAT_HREF,
  HOME_TEXT,
  MOOD_CALLS,
  RECOVERY_STEPS,
  telHref,
  type RecoveryStateCard as RecoveryStateCardModel,
  type StateTone,
} from "./homeViewModel";
import { ROUTES } from "@/routes";

// Tailwind가 클래스를 찾을 수 있게 조합을 전부 적어 둔다.
const TONE_CIRCLE: Record<StateTone, string> = {
  normal: "bg-state-normal/12",
  watch: "bg-state-watch/12",
  alert: "bg-state-alert/12",
};
// SF Symbol .fill 아이콘처럼: 면은 상태색, 선(체크·느낌표)은 흰색
const TONE_ICON: Record<StateTone, string> = {
  normal: "fill-state-normal text-white",
  watch: "fill-state-watch text-white",
  alert: "fill-state-alert text-white",
};
const TONE_BAR: Record<StateTone, string> = {
  normal: "bg-state-normal",
  watch: "bg-state-watch",
  alert: "bg-state-alert",
};
const STATE_ICON: Record<StateTone, LucideIcon> = {
  normal: BadgeCheck, // checkmark.seal.fill
  watch: Eye, // eye.fill
  alert: TriangleAlert, // exclamationmark.triangle.fill
};

/** 카드 전체가 링크인 경우(기록 유도·회복 단계 분석) — 포커스 링이 카드 모양을 따르게 라운드를 맞춘다. */
const cardLinkClass = "block rounded-card";

/**
 * exclamationmark.octagon.fill — lucide OctagonAlert는 팔각형을 느낌표 뒤에 그려서, 면을 채우면 느낌표가 가려진다.
 * 같은 팔각형 경로를 채우고 그 위에 흰 느낌표를 그린다.
 */
function FilledOctagonAlert({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false" className={className}>
      <path
        className="fill-state-alert"
        d="M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z"
      />
      <path d="M12 7.5v5M12 16.5h.01" fill="none" stroke="white" strokeWidth={2.5} strokeLinecap="round" />
    </svg>
  );
}

function Chevron() {
  return <ChevronRight aria-hidden className="size-4 shrink-0 text-text-subtle" strokeWidth={2.5} />;
}

// MARK: 상단 바 (HomeView.swift:61-79)
// 음성 입력은 웹에서 만들지 않는다(D3) — 마이크 없이 "AI 상담"(글로 묻는 상담) 화면을 연다(CPO 결정 2026-09-27).
export function HomeTopBar() {
  return (
    // PC: 위 여백 없이(py-0) — [AI 상담] 줄이 사이드바 로고 줄·다른 화면의 [뒤로] 줄과 같은 높이에 온다(pageFrame)
    <header className="flex items-center justify-between gap-2 py-1 lg:justify-end lg:py-0">
      {/* "온맘"을 누르면 소개 페이지로. PC는 사이드 메뉴에 로고가 있어 글자를 숨기고 제목만 스크린 리더에 남긴다. */}
      <h1 className="text-[1.375rem] font-bold text-primary lg:hidden">
        <Link href={ROUTES.landing} className="-mx-1 inline-flex min-h-11 items-center rounded-button px-1">
          {HOME_TEXT.brand}
        </Link>
      </h1>
      <h1 className="hidden lg:block lg:sr-only">{HOME_TEXT.brand}</h1>
      <Link
        href={HOME_CHAT_HREF}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-coral-tint px-3 text-[0.8125rem] font-semibold text-primary-text"
      >
        <MessageCircle aria-hidden className="size-3.5 shrink-0" strokeWidth={2.5} />
        {HOME_TEXT.askButton}
      </Link>
    </header>
  );
}

// MARK: 히어로 — 산후 일차 (HomeView.swift:82-118)
export function HeroCard({ dayCount, chips }: { dayCount: number | null; chips: readonly string[] }) {
  return (
    <Card as="section" aria-labelledby="home-hero-title" className="flex items-center gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <h2 id="home-hero-title" className="text-sm font-medium text-text-subtle-aa">
          {HOME_TEXT.heroTitle}
        </h2>
        {dayCount !== null ? (
          <p className="flex items-baseline gap-0.75 text-text-primary">
            <span className="text-[2.5rem] font-bold leading-none">{dayCount}</span>
            <span className="text-xl font-semibold">{HOME_TEXT.dayUnit}</span>
          </p>
        ) : null}
        {/* Swift는 가로 스크롤 한 줄 — 웹은 글씨를 키웠을 때 잘리지 않게 줄바꿈한다.
            목록 이름은 스크린리더가 "분만 방식·목표, 목록 2개"처럼 칩이 무엇인지 먼저 알리게 한다. */}
        <ul aria-label={HOME_TEXT.heroChipsLabel} className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <li
              key={chip}
              className="whitespace-nowrap rounded-full bg-divider px-2.5 py-1.5 text-[0.8125rem] font-medium leading-tight text-text-secondary"
            >
              {chip}
            </li>
          ))}
        </ul>
      </div>
      <div aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-full bg-coral-tint">
        <Heart className="size-6 fill-primary text-primary" />
      </div>
    </Card>
  );
}

// MARK: 오늘의 회복 상태 (HomeView.swift:176-262)
export function RecoveryStateCard({ model }: { model: RecoveryStateCardModel }) {
  if (model.kind === "empty") {
    // 기록이 없으면 상태를 지어내지 않고 기록을 권한다 — 탭하면 기록 화면(iOS는 기록 시트)
    return (
      <Link href={ROUTES.record} className={cardLinkClass}>
        <Card className="flex items-center gap-4">
          <div aria-hidden className="flex size-13 shrink-0 items-center justify-center rounded-full bg-coral-tint">
            <SquarePen className="size-5.5 text-primary" strokeWidth={2.5} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.75">
            <p className="text-[0.8125rem] font-medium text-text-subtle-aa">{HOME_TEXT.emptyStateTitle}</p>
            <p className="text-xl font-bold leading-snug text-text-primary">{HOME_TEXT.emptyStateHeadline}</p>
            <p className="text-[0.8125rem] text-text-secondary">{HOME_TEXT.emptyStateBody}</p>
          </div>
          <Chevron />
        </Card>
      </Link>
    );
  }

  const Icon = STATE_ICON[model.tone];
  return (
    <Card as="section" aria-labelledby="home-state-title" className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <div aria-hidden className={cx("flex size-13 shrink-0 items-center justify-center rounded-full", TONE_CIRCLE[model.tone])}>
          <Icon className={cx("size-6", TONE_ICON[model.tone])} />
        </div>
        <div className="flex min-w-0 flex-col gap-0.75">
          <h2 id="home-state-title" className="text-[0.8125rem] font-medium text-text-subtle-aa">
            {model.title}
          </h2>
          <p className="text-[1.75rem] font-bold leading-tight text-text-primary">{model.label}</p>
        </div>
      </div>
      <p className="text-base text-text-secondary">{model.descriptor}</p>
      {/* 3단계 인디케이터 — 현재 상태만 색. 상태는 위 글자로 이미 전하므로 스크린리더에는 숨긴다. */}
      <div aria-hidden className="grid grid-cols-3 gap-1.5 pt-0.5">
        {RECOVERY_STEPS.map((step) => {
          const current = step.label === model.label;
          return (
            <div key={step.label} className="flex flex-col items-center gap-1.5">
              <span className={cx("h-1.25 w-full rounded-full", current ? TONE_BAR[model.tone] : "bg-divider")} />
              <span className={cx("text-[0.6875rem]", current ? "font-bold text-text-primary" : "font-medium text-text-subtle-aa")}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// MARK: 마음 연계 — 기분 살피기 신호가 쌓였을 때만 (HomeView.swift:268-321)
// 점수·등급·"우울"이라는 단어를 쓰지 않는다. 진단이 아니라 이야기 나눌 곳 안내다.
export function MoodSupportCard({ onSnooze }: { onSnooze: () => void }) {
  return (
    <Card as="section" aria-labelledby="home-mood-title" className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <Heart aria-hidden className="size-3.5 shrink-0 fill-primary text-primary" strokeWidth={2.5} />
        <h2 id="home-mood-title" className="text-[1.0625rem] font-bold text-text-primary">
          {HOME_TEXT.moodTitle}
        </h2>
      </div>
      <p className="text-[0.9375rem] text-text-secondary">{HOME_TEXT.moodBody}</p>
      <ul className="flex flex-col gap-2">
        {MOOD_CALLS.map((call) => (
          <li key={call.number}>
            <a href={telHref(call.number)} className="flex min-h-11 items-center gap-2 rounded-chip bg-coral-tint px-4 py-2">
              <Phone aria-hidden className="size-3.5 shrink-0 fill-primary text-primary" />
              <span className="min-w-0 flex-1 text-[0.9375rem] font-medium text-text-primary">{call.name}</span>
              <span className="shrink-0 whitespace-nowrap text-[0.9375rem] font-semibold text-primary-text">{call.number}</span>
            </a>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Link
          href={ROUTES.support}
          className="flex min-h-11 flex-1 items-center justify-center rounded-chip bg-background px-2 py-2.5 text-center text-[0.9375rem] font-semibold text-neutral"
        >
          {HOME_TEXT.moodSupport}
        </Link>
        <button
          type="button"
          onClick={onSnooze}
          className="flex min-h-11 flex-1 items-center justify-center rounded-chip px-2 py-2.5 text-center text-[0.9375rem] font-semibold text-text-subtle-aa"
        >
          {HOME_TEXT.moodLater}
        </button>
      </div>
      <p className="text-xs text-text-subtle-aa">{HOME_TEXT.moodDisclaimer}</p>
    </Card>
  );
}

// MARK: 회복 단계 분석 진입 (HomeView.swift:324-350)
export function AnalyzeEntryCard({ ref }: { ref?: Ref<HTMLAnchorElement> }) {
  return (
    <Link href={ROUTES.analyze} ref={ref} className={cardLinkClass}>
      <Card className="flex items-center gap-4">
        <div aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-coral-tint">
          <ScanText className="size-5 text-primary" strokeWidth={2.5} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.75">
          <p className="text-base font-semibold text-text-primary">{HOME_TEXT.analyzeTitle}</p>
          <p className="text-[0.8125rem] text-text-subtle-aa">{HOME_TEXT.analyzeSubtitle}</p>
        </div>
        <Chevron />
      </Card>
    </Link>
  );
}

// MARK: 회복 지표 — 최근 기록에서 파생 (HomeView.swift:352-381)
export function MetricsCard({
  items,
  relativeTime,
  recordDate,
}: {
  items: readonly RecoveryMetric[];
  relativeTime: string | null;
  recordDate: string;
}) {
  return (
    <Card as="section" aria-labelledby="home-metrics-title" className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-2">
        <h2 id="home-metrics-title" className="text-[0.9375rem] font-semibold text-text-subtle-aa">
          {HOME_TEXT.metricsTitle}
        </h2>
        {relativeTime ? (
          <time dateTime={recordDate} className="shrink-0 text-[0.8125rem] text-text-subtle-aa">
            {relativeTime}
          </time>
        ) : null}
      </div>
      <ul className="flex flex-col gap-3.5">
        {items.map((m) => (
          <li key={m.name} className="flex items-center justify-between gap-2">
            <span className="min-w-0 text-base text-text-primary">{m.name}</span>
            <StatusBadge status={m.status} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

// MARK: 지금 회복 단계 — 레드플래그면 운동 안내 중단 (HomeView.swift:384-438)
export function StageCard({ card }: { card: HomeStageCard }) {
  if (card.kind === "redFlag") {
    return (
      <Card as="section" aria-labelledby="home-stage-title" className="flex items-start gap-4">
        <FilledOctagonAlert className="mt-0.5 size-5 shrink-0" />
        <div className="flex min-w-0 flex-col gap-0.75">
          <h2 id="home-stage-title" className="text-base font-semibold text-text-primary">
            {card.title}
          </h2>
          <p className="text-[0.8125rem] text-text-secondary">{card.body}</p>
        </div>
      </Card>
    );
  }
  return (
    <Card as="section" aria-labelledby="home-stage-title" className="flex flex-col gap-1">
      <h2 id="home-stage-title" className="text-[0.8125rem] font-medium text-text-subtle-aa">
        {card.heading}
      </h2>
      <p className="text-base text-text-primary">{card.current}</p>
      {card.next ? <p className="text-[0.8125rem] text-text-secondary">{card.next}</p> : null}
      {card.excluded.map((line) => (
        <p key={line} className="text-[0.8125rem] text-state-watch-text">
          {line}
        </p>
      ))}
    </Card>
  );
}

// MARK: 체중 관리 목표 — 키·현재 체중 입력 시에만 (HomeView.swift:441-461)
export function WeightPlanCard({ plan }: { plan: WeightPlan }) {
  return (
    <Card as="section" aria-labelledby="home-weight-title" className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <Footprints aria-hidden className="size-3.5 shrink-0 text-primary" strokeWidth={2.5} />
        <h2 id="home-weight-title" className="text-[0.8125rem] font-medium text-text-subtle-aa">
          {plan.title}
        </h2>
      </div>
      <p className="text-base text-text-primary">{plan.detail}</p>
      <EvidenceChipList tokens={plan.chips} />
    </Card>
  );
}

// MARK: 이상 증상 빠른 기록 (HomeView.swift:464-478) — iOS 기록 시트 대신 기록 탭으로
export function QuickRecordButton() {
  return (
    <Link
      href={ROUTES.record}
      className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-button bg-coral-tint px-4 py-4 text-base font-semibold text-primary-text"
    >
      <CirclePlus aria-hidden className="size-5 shrink-0 fill-primary text-coral-tint" />
      {HOME_TEXT.quickRecord}
    </Link>
  );
}

// MARK: 푸터 면책 (HomeView.swift:27-31)
export function HomeFooter() {
  return <p className="pt-1 text-[0.8125rem] text-text-subtle-aa">{HOME_TEXT.footer}</p>;
}
