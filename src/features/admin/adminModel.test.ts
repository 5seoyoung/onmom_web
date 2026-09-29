import { describe, expect, it } from "vitest";
import {
  ADMIN_LIST_MAX,
  ADMIN_TEXT,
  ADMIN_PAGE_SIZE,
  CSV_MAX_ROWS,
  DELETE_REASON_MAX,
  accountKind,
  adminRowView,
  barReadout,
  chartBars,
  chartSegmentKinds,
  chartSummary,
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
  parseUserRows,
  segmentUsers,
  sharePercent,
  shortId,
  splitPage,
  userRowView,
  usersCsv,
  usersPageArgs,
  type AdminOverview,
  type AdminUserRow,
  type DayCount,
  type DeleteFailure,
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
    const rows = parseUserRows([{ ...ROW_JSON, email: "a@b.c", state: { symptoms: [] } }]);
    expect(rows).toEqual([
      {
        id: ROW_JSON.id,
        createdAt: ROW_JSON.created_at,
        lastSignInAt: ROW_JSON.last_sign_in_at,
        isAnonymous: false,
        provider: "kakao",
        hasState: true,
        consentVersion: VERSION,
        stateUpdatedAt: ROW_JSON.state_updated_at,
      },
    ]);
    expect(Object.keys(rows![0])).not.toContain("email");
    expect(Object.keys(rows![0])).not.toContain("state");
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
    expect(formatSeoulDate(null)).toBe("—");
    expect(formatSeoulDateTime("nope")).toBe("—");
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
      lastSignIn: "—",
      kind: "guest",
      kindLabel: "게스트",
      consent: "—",
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
      lastSignIn: "—",
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
  });

  it("첫 줄은 칸 이름, UTF-8 BOM + CRLF, 표에 보이는 칸만(이메일·닉네임·건강 기록 없음)", () => {
    const text = usersCsv([kakao, guest], VERSION);
    expect(text.startsWith("\uFEFF")).toBe(true);
    const lines = text.slice(1).split("\r\n");
    expect(lines).toHaveLength(4); // 머리 + 2행 + 끝 줄바꿈 뒤 빈 줄
    expect(lines[3]).toBe("");
    expect(lines[0]).toBe("계정 ID,가입일,최근 접속,유형,동의 버전,현재 판 동의,기록 저장,마지막 저장일");
    expect(lines[1]).toBe(`${kakao.id},2026.09.28 00:30,2026.09.28 10:02,카카오,${VERSION},예,있음,2026.09.28`);
    expect(lines[2]).toBe(`${guest.id},2026.09.28 00:30,—,게스트,,아니요,없음,`);
    expect(text).not.toMatch(/email|이메일|닉네임|state\b/);
    expect(usersCsv([], VERSION).slice(1).split("\r\n")).toEqual([lines[0], ""]);
  });

  it("최대 5,000명 — 안내 문구와 같은 수. 파일 이름은 이 기기의 날짜", () => {
    expect(CSV_MAX_ROWS).toBe(5000);
    expect(ADMIN_TEXT.csvNote).toContain("5,000");
    expect(csvFileName(new Date(2026, 8, 28, 23, 40))).toBe("온맘-관리자-사용자-2026-09-28.csv");
  });
});
