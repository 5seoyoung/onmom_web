import { describe, expect, it } from "vitest";
import {
  ADMIN_AUDIT_RETENTION_YEARS,
  ADMIN_IDLE_MINUTES,
  ADMIN_LIST_MAX,
  ADMIN_TEXT,
  ADMIN_PAGE_SIZE,
  CSV_MAX_ROWS,
  CSV_REASON_MAX,
  DELETE_REASON_MAX,
  adminIdleExpired,
  csvReasonProblem,
  groupSecret,
  normalizeCsvReason,
  normalizeTotpCode,
  qrImageSrc,
  USAGE_BUCKET_LABEL,
  USAGE_DAYS_MAX,
  USAGE_DAYS_MIN,
  USAGE_DEFAULT_DAYS,
  USAGE_DISTRIBUTIONS,
  USAGE_DISTRIBUTION_IDS,
  USAGE_K,
  USAGE_PERIODS,
  accountKind,
  adminRowView,
  barReadout,
  chartBars,
  chartSegmentKinds,
  chartSummary,
  clampUsageDays,
  consentVersionRows,
  csvCell,
  csvFileName,
  dayLong,
  dayTick,
  deleteConfirmMatches,
  deleteFailureMessage,
  deleteReasonProblem,
  formatCount,
  formatPeople,
  formatRecords,
  formatSeoulDate,
  formatSeoulDateTime,
  generatedAtLabel,
  hasChartSplit,
  kpiCards,
  niceScale,
  normalizeDeleteReason,
  normalizeUuid,
  pageLabel,
  parseAdminRows,
  parseCount,
  parseOverview,
  parseUsageStats,
  parseUserRows,
  segmentUsers,
  sharePercent,
  shortId,
  splitPage,
  usageAdoptionView,
  usageDailyView,
  usageDayReadout,
  usageDistributionView,
  usageKpis,
  usagePeriodOptions,
  usagePeriodText,
  usageRedFlagView,
  usageTickStep,
  usageValueText,
  userRowView,
  usersCsv,
  usersPageArgs,
  type AdminOverview,
  type AdminUserRow,
  type DayCount,
  type DeleteFailure,
  type UsageDay,
  type UsageStats,
} from "./adminModel";

const VERSION = "web-2026-09-28";

/** 2026-08-30 ~ 2026-09-28(한국 날짜) 30칸 */
function thirtyDays(values: (i: number) => number = () => 0): DayCount[] {
  const out: DayCount[] = [];
  const start = Date.UTC(2026, 7, 30);
  for (let i = 0; i < 30; i++) {
    const d = new Date(start + i * 86_400_000);
    out.push({ day: d.toISOString().slice(0, 10), users: values(i), anonymousUsers: null, kakaoUsers: null });
  }
  return out;
}

const OVERVIEW_JSON = {
  generated_at: "2026-09-28T05:05:00+00:00",
  consent_version: VERSION,
  totals: { users: 45, anonymous_users: 18, kakao_users: 27, users_with_state: 20, users_with_current_consent: 19 },
  active_users_7d: 12,
  states_updated_7d: 9,
  new_users_by_day: thirtyDays((i) => (i === 10 ? 7 : i % 3)).map((d) => ({ day: d.day, users: d.users })),
};

describe("parseOverview", () => {
  it("서버 응답을 화면 값으로 — 날짜 순으로 정렬", () => {
    const shuffled = { ...OVERVIEW_JSON, new_users_by_day: [...OVERVIEW_JSON.new_users_by_day].reverse() };
    const o = parseOverview(shuffled);
    expect(o).not.toBeNull();
    expect(o!.totals).toEqual({ users: 45, anonymousUsers: 18, kakaoUsers: 27, usersWithState: 20, usersWithCurrentConsent: 19 });
    expect(o!.activeUsers7d).toBe(12);
    expect(o!.statesUpdated7d).toBe(9);
    expect(o!.newUsersByDay).toHaveLength(30);
    expect(o!.newUsersByDay[0].day).toBe("2026-08-30");
    expect(o!.newUsersByDay[29].day).toBe("2026-09-28");
    expect(o!.generatedAt).toBe("2026-09-28T05:05:00+00:00");
  });

  it("bigint가 문자열로 와도 읽는다", () => {
    const o = parseOverview({ ...OVERVIEW_JSON, totals: { ...OVERVIEW_JSON.totals, users: "45" }, active_users_7d: "12" });
    expect(o?.totals.users).toBe(45);
    expect(o?.activeUsers7d).toBe(12);
  });

  it("빠지거나 이상한 값은 0으로 꾸미지 않고 null", () => {
    expect(parseOverview(null)).toBeNull();
    expect(parseOverview([])).toBeNull();
    expect(parseOverview({ ...OVERVIEW_JSON, totals: undefined })).toBeNull();
    expect(parseOverview({ ...OVERVIEW_JSON, totals: { ...OVERVIEW_JSON.totals, kakao_users: -1 } })).toBeNull();
    expect(parseOverview({ ...OVERVIEW_JSON, totals: { ...OVERVIEW_JSON.totals, users: 1.5 } })).toBeNull();
    expect(parseOverview({ ...OVERVIEW_JSON, active_users_7d: null })).toBeNull();
    expect(parseOverview({ ...OVERVIEW_JSON, new_users_by_day: [{ day: "9/28", users: 1 }] })).toBeNull();
    expect(parseOverview({ ...OVERVIEW_JSON, new_users_by_day: "x" })).toBeNull();
  });

  it("집계 시각이 없으면 시각 줄을 빼고, 날짜 목록이 null(가입 0)이면 빈 목록", () => {
    const o = parseOverview({ ...OVERVIEW_JSON, generated_at: null, new_users_by_day: null });
    expect(o?.generatedAt).toBeNull();
    expect(o?.newUsersByDay).toEqual([]);
    expect(generatedAtLabel(null)).toBeNull();
  });
});

describe("parseCount", () => {
  it("0 이상 정수만", () => {
    expect(parseCount(0)).toBe(0);
    expect(parseCount(12)).toBe(12);
    expect(parseCount("12")).toBe(12);
    expect(parseCount(-1)).toBeNull();
    expect(parseCount("1e3")).toBeNull();
    expect(parseCount(Number.NaN)).toBeNull();
    expect(parseCount(undefined)).toBeNull();
  });
});

const ROW_JSON = {
  id: "3f0f9b2e-0000-4000-8000-000000000001",
  created_at: "2026-09-27T15:30:00+00:00",
  last_sign_in_at: "2026-09-28T01:02:00+00:00",
  is_anonymous: false,
  provider: "kakao",
  has_state: true,
  consent_version: VERSION,
  state_updated_at: "2026-09-28T01:05:00+00:00",
};

describe("parseUserRows", () => {
  it("계정 메타데이터만 읽는다 — 다른 칸이 와도 옮기지 않는다", () => {
    const rows = parseUserRows([{ ...ROW_JSON, email: "a@b.c", nickname: "엄마", state: { symptoms: [] } }]);
    expect(rows).toEqual([
      {
        id: ROW_JSON.id,
        createdAt: ROW_JSON.created_at,
        lastSignInAt: ROW_JSON.last_sign_in_at,
        isAnonymous: false,
        provider: "kakao",
        email: "a@b.c",
        hasState: true,
        consentVersion: VERSION,
        stateUpdatedAt: ROW_JSON.state_updated_at,
      },
    ]);
    expect(Object.keys(rows![0])).not.toContain("nickname");
    expect(Object.keys(rows![0])).not.toContain("state");
  });

  it("이메일이 없거나(게스트·0013 전 서버) 비었으면 null — 화면은 '-'", () => {
    expect(parseUserRows([ROW_JSON])![0].email).toBeNull();
    expect(parseUserRows([{ ...ROW_JSON, email: null }])![0].email).toBeNull();
    expect(parseUserRows([{ ...ROW_JSON, email: "" }])![0].email).toBeNull();
    expect(userRowView(parseUserRows([ROW_JSON])![0], VERSION).email).toBe(ADMIN_TEXT.none);
    expect(userRowView(parseUserRows([{ ...ROW_JSON, email: "a@b.c" }])![0], VERSION).email).toBe("a@b.c");
  });

  it("비어 있을 수 있는 칸은 null, 참/거짓은 true일 때만 참", () => {
    const rows = parseUserRows([
      { ...ROW_JSON, last_sign_in_at: null, provider: null, has_state: null, consent_version: null, state_updated_at: null, is_anonymous: "true" },
    ]);
    expect(rows?.[0]).toMatchObject({ lastSignInAt: null, provider: null, hasState: false, consentVersion: null, stateUpdatedAt: null, isAnonymous: false });
  });

  it("한 행이라도 id·가입 시각이 없으면 전체를 null(사용자가 말없이 빠지지 않게)", () => {
    expect(parseUserRows([ROW_JSON, { ...ROW_JSON, id: "" }])).toBeNull();
    expect(parseUserRows([{ ...ROW_JSON, created_at: "not a date" }])).toBeNull();
    expect(parseUserRows({})).toBeNull();
    expect(parseUserRows([])).toEqual([]);
  });
});

