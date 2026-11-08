"use client";

// 이용 통계(집계) — 관리자 화면의 "이용 통계(집계)" 묶음(supabase/migrations/0011_admin_usage_stats.sql).
// 서버가 서비스 개선 통계에 동의한 사용자(관리자 제외)의 건강 기록을 서버 안에서 익명 집계로 바꾼 수만 그린다 — 사람별 값·계정 ID·자유 글은 오지 않고,
// 5명 미만인 칸은 숨김(null)으로 온다(adminModel parseUsageStats가 한 번 더 막는다). 데이터 상태(기간·불러오는 중·실패)는 AdminScreen이
// 들고 있고, 여기는 그리기만 한다. 글자는 모두 adminModel에서 온다.
// - 기간(7·30·90일)은 묶음 맨 위 한 줄 — 아래의 모든 수가 같은 기간이다. 다시 불러오는 동안 이전 값을 흐리게 남긴다(자리가 튀지 않게).
// - 폰: 카드가 한 줄씩. PC(lg): 한눈에 보기 4칸, 날짜별 기록은 전체 폭, 나머지 카드는 두 열(관리자 도구 카드와 같은 격자).
// - 막대는 모두 aria-hidden이고 같은 값이 글자로 있다 — 날짜별 기록은 요약(그룹 이름)·가리킨 날 알림(aria-live)·[표로 보기],
//   기능별 이용·분포는 줄마다 이름과 값. 색만으로 전하지 않는다(숨긴 날은 범례 글자, 숨긴 칸은 "숨김").
// - 막대 색은 30일 가입 막대(NewUsersChart)와 같은 짙은 코랄 한 색(흰 카드 위 3:1 이상, 한 갈래라 범례 상자 없음 — 제목이 이름이다).
//   숨긴 날은 옅은 회색 띠(text-subtle 25%) — 범례에 글자로 적는다.

import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui";
import { cx } from "@/components/ui/cx";
import {
  ADMIN_TEXT,
  formatCount,
  usageAdoptionView,
  usageDailyView,
  usageDayReadout,
  usageDistributionView,
  usageKpis,
  usagePeriodOptions,
  usagePeriodText,
  usageRedFlagView,
  usageValueText,
  type UsageBarsView,
  type UsageDailyView,
  type UsageRedFlagView,
  type UsageStats,
} from "./adminModel";

/** NewUsersChart의 한 색 막대와 같은 짙은 코랄(흰 카드 위 3.9:1) */
const BAR_COLOR = "#e0524f";

export interface UsageStatsSectionProps {
  titleId: string;
  /** 고른 기간(일) */
  days: number;
  onDaysChange(days: number): void;
  /** 보일 값 — 다시 불러오는 동안에는 이전 값 */
  stats: UsageStats | null;
  loading: boolean;
  /** 값 대신 그릴 것(불러오는 중·실패 안내) — 있으면 본문 대신 */
  placeholder?: ReactNode;
}

export function UsageStatsSection({ titleId, days, onDaysChange, stats, loading, placeholder }: UsageStatsSectionProps) {
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4 md:gap-5 lg:gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={titleId} className="text-xl font-bold text-neutral">
            {ADMIN_TEXT.usageTitle}
          </h2>
          <p className="text-[0.8125rem] text-text-secondary">
            {ADMIN_TEXT.usageSubtitle}
            {stats !== null ? ` · ${usagePeriodText(stats)}` : ""}
          </p>
        </div>
        <PeriodPicker days={days} onChange={onDaysChange} disabled={loading} />
      </div>

      <p className="flex items-start gap-2 rounded-chip bg-surface px-4 py-3 text-[0.8125rem] text-text-secondary ring-1 ring-divider">
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-state-normal" />
        <span>{ADMIN_TEXT.usageNote}</span>
      </p>

      {placeholder ?? (stats === null ? null : <UsageBody stats={stats} loading={loading} />)}
    </section>
  );
}

