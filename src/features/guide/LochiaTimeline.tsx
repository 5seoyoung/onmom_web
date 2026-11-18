// 오로 변화 그림 — 회복 가이드 "오로(분비물) 변화" 주제에만 붙는다(2026-11-15 산부인과 전문의 화면 검토: 주제마다 그림과 함께).
// 카드 요점을 짧게 옮긴 세로 시간선 3단계 + 주의 상자. 물방울의 색·크기는 장식(aria-hidden)이고 뜻은 글자가 전한다(색만으로 구분하지 않기).
// 새 의학 정보를 더하지 않는다 — 글자는 guideContent LOCHIA_TIMELINE(원문 대조는 guide.test). 요점 원문은 이 그림 아래에 그대로 나온다.
// 훅이 없어 서버·클라이언트 어디서든 그린다.
import { Droplet, TriangleAlert } from "lucide-react";
import { cx } from "@/components/ui";
import { LOCHIA_TIMELINE, type LochiaPhaseMark } from "./guideContent";

/**
 * 물방울 모양 — 처음 며칠은 크고 붉게("혈액 같은"), 3~4일 후는 작게("양이 줄고" — 원문에 색이 없어 칠하지 않는다),
 * 10일 후부터는 작고 노랗게("노란색으로"). 글자 색이 아니라 아이콘 색이라 대비 요구 대상이 아니다.
 */
const MARK: Readonly<Record<LochiaPhaseMark, string>> = {
  blood: "size-6 fill-state-alert-strong text-state-alert-strong",
  less: "size-4 text-text-secondary",
  yellow: "size-4 fill-state-watch text-state-watch",
};

export function LochiaTimeline() {
  const last = LOCHIA_TIMELINE.phases.length - 1;
  return (
    <figure className="flex flex-col gap-3 rounded-chip bg-background p-4">
      <figcaption className="text-[0.8125rem] font-semibold text-text-secondary">{LOCHIA_TIMELINE.caption}</figcaption>
      <ol className="flex flex-col">
        {LOCHIA_TIMELINE.phases.map((phase, i) => (
          <li key={phase.when} className={cx("relative flex items-start gap-3", i !== last && "pb-3")}>
            {/* 단계 사이를 잇는 세로선 — 원(40px)의 가운데 아래에서 다음 단계까지 */}
            {i !== last ? <span aria-hidden className="absolute top-10 bottom-0 left-5 w-0.5 -translate-x-1/2 bg-secondary" /> : null}
            <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface">
              <Droplet className={MARK[phase.mark]} />
            </span>
            <span className="flex min-w-0 flex-col pt-0.5">
              <span className="text-[0.9375rem] font-bold text-text-primary">{phase.when}</span>
              <span className="text-[0.8125rem] text-text-secondary">{phase.what}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-2 rounded-chip bg-coral-tint p-3">
        <p className="flex items-start gap-1.5 text-[0.8125rem] font-bold text-state-alert-text">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-state-alert-strong" />
          {LOCHIA_TIMELINE.warningTitle}
        </p>
        <ul className="flex flex-wrap gap-1.5">
          {LOCHIA_TIMELINE.warningSigns.map((sign) => (
            <li key={sign} className="rounded-full bg-surface px-2.5 py-1 text-[0.8125rem] font-medium text-text-primary">
              {sign}
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}