describe("숫자·날짜 표시", () => {
  it("천 단위 쉼표·명", () => {
    expect(formatCount(1284)).toBe("1,284");
    expect(formatPeople(0)).toBe("0명");
    expect(formatPeople(12900)).toBe("12,900명");
  });

  it("비율 — 반올림, 전체 0이면 null", () => {
    expect(sharePercent(18, 45)).toBe("40%");
    expect(sharePercent(1, 3)).toBe("33%");
    expect(sharePercent(0, 0)).toBeNull();
  });

  it("한국 시간 날짜·시각 — UTC 오후는 한국 다음 날", () => {
    expect(formatSeoulDate("2026-09-27T15:30:00+00:00")).toBe("2026.09.28");
    expect(formatSeoulDateTime("2026-09-27T15:30:00+00:00")).toBe("2026.09.28 00:30");
    expect(formatSeoulDateTime("2026-09-28T05:05:00Z")).toBe("2026.09.28 14:05");
    expect(formatSeoulDate(null)).toBe("-");
    expect(formatSeoulDateTime("nope")).toBe("-");
    expect(generatedAtLabel("2026-09-28T05:05:00Z")).toBe("2026.09.28 14:05 기준");
  });

  it("Postgres가 주는 마이크로초 시각(timestamptz → JSON)도 읽는다", () => {
    expect(formatSeoulDateTime("2026-09-27T15:30:59.123456+00:00")).toBe("2026.09.28 00:30");
    expect(parseUserRows([{ ...ROW_JSON, created_at: "2026-09-27T15:30:00.654321+00:00" }])?.[0].createdAt).toBe(
      "2026-09-27T15:30:00.654321+00:00",
    );
  });

  it("날짜 눈금·긴 날짜", () => {
    expect(dayTick("2026-09-01")).toBe("9.1");
    expect(dayTick("2026-10-28")).toBe("10.28");
    expect(dayLong("2026-09-01")).toBe("9월 1일");
    expect(barReadout({ longLabel: "9월 1일", users: 3 })).toBe("9월 1일 · 3명");
  });
});

describe("kpiCards", () => {
  const o = parseOverview(OVERVIEW_JSON) as AdminOverview;

  it("다섯 칸 — 전체·게스트·카카오·동의 완료·최근 7일 활성", () => {
    const cards = kpiCards(o, VERSION);
    expect(cards.map((c) => [c.label, c.value])).toEqual([
      ["전체 사용자", "45"],
      ["게스트", "18"],
      ["카카오", "27"],
      ["동의 완료", "19"],
      ["최근 7일 활성", "12"],
    ]);
    expect(cards[0].caption).toBe("서버 기록 20명");
    expect(cards[1].caption).toBe("전체의 40%");
    expect(cards[2].caption).toBe("전체의 60%");
    expect(cards[3].caption).toBe(`${VERSION} 기준`);
    expect(cards[4].caption).toBe("로그인 기준 · 기록 갱신 9명");
  });

  it("사용자가 0명이면 비율 줄을 뺀다", () => {
    const empty: AdminOverview = {
      ...o,
      totals: { users: 0, anonymousUsers: 0, kakaoUsers: 0, usersWithState: 0, usersWithCurrentConsent: 0 },
    };
    const cards = kpiCards(empty, VERSION);
    expect(cards[1].caption).toBeNull();
    expect(cards[2].caption).toBeNull();
  });
});

describe("niceScale", () => {
  it("1·2·5 간격, 눈금 칸은 많아야 4, 간격은 1 이상", () => {
    expect(niceScale(3)).toEqual({ max: 3, ticks: [0, 1, 2, 3] });
    expect(niceScale(4)).toEqual({ max: 4, ticks: [0, 1, 2, 3, 4] });
    expect(niceScale(7)).toEqual({ max: 8, ticks: [0, 2, 4, 6, 8] });
    expect(niceScale(45)).toEqual({ max: 60, ticks: [0, 20, 40, 60] });
    expect(niceScale(120)).toEqual({ max: 150, ticks: [0, 50, 100, 150] });
    expect(niceScale(1)).toEqual({ max: 1, ticks: [0, 1] });
  });

  it("꼭대기는 가장 큰 값 이상 — 막대가 넘치지 않는다", () => {
    for (let v = 1; v <= 500; v++) {
      const s = niceScale(v);
      expect(s.max).toBeGreaterThanOrEqual(v);
      expect(s.ticks[0]).toBe(0);
      expect(s.ticks[s.ticks.length - 1]).toBe(s.max);
      expect(s.ticks.length - 1).toBeLessThanOrEqual(5);
      for (const t of s.ticks) expect(Number.isInteger(t)).toBe(true);
    }
  });

  it("모두 0이면 0~1(빈 막대를 부풀리지 않는다)", () => {
    expect(niceScale(0)).toEqual({ max: 1, ticks: [0, 1] });
    expect(niceScale(Number.NaN)).toEqual({ max: 1, ticks: [0, 1] });
  });
});

describe("chartBars", () => {
  it("높이는 꼭대기 대비 %, 눈금은 오늘부터 7일마다, 값 글자는 오늘·가장 많은 날만", () => {
    const days = thirtyDays((i) => (i === 10 ? 7 : i === 29 ? 2 : 1));
    const scale = niceScale(7);
    const bars = chartBars(days, scale);
    expect(bars).toHaveLength(30);
    expect(bars[10].heightPct).toBeCloseTo(87.5);
    expect(bars[0].heightPct).toBeCloseTo(12.5);
    expect(bars.filter((b) => b.tick !== null).map((b) => b.tick)).toEqual(["8.31", "9.7", "9.14", "9.21", "9.28"]);
    expect(bars.filter((b) => b.valueLabel).map((b) => b.day)).toEqual(["2026-09-09", "2026-09-28"]);
    expect(bars[29].longLabel).toBe("9월 28일");
  });

  it("가장 많은 날이 오늘 바로 옆이면 오늘 값만(숫자가 겹치지 않게)", () => {
    const bars = chartBars(thirtyDays((i) => (i === 28 ? 9 : 1)), niceScale(9));
    expect(bars.filter((b) => b.valueLabel).map((b) => b.day)).toEqual(["2026-09-28"]);
  });

  it("같은 최댓값이 여럿이면 처음 나온 날, 모두 0이면 오늘만", () => {
    const tie = chartBars(thirtyDays((i) => (i === 5 || i === 15 ? 4 : 0)), niceScale(4));
    expect(tie.filter((b) => b.valueLabel).map((b) => b.day)).toEqual(["2026-09-04", "2026-09-28"]);
    const zero = chartBars(thirtyDays(), niceScale(0));
    expect(zero.filter((b) => b.valueLabel)).toHaveLength(1);
    expect(zero.every((b) => b.heightPct === 0)).toBe(true);
  });

  it("빈 목록이면 막대도 없다", () => {
    expect(chartBars([], niceScale(0))).toEqual([]);
  });
});

describe("chartSummary", () => {
  it("합계와 가장 많은 날", () => {
    expect(chartSummary(thirtyDays((i) => (i === 10 ? 7 : 0)))).toBe("최근 30일 신규 가입 7명. 가장 많은 날 9월 9일 7명.");
    expect(chartSummary(thirtyDays())).toBe("최근 30일 신규 가입 0명.");
    expect(chartSummary([])).toBe("");
  });
});

describe("사용자 목록 행", () => {
  const base: AdminUserRow = {
    id: "3f0f9b2e-0000-4000-8000-000000000001",
    createdAt: "2026-09-27T15:30:00+00:00",
    lastSignInAt: null,
    isAnonymous: true,
    provider: "anonymous",
    email: null,
    hasState: false,
    consentVersion: null,
    stateUpdatedAt: null,
  };

  it("유형 — 카카오 identity가 있으면 카카오(연결한 게스트 포함), 익명이면 게스트, 그 밖은 기타", () => {
    expect(accountKind({ provider: "kakao", isAnonymous: false })).toBe("kakao");
    expect(accountKind({ provider: "kakao", isAnonymous: true })).toBe("kakao");
    expect(accountKind({ provider: "anonymous", isAnonymous: true })).toBe("guest");
    expect(accountKind({ provider: null, isAnonymous: true })).toBe("guest");
    expect(accountKind({ provider: "email", isAnonymous: false })).toBe("other");
  });

  it("짧은 ID는 앞 8자리", () => {
    expect(shortId(base.id)).toBe("3f0f9b2e");
  });

  it("게스트, 기록 없음, 동의 없음", () => {
    expect(userRowView(base, VERSION)).toEqual({
      id: base.id,
      shortId: "3f0f9b2e",
      created: "2026.09.28",
      lastSignIn: "-",
      kind: "guest",
      kindLabel: "게스트",
      email: "-",
      consent: "-",
      consentCurrent: false,
      hasState: false,
      stateLabel: "없음",
      stateUpdated: null,
    });
  });

  it("카카오, 기록 있음, 지금 판 동의 / 옛 판 동의", () => {
    const kakao = { ...base, isAnonymous: false, provider: "kakao", hasState: true, consentVersion: VERSION, stateUpdatedAt: "2026-09-28T01:05:00Z" };
    const v = userRowView(kakao, VERSION);
    expect(v).toMatchObject({ kindLabel: "카카오", consent: VERSION, consentCurrent: true, stateLabel: "있음", stateUpdated: "2026.09.28" });
    expect(userRowView({ ...kakao, consentVersion: "web-2026-01-01" }, VERSION).consentCurrent).toBe(false);
  });

  it("화면 아래 개인정보 안내가 행에 보이는 칸을 모두 말한다(보이는 것보다 적게 말하지 않는다)", () => {
    // 행에 보이는 칸 → 안내 문구 속 이름. 행 모양(UserRowView)에 칸이 늘면 여기서 멈춰 안내도 고치게 한다.
    const said: Record<string, string> = {
      id: "계정 ID",
      shortId: "계정 ID",
      created: "가입",
      lastSignIn: "접속 시각",
      kind: "계정 유형",
      kindLabel: "계정 유형",
      email: "로그인 이메일",
      consent: "동의 버전",
      consentCurrent: "동의 버전",
      hasState: "기록 저장 여부",
      stateLabel: "기록 저장 여부",
      stateUpdated: "마지막 저장일",
    };
    expect(Object.keys(userRowView(base, VERSION)).sort()).toEqual(Object.keys(said).sort());
    for (const phrase of new Set(Object.values(said))) expect(ADMIN_TEXT.privacyNote).toContain(phrase);
    expect(ADMIN_TEXT.privacyNote).toContain("건강 기록 내용은 이 화면에 나오지 않아요");
  });
});

