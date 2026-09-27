"use client";

// 최근 30일 신규 가입 — 한 계열 세로 막대(차트 라이브러리 없이 HTML/CSS).
// - 막대: 최대 24px, 위쪽 끝만 4px 둥글게, 바닥선에서 자람, 막대 사이 2px. 한 계열이라 범례 없이 제목이 무엇인지 말한다.
// - 색: 브랜드 코랄보다 한 단계 짙은 #e0524f — 흰 카드 위 3:1 이상(그래픽 대비). 글자는 막대 색을 쓰지 않는다.
// - 값 글자는 오늘·가장 많은 날만(adminModel chartBars). 나머지 값은 가리키거나(마우스) 방향키(키보드)로, 그리고 [표로 보기]로.
// - 눈금선은 1px 실선(divider), 세로축은 깔끔한 수(niceScale), 가로축은 7일마다 날짜.

import { useId, useState, type KeyboardEvent } from "react";
import { Card } from "@/components/ui";
import { cx } from "@/components/ui/cx";
import { ADMIN_TEXT, barReadout, formatCount, formatPeople, type ChartBar, type ChartScale } from "./adminModel";

const BAR_COLOR = "#e0524f";

export interface NewUsersChartProps {
  bars: ChartBar[];
  scale: ChartScale;
  summary: string;
}

