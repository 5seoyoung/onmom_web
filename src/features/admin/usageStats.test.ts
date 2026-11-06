// 이용 통계(집계) 묶음(UsageStats) — 정적 마크업으로 구조·접근성·숨김만 본다(adminTools.test.ts와 같은 방식).
// 데이터 상태는 AdminScreen이 들고 있으므로(브라우저 전용), 여기서는 그리기 결과가 문구·역할·이름을 제대로 내고,
// 숨긴 값이 어디에도(글자·표·낭독 요약) 나오지 않으며, 그림마다 글자 대안이 있는지 확인한다.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ADMIN_TEXT, parseUsageStats, usageDailyView, usageDistributionView, usageRedFlagView, type UsageStats } from "./adminModel";
import { UsageBarsCard, UsageDailyChart, UsageRedFlagCard, UsageStatsSection } from "./UsageStats";

const count = (markup: string, re: RegExp) => (markup.match(re) ?? []).length;

function dailyJson(days: number, cell: (i: number) => { s?: number | null; m?: number | null; j?: number | null } = () => ({})) {
  const end = Date.UTC(2026, 10, 4);
  return Array.from({ length: days }, (_, i) => {
    const c = cell(i);
    return {
      day: new Date(end - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10),
      symptom_records: c.s === undefined ? 0 : c.s,
      mood_answers: c.m === undefined ? 0 : c.m,
      journal_posts: c.j === undefined ? 0 : c.j,
    };
  });
}

const SHOWN_JSON = {
  generated_at: "2026-11-04T08:14:35+00:00",
  days: 30,
  period: { from: "2026-10-06", to: "2026-11-04" },
  k: 5,
  suppressed: false,
  totals: { consented_users: 42, active_users: 17 },
  daily: dailyJson(30, (i) => (i === 29 ? { s: 12, m: null, j: 0 } : i === 10 ? { s: 20, m: 7, j: null } : {})),
  adoption: { symptom_records: 12, mood_answers: 21, journal_posts: null },
  return_rate: { recording_users: 25, returning_users: 10 },
  distributions: {
    postpartum_weeks: { total: 42, counts: { weeks_0_1: 6, weeks_2_5: 11, weeks_6_11: null, weeks_12_plus: null, unknown: 7 } },
    delivery_method: { total: 42, counts: { vaginal: 20, cesarean: 15, unknown: 7 } },
    goal: null,
    mood_answers: { total: 71, counts: { yes: 40, unsure: null, no: null } },
    red_flag: { total: 120, counts: { red_flag: 14, other: 106 } },
  },
};
const SHOWN = parseUsageStats(SHOWN_JSON) as UsageStats;
/** 오늘처럼 동의한 사용자가 1명일 때 */
const ONE_USER = parseUsageStats({
  ...SHOWN_JSON,
  suppressed: true,
  totals: { consented_users: 1, active_users: 1 },
  daily: null,
  adoption: null,
  return_rate: null,
  distributions: null,
}) as UsageStats;

const render = (stats: UsageStats | null, props: { days?: number; loading?: boolean; placeholder?: string } = {}) =>
  renderToStaticMarkup(
    h(UsageStatsSection, {
      titleId: "usage",
      days: props.days ?? 30,
      onDaysChange() {},
      stats,
      loading: props.loading ?? false,
      placeholder: props.placeholder,
    }),
  );

