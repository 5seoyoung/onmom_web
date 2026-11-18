"use client"; // 고른 주제(주소 해시) 읽고 쓰기 · 화살표 키

// 회복 가이드 주제별 보기(2026-11-15 산부인과 전문의 화면 검토) — 위에 주제 목록(아이콘 타일 2열, 넓은 화면 4열), 아래에 고른 주제 카드 하나.
// 접근성: WAI-ARIA 탭(tablist·tab·tabpanel). 고른 탭만 Tab으로 닿고(roving tabindex), ←·→·Home·End로 옮기면 바로 그 주제가 열린다.
// 패널 8개는 모두 그려 두고 고르지 않은 것은 hidden — 정적 HTML에도 모든 요점이 있고, 탭의 aria-controls가 늘 있는 요소를 가리킨다.
// 고른 주제는 주소의 해시(#lochia)에 남긴다: 링크로 바로 열리고, 다른 화면에 갔다가 [뒤로] 오면 같은 주제다.
// 기록을 쌓지 않고(replaceState) 바꾼다 — 주제를 여러 번 눌러도 [뒤로] 한 번에 화면을 떠난다(SubPageHeader·subPageExit).
// 위험 신호 카드(aside)는 주제와 상관없이 늘 보인다 — 고른 주제 카드 다음(넓은 화면에서는 옆).

import { useRef, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { Card, EvidenceChipList, cx } from "@/components/ui";
import {
  GUIDE_TOPIC_TEXT,
  LOCHIA_TOPIC_SLUG,
  nextTopicIndex,
  topicIndexFromHash,
  topicPanelId,
  topicTabId,
  type GuideTopic,
} from "./guideContent";
import { LochiaTimeline } from "./LochiaTimeline";
import { PhoneLinks } from "./PhoneLinks";
import { SfIcon } from "./SfIcon";

// ─── 주소 해시 = 고른 주제(useSyncExternalStore) ───
const hashListeners = new Set<() => void>();

function subscribeHash(onChange: () => void) {
  hashListeners.add(onChange);
  window.addEventListener("hashchange", onChange);
  return () => {
    hashListeners.delete(onChange);
    window.removeEventListener("hashchange", onChange);
  };
}

const readHash = () => window.location.hash;
// 정적 HTML과 첫 hydration은 해시를 모른다 → 첫 주제. 그 뒤 실제 해시로 다시 그린다.
const serverHash = () => "";

/** 지금 기록의 해시만 바꾼다(새 기록 없음). Next 라우터와 맞물리는 방법 — Native History API(state null이면 라우터가 제 상태를 붙인다). */
function writeHash(slug: string) {
  if (window.location.hash === `#${slug}`) return;
  window.history.replaceState(null, "", `#${slug}`);
  for (const listener of hashListeners) listener();
}

export interface GuideTopicsProps {
  topics: readonly GuideTopic[];
  /** 주제와 상관없이 늘 보이는 것(위험 신호 카드) — 고른 주제 카드 다음, 넓은 화면에서는 옆 칸 */
  aside?: ReactNode;
}

export function GuideTopics({ topics, aside }: GuideTopicsProps) {
  const hash = useSyncExternalStore(subscribeHash, readHash, serverHash);
  const selected = topicIndexFromHash(hash, topics);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function onTabKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = nextTopicIndex(e.key, index, topics.length);
    if (next === null) return;
    e.preventDefault();
    writeHash(topics[next].slug);
    tabRefs.current[next]?.focus();
  }

  return (
    <>
      <div role="tablist" aria-label={GUIDE_TOPIC_TEXT.topicsLabel} className="grid grid-cols-2 gap-2 @2xl:grid-cols-4">
        {topics.map((topic, i) => {
          const on = i === selected;
          return (
            <button
              key={topic.slug}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={topicTabId(topic.slug)}
              aria-selected={on}
              aria-controls={topicPanelId(topic.slug)}
              tabIndex={on ? 0 : -1}
              onClick={() => writeHash(topic.slug)}
              onKeyDown={(e) => onTabKeyDown(e, i)}
              className={cx(
                // 고른 타일: 짙은 코랄 테두리(선택 테두리 strong — 3:1, CPO 12) + coral-tint 면. 고대비 모드에서는 시스템 강조색 테두리
                "flex min-h-14 cursor-pointer items-center gap-2 rounded-chip border-2 p-2.5 text-left text-[0.8125rem] font-semibold leading-snug text-text-primary",
                on
                  ? "border-primary-strong bg-coral-tint forced-colors:border-[Highlight]"
                  : "border-transparent bg-surface shadow-[0_0.125rem_1rem_rgb(0_0_0/0.04)]",
              )}
            >
              <span
                aria-hidden
                className={cx("flex size-8 shrink-0 items-center justify-center rounded-full text-primary", on ? "bg-surface" : "bg-secondary/20")}
              >
                <SfIcon name={topic.card.icon} className="size-4.5" />
              </span>
              <span className="min-w-0">{topic.card.title}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2 @2xl:items-start">
        {topics.map((topic, i) => (
          <TopicPanel key={topic.slug} topic={topic} hidden={i !== selected} />
        ))}
        {aside}
      </div>
    </>
  );
}

// 주제 카드 — 큰 머리(아이콘 원 64 · 제목 20 bold, coral-tint 띠) → (오로면 변화 그림) → 요점(15) → 출처 보기.
// 카드 하나만 보이므로 요점 글씨를 예전 카드(13 textSecondary)보다 키웠다.
function TopicPanel({ topic, hidden }: { topic: GuideTopic; hidden: boolean }) {
  const { card } = topic;
  return (
    <Card
      role="tabpanel"
      id={topicPanelId(topic.slug)}
      aria-labelledby={topicTabId(topic.slug)}
      // 첫 내용(머리)이 초점을 받지 않아 패널 자신이 Tab으로 닿는다(APG Tabs)
      tabIndex={0}
      hidden={hidden}
      className="flex flex-col gap-4"
    >
      <div className="flex items-center gap-4 rounded-chip bg-coral-tint p-4">
        <span aria-hidden className="flex size-16 shrink-0 items-center justify-center rounded-full bg-surface text-primary">
          <SfIcon name={card.icon} className="size-8" />
        </span>
        <h2 className="min-w-0 text-xl font-bold text-text-primary">{card.title}</h2>
      </div>
      {topic.slug === LOCHIA_TOPIC_SLUG ? <LochiaTimeline /> : null}
      <ul className="flex flex-col gap-2.5">
        {card.points.map((point) => (
          <li key={point} className="flex items-start gap-2 text-[0.9375rem] leading-relaxed text-text-primary">
            <span aria-hidden className="text-primary">
              •
            </span>
            <PhoneLinks text={point} />
          </li>
        ))}
      </ul>
      <EvidenceChipList tokens={card.sourceToken ? [card.sourceToken] : []} />
    </Card>
  );
}