export function NewUsersChart({ bars, scale, summary }: NewUsersChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const titleId = useId();
  const readoutId = useId();
  const n = bars.length;
  const activeBar = active !== null && active < n ? bars[active] : null;

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (n === 0) return;
    const cur = active ?? n - 1;
    let next: number | null = null;
    if (e.key === "ArrowLeft") next = Math.max(0, cur - 1);
    else if (e.key === "ArrowRight") next = Math.min(n - 1, cur + 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    else if (e.key === "Escape") {
      setActive(null);
      return;
    }
    if (next !== null) {
      e.preventDefault();
      setActive(next);
    }
  }

  // 알림 상자 위치 — 가리킨 막대 옆(왼쪽 절반은 오른쪽에, 오른쪽 절반은 왼쪽에)에 두어 그 막대를 가리지 않고,
  // 높이는 막대 끝에 맞추되 그림 위로 넘치지 않게(제목을 덮지 않게) 그림 안에 가둔다.
  const tooltipOnRight = active !== null && active < n / 2;

  return (
    <Card as="section" aria-labelledby={titleId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={titleId} className="text-[1.0625rem] font-semibold text-neutral">
          {ADMIN_TEXT.chartTitle}
        </h2>
        <p className="text-[0.8125rem] text-text-secondary">{ADMIN_TEXT.chartSubtitle}</p>
      </div>

      <div className="flex gap-2 pt-5">
        {/* 세로축 눈금 — 수만(가로 칸에 맞춰 오른쪽 정렬) */}
        <div aria-hidden className="relative h-44 w-8 shrink-0 md:h-56">
          {scale.ticks.map((t) => (
            <span
              key={t}
              className="absolute right-0 translate-y-1/2 text-[0.6875rem] leading-none text-text-secondary tabular-nums"
              style={{ bottom: `${(t / scale.max) * 100}%` }}
            >
              {formatCount(t)}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div
            role="group"
            aria-label={summary}
            aria-describedby={readoutId}
            tabIndex={0}
            onKeyDown={onKeyDown}
            onFocus={() => setActive((a) => a ?? n - 1)}
            onBlur={() => setActive(null)}
            onPointerLeave={() => setActive(null)}
            className="relative h-44 rounded-sm md:h-56"
          >
            {/* 눈금선 — 1px 실선, 바닥선만 조금 진하게 */}
            {scale.ticks.map((t) => (
              <div
                key={t}
                aria-hidden
                className={cx("absolute inset-x-0 h-px", t === 0 ? "bg-text-subtle/40" : "bg-divider")}
                style={{ bottom: `${(t / scale.max) * 100}%` }}
              />
            ))}

            <div aria-hidden className="absolute inset-0 flex items-end gap-[2px]">
              {bars.map((b, i) => (
                <div
                  key={b.day}
                  className="relative flex h-full min-w-0 flex-1 items-end justify-center"
                  onPointerEnter={() => setActive(i)}
                  onPointerDown={() => setActive(i)}
                >
                  <div
                    className={cx("w-full max-w-6 rounded-t-[4px] transition-[filter]", active === i && "brightness-[0.85]")}
                    style={{ height: `${b.heightPct}%`, backgroundColor: BAR_COLOR }}
                  />
                  {b.valueLabel ? (
                    <span
                      className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-[0.75rem] font-semibold leading-none text-text-primary tabular-nums"
                      style={{ bottom: `calc(${b.heightPct}% + 0.3125rem)` }}
                    >
                      {formatCount(b.users)}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>

            {/* 가리킨 막대의 값 — 값이 먼저, 날짜가 뒤(보조). 표시만 하고 읽기는 아래 알림 줄(aria-live)이 한다 */}
            {activeBar !== null && active !== null ? (
              <div
                aria-hidden
                className="pointer-events-none absolute z-10 whitespace-nowrap rounded-chip bg-neutral px-2.5 py-1.5 text-white shadow-[0_0.25rem_0.75rem_rgb(0_0_0/0.16)]"
                style={{
                  left: `${((active + 0.5) / n) * 100}%`,
                  bottom: `min(${activeBar.heightPct}%, calc(100% - 3rem))`,
                  transform: tooltipOnRight ? "translateX(0.875rem)" : "translateX(calc(-100% - 0.875rem))",
                }}
              >
                <span className="block text-[0.9375rem] font-bold leading-tight">{formatPeople(activeBar.users)}</span>
                <span className="block text-[0.75rem] leading-tight text-white/80">{activeBar.longLabel}</span>
              </div>
            ) : null}
          </div>

          {/* 가로축 — 7일마다 날짜 */}
          <div aria-hidden className="mt-2 flex gap-[2px]">
            {bars.map((b) => (
              <div key={b.day} className="relative h-4 min-w-0 flex-1">
                {b.tick !== null ? (
                  <span className="absolute left-1/2 top-0 -translate-x-1/2 whitespace-nowrap text-[0.6875rem] leading-none text-text-secondary tabular-nums">
                    {b.tick}
                  </span>
                ) : null}
              </div>
            ))}
          </div>

          {/* 키보드로 막대를 옮길 때 읽힌다 */}
          <p id={readoutId} aria-live="polite" className="sr-only">
            {activeBar !== null ? barReadout(activeBar) : ""}
          </p>
        </div>
      </div>

      {/* 표 — 그림과 같은 값(색·마우스 없이도 모든 값에 닿는다) */}
      <details className="rounded-chip border border-divider">
        <summary className="flex min-h-11 cursor-pointer items-center px-4 text-[0.9375rem] font-medium text-text-secondary">
          {ADMIN_TEXT.showTable}
        </summary>
        <div className="max-h-80 overflow-y-auto border-t border-divider">
          <table className="w-full text-left text-[0.875rem]">
            <caption className="sr-only">{ADMIN_TEXT.chartTitle}</caption>
            <thead className="sticky top-0 bg-surface">
              <tr className="text-[0.8125rem] text-text-secondary">
                <th scope="col" className="px-4 py-2 font-medium">
                  {ADMIN_TEXT.colDay}
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  {ADMIN_TEXT.colNewUsers}
                </th>
              </tr>
            </thead>
            <tbody>
              {bars.map((b) => (
                <tr key={b.day} className="border-t border-divider">
                  <th scope="row" className="px-4 py-2 font-normal text-text-primary">
                    {b.longLabel}
                  </th>
                  <td className="px-4 py-2 text-right text-text-primary tabular-nums">{formatPeople(b.users)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}