describe("이용 통계 묶음 — 머리", () => {
  it("제목이 묶음의 이름이고, 기준·기간을 글자로 말한다", () => {
    const markup = render(SHOWN);
    expect(markup).toMatch(/<section aria-labelledby="usage"/);
    expect(markup).toContain(`<h2 id="usage"`);
    expect(markup).toContain(ADMIN_TEXT.usageTitle);
    expect(markup).toContain(ADMIN_TEXT.usageSubtitle);
    expect(markup).toContain("2026.10.06 ~ 2026.11.04(30일)");
    expect(markup).toContain(ADMIN_TEXT.usageNote);
  });

  it("기간 단추 — 이름 붙은 묶음 안에 7·30·90일, 고른 기간은 aria-pressed", () => {
    const markup = render(SHOWN, { days: 90 });
    expect(markup).toContain(`role="group" aria-label="${ADMIN_TEXT.usagePeriodGroup}"`);
    expect(count(markup, /<button type="button" aria-pressed="false"/g)).toBe(2);
    expect(count(markup, /<button type="button" aria-pressed="true"/g)).toBe(1);
    expect(markup).toMatch(/aria-pressed="true"[^>]*>90일<\/button>/);
    expect(markup).toMatch(/aria-pressed="false"[^>]*>7일<\/button>/);
    expect(markup).toMatch(/aria-pressed="false"[^>]*>30일<\/button>/);
  });

  it("불러오는 동안 — 이전 값을 흐리게 남기고(aria-busy), 다른 기간 단추를 잠근다", () => {
    const markup = render(SHOWN, { loading: true });
    expect(markup).toContain(`aria-busy="true"`);
    expect(markup).toContain("opacity-50");
    expect(markup).toContain("이틀 이상 기록 10명");
    expect(count(markup, /<button type="button" aria-pressed="false" disabled=""/g)).toBe(2);
    expect(count(markup, /aria-pressed="true" disabled/g)).toBe(0);
  });

  it("값 대신 그릴 것(불러오는 중·실패 안내)이 있으면 본문은 그리지 않고 단추는 남는다, 값이 없어도 깨지지 않는다", () => {
    const kpi = `>${ADMIN_TEXT.usageKpiConsented}</p>`;
    expect(render(SHOWN)).toContain(kpi);
    const failed = render(null, { placeholder: ADMIN_TEXT.usageSetupHint });
    expect(failed).toContain("0011_admin_usage_stats.sql");
    expect(failed).toContain(">30일<");
    expect(failed).not.toContain(kpi);
    expect(render(SHOWN, { placeholder: "안내" })).not.toContain(kpi);
    expect(render(null)).toContain(ADMIN_TEXT.usageTitle);
  });
});

describe("이용 통계 묶음 — 동의한 사용자가 5명 미만(오늘처럼 1명)", () => {
  const markup = render(ONE_USER);

  it("계정 수와 안내만 보이고, 그림·표·분포 카드는 그리지 않는다", () => {
    expect(markup).toContain(ADMIN_TEXT.usageSuppressedBody);
    expect(markup).toContain(`>${ADMIN_TEXT.usageKpiConsented}</p>`);
    expect(count(markup, />숨김</g)).toBe(2); // 기록한 사람·재방문
    expect(count(markup, new RegExp(ADMIN_TEXT.usageHidden, "g"))).toBe(2);
    expect(count(markup, /<h3 /g)).toBe(0); // 날짜별 기록·기능별 이용·분포 카드가 하나도 없다
    for (const gone of ["<table", "<details", `aria-label="최근`, "background-color"]) expect(markup, gone).not.toContain(gone);
  });
});

