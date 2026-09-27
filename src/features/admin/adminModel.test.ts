import { describe, expect, it } from "vitest";
import {
  ADMIN_LIST_MAX,
  ADMIN_TEXT,
  ADMIN_PAGE_SIZE,
  accountKind,
  barReadout,
  chartBars,
  chartSummary,
  dayLong,
  dayTick,
  formatCount,
  formatPeople,
  formatSeoulDate,
  formatSeoulDateTime,
  generatedAtLabel,
  kpiCards,
  niceScale,
  pageLabel,
  parseCount,
  parseOverview,
  parseUserRows,
  sharePercent,
  shortId,
  splitPage,
  userRowView,
  usersPageArgs,
  type AdminOverview,
  type AdminUserRow,
  type DayCount,
} from "./adminModel";

const VERSION = "web-2026-09-28";

/** 2026-08-30 ~ 2026-09-28(한국 날짜) 30칸 */
function thirtyDays(values: (i: number) => number = () => 0): DayCount[] {
  const out: DayCount[] = [];
  const start = Date.UTC(2026, 7, 30);
  for (let i = 0; i < 30; i++) {
    const d = new Date(start + i * 86_400_000);
    out.push({ day: d.toISOString().slice(0, 10), users: values(i) });
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
