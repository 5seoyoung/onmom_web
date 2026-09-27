// 운동 탭 본문 조각 — 조회 상태별 블록과 영상 카드(ExerciseView.swift:50-257). 데이터는 exerciseModel이 만든다.
// PC(lg 이상): 영상 카드는 두 열 격자(같은 줄 카드는 높이를 맞추고 [영상 보기]를 아래에 붙인다),
// 안내 블록(레드플래그·영상 준비 중·연결 실패·프로필 필요)은 읽기 폭(READING_BLOCK — 읽기 화면의 글줄과 같은 45rem)에 둔다.
// 폰은 이전과 같다.

import { useId } from "react";
import { ChevronRight, Hourglass, LoaderCircle, PersonStanding, UserRoundSearch, WifiOff } from "lucide-react";
import { EXTERNAL_LINK_PROPS } from "@/api/safeUrl";
import { READING_BLOCK } from "@/components/shell/pageFrame";
import { Card, DisclaimerBanner, EmptyState, StatusBadge, cx } from "@/components/ui";
import { EXERCISE_TEXT } from "@/rules/exercise";
import type { ExerciseBody, VideoCardModel } from "./exerciseModel";
import { FilledOctagonAlert } from "./FilledOctagonAlert";

/** 안내 블록의 PC 최대 폭 — 한 줄이 너무 길어지지 않게(읽기 화면의 글줄과 같은 폭) */
const BLOCK_WIDTH = READING_BLOCK;

/**
 * 본문. 조회 상태 블록(불러오는 중·영상 준비 중·연결 실패·영상 없음)은 늘 있는 live region 안에서 바뀐다 —
 * 스피너가 결과로 바뀌거나 [다시 시도] 뒤 상태가 바뀌면 스크린리더가 듣게(iOS VoiceOver는 화면 변화를 알린다).
 * 영상 목록은 길어서 live region 밖에 그린다. 목록일 때 비는 live region은 empty:hidden으로 간격을 만들지 않는다.
 */
export function ExerciseBodyView({ body, onRetry }: { body: ExerciseBody; onRetry: () => void }) {
  return (
    <>
      <div aria-live="polite" className={cx("empty:hidden", BLOCK_WIDTH)}>
        {body.kind !== "plan" ? <StatusBlock body={body} onRetry={onRetry} /> : null}
      </div>
      {body.kind === "plan" ? (
        <>
          {body.sections.map((section) => (
            <PlanSection key={section.title} title={section.title} count={section.count} cards={section.cards} />
          ))}
          <DisclaimerBanner />
        </>
      ) : null}
    </>
  );
}

function StatusBlock({ body, onRetry }: { body: Exclude<ExerciseBody, { kind: "plan" }>; onRetry: () => void }) {
  switch (body.kind) {
    case "loading":
      return (
        <div role="status" className="flex justify-center py-8">
          <LoaderCircle aria-hidden className="size-7 animate-spin text-primary motion-reduce:animate-none" />
          <span className="sr-only">{body.srLabel}</span>
        </div>
      );
    case "unavailable":
      return (
        <Card className="flex flex-col gap-2">
          <IconLabel icon={Hourglass} className="text-text-secondary">
            {body.title}
          </IconLabel>
          <p className="text-base text-text-secondary">{body.message}</p>
          {body.stage !== null || body.excluded.length > 0 ? <hr className="border-divider" /> : null}
          {body.stage !== null ? (
            <>
              <p className="text-[0.9375rem] font-semibold text-text-primary">{body.stage.line}</p>
              <p className="text-[0.8125rem] text-text-secondary">{body.stage.summary}</p>
            </>
          ) : null}
          {body.excluded.map((line) => (
            <p key={line} className="text-[0.8125rem] text-state-watch">
              {line}
            </p>
          ))}
        </Card>
      );
    case "failed":
      return (
        <Card className="flex flex-col gap-2">
          <IconLabel icon={WifiOff} className="text-state-watch">
            {body.title}
          </IconLabel>
          <p className="text-base text-text-secondary">{body.message}</p>
          <button
            type="button"
            onClick={onRetry}
            className="-mx-1 mt-0.5 inline-flex min-h-11 w-fit items-center rounded-button px-1 text-sm font-medium text-primary"
          >
            {body.retry}
          </button>
        </Card>
      );
    case "empty":
      return <EmptyState variant="plain" message={body.message} />;
  }
}