describe("이용 통계 묶음 — 값이 있을 때", () => {
  const markup = render(SHOWN);

  it("순서 — 한눈에 보기 네 칸, 날짜별 기록, 기능별 이용·병원 안내·분포 카드(제목은 h3)", () => {
    expect([...markup.matchAll(/<h3 [^>]*>([^<]+)<\/h3>/g)].map((m) => m[1])).toEqual([
      ADMIN_TEXT.usageDailyTitle,
      ADMIN_TEXT.usageAdoptionTitle,
      ADMIN_TEXT.usageRedFlagTitle,
      ADMIN_TEXT.usageWeeksTitle,
      ADMIN_TEXT.usageMoodTitle,
      ADMIN_TEXT.usageDeliveryTitle,
      ADMIN_TEXT.usageGoalTitle,
    ]);
    expect([...markup.matchAll(/font-medium text-text-secondary">([^<]+)<\/p>/g)].map((m) => m[1])).toEqual([
      ADMIN_TEXT.usageKpiConsented,
      ADMIN_TEXT.usageKpiActive,
      ADMIN_TEXT.usageKpiRecording,
      ADMIN_TEXT.usageKpiReturning,
    ]);
    expect(markup.indexOf(`>${ADMIN_TEXT.usageKpiReturning}</p>`)).toBeLessThan(markup.indexOf(`>${ADMIN_TEXT.usageDailyTitle}</h3>`));
    expect(markup).not.toContain(ADMIN_TEXT.usageSuppressedBody);
  });

  it("폰은 한 줄씩, PC(lg)는 격자 — 한눈에 보기 네 칸, 카드는 두 열", () => {
    expect(markup).toContain("grid grid-cols-2 gap-3 lg:grid-cols-4");
    expect(markup).toContain("grid gap-4 md:gap-5 lg:grid-cols-2 lg:gap-4");
  });

  it("카드마다 제목으로 이름이 붙고, 막대는 그림일 뿐 값은 글자로 있다", () => {
    const named = markup.match(/<section [^>]*aria-labelledby="[^"]+"/g) ?? [];
    expect(named).toHaveLength(8); // 묶음 + 날짜별 기록 + 카드 여섯
    expect(count(markup, /<section /g)).toBe(8); // 이름 없는 section이 없다
    expect(markup).toContain("12명 · 29%");
    expect(markup).toContain("20명 · 48%");
    expect(markup).toContain("40건 · 56%");
    expect(markup).toContain("증상 기록 120건 중 14건");
    expect(markup).toContain(">12%<");
  });

  it("숨긴 칸은 수가 아니라 '숨김' — 까닭을 적고, 모두 숨긴 분포는 한 줄로", () => {
    expect(markup).toContain(ADMIN_TEXT.usageComplementNote);
    expect(markup).toContain("숨김: 그 기능을 쓴 사람이 5명 미만이에요.");
    expect(markup).toContain(`>${ADMIN_TEXT.usageHidden}</p>`); // 목표 카드
    expect(markup).not.toContain("전업");
  });

  it("계정 ID·자유 글이 응답에 섞여 와도 화면에 없다", () => {
    const leaked = parseUsageStats({ ...SHOWN_JSON, user_ids: ["3f0f9b2e-0000-4000-8000-000000000001"], titles: ["비밀 글"] }) as UsageStats;
    const text = render(leaked);
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(text).not.toContain("비밀 글");
  });
});

describe("날짜별 기록 — 그림의 글자 대안(NewUsersChart와 같다)", () => {
  const view = usageDailyView(SHOWN.daily!);
  const markup = renderToStaticMarkup(h(UsageDailyChart, { view }));
  const escaped = view.summary.replaceAll("(", "\\(").replaceAll(")", "\\)");

  it("그림 묶음에 요약이 이름으로 붙고, 키보드로 닿으며, 가리킨 날을 읽는 알림 줄과 이어진다", () => {
    const group = /<div role="group" aria-label="([^"]+)" aria-describedby="([^"]+)" tabindex="0"/.exec(markup);
    expect(group).not.toBeNull();
    expect(group![1]).toBe(view.summary);
    expect(markup).toMatch(new RegExp(escaped));
    expect(markup).toContain(`<p id="${group![2]}" aria-live="polite" class="sr-only">`);
  });

  it("막대·눈금은 aria-hidden — 값은 요약·표로 읽힌다", () => {
    expect(count(markup, /aria-hidden="true"/g)).toBeGreaterThanOrEqual(3 * 2 + 1 + 1); // 갈래마다 세로축·그림, 가로축, 범례 색
    expect(markup).not.toMatch(/<svg|<canvas/);
  });

  it("범례 — 숨긴 날의 띠를 글자로 말한다(색만으로 전하지 않는다)", () => {
    expect(markup).toContain(ADMIN_TEXT.usageHiddenDayLegend);
    expect(markup).toContain("bg-text-subtle/25");
  });

  it("표 — 제목·칸 머리·줄 머리가 있고, 모든 날의 값이 있으며 숨긴 칸은 '숨김'", () => {
    expect(markup).toContain(`<caption class="sr-only">${ADMIN_TEXT.usageDailyTitle}</caption>`);
    expect(markup).toContain(ADMIN_TEXT.showTable);
    expect(count(markup, /<th scope="col"/g)).toBe(4); // 날짜 + 갈래 셋
    expect(count(markup, /<th scope="row"/g)).toBe(30);
    expect(count(markup, /<td /g)).toBe(90);
    const today = markup.slice(markup.lastIndexOf(`<th scope="row"`));
    expect(today).toContain("11월 4일");
    expect(today).toContain(">12건<");
    expect(today).toContain(">숨김<");
    expect(today).toContain(">0건<");
  });

  it("갈래마다 합계·가장 많은 날·숨긴 날을 글자로 — 숫자를 막대마다 달지 않는다", () => {
    expect(markup).toContain("보이는 날 합계 32건 · 가장 많은 날 10월 16일 20건");
    expect(markup).toContain("보이는 날 합계 0건 · 숨긴 날 1일");
  });

  it("90일은 막대 사이를 좁히고 표는 그 칸 수만큼, 날이 없어도 깨지지 않는다", () => {
    const long = usageDailyView(parseUsageStats({ ...SHOWN_JSON, days: 90, daily: dailyJson(90) })!.daily!);
    const dense = renderToStaticMarkup(h(UsageDailyChart, { view: long }));
    expect(dense).toContain("gap-px");
    expect(count(dense, /<th scope="row"/g)).toBe(90);
    expect(markup).not.toContain("gap-px");
    const none = renderToStaticMarkup(h(UsageDailyChart, { view: usageDailyView([]) }));
    expect(none).not.toContain("tabindex");
  });
});

describe("분포 카드 · 병원 안내 카드", () => {
  it("줄마다 이름과 값이 글자로 — 숨긴 줄에는 막대도 수도 없다", () => {
    const markup = renderToStaticMarkup(h(UsageBarsCard, { view: usageDistributionView(SHOWN, "postpartumWeeks") }));
    expect(count(markup, /<li /g)).toBe(5);
    expect(markup).toContain("0~1주차");
    expect(markup).toContain("6명 · 14%");
    expect(count(markup, />숨김</g)).toBe(2);
    expect(count(markup, /background-color/g)).toBe(3);
    expect(markup).toContain(ADMIN_TEXT.usageComplementNote);
  });

  it("모두 숨긴 분포 — 줄 없이 '5명 미만이라 숨겼어요'", () => {
    const markup = renderToStaticMarkup(h(UsageBarsCard, { view: usageDistributionView(SHOWN, "goal") }));
    expect(markup).toContain(ADMIN_TEXT.usageHidden);
    expect(markup).not.toContain("<li");
    expect(markup).not.toContain("background-color");
  });

  it("병원 안내 — 비율·건수가 글자로, 숨기면 수가 없다", () => {
    const shown = renderToStaticMarkup(h(UsageRedFlagCard, { view: usageRedFlagView(SHOWN) }));
    expect(shown).toContain(">12%<");
    expect(shown).toContain("증상 기록 120건 중 14건");
    const hidden = renderToStaticMarkup(h(UsageRedFlagCard, { view: usageRedFlagView(ONE_USER) }));
    expect(hidden).toContain(ADMIN_TEXT.usageHidden);
    expect(hidden).not.toMatch(/\d+%/);
    expect(hidden).not.toContain("background-color");
  });
});

describe("관리자 화면 안의 자리 — 소스로 확인", () => {
  const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
  const screen = read("./AdminScreen.tsx");

  it("30일 가입 막대 바로 뒤, 동의 버전 카드 앞에 놓인다", () => {
    const chart = screen.indexOf("<NewUsersChart");
    const usage = screen.indexOf("<UsageStatsSection");
    const consent = screen.indexOf("<ConsentVersionsTable");
    expect(chart).toBeGreaterThan(0);
    expect(usage).toBeGreaterThan(chart);
    expect(consent).toBeGreaterThan(usage);
  });

  it("0011이 없는 서버는 그 묶음만 0011 설치 안내 — 다른 카드의 안내(0002·0005)와 다르다", () => {
    expect(screen).toContain("<LoadFailed failure={usage.failure} onRetry={reload} setupHint={ADMIN_TEXT.usageSetupHint} />");
    expect(ADMIN_TEXT.usageSetupHint).not.toBe(ADMIN_TEXT.setupHint);
    expect(ADMIN_TEXT.usageSetupHint).not.toBe(ADMIN_TEXT.toolsSetupHint);
  });

  it("권한이 없어지면 화면을 내린다 · 새로고침이 통계도 다시 부른다 · 기간은 fetchUsageStats로 넘어간다", () => {
    const effect = screen.slice(screen.indexOf("void fetchUsageStats(client, usageDays)"), screen.indexOf("[client, usageDays, reloadKey, onForbidden]"));
    expect(effect).toContain(`r.failure === "forbidden"`);
    expect(effect).toContain("onForbidden()");
    const reload = screen.slice(screen.indexOf("const reload = () => {"), screen.indexOf("const goToPage"));
    expect(reload).toContain("setUsage(");
  });

  it("새 문구는 표시가 있다 — 모델의 문구 묶음과 묶음 파일은 글자를 직접 적지 않는다", () => {
    expect(read("./adminModel.ts")).toMatch(/이용 통계\(집계\)\(supabase\/migrations\/0011_admin_usage_stats\.sql\) — 모두 웹 신규 문구 — CPO 확인 필요/);
    // 묶음 파일의 한글은 주석뿐이다(화면 글자는 모두 adminModel에서 온다)
    const code = read("./UsageStats.tsx").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(code).not.toMatch(/[가-힣]/);
  });
});