describe("쪽 나누기", () => {
  it("서버에는 한 쪽보다 하나 더 — 다음 쪽 유무를 안다", () => {
    expect(usersPageArgs(0)).toEqual({ p_limit: ADMIN_PAGE_SIZE + 1, p_offset: 0 });
    expect(usersPageArgs(2)).toEqual({ p_limit: ADMIN_PAGE_SIZE + 1, p_offset: 2 * ADMIN_PAGE_SIZE });
    expect(usersPageArgs(-3)).toEqual({ p_limit: ADMIN_PAGE_SIZE + 1, p_offset: 0 });
    expect(usersPageArgs(1.5)).toEqual({ p_limit: ADMIN_PAGE_SIZE + 1, p_offset: 0 });
  });

  it("요청 수는 서버 최대(100)를 넘지 않는다", () => {
    expect(usersPageArgs(0, 500).p_limit).toBeLessThanOrEqual(ADMIN_LIST_MAX);
    expect(ADMIN_PAGE_SIZE + 1).toBeLessThanOrEqual(ADMIN_LIST_MAX);
  });

  it("받은 행 → 보일 행·다음 쪽", () => {
    const rows = Array.from({ length: 21 }, (_, i) => i);
    expect(splitPage(rows, 20)).toEqual({ rows: rows.slice(0, 20), hasNext: true });
    expect(splitPage(rows.slice(0, 20), 20)).toEqual({ rows: rows.slice(0, 20), hasNext: false });
    expect(splitPage([], 20)).toEqual({ rows: [], hasNext: false });
  });

  it("범위 줄", () => {
    expect(pageLabel(0, 20, 20, 45)).toBe("1–20 / 전체 45명");
    expect(pageLabel(2, 20, 5, 45)).toBe("41–45 / 전체 45명");
    expect(pageLabel(0, 20, 3, null)).toBe("1–3");
    expect(pageLabel(0, 20, 0, 0)).toBeNull();
  });
});

// ── 0005_admin_tools.sql 확장 ────────────────────────────────────────────────

/** 게스트·카카오를 나눠 준 30칸(0005 뒤의 응답) — users = 게스트 + 카카오 + 기타 */
function thirtyDaysSplit(values: (i: number) => { guest: number; kakao: number; other?: number }): DayCount[] {
  return thirtyDays().map((d, i) => {
    const v = values(i);
    return { ...d, users: v.guest + v.kakao + (v.other ?? 0), anonymousUsers: v.guest, kakaoUsers: v.kakao };
  });
}

describe("parseOverview — 0005 확장(동의 판 분포 · 날마다 게스트/카카오)", () => {
  const split = thirtyDays((i) => i % 3).map((d) => ({ day: d.day, users: d.users, anonymous_users: d.users > 0 ? 1 : 0, kakao_users: d.users > 1 ? 1 : 0 }));
  const WITH_0005 = {
    ...OVERVIEW_JSON,
    new_users_by_day: split,
    consent_versions: [
      { version: null, users: 2 },
      { version: VERSION, users: "17" },
      { version: "web-2026-09-01", users: 1 },
    ],
  };

  it("칸이 있으면 읽고, 판이 비었거나 null이면 '판 없음'(null)으로", () => {
    const o = parseOverview(WITH_0005)!;
    expect(o.newUsersByDay[2]).toEqual({ day: "2026-09-01", users: 2, anonymousUsers: 1, kakaoUsers: 1 });
    expect(o.newUsersByDay[0]).toMatchObject({ users: 0, anonymousUsers: 0, kakaoUsers: 0 });
    expect(o.consentVersions).toEqual([
      { version: null, users: 2 },
      { version: VERSION, users: 17 },
      { version: "web-2026-09-01", users: 1 },
    ]);
    expect(parseOverview({ ...WITH_0005, consent_versions: [{ version: "", users: 3 }] })?.consentVersions).toEqual([{ version: null, users: 3 }]);
  });

  it("0002만 실행된 서버(칸 없음)는 null — 0으로 꾸미지 않는다", () => {
    const o = parseOverview(OVERVIEW_JSON)!;
    expect(o.consentVersions).toBeNull();
    expect(o.newUsersByDay.every((d) => d.anonymousUsers === null && d.kakaoUsers === null)).toBe(true);
    expect(parseOverview({ ...OVERVIEW_JSON, consent_versions: null })?.consentVersions).toBeNull();
    expect(parseOverview({ ...OVERVIEW_JSON, consent_versions: [] })?.consentVersions).toEqual([]);
  });

  it("칸이 있는데 모양이 다르면 전체가 모양 오류(null)", () => {
    expect(parseOverview({ ...WITH_0005, consent_versions: "x" })).toBeNull();
    expect(parseOverview({ ...WITH_0005, consent_versions: [{ version: VERSION, users: "많음" }] })).toBeNull();
    expect(parseOverview({ ...WITH_0005, consent_versions: [{ version: 5, users: 1 }] })).toBeNull();
    expect(parseOverview({ ...WITH_0005, consent_versions: [null] })).toBeNull();
    expect(parseOverview({ ...WITH_0005, new_users_by_day: [{ day: "2026-09-01", users: 2, anonymous_users: "x", kakao_users: 1 }] })).toBeNull();
    expect(parseOverview({ ...WITH_0005, new_users_by_day: [{ day: "2026-09-01", users: 2, anonymous_users: 1, kakao_users: -1 }] })).toBeNull();
  });

  it("한쪽 칸만 있으면 없는 쪽은 null — 화면은 나누지 않는다", () => {
    const o = parseOverview({ ...WITH_0005, new_users_by_day: [{ day: "2026-09-01", users: 2, kakao_users: 1 }] })!;
    expect(o.newUsersByDay[0]).toEqual({ day: "2026-09-01", users: 2, anonymousUsers: null, kakaoUsers: 1 });
    expect(hasChartSplit(o.newUsersByDay)).toBe(false);
  });
});

describe("parseAdminRows", () => {
  const ROW = { user_id: "3f0f9b2e-0000-4000-8000-000000000001", added_at: "2026-09-28T00:00:00+00:00", last_sign_in_at: "2026-09-28T01:00:00+00:00", is_me: true };

  it("계정 ID·등록일·최근 접속·나인지만", () => {
    expect(parseAdminRows([ROW, { ...ROW, user_id: "3f0f9b2e-0000-4000-8000-000000000002", last_sign_in_at: null, is_me: "true" }])).toEqual([
      { userId: ROW.user_id, addedAt: ROW.added_at, lastSignInAt: ROW.last_sign_in_at, isMe: true },
      { userId: "3f0f9b2e-0000-4000-8000-000000000002", addedAt: ROW.added_at, lastSignInAt: null, isMe: false },
    ]);
  });

  it("한 행이라도 ID·등록일이 없으면 null, 배열이 아니면 null", () => {
    expect(parseAdminRows([ROW, { ...ROW, user_id: null }])).toBeNull();
    expect(parseAdminRows([{ ...ROW, added_at: "언제" }])).toBeNull();
    expect(parseAdminRows({})).toBeNull();
    expect(parseAdminRows([])).toEqual([]);
  });

  it("행 → 화면(한국 날짜·짧은 ID·나)", () => {
    expect(adminRowView({ userId: ROW.user_id, addedAt: ROW.added_at, lastSignInAt: null, isMe: true })).toEqual({
      id: ROW.user_id,
      shortId: "3f0f9b2e",
      added: "2026.09.28",
      lastSignIn: "-",
      isMe: true,
    });
  });
});

