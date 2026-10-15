// 운동 탭 "유튜브 추천 영상" — 큐레이션 목록(영상 서버) 아래. 무엇을 보일지는 features/youtube/youtubePlan.ts가 정한다.
// 카드 하나가 링크 하나다: 미리보기·제목·채널 이름·단계 → youtube.com 새 탭(safeExternalUrl + EXTERNAL_LINK_PROPS — opener·Referer 없음).
// 링크 이름은 카드 글자 전체(제목 먼저)와 화면에 보이지 않는 "유튜브 새 탭에서 열기".
// 미리보기는 i.ytimg.com(CSP img-src는 목록이 있는 빌드에만 연다) — 늦게 불러오고(loading=lazy) Referer를 보내지 않는다.
// 글자 크기 150%에서도 쓸 수 있게 미리보기 폭은 카드 폭의 비율(최대 10rem)이고, 글자는 줄여 자르지 않고 줄을 바꾼다.

import { useId } from "react";
import { CirclePlay, ExternalLink, PersonStanding } from "lucide-react";
import { EXTERNAL_LINK_PROPS } from "@/api/safeUrl";
import { READING_BLOCK } from "@/components/shell/pageFrame";
import { cx } from "@/components/ui";
import type { YouTubeCardModel, YouTubeSectionModel } from "@/features/youtube/youtubePlan";

export function YouTubeSection({ section }: { section: YouTubeSectionModel }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      {/* 큐레이션 목록 섹션 제목과 같은 모양(16 bold neutral + 개수 13 textSecondary) */}
      <h2 id={headingId} className="flex items-baseline gap-2 pt-1">
        <span className="text-base font-bold text-neutral">{section.heading}</span>
        <span className="text-[0.8125rem] text-text-secondary">{section.count}</span>
      </h2>
      <p className={cx("text-[0.8125rem] text-text-secondary", READING_BLOCK)}>{section.disclaimer}</p>
      <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-4">
        {section.cards.map((card) => (
          <li key={card.videoId} className="min-w-0">
            <YouTubeCard card={card} opensInNewTab={section.opensInNewTab} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function YouTubeCard({ card, opensInNewTab }: { card: YouTubeCardModel; opensInNewTab: string }) {
  return (
    <a
      href={card.href}
      {...EXTERNAL_LINK_PROPS}
      className="flex min-h-11 w-full items-start gap-3 rounded-card bg-surface p-3 shadow-[0_0.125rem_1rem_rgb(0_0_0/0.04)] lg:h-full"
    >
      <span aria-hidden className="relative block aspect-video w-[36%] max-w-40 shrink-0 overflow-hidden rounded-[0.625rem] bg-background">
        {card.thumbnail !== null ? (
          // next/image는 정적 내보내기(images.unoptimized)라 하는 일이 없고 원격 주소 설정만 더한다 — i.ytimg.com이 이미 320×180으로 준다
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.thumbnail}
            alt=""
            width={320}
            height={180}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="size-full object-cover"
          />
        ) : (
          <CirclePlay className="absolute inset-0 m-auto size-6 text-text-secondary" />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[0.9375rem] font-semibold wrap-break-word text-text-primary">{card.title}</span>
        <span className="text-[0.8125rem] wrap-break-word text-text-secondary">{card.channelTitle}</span>
        <span className="flex items-center gap-1.5 text-[0.8125rem] text-text-secondary">
          <PersonStanding aria-hidden className="size-4 shrink-0" />
          {card.stageTitle}
        </span>
        <span className="sr-only">{opensInNewTab}</span>
      </span>
      <ExternalLink aria-hidden className="mt-0.5 size-4 shrink-0 text-text-secondary" />
    </a>
  );
}