function PlanSection({ title, count, cards }: { title: string; count: number; cards: VideoCardModel[] }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      {/* 16 bold neutral + 개수 13 textSecondary, 위 xs(4) — ExerciseView.swift:93-101 */}
      <h2 id={headingId} className="flex items-baseline gap-2 pt-1">
        <span className="text-base font-bold text-neutral">{title}</span>
        <span className="text-[0.8125rem] text-text-secondary">{count}</span>
      </h2>
      <ul className="flex flex-col gap-4 lg:grid lg:grid-cols-2">
        {cards.map((card) => (
          <li key={card.id} className="min-w-0">
            <VideoCard card={card} />
          </li>
        ))}
      </ul>
    </section>
  );
}

// MARK: - 영상 카드 (ExerciseView.swift:189-257)

function VideoCard({ card }: { card: VideoCardModel }) {
  const titleId = useId();
  return (
    <Card as="article" aria-labelledby={titleId} className={cx("flex flex-col gap-2 lg:h-full", card.dimmed && "opacity-70")}>
      <div className="flex items-center justify-between gap-2">
        <h3 id={titleId} className="min-w-0 text-base font-semibold text-text-primary">
          {card.title}
        </h3>
        <StatusBadge variant="exercise" status={card.badge.tone} label={card.badge.text} />
      </div>
      <p className="flex items-center gap-1.5 text-[0.8125rem] text-text-secondary">
        <PersonStanding aria-hidden className="size-4 shrink-0" />
        {card.bucketTitle}
      </p>
      {card.description !== null ? <p className="text-[0.8125rem] text-text-secondary">{card.description}</p> : null}
      {card.action.kind === "watch" ? (
        card.action.href !== null ? (
          <a
            href={card.action.href}
            {...EXTERNAL_LINK_PROPS}
            aria-describedby={titleId}
            className="mt-0.5 flex min-h-11 items-center gap-2 rounded-button lg:mt-auto"
          >
            <span aria-hidden className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary">
              <span className="ml-0.5 size-0 border-y-[0.3125rem] border-l-[0.4375rem] border-y-transparent border-l-white" />
            </span>
            <span className="flex-1 text-sm font-medium text-text-primary">{EXERCISE_TEXT.watchVideo}</span>
            <ChevronRight aria-hidden className="size-5 shrink-0 text-divider" />
          </a>
        ) : null
      ) : (
        <p
          className={cx(
            "pt-0.5 text-sm font-medium lg:mt-auto",
            card.action.tone === "alert" ? "text-state-alert" : "text-text-secondary",
          )}
        >
          {card.action.text}
        </p>
      )}
    </Card>
  );
}

// MARK: - 안내 블록

type Icon = typeof Hourglass;

/** SwiftUI Label(아이콘 + 16 semibold) */
function IconLabel({ icon: Icon, className, children }: { icon: Icon; className: string; children: string }) {
  return (
    <h2 className={cx("flex items-center gap-2 text-base font-semibold", className)}>
      <Icon aria-hidden className="size-5 shrink-0" />
      {children}
    </h2>
  );
}

/** 분만 방식(또는 출산일)이 없으면 추천하지 않고 프로필 입력으로 안내한다(ExerciseView.swift:118-129) */
export function NeedsProfileBlock({ title, body }: { title: string; body: string }) {
  return (
    <Card className={cx("flex flex-col gap-2", BLOCK_WIDTH)}>
      <IconLabel icon={UserRoundSearch} className="text-text-secondary">
        {title}
      </IconLabel>
      <p className="text-base text-text-secondary">{body}</p>
    </Card>
  );
}

/** 운동 영상 추천 전면 중단 — stateAlert 배경, 흰 글씨(ExerciseView.swift:132-150). 영상은 조회하지 않는다. */
export function RedFlagBlock() {
  return (
    <section className={cx("flex w-full flex-col gap-4 rounded-card bg-state-alert p-6 text-white", BLOCK_WIDTH)}>
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <FilledOctagonAlert className="size-6" shapeClassName="fill-white" markClassName="stroke-state-alert" />
        {EXERCISE_TEXT.redFlagTitle}
      </h2>
      <p className="text-base">{EXERCISE_TEXT.redFlagBody}</p>
    </section>
  );
}