describe("30일 막대 — 게스트·카카오 나누기(자료가 허락할 때만)", () => {
  it("모든 날에 두 수가 있고 합이 전체를 넘지 않을 때만 나눈다", () => {
    expect(hasChartSplit(thirtyDaysSplit(() => ({ guest: 1, kakao: 0 })))).toBe(true);
    expect(hasChartSplit(thirtyDays())).toBe(false); // 0002 — 칸 없음
    const oneMissing = thirtyDaysSplit(() => ({ guest: 1, kakao: 1 }));
    oneMissing[3] = { ...oneMissing[3], kakaoUsers: null };
    expect(hasChartSplit(oneMissing)).toBe(false);
    const overflow = thirtyDaysSplit(() => ({ guest: 1, kakao: 1 }));
    overflow[0] = { ...overflow[0], users: 1 }; // 게스트 + 카카오 > 전체
    expect(hasChartSplit(overflow)).toBe(false);
    expect(hasChartSplit([])).toBe(false);
  });

  it("조각은 게스트(아래)·카카오·기타(나머지) 순, 0인 조각은 뺀다, 높이는 꼭대기 대비 %", () => {
    const days = thirtyDaysSplit((i) => (i === 29 ? { guest: 2, kakao: 1, other: 1 } : i === 10 ? { guest: 0, kakao: 3 } : { guest: 0, kakao: 0 }));
    const bars = chartBars(days, niceScale(4));
    expect(bars[29].segments).toEqual([
      { kind: "guest", users: 2, heightPct: 50 },
      { kind: "kakao", users: 1, heightPct: 25 },
      { kind: "other", users: 1, heightPct: 25 },
    ]);
    expect(bars[10].segments).toEqual([{ kind: "kakao", users: 3, heightPct: 75 }]);
    expect(bars[0].segments).toEqual([]);
    expect(bars[29].heightPct).toBe(100);
    expect(chartSegmentKinds(bars)).toEqual(["guest", "kakao", "other"]);
    expect(segmentUsers(bars[29], "guest")).toBe(2);
    expect(segmentUsers(bars[10], "guest")).toBe(0);
    expect(barReadout(bars[29])).toBe("9월 28일 · 4명 (게스트 2명 · 카카오 1명 · 기타 1명)");
    expect(barReadout(bars[0])).toBe("8월 30일 · 0명");
  });

  it("기타가 어느 날에도 없으면 범례·표는 게스트·카카오만", () => {
    const bars = chartBars(
      thirtyDaysSplit((i) => ({ guest: i % 2, kakao: 1 })),
      niceScale(2),
    );
    expect(chartSegmentKinds(bars)).toEqual(["guest", "kakao"]);
  });

  it("나눌 수 없으면(0002) 조각 없음 — 한 색 막대, 범례 없음, 알림은 전과 같다", () => {
    const bars = chartBars(thirtyDays((i) => (i === 29 ? 3 : 0)), niceScale(3));
    expect(bars.every((b) => b.segments === null)).toBe(true);
    expect(chartSegmentKinds(bars)).toEqual([]);
    expect(chartSegmentKinds([])).toEqual([]);
    expect(barReadout(bars[29])).toBe("9월 28일 · 3명");
    expect(segmentUsers(bars[29], "kakao")).toBe(0);
  });
});

describe("consentVersionRows — 동의 버전 분포", () => {
  it("현재 판 먼저, 그다음 판 이름 내림차순, 판 없음은 마지막. 비율은 서버 기록이 있는 사람 기준", () => {
    const rows = consentVersionRows(
      [
        { version: null, users: 2 },
        { version: "web-2026-09-01", users: 1 },
        { version: "web-2026-10-01", users: 1 },
        { version: VERSION, users: 16 },
      ],
      VERSION,
    );
    expect(rows.map((r) => [r.label, r.usersLabel, r.share, r.isCurrent])).toEqual([
      [VERSION, "16명", "80%", true],
      ["web-2026-10-01", "1명", "5%", false],
      ["web-2026-09-01", "1명", "5%", false],
      [ADMIN_TEXT.consentNone, "2명", "10%", false],
    ]);
    expect(rows.map((r) => r.key)).toEqual([VERSION, "web-2026-10-01", "web-2026-09-01", "__none__"]);
    expect(ADMIN_TEXT.consentNone).toBe("없음");
  });

  it("비어 있으면 빈 목록, 합계 0이면 비율 없음", () => {
    expect(consentVersionRows([], VERSION)).toEqual([]);
    expect(consentVersionRows([{ version: VERSION, users: 0 }], VERSION)[0].share).toBeNull();
  });
});

describe("계정 찾기·계정 삭제 입력", () => {
  const ID = "3F0F9B2E-0000-4000-8000-000000000001";

  it("계정 ID — 앞뒤 공백·대문자를 정리한 UUID 36자만, 아니면 null(서버에 묻지 않는다)", () => {
    expect(normalizeUuid(`  ${ID} `)).toBe(ID.toLowerCase());
    expect(normalizeUuid("3f0f9b2e")).toBeNull();
    expect(normalizeUuid(`{${ID}}`)).toBeNull();
    expect(normalizeUuid("")).toBeNull();
    expect(normalizeUuid("3f0f9b2e-0000-4000-8000-00000000000g")).toBeNull();
  });

  it("삭제 확정 — 계정 ID 앞 8자리(공백·대소문자 무시)", () => {
    expect(deleteConfirmMatches(" 3F0F9B2E ", ID.toLowerCase())).toBe(true);
    expect(deleteConfirmMatches("3f0f9b2", ID.toLowerCase())).toBe(false);
    expect(deleteConfirmMatches("", ID.toLowerCase())).toBe(false);
  });

  it("사유 — 다듬고 500자까지, 비면 null(SQL 제약과 같다)", () => {
    expect(DELETE_REASON_MAX).toBe(500);
    expect(normalizeDeleteReason("   ")).toBeNull();
    expect(normalizeDeleteReason("  이용자 요청(문의 메일 2026-09-28)  ")).toBe("이용자 요청(문의 메일 2026-09-28)");
    expect(normalizeDeleteReason("가".repeat(600))).toHaveLength(500);
  });

  it("사유에 이메일 주소가 있으면 막는다(SQL 제약 admin_audit_reason_no_email과 같은 패턴) — 안내 문구도 이메일·건강 정보를 말한다", () => {
    expect(deleteReasonProblem(null)).toBeNull();
    expect(deleteReasonProblem("이용자 요청(문의 메일 2026-09-28)")).toBeNull();
    expect(deleteReasonProblem("요청자 someone@example.com 이 메일로 요청")).toBe(ADMIN_TEXT.deleteReasonHasEmail);
    expect(deleteReasonProblem("First.Last+tag@sub.example.co.kr")).toBe(ADMIN_TEXT.deleteReasonHasEmail);
    expect(deleteReasonProblem("골뱅이@만")).toBeNull(); // 도메인 모양이 아니면 이메일이 아니다
    expect(ADMIN_TEXT.deleteReasonLabel).toContain("이메일");
    expect(ADMIN_TEXT.deleteReasonLabel).toContain("건강 정보");
  });

  it("실패 갈래 → 문장(없는 계정·내 계정·다른 관리자·0005 미실행·그 밖)", () => {
    const expected: Record<DeleteFailure, string> = {
      notFound: ADMIN_TEXT.deleteNotFound,
      self: ADMIN_TEXT.deleteSelf,
      isAdmin: ADMIN_TEXT.deleteIsAdmin,
      setupMissing: ADMIN_TEXT.toolsSetupHint,
      forbidden: ADMIN_TEXT.deleteFailed,
      failed: ADMIN_TEXT.deleteFailed,
    };
    for (const [failure, text] of Object.entries(expected)) expect(deleteFailureMessage(failure as DeleteFailure)).toBe(text);
    expect(ADMIN_TEXT.toolsSetupHint).toContain("0005_admin_tools.sql");
    expect(ADMIN_TEXT.deleteIsAdmin).toContain("public.admins");
  });
});