/** 기간 단추 — 누른 단추는 aria-pressed. 불러오는 동안에는 다른 기간을 고르지 못한다(요청이 겹치지 않게). */
function PeriodPicker({ days, onChange, disabled }: { days: number; onChange(days: number): void; disabled: boolean }) {
  return (
    <div role="group" aria-label={ADMIN_TEXT.usagePeriodGroup} className="inline-flex gap-1 rounded-button bg-surface p-1 ring-1 ring-divider">
      {usagePeriodOptions(days).map((o) => (
        <button
          key={o.days}
          type="button"
          aria-pressed={o.selected}
          disabled={disabled && !o.selected}
          onClick={() => {
            if (!o.selected) onChange(o.days);
          }}
          className={cx(
            "inline-flex min-h-11 min-w-14 items-center justify-center rounded-[0.625rem] px-3 text-[0.9375rem] font-semibold disabled:cursor-not-allowed disabled:opacity-50",
            o.selected ? "bg-neutral text-white" : "text-text-secondary",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function UsageBody({ stats, loading }: { stats: UsageStats; loading: boolean }) {
  const kpis = useMemo(() => usageKpis(stats), [stats]);
  const daily = useMemo(() => (stats.daily === null || stats.daily.length === 0 ? null : usageDailyView(stats.daily)), [stats]);
  const cards = useMemo(
    () => ({
      adoption: usageAdoptionView(stats),
      redFlag: usageRedFlagView(stats),
      weeks: usageDistributionView(stats, "postpartumWeeks"),
      mood: usageDistributionView(stats, "moodAnswers"),
      delivery: usageDistributionView(stats, "deliveryMethod"),
      goal: usageDistributionView(stats, "goal"),
    }),
    [stats],
  );

  return (
    <div aria-busy={loading} className={cx("flex flex-col gap-4 transition-opacity md:gap-5 lg:gap-4", loading && "opacity-50")}>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <li key={k.id}>
            <Card className="flex h-full flex-col gap-1">
              <p className="text-[0.8125rem] font-medium text-text-secondary">{k.label}</p>
              <p className="text-[1.75rem] font-bold leading-tight text-neutral">{k.value}</p>
              <p className="text-[0.75rem] text-text-secondary">{k.caption}</p>
            </Card>
          </li>
        ))}
      </ul>

      {stats.suppressed ? (
        <Card>
          <p className="text-[0.9375rem] text-text-secondary">{ADMIN_TEXT.usageSuppressedBody}</p>
        </Card>
      ) : (
        <>
          {daily !== null ? <UsageDailyChart view={daily} /> : null}
          <div className="grid gap-4 md:gap-5 lg:grid-cols-2 lg:gap-4">
            <UsageBarsCard view={cards.adoption} />
            <UsageRedFlagCard view={cards.redFlag} />
            <UsageBarsCard view={cards.weeks} />
            <UsageBarsCard view={cards.mood} />
            <UsageBarsCard view={cards.delivery} />
            <UsageBarsCard view={cards.goal} />
          </div>
        </>
      )}
    </div>
  );
}

// ── 날짜별 기록 — 같은 날짜 축을 쓰는 작은 막대 셋(갈래마다 세로축이 따로 — 두 눈금을 한 그림에 겹치지 않는다) ──

export function UsageDailyChart({ view }: { view: UsageDailyView }) {
  const [active, setActive] = useState<number | null>(null);
  const titleId = useId();
  const readoutId = useId();
  const n = view.days.length;
  // 날이 없으면 가리킬 막대가 없다 — 범위 밖 번호를 읽지 않게 함께 본다
  const activeIndex = active !== null && active >= 0 && active < n ? active : null;
  const gap = view.dense ? "gap-px" : "gap-[2px]";

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

  // 알림 상자 — 가리킨 날 옆(왼쪽 절반은 오른쪽에, 오른쪽 절반은 왼쪽에). 가로 위치는 세로축 칸(2.5rem)을 뺀 그림 폭 기준.
  const tooltipOnRight = activeIndex !== null && activeIndex < n / 2;

  return (
    <Card as="section" aria-labelledby={titleId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 id={titleId} className="text-[1.0625rem] font-semibold text-neutral">
          {ADMIN_TEXT.usageDailyTitle}
        </h3>
        <p className="text-[0.8125rem] text-text-secondary">{ADMIN_TEXT.usageDailySubtitle}</p>
      </div>

      {/* 범례 — 숨긴 날의 띠(글자가 늘 함께 있다). 막대는 갈래마다 한 색이라 제목이 이름이다. */}
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem] text-text-secondary">
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block size-2.5 rounded-[2px] bg-text-subtle/25" />
          {ADMIN_TEXT.usageHiddenDayLegend}
        </li>
      </ul>

      <div
        role="group"
        aria-label={view.summary}
        aria-describedby={readoutId}
        tabIndex={n > 0 ? 0 : undefined}
        onKeyDown={onKeyDown}
        onFocus={() => {
          if (n > 0) setActive((a) => a ?? n - 1);
        }}
        onBlur={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
        className="relative flex flex-col gap-3 rounded-sm"
      >
        {view.series.map((s) => (
          <div key={s.activity} className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="text-[0.875rem] font-semibold text-text-primary">{s.title}</p>
              <p className="text-[0.75rem] text-text-secondary tabular-nums">{s.caption}</p>
            </div>
            <div className="flex gap-2">
              {/* 세로축 눈금 — 수만 */}
              <div aria-hidden className="relative h-20 w-8 shrink-0 md:h-24">
                {s.scale.ticks.map((t) => (
                  <span
                    key={t}
                    className="absolute right-0 translate-y-1/2 text-[0.6875rem] leading-none text-text-secondary tabular-nums"
                    style={{ bottom: `${(t / s.scale.max) * 100}%` }}
                  >
                    {formatCount(t)}
                  </span>
                ))}
              </div>
              <div aria-hidden className="relative h-20 min-w-0 flex-1 md:h-24">
                {s.scale.ticks.map((t) => (
                  <div
                    key={t}
                    className={cx("absolute inset-x-0 h-px", t === 0 ? "bg-text-subtle/40" : "bg-divider")}
                    style={{ bottom: `${(t / s.scale.max) * 100}%` }}
                  />
                ))}
                <div className={cx("absolute inset-0 flex items-end", gap)}>
                  {s.bars.map((b, i) => (
                    <div
                      key={b.day}
                      className={cx("relative flex h-full min-w-0 flex-1 items-end justify-center", activeIndex === i && "bg-neutral/5")}
                      onPointerEnter={() => setActive(i)}
                      onPointerDown={() => setActive(i)}
                    >
                      {b.value === null ? (
                        <div className={cx("absolute inset-0", activeIndex === i ? "bg-text-subtle/40" : "bg-text-subtle/25")} />
                      ) : b.heightPct > 0 ? (
                        <div
                          className={cx("w-full max-w-6 rounded-t-[4px] transition-[filter]", activeIndex === i && "brightness-[0.85]")}
                          style={{ height: `${b.heightPct}%`, backgroundColor: BAR_COLOR }}
                        />
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* 가로축 — 7일은 날마다, 30일은 7일마다, 90일은 14일마다(오늘부터 거꾸로). 세로축 칸(w-8 + gap-2)만큼 띄운다. */}
        <div aria-hidden className={cx("ml-10 flex", gap)}>
          {view.days.map((d) => (
            <div key={d.day} className="relative h-4 min-w-0 flex-1">
              {d.tick !== null ? (
                <span className="absolute left-1/2 top-0 -translate-x-1/2 whitespace-nowrap text-[0.6875rem] leading-none text-text-secondary tabular-nums">
                  {d.tick}
                </span>
              ) : null}
            </div>
          ))}
        </div>

        {/* 가리킨 날 — 값이 먼저, 이름이 뒤. 표시만 하고 읽기는 아래 알림 줄(aria-live)이 한다 */}
        {activeIndex !== null ? (
          <div
            aria-hidden
            className="pointer-events-none absolute top-6 z-10 whitespace-nowrap rounded-chip bg-neutral px-2.5 py-1.5 text-white shadow-[0_0.25rem_0.75rem_rgb(0_0_0/0.16)]"
            style={{
              left: `calc(2.5rem + (100% - 2.5rem) * ${(activeIndex + 0.5) / n})`,
              transform: tooltipOnRight ? "translateX(0.875rem)" : "translateX(calc(-100% - 0.875rem))",
            }}
          >
            <span className="block text-[0.75rem] leading-tight text-white/80">{view.days[activeIndex].longLabel}</span>
            {view.series.map((s) => (
              <span key={s.activity} className="mt-0.5 block text-[0.8125rem] leading-tight">
                <span className="font-bold">{usageValueText(s.bars[activeIndex]?.value ?? null)}</span> <span className="text-white/80">{s.title}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* 키보드로 날을 옮길 때 읽힌다 */}
      <p id={readoutId} aria-live="polite" className="sr-only">
        {activeIndex !== null ? usageDayReadout(view, activeIndex) : ""}
      </p>

      {/* 표 — 그림과 같은 값(색·마우스 없이도 모든 값에 닿는다). 숨긴 칸은 "숨김". */}
      <details className="rounded-chip border border-divider">
        <summary className="flex min-h-11 cursor-pointer items-center px-4 text-[0.9375rem] font-medium text-text-secondary">{ADMIN_TEXT.showTable}</summary>
        <div className="max-h-80 overflow-auto border-t border-divider">
          <table className="w-full text-left text-[0.875rem]">
            <caption className="sr-only">{ADMIN_TEXT.usageDailyTitle}</caption>
            <thead className="sticky top-0 bg-surface">
              <tr className="text-[0.8125rem] text-text-secondary">
                <th scope="col" className="px-3 py-2 font-medium md:px-4">
                  {ADMIN_TEXT.colDay}
                </th>
                {view.series.map((s) => (
                  <th key={s.activity} scope="col" className="px-3 py-2 text-right font-medium md:px-4">
                    {s.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.days.map((d, i) => (
                <tr key={d.day} className="border-t border-divider">
                  <th scope="row" className="whitespace-nowrap px-3 py-2 font-normal text-text-primary md:px-4">
                    {d.longLabel}
                  </th>
                  {view.series.map((s) => {
                    const v = s.bars[i]?.value ?? null;
                    return (
                      <td key={s.activity} className={cx("px-3 py-2 text-right tabular-nums md:px-4", v === null ? "text-text-secondary" : "text-text-primary")}>
                        {usageValueText(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}

// ── 기능별 이용 · 분포 — 이름 | 막대(기준 수 대비) | 값. 숨긴 줄은 막대 없이 "숨김". ──

export function UsageBarsCard({ view }: { view: UsageBarsView }) {
  const titleId = useId();
  return (
    <Card as="section" aria-labelledby={titleId} className="flex flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h3 id={titleId} className="text-[1.0625rem] font-semibold text-neutral">
          {view.title}
        </h3>
        <p className="text-[0.8125rem] text-text-secondary">{view.basis}</p>
      </div>
      {view.hidden ? (
        <p className="py-4 text-center text-[0.9375rem] text-text-secondary">{ADMIN_TEXT.usageHidden}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {/* 이름(6rem)·막대(5rem 이상)·값(7.5rem)이 한 줄에 들어가지 않으면(글자 150%·확대·좁은 폭) 값이 다음 줄 오른쪽으로 내려간다 —
              전에는 카드가 화면보다 넓어져 가로 스크롤이 생기고 막대가 0 폭으로 사라졌다(e2e/admin-dashboard.spec.ts) */}
          {view.rows.map((r) => (
            <li key={r.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.875rem]">
              <span className="w-24 shrink-0 text-text-primary">{r.label}</span>
              {r.value === null ? (
                <span aria-hidden className="min-w-20 flex-1" />
              ) : (
                <span aria-hidden className="relative h-2.5 min-w-20 flex-1 rounded-full bg-divider">
                  {r.widthPct > 0 ? (
                    <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${r.widthPct}%`, backgroundColor: BAR_COLOR }} />
                  ) : null}
                </span>
              )}
              <span className={cx("ml-auto w-[7.5rem] shrink-0 text-right tabular-nums", r.value === null ? "text-text-secondary" : "text-text-primary")}>
                {r.valueLabel}
              </span>
            </li>
          ))}
        </ul>
      )}
      {view.note !== null ? <p className="text-[0.75rem] text-text-secondary">{view.note}</p> : null}
    </Card>
  );
}

// ── 병원 안내가 나온 증상 기록 — 비율 하나(큰 수 + 미터) ──

export function UsageRedFlagCard({ view }: { view: UsageRedFlagView }) {
  const titleId = useId();
  return (
    <Card as="section" aria-labelledby={titleId} className="flex flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h3 id={titleId} className="text-[1.0625rem] font-semibold text-neutral">
          {view.title}
        </h3>
        <p className="text-[0.8125rem] text-text-secondary">{view.basis}</p>
      </div>
      {view.hidden ? (
        <p className="py-4 text-center text-[0.9375rem] text-text-secondary">{ADMIN_TEXT.usageHidden}</p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-[1.75rem] font-bold leading-tight text-neutral">{view.share ?? ADMIN_TEXT.none}</p>
          <span aria-hidden className="relative block h-2.5 w-full rounded-full bg-divider">
            {view.widthPct > 0 ? (
              <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${view.widthPct}%`, backgroundColor: BAR_COLOR }} />
            ) : null}
          </span>
        </div>
      )}
    </Card>
  );
}