describe("CSV 내려받기 — 메타데이터만", () => {
  const kakao: AdminUserRow = {
    id: "3f0f9b2e-0000-4000-8000-000000000001",
    createdAt: "2026-09-27T15:30:00+00:00",
    lastSignInAt: "2026-09-28T01:02:00+00:00",
    isAnonymous: false,
    provider: "kakao",
    email: null,
    hasState: true,
    consentVersion: VERSION,
    stateUpdatedAt: "2026-09-28T01:05:00+00:00",
  };
  const guest: AdminUserRow = { ...kakao, id: "00000000-0000-4000-8000-000000000002", lastSignInAt: null, isAnonymous: true, provider: "anonymous", hasState: false, consentVersion: null, stateUpdatedAt: null };

  it("칸 — 쉼표·따옴표·줄바꿈은 따옴표로 감싸고, 수식 첫 글자는 막는다", () => {
    expect(csvCell("abc")).toBe("abc");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("두\n줄")).toBe('"두\n줄"');
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("-1")).toBe("'-1");
    // 값 없음 표시(하이픈 하나)는 수식이 아니라 그대로
    expect(csvCell(ADMIN_TEXT.none)).toBe("-");
    expect(csvCell("--1")).toBe("'--1");
  });

  it("첫 줄은 칸 이름, UTF-8 BOM + CRLF, 계정 메타데이터만 — 행에 이메일이 있어도 파일에 쓰지 않는다(닉네임·건강 기록도 없음)", () => {
    const text = usersCsv([{ ...kakao, email: "mom@example.com" }, guest], VERSION);
    expect(text.startsWith("\uFEFF")).toBe(true);
    const lines = text.slice(1).split("\r\n");
    expect(lines).toHaveLength(4); // 머리 + 2행 + 끝 줄바꿈 뒤 빈 줄
    expect(lines[3]).toBe("");
    expect(lines[0]).toBe("계정 ID,가입일,최근 접속,유형,동의 버전,현재 판 동의,기록 저장,마지막 저장일");
    expect(lines[1]).toBe(`${kakao.id},2026.09.28 00:30,2026.09.28 10:02,카카오,${VERSION},예,있음,2026.09.28`);
    expect(lines[2]).toBe(`${guest.id},2026.09.28 00:30,-,게스트,,아니요,없음,`);
    expect(text).not.toMatch(/email|이메일|닉네임|state\b|mom@example\.com/);
    expect(ADMIN_TEXT.csvNote).toContain("이메일");
    expect(usersCsv([], VERSION).slice(1).split("\r\n")).toEqual([lines[0], ""]);
  });

  it("접근 기록 안내 — 조회·내려받기가 admin_audit에 보존 기간(0009 정리와 같은 2년) 동안 남는다, 기록 함수가 없으면 파일을 만들지 않았다고 말한다", () => {
    expect(ADMIN_AUDIT_RETENTION_YEARS).toBe(2);
    expect(ADMIN_TEXT.accessLogNote).toBe("이 화면에서 조회하거나(이용 통계 포함) 내려받으면 누가 언제 했는지 admin_audit 표에 2년 동안 남아요.");
    expect(ADMIN_TEXT.auditSetupHint).toContain("CSV를 만들지 않았어요");
    expect(ADMIN_TEXT.auditSetupHint).toContain("supabase/migrations/0009_admin_access_log.sql");
    // 화면 문구 규칙 — 하이픈만(em dash 없음, emDash.test.ts), 진단·판정 같은 말 없음
    for (const t of [ADMIN_TEXT.accessLogNote, ADMIN_TEXT.auditSetupHint]) expect(t).not.toMatch(/—|판정/);
  });

  it("최대 5,000명 — 안내 문구와 같은 수. 파일 이름은 이 기기의 날짜", () => {
    expect(CSV_MAX_ROWS).toBe(5000);
    expect(ADMIN_TEXT.csvNote).toContain("5,000");
    expect(csvFileName(new Date(2026, 8, 28, 23, 40))).toBe("온맘-관리자-사용자-2026-09-28.csv");
  });
});

// ── 0011_admin_usage_stats.sql ───────────────────────────────────────────────

/** days칸 — 끝이 2026-11-04(오늘) */
function usageDailyJson(days: number, cell: (i: number) => { s?: unknown; m?: unknown; j?: unknown } = () => ({})) {
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

/** 서버가 돌려주는 모양 — 동의한 사용자 42명, 30일 */
const USAGE_JSON = {
  generated_at: "2026-11-04T08:14:35.630004+00:00",
  days: 30,
  period: { from: "2026-10-06", to: "2026-11-04" },
  k: 5,
  suppressed: false,
  totals: { consented_users: 42, active_users: 17 },
  daily: usageDailyJson(30, (i) => (i === 29 ? { s: 12, m: null, j: 0 } : i === 10 ? { s: 20, m: 7, j: null } : {})),
  adoption: { symptom_records: 12, mood_answers: 21, journal_posts: null },
  return_rate: { recording_users: 25, returning_users: 10 },
  distributions: {
    postpartum_weeks: { total: 42, counts: { weeks_0_1: 6, weeks_2_5: 11, weeks_6_11: null, weeks_12_plus: null, unknown: 7 } },
    delivery_method: { total: 42, counts: { vaginal: 20, cesarean: 15, unknown: 7 } },
    goal: null,
    mood_answers: { percents: { yes: 56, unsure: null, no: null } },
    red_flag: { percents: { red_flag: 12, other: 88 } },
  },
};

/** 동의한 사용자가 5명 미만일 때의 응답 */
const USAGE_SUPPRESSED_JSON = {
  ...USAGE_JSON,
  suppressed: true,
  totals: { consented_users: 1, active_users: 1 },
  daily: null,
  adoption: null,
  return_rate: null,
  distributions: null,
};

const usage = (patch: Record<string, unknown> = {}) => parseUsageStats({ ...USAGE_JSON, ...patch });
const shownUsage = () => usage() as UsageStats;

describe("이용 통계 — 기간", () => {
  it("서버와 같은 규칙으로 7~90일 — 소수는 버리고, 숫자가 아니면 기본 30일", () => {
    expect([USAGE_DAYS_MIN, USAGE_DEFAULT_DAYS, USAGE_DAYS_MAX]).toEqual([7, 30, 90]);
    expect(clampUsageDays(7)).toBe(7);
    expect(clampUsageDays(90)).toBe(90);
    expect(clampUsageDays(3)).toBe(7);
    expect(clampUsageDays(-5)).toBe(7);
    expect(clampUsageDays(0)).toBe(7);
    expect(clampUsageDays(1000)).toBe(90);
    expect(clampUsageDays(30.9)).toBe(30);
    expect(clampUsageDays(Number.NaN)).toBe(30);
    expect(clampUsageDays(Number.POSITIVE_INFINITY)).toBe(30);
  });

  it("단추는 7·30·90일 — 고른 기간만 켜지고, 맞추기를 거쳐도 그대로다", () => {
    expect(USAGE_PERIODS).toEqual([7, 30, 90]);
    for (const days of USAGE_PERIODS) expect(clampUsageDays(days)).toBe(days);
    expect(usagePeriodOptions(30)).toEqual([
      { days: 7, label: "7일", selected: false },
      { days: 30, label: "30일", selected: true },
      { days: 90, label: "90일", selected: false },
    ]);
    expect(usagePeriodOptions(14).every((o) => !o.selected)).toBe(true);
  });

  it("기간 표시 — 한국 날짜와 일수", () => {
    expect(usagePeriodText(shownUsage())).toBe("2026.10.06 ~ 2026.11.04(30일)");
  });
});

describe("parseUsageStats — 서버 응답 읽기", () => {
  it("칸을 화면 값으로 — 숨김(null)은 null, 0은 0, 날짜 순으로 정렬", () => {
    const s = parseUsageStats({ ...USAGE_JSON, daily: [...USAGE_JSON.daily].reverse() })!;
    expect(s.suppressed).toBe(false);
    expect(s.days).toBe(30);
    expect(s.period).toEqual({ from: "2026-10-06", to: "2026-11-04" });
    expect(s.totals).toEqual({ consentedUsers: 42, activeUsers: 17 });
    expect(s.generatedAt).toBe(USAGE_JSON.generated_at);
    expect(s.daily).toHaveLength(30);
    expect(s.daily![0].day).toBe("2026-10-06");
    expect(s.daily![29]).toEqual({ day: "2026-11-04", counts: { symptom: 12, mood: null, journal: 0 } });
    expect(s.adoption).toEqual({ symptom: 12, mood: 21, journal: null });
    expect(s.returnRate).toEqual({ recordingUsers: 25, returningUsers: 10 });
    expect(s.distributions.deliveryMethod).toEqual({
      total: 42,
      buckets: [
        { key: "vaginal", value: 20 },
        { key: "cesarean", value: 15 },
        { key: "unknown", value: 7 },
      ],
    });
    expect(s.distributions.goal).toBeNull();
    expect(s.distributions.postpartumWeeks?.buckets.map((b) => b.value)).toEqual([6, 11, null, null, 7]);
  });

  it("다른 칸이 와도 옮기지 않는다 — 계정 ID·자유 글이 섞여 와도 화면 값에 없다", () => {
    const leaked = {
      ...USAGE_JSON,
      user_ids: ["3f0f9b2e-0000-4000-8000-000000000001"],
      adoption: { ...USAGE_JSON.adoption, user_id: "3f0f9b2e-0000-4000-8000-000000000001" },
      daily: USAGE_JSON.daily.map((d) => ({ ...d, title: "비밀 글" })),
      distributions: {
        ...USAGE_JSON.distributions,
        delivery_method: { total: 42, counts: { vaginal: 20, cesarean: 15, unknown: 7, "비밀 글": 9 } },
      },
    };
    const text = JSON.stringify(parseUsageStats(leaked));
    expect(text).not.toContain("3f0f9b2e");
    expect(text).not.toContain("비밀 글");
    expect(text).not.toContain("user_id");
  });

  it("suppressed이면 건강 기록에서 나온 값을 모두 버린다 — 서버가 값을 함께 보내도 화면 값에 없다", () => {
    const empty = { daily: null, adoption: null, returnRate: null };
    const none = { postpartumWeeks: null, deliveryMethod: null, goal: null, moodAnswers: null, redFlag: null };
    expect(parseUsageStats(USAGE_SUPPRESSED_JSON)).toMatchObject({ suppressed: true, totals: { consentedUsers: 1, activeUsers: 1 }, ...empty, distributions: none });
    expect(parseUsageStats({ ...USAGE_JSON, suppressed: true })).toMatchObject({ suppressed: true, ...empty, distributions: none });
  });

  it(`동의한 사용자가 ${USAGE_K}명 미만이면 서버가 suppressed를 빠뜨려도 화면이 숨긴다, ${USAGE_K}명부터는 보인다`, () => {
    const four = usage({ totals: { consented_users: 4, active_users: 4 } });
    expect(four).toMatchObject({ suppressed: true, daily: null, adoption: null, returnRate: null });
    expect(four!.distributions.deliveryMethod).toBeNull();
    const five = usage({ totals: { consented_users: 5, active_users: 4 }, adoption: null, return_rate: null, distributions: null });
    expect(five!.suppressed).toBe(false);
    expect(five!.daily).toHaveLength(30);
  });

  it("이용 수의 1~4는 서버가 숨겼어야 할 값 — 그 칸만 숨긴다(0과 5는 그대로)", () => {
    const s = usage({
      daily: usageDailyJson(30, (i) => (i === 0 ? { s: 1, m: 4, j: 5 } : {})),
      adoption: { symptom_records: 3, mood_answers: 0, journal_posts: 5 },
      return_rate: { recording_users: 5, returning_users: 2 },
    })!;
    expect(s.daily![0].counts).toEqual({ symptom: null, mood: null, journal: 5 });
    expect(s.daily![1].counts).toEqual({ symptom: 0, mood: 0, journal: 0 });
    expect(s.adoption).toEqual({ symptom: null, mood: 0, journal: 5 });
    expect(s.returnRate).toEqual({ recordingUsers: 5, returningUsers: null });
  });

  it("분포의 보이는 칸에 0~4가 오면 그 분포 전체를 숨긴다 — 그 칸만 숨기면 합계에서 빼서 되살릴 수 있다", () => {
    const withDelivery = (counts: Record<string, unknown>) =>
      usage({ distributions: { ...USAGE_JSON.distributions, delivery_method: { total: 42, counts } } })!.distributions.deliveryMethod;
    expect(withDelivery({ vaginal: 30, cesarean: 4, unknown: 8 })).toBeNull();
    expect(withDelivery({ vaginal: 42, cesarean: 0, unknown: 0 })).toBeNull();
    expect(withDelivery({ vaginal: 37, cesarean: 5, unknown: null })?.buckets.map((b) => b.value)).toEqual([37, 5, null]);
  });

  it("기록 분포는 비율만 읽는다 — 합계·칸의 수가 함께 와도 화면 값에 없다(날짜별 칸에서 빼서 숨긴 날을 되살리지 못하게)", () => {
    const s = shownUsage();
    expect(s.distributions.moodAnswers).toEqual({
      total: null,
      buckets: [
        { key: "yes", value: 56 },
        { key: "unsure", value: null },
        { key: "no", value: null },
      ],
    });
    expect(s.distributions.redFlag?.total).toBeNull();
    const withCounts = usage({
      distributions: { ...USAGE_JSON.distributions, red_flag: { total: 848, counts: { red_flag: 125, other: 723 }, percents: { red_flag: 15, other: 85 } } },
    })!;
    expect(withCounts.distributions.redFlag).toEqual({ total: null, buckets: [{ key: "red_flag", value: 15 }, { key: "other", value: 85 }] });
    expect(JSON.stringify(withCounts.distributions.redFlag)).not.toMatch(/848|125|723/);
    // 비율은 5보다 작아도 된다(사람 수가 아니다 — 5명 미만 숨김은 서버가 칸의 사람 수로 정한다)
    expect(usage({ distributions: { ...USAGE_JSON.distributions, red_flag: { percents: { red_flag: 3, other: 97 } } } })!.distributions.redFlag?.buckets[0].value).toBe(3);
    // 칸마다 반올림해 합이 100을 조금 넘는 것은 정상이다
    expect(usage({ distributions: { ...USAGE_JSON.distributions, mood_answers: { percents: { yes: 34, unsure: 34, no: 33 } } } })).not.toBeNull();
  });

  it("칸이 빠지면 숨김, 모든 칸이 숨김이면 분포 전체가 null, 분포 묶음이 없으면 모두 null", () => {
    const withDelivery = (v: unknown) => usage({ distributions: { ...USAGE_JSON.distributions, delivery_method: v } })!.distributions.deliveryMethod;
    expect(withDelivery({ total: 42, counts: { vaginal: 20 } })?.buckets.map((b) => b.value)).toEqual([20, null, null]);
    expect(withDelivery({ total: 42, counts: { vaginal: null, cesarean: null, unknown: null } })).toBeNull();
    expect(withDelivery(null)).toBeNull();
    const none = usage({ distributions: null })!;
    for (const id of USAGE_DISTRIBUTION_IDS) expect(none.distributions[id]).toBeNull();
    expect(usage({ daily: null, adoption: null, return_rate: null })).toMatchObject({ daily: null, adoption: null, returnRate: null });
  });

  it("bigint가 문자열로 와도 읽는다", () => {
    const s = usage({ totals: { consented_users: "42", active_users: "17" }, daily: usageDailyJson(30, () => ({ s: "12" })) })!;
    expect(s.totals.consentedUsers).toBe(42);
    expect(s.daily![0].counts.symptom).toBe(12);
  });

  it("서버의 숨김 기준이 화면과 다르면 읽지 않는다(k 3이면 '5명 미만' 문구가 거짓이 된다)", () => {
    expect(USAGE_K).toBe(5);
    expect(usage({ k: 3 })).toBeNull();
    expect(usage({ k: 10 })).toBeNull();
    expect(usage({ k: undefined })).toBeNull();
  });

  it("모양이 다르면 0으로 꾸미지 않고 null", () => {
    expect(parseUsageStats(null)).toBeNull();
    expect(parseUsageStats([])).toBeNull();
    expect(usage({ totals: undefined })).toBeNull();
    expect(usage({ totals: { consented_users: -1, active_users: 0 } })).toBeNull();
    expect(usage({ totals: { consented_users: 10, active_users: 11 } })).toBeNull(); // 활성은 동의한 사람의 일부다
    expect(usage({ days: 6 })).toBeNull();
    expect(usage({ days: 91 })).toBeNull();
    expect(usage({ period: { from: "10/06", to: "2026-11-04" } })).toBeNull();
    expect(usage({ period: { from: "2026-11-05", to: "2026-11-04" } })).toBeNull();
    expect(usage({ suppressed: "false" })).toBeNull();
    expect(usage({ suppressed: undefined })).toBeNull();
    expect(usage({ daily: "x" })).toBeNull();
    expect(usage({ daily: [{ day: "11/04", symptom_records: 0 }] })).toBeNull();
    expect(usage({ daily: usageDailyJson(30, () => ({ s: -1 })) })).toBeNull();
    expect(usage({ daily: usageDailyJson(30, () => ({ m: "많음" })) })).toBeNull();
    expect(usage({ adoption: "x" })).toBeNull();
    expect(usage({ adoption: { symptom_records: 43, mood_answers: 0, journal_posts: 0 } })).toBeNull(); // 동의한 사람보다 많을 수 없다
    expect(usage({ return_rate: { recording_users: 10, returning_users: 11 } })).toBeNull();
    expect(usage({ return_rate: { recording_users: 43, returning_users: null } })).toBeNull();
    expect(usage({ distributions: "x" })).toBeNull();
    expect(usage({ distributions: { ...USAGE_JSON.distributions, goal: { total: "많음", counts: {} } } })).toBeNull();
    expect(usage({ distributions: { ...USAGE_JSON.distributions, goal: { total: 42 } } })).toBeNull();
    expect(usage({ distributions: { ...USAGE_JSON.distributions, goal: { total: 42, counts: { homemaker: "많음" } } } })).toBeNull();
    expect(usage({ distributions: { ...USAGE_JSON.distributions, goal: { total: 10, counts: { homemaker: 6, returning_to_work: 6 } } } })).toBeNull(); // 칸의 합이 전체보다 크다
    expect(usage({ distributions: { ...USAGE_JSON.distributions, mood_answers: { total: 71, counts: { yes: 40 } } } })).toBeNull(); // 기록 분포는 비율로만 온다
    expect(usage({ distributions: { ...USAGE_JSON.distributions, mood_answers: { percents: { yes: 101 } } } })).toBeNull();
    expect(usage({ distributions: { ...USAGE_JSON.distributions, mood_answers: { percents: { yes: 60, unsure: 60 } } } })).toBeNull(); // 합이 100을 크게 넘는다
    expect(usage({ distributions: { ...USAGE_JSON.distributions, mood_answers: { percents: { yes: "많음" } } } })).toBeNull();
  });

  it("집계 시각이 없어도 나머지는 읽는다", () => {
    expect(usage({ generated_at: null })?.generatedAt).toBeNull();
  });
});

describe("이용 통계 — 문구", () => {
  it(`숨김 문구는 k(${USAGE_K}명)를 말하고, 0011 설치 안내는 파일 이름을 말한다`, () => {
    expect(ADMIN_TEXT.usageTitle).toBe("이용 통계(집계)");
    expect(ADMIN_TEXT.usageHidden).toBe("5명 미만이라 숨겼어요");
    expect(ADMIN_TEXT.usageHiddenShort).toBe("숨김");
    expect(ADMIN_TEXT.usageHiddenDayLegend).toBe("5명 미만이라 숨긴 날");
    expect(ADMIN_TEXT.usageSetupHint).toContain("0011_admin_usage_stats.sql");
    expect(ADMIN_TEXT.usageSetupHint).toContain("실행했는지 확인");
    expect(ADMIN_TEXT.usageSuppressedBody).toContain("통계에 동의한 사용자가 5명 미만");
  });

  it("통계는 통계 목적에 동의한 사람을 센다고 말한다 — 묶음 머리·안내·수를 세는 칸·기준 줄·화면 위 개인정보 안내 모두", () => {
    expect(ADMIN_TEXT.usageSubtitle).toContain("서비스 개선 통계에 동의한 사용자");
    expect(ADMIN_TEXT.usageNote).toContain("서비스 개선 통계에 동의한 사람만");
    expect(ADMIN_TEXT.usageKpiConsented).toBe("통계에 동의한 사용자");
    expect(ADMIN_TEXT.usageAdoptionSubtitle).toContain("통계에 동의한 사용자");
    expect(ADMIN_TEXT.privacyNote).toContain("통계에 동의한 사람의 익명 집계");
    for (const id of ["postpartumWeeks", "deliveryMethod", "goal"] as const) {
      expect(usageDistributionView(shownUsage(), id).basis, id).toContain("통계에 동의한 사용자");
    }
  });

  it("칸 이름 — 분만 방식·목표·기분 답은 앱의 원문 그대로, 모든 칸에 이름이 있다", () => {
    expect(USAGE_BUCKET_LABEL.deliveryMethod).toEqual({ vaginal: "자연분만", cesarean: "제왕절개", unknown: "미설정" });
    expect(USAGE_BUCKET_LABEL.goal).toEqual({ homemaker: "전업", returning_to_work: "복직 예정", unknown: "미설정" });
    expect(USAGE_BUCKET_LABEL.moodAnswers).toEqual({ yes: "네", unsure: "글쎄요", no: "아니요" });
    expect(Object.values(USAGE_BUCKET_LABEL.postpartumWeeks)).toEqual(["0~1주차", "2~5주차", "6~11주차", "12주차 이상", "출산일 없음"]);
    for (const id of USAGE_DISTRIBUTION_IDS) {
      expect(Object.keys(USAGE_BUCKET_LABEL[id])).toEqual([...USAGE_DISTRIBUTIONS[id].buckets]);
    }
  });

  it("개인정보 안내 — 개인의 건강 기록은 안 보이고, 건강 기록은 익명 집계로만, 5명 미만인 칸은 숨긴다. 통계를 본 것도 남는다", () => {
    expect(ADMIN_TEXT.privacyNote).toContain("개인의 건강 기록 내용은 이 화면에 나오지 않아요");
    expect(ADMIN_TEXT.privacyNote).toContain("익명 집계");
    expect(ADMIN_TEXT.privacyNote).toContain("5명 미만인 칸은 숨겨요");
    expect(ADMIN_TEXT.accessLogNote).toContain("이용 통계 포함");
    expect(ADMIN_TEXT.accessLogNote).toContain("admin_audit");
    expect(ADMIN_TEXT.usageNote).toContain("admin_audit");
  });

  it("화면 문구 규칙 — 하이픈만(em dash 없음), 진단·판정 같은 말 없음", () => {
    const usageText = Object.entries(ADMIN_TEXT).filter(([key]) => key.startsWith("usage") || key === "privacyNote" || key === "accessLogNote");
    expect(usageText.length).toBeGreaterThan(30);
    for (const [key, text] of usageText) expect(text, key).not.toMatch(/—|판정|진단/);
  });
});

describe("이용 통계 — 한눈에 보기", () => {
  it("네 칸 — 동의한 사용자·기간 중 기록 저장·기록한 사람·재방문", () => {
    expect(usageKpis(shownUsage()).map((k) => [k.id, k.label, k.value, k.caption])).toEqual([
      ["consented", "통계에 동의한 사용자", "42", "관리자 계정 제외"],
      ["active", "기간 중 기록 저장", "17", "서버 저장 시각 기준 · 전체의 40%"],
      ["recording", "기록한 사람", "25", "기록 시각 기준"],
      ["returning", "재방문", "40%", "이틀 이상 기록 10명"],
    ]);
  });

  it("숨긴 칸은 숫자 대신 '숨김' — 재방문은 두 수 중 하나라도 숨겨지면 숨김", () => {
    const hidden = usage({ return_rate: { recording_users: 25, returning_users: null } })!;
    expect(usageKpis(hidden).slice(2).map((k) => [k.value, k.caption])).toEqual([
      ["25", "기록 시각 기준"],
      ["숨김", "5명 미만이라 숨겼어요"],
    ]);
  });

  it("suppressed — 계정 수만 보이고 나머지는 숨김. 1명만 있어도 건강 기록에서 나온 수는 없다", () => {
    const k = usageKpis(parseUsageStats(USAGE_SUPPRESSED_JSON)!);
    expect(k.map((c) => c.value)).toEqual(["1", "1", "숨김", "숨김"]);
    expect(k[2].caption).toBe("5명 미만이라 숨겼어요");
  });

  it("기록한 사람이 0명이면 재방문 비율은 없다(0으로 나누지 않는다), 동의한 사람이 0명이면 비율 줄을 뺀다", () => {
    const none = usage({ return_rate: { recording_users: 0, returning_users: 0 } })!;
    expect(usageKpis(none)[3]).toMatchObject({ value: "-", caption: "이틀 이상 기록 0명" });
    const empty = parseUsageStats({ ...USAGE_SUPPRESSED_JSON, totals: { consented_users: 0, active_users: 0 } })!;
    expect(usageKpis(empty)[1].caption).toBe("서버 저장 시각 기준");
  });
});

describe("이용 통계 — 날짜별 기록", () => {
  const dayCounts = (n: number, f: (i: number) => Partial<UsageDay["counts"]> = () => ({})): UsageDay[] =>
    parseUsageStats({ ...USAGE_JSON, days: n, daily: usageDailyJson(n) })!.daily!.map((d, i) => ({ ...d, counts: { ...d.counts, ...f(i) } }));

  it("갈래 셋 — 증상 기록·기분 살피기 답·기록장 글, 갈래마다 세로축이 따로다", () => {
    const view = usageDailyView(shownUsage().daily!);
    expect(view.series.map((s) => [s.activity, s.title])).toEqual([
      ["symptom", "증상 기록"],
      ["mood", "기분 살피기 답"],
      ["journal", "기록장 글"],
    ]);
    expect(view.series[0].scale.max).toBeGreaterThanOrEqual(20);
    expect(view.series[1].scale.max).toBeGreaterThanOrEqual(7);
    expect(view.series[1].scale.max).toBeLessThan(view.series[0].scale.max);
  });

  it("숨긴 날은 값 없이(0으로 꾸미지 않는다) 막대도 없고, 합계·꼭대기에서 뺀다", () => {
    const view = usageDailyView(dayCounts(30, (i) => (i === 3 ? { symptom: null } : i === 4 ? { symptom: 10 } : i === 5 ? { symptom: 5 } : {})));
    const s = view.series[0];
    expect(s.bars[3]).toMatchObject({ value: null, heightPct: 0 });
    expect(s.bars[4].value).toBe(10);
    expect(s.bars[4].heightPct).toBeGreaterThan(0);
    expect(s.bars[0]).toMatchObject({ value: 0, heightPct: 0 });
    expect(s.visibleTotal).toBe(15);
    expect(s.hiddenDays).toBe(1);
    expect(s.caption).toBe("보이는 날 합계 15건 · 가장 많은 날 10월 10일 10건 · 숨긴 날 1일");
  });

  it("보이는 값이 없으면 합계만, 모두 숨겨져도 그림이 깨지지 않는다", () => {
    const zero = usageDailyView(dayCounts(7));
    expect(zero.series[0].caption).toBe("보이는 날 합계 0건");
    expect(zero.series[0].scale).toEqual({ max: 1, ticks: [0, 1] });
    const hidden = usageDailyView(dayCounts(7, () => ({ mood: null })));
    expect(hidden.series[1].caption).toBe("보이는 날 합계 0건 · 숨긴 날 7일");
    expect(hidden.series[1].bars.every((b) => b.value === null && b.heightPct === 0)).toBe(true);
  });

  it("막대는 꼭대기를 넘지 않는다", () => {
    const view = usageDailyView(dayCounts(30, (i) => ({ symptom: i * 37 })));
    for (const b of view.series[0].bars) {
      expect(b.heightPct).toBeGreaterThanOrEqual(0);
      expect(b.heightPct).toBeLessThanOrEqual(100);
    }
  });

  it("가로축 — 7일은 날마다, 30일은 7일마다, 90일은 14일마다, 늘 오늘 포함", () => {
    expect([usageTickStep(7), usageTickStep(30), usageTickStep(90)]).toEqual([1, 7, 14]);
    const ticks = (n: number) => usageDailyView(dayCounts(n)).days.filter((d) => d.tick !== null);
    expect(ticks(7)).toHaveLength(7);
    expect(ticks(30)).toHaveLength(5);
    expect(ticks(90)).toHaveLength(7);
    for (const n of USAGE_PERIODS) expect(ticks(n).at(-1)?.tick).toBe("11.4");
    expect(usageDailyView(dayCounts(30)).dense).toBe(false);
    expect(usageDailyView(dayCounts(90)).dense).toBe(true);
  });

  it("글자 대안 — 그림 전체 요약과 가리킨 날의 값(숨김도 말한다)", () => {
    const view = usageDailyView(shownUsage().daily!);
    expect(view.summary).toBe(
      "최근 30일 날짜별 기록(보이는 날 합계): 증상 기록 32건, 기분 살피기 답 7건, 기록장 글 0건. 5명 미만이라 숨긴 날: 기분 살피기 답 1일, 기록장 글 1일.",
    );
    expect(usageDayReadout(view, 29)).toBe("11월 4일 · 증상 기록 12건 · 기분 살피기 답 숨김 · 기록장 글 0건");
    expect(usageDayReadout(view, 99)).toBe("");
    expect(usageDailyView(dayCounts(7)).summary).toBe("최근 7일 날짜별 기록(보이는 날 합계): 증상 기록 0건, 기분 살피기 답 0건, 기록장 글 0건.");
    expect(usageValueText(null)).toBe("숨김");
    expect(usageValueText(1284)).toBe("1,284건");
    expect(formatRecords(0)).toBe("0건");
  });
});

describe("이용 통계 — 기능별 이용 · 분포", () => {
  it("기능별 이용 — 동의한 사용자 대비 수와 비율, 숨긴 기능은 까닭을 적는다", () => {
    const v = usageAdoptionView(shownUsage());
    expect(v.title).toBe("기능별 이용");
    expect(v.rows.map((r) => [r.label, r.valueLabel])).toEqual([
      ["증상 기록", "12명 · 29%"],
      ["기분 살피기", "21명 · 50%"],
      ["기록장", "숨김"],
    ]);
    expect(v.rows[1].widthPct).toBeCloseTo(50);
    expect(v.rows[2]).toMatchObject({ value: null, widthPct: 0 });
    expect(v.note).toBe("숨김: 그 기능을 쓴 사람이 5명 미만이에요.");
    expect(v.hidden).toBe(false);
  });

  it("아무도 쓰지 않은 기능은 0명으로 보인다(숨김과 다르다), 숨긴 줄이 없으면 까닭도 없다", () => {
    const v = usageAdoptionView(usage({ adoption: { symptom_records: 12, mood_answers: 0, journal_posts: 5 } })!);
    expect(v.rows[1]).toMatchObject({ value: 0, valueLabel: "0명 · 0%", widthPct: 0 });
    expect(v.note).toBeNull();
  });

  it("분포 — 칸 순서 그대로, 사람 분포는 명과 기준 수 대비 비율, 기록 분포는 비율만", () => {
    const weeks = usageDistributionView(shownUsage(), "postpartumWeeks");
    expect(weeks.title).toBe("산후 주차");
    expect(weeks.basis).toBe("통계에 동의한 사용자 42명 · 오늘 기준");
    expect(weeks.rows.map((r) => [r.label, r.valueLabel])).toEqual([
      ["0~1주차", "6명 · 14%"],
      ["2~5주차", "11명 · 26%"],
      ["6~11주차", "숨김"],
      ["12주차 이상", "숨김"],
      ["출산일 없음", "7명 · 17%"],
    ]);
    expect(weeks.note).toBe(ADMIN_TEXT.usageComplementNote);
    const mood = usageDistributionView(shownUsage(), "moodAnswers");
    expect(mood.basis).toBe("기간 안의 답 기준");
    expect(mood.rows.map((r) => [r.label, r.valueLabel])).toEqual([
      ["네", "56%"],
      ["글쎄요", "숨김"],
      ["아니요", "숨김"],
    ]);
    expect(mood.rows[0].widthPct).toBe(56);
    const delivery = usageDistributionView(shownUsage(), "deliveryMethod");
    expect(delivery.basis).toBe("통계에 동의한 사용자 42명 기준");
    expect(delivery.rows.map((r) => r.label)).toEqual(["자연분만", "제왕절개", "미설정"]);
    expect(delivery.note).toBeNull();
  });

  it("모든 칸이 숨겨지면 줄 없이 전체 숨김 — 기준 수도 말하지 않는다", () => {
    expect(usageDistributionView(shownUsage(), "goal")).toEqual({
      id: "goal",
      title: "목표",
      basis: "통계에 동의한 사용자 기준",
      rows: [],
      hidden: true,
      note: null,
    });
  });

  it("병원 안내 — 하나의 비율만(건수 없음), 숨기면 비율도 없다", () => {
    expect(usageRedFlagView(shownUsage())).toEqual({ title: "병원 안내가 나온 증상 기록", basis: "기간 안의 증상 기록 기준", hidden: false, share: "12%", widthPct: 12 });
    const hidden = usageRedFlagView(usage({ distributions: { ...USAGE_JSON.distributions, red_flag: null } })!);
    expect(hidden).toEqual({ title: "병원 안내가 나온 증상 기록", basis: "기간 안의 증상 기록 기준", hidden: true, share: null, widthPct: 0 });
  });

  it("suppressed — 기능별 이용·모든 분포가 숨김", () => {
    const s = parseUsageStats(USAGE_SUPPRESSED_JSON)!;
    expect(usageAdoptionView(s)).toMatchObject({ hidden: true, note: null });
    for (const id of USAGE_DISTRIBUTION_IDS) expect(usageDistributionView(s, id).hidden).toBe(true);
    expect(usageRedFlagView(s).hidden).toBe(true);
  });
});

// ── 관리자 보안 보강(0014) ─────────────────────────────────────────────────

describe("0014 — CSV 사유·무동작·인증 앱 숫자·QR", () => {
  it("CSV 사유 — 공백을 지우고 200자까지, 비었거나 이메일 모양이면 보내지 않는다", () => {
    expect(normalizeCsvReason("  월간 정리  ")).toBe("월간 정리");
    expect(normalizeCsvReason("가".repeat(250))).toHaveLength(CSV_REASON_MAX);
    expect(csvReasonProblem("")).toBe(ADMIN_TEXT.csvReasonRequired);
    expect(csvReasonProblem(normalizeCsvReason("   "))).toBe(ADMIN_TEXT.csvReasonRequired);
    expect(csvReasonProblem("문의 user@example.com 요청")).toBe(ADMIN_TEXT.csvReasonHasEmail);
    expect(csvReasonProblem("월간 가입 현황 정리")).toBeNull();
  });

  it("무동작 — 마지막 활동부터 15분이 지나면(같거나 넘으면) 만료, 시계가 뒤로 가면 만료 아님", () => {
    expect(ADMIN_IDLE_MINUTES).toBe(15);
    const t = 1_700_000_000_000;
    expect(adminIdleExpired(t, t + 15 * 60_000 - 1)).toBe(false);
    expect(adminIdleExpired(t, t + 15 * 60_000)).toBe(true);
    expect(adminIdleExpired(t, t - 60 * 60_000)).toBe(false);
    expect(adminIdleExpired(t, t + 60_000, 1)).toBe(true);
    expect(ADMIN_TEXT.idleBody).toContain(`${ADMIN_IDLE_MINUTES}분`);
  });

  it("인증 앱 숫자 — 공백·하이픈은 빼고 정확히 6자리 숫자만", () => {
    expect(normalizeTotpCode("123456")).toBe("123456");
    expect(normalizeTotpCode(" 123 456 ")).toBe("123456");
    expect(normalizeTotpCode("123-456")).toBe("123456");
    expect(normalizeTotpCode("12345")).toBeNull();
    expect(normalizeTotpCode("1234567")).toBeNull();
    expect(normalizeTotpCode("12a456")).toBeNull();
    expect(normalizeTotpCode("１２３４５６")).toBeNull();
  });

  it("QR — supabase-js의 인코딩 안 된 SVG data URL을 인코딩해 다시 만든다, SVG가 아니면 그리지 않는다", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path fill="#000" d="M0 0h1v1H0z"/></svg>';
    const src = qrImageSrc(`data:image/svg+xml;utf-8,${svg}`)!;
    expect(src.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(src).not.toContain("#");
    expect(decodeURIComponent(src.slice("data:image/svg+xml;charset=utf-8,".length))).toBe(svg);
    expect(qrImageSrc(svg)).toBe(src);
    expect(qrImageSrc('<?xml version="1.0"?>\n<svg viewBox="0 0 1 1"></svg>')).not.toBeNull();
    expect(qrImageSrc("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(qrImageSrc("javascript:alert(1)")).toBeNull();
    expect(qrImageSrc("")).toBeNull();
  });

  it("비밀 키는 4글자씩 띄운다", () => {
    expect(groupSecret("JBSWY3DPEHPK3PXP")).toBe("JBSW Y3DP EHPK 3PXP");
    expect(groupSecret("ABCDE")).toBe("ABCD E");
    expect(groupSecret("")).toBe("");
  });
});
