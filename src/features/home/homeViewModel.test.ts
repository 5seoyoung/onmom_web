import { describe, expect, it } from "vitest";
import type { MoodCheckRecord, PersistedState, SymptomRecord } from "@/domain/types";
import { initialState } from "@/store/defaults";
import {
  HOME_TEXT,
  MOOD_CALLS,
  buildHomeViewModel,
  heroChips,
  homeDayCount,
  recordReferenceTime,
  recoveryStateCard,
  returnToWorkChip,
  telHref,
} from "./homeViewModel";

// vitest.config.ts가 TZ=Asia/Seoul로 고정한다. 2026-09-27(일) 14:00 KST.
const NOW = new Date(2026, 8, 27, 14, 0, 0);

const record = (over: Partial<SymptomRecord> = {}): SymptomRecord => ({
  id: "r1",
  date: new Date(2026, 8, 27, 13, 0, 0).toISOString(), // 1시간 전
  lochiaIncreased: false,
  lochiaRed: false,
  feverEvent: false,
  painNrs: 0,
  redFlagCode: null,
  postpartumDays: 63,
  ...over,
});

function stateWith(over: {
  profile?: Partial<PersistedState["profile"]>;
  maternity?: Partial<PersistedState["maternity"]>;
  symptomHistory?: SymptomRecord[];
  moodChecks?: MoodCheckRecord[];
  moodCardSnoozedUntil?: string | null;
}): PersistedState {
  const base = initialState();
  return {
    ...base,
    hasOnboarded: true,
    profile: { ...base.profile, ...over.profile },
    maternity: { ...base.maternity, ...over.maternity },
    symptomHistory: over.symptomHistory ?? [],
    moodChecks: over.moodChecks ?? [],
    moodCardSnoozedUntil: over.moodCardSnoozedUntil ?? null,
  };
}

/** 오늘부터 거꾸로 n일 동안 매일 「아니요」 */
function noAnswers(days: number): MoodCheckRecord[] {
  return Array.from({ length: days }, (_, i) => ({
    id: `m${i}`,
    date: new Date(2026, 8, 27 - i, 9, 0, 0).toISOString(),
    questionID: 1,
    answer: "no" as const,
  }));
}

// home.png — 제왕절개 63일차(9주차) · 전업 · 기록 없음 · 골반통+복직근 이개 · BMI 24.4
const SCREENSHOT_HOME = stateWith({
  profile: {
    deliveryDate: "2026-07-26",
    deliveryMethod: "cesarean",
    goal: "homemaker",
    heightCm: 160,
    currentWeightKg: 62.5,
  },
  maternity: { pelvicPain: true, diastasisRecti: true },
});

describe("buildHomeViewModel — 첫 실행(아무 입력 없음)", () => {
  const vm = buildHomeViewModel(initialState(), NOW);

  it("받지 않은 값을 지어내지 않는다 — 일차 없음, 조건 카드 전부 없음", () => {
    expect(vm.dayCount).toBeNull();
    expect(vm.heroChips).toEqual(["분만"]); // HomeView.swift:99 `?? "분만"`
    expect(vm.recoveryState).toEqual({ kind: "empty" });
    expect(vm.showMoodCard).toBe(false);
    expect(vm.metrics).toBeNull();
    expect(vm.stageCard).toBeNull();
    expect(vm.weightPlan).toBeNull();
  });
});

describe("buildHomeViewModel — home.png", () => {
  const vm = buildHomeViewModel(SCREENSHOT_HOME, NOW);

  it("히어로: 63일차 · 제왕절개 · 전업", () => {
    expect(vm.dayCount).toBe(63);
    expect(vm.heroChips).toEqual(["제왕절개", "전업"]);
  });

  it("기록이 없으면 기록 유도 카드, 지표 카드 없음", () => {
    expect(vm.recoveryState).toEqual({ kind: "empty" });
    expect(vm.metrics).toBeNull();
  });

  it("지금 회복 단계: 9주차 골반저근, 막힌 단계 줄, 다음 단계 없음(코어 강화도 막힘)", () => {
    expect(vm.stageCard).toEqual({
      kind: "stage",
      heading: "지금 회복 단계 — 9주차",
      current: "골반저근 · 케겔(골반저근 운동)",
      next: null,
      excluded: ["기능 강화 제외 — 골반통·치골결합 통증이 있어 한다리·비대칭 동작(클램·런지 등)은 피해요"],
    });
  });

  it("체중 감량 목표 + 칩", () => {
    expect(vm.weightPlan?.title).toBe("체중 감량 목표");
    expect(vm.weightPlan?.chips).toEqual(["BMI 24.4", "주당 0.5kg", "유산소(걷기)", "6개월 5~10% 감량"]);
  });

  it("다음 단계가 막히지 않았으면 다음 단계 줄이 나온다", () => {
    const s = stateWith({ profile: { deliveryDate: "2026-07-26", deliveryMethod: "cesarean" } });
    const card = buildHomeViewModel(s, NOW).stageCard;
    expect(card).toMatchObject({ kind: "stage", current: "기능 강화 · 브릿지·클램·하체 근력", excluded: [] });
    expect(card?.kind === "stage" && card.next).toBe("12주차부터 '코어 강화' 단계가 열려요.");
  });
});

describe("buildHomeViewModel — home_redflag.png (최근 기록에 레드플래그)", () => {
  const redFlag = record({ feverEvent: true, painNrs: 3, redFlagCode: "fever_infection" });
  const s = stateWith({
    profile: { deliveryDate: "2026-07-26", deliveryMethod: "cesarean", heightCm: 160, currentWeightKg: 62.5 },
    symptomHistory: [redFlag],
  });
  const vm = buildHomeViewModel(s, NOW);

  it("상태 카드: 오늘의 회복 상태 · 확인 필요", () => {
    expect(vm.recoveryState).toEqual({
      kind: "filled",
      title: "오늘의 회복 상태",
      label: "확인 필요",
      tone: "alert",
      descriptor: "병원 확인이 필요할 수 있는 기록이 있어요. 기록 탭에서 확인하세요.",
    });
  });

  it("회복 지표: 오로 정상 · 발열 확인 필요 · 통증 3/10 정상 · 1시간 전", () => {
    expect(vm.metrics).toEqual({
      items: [
        { name: "오로(분비물)", status: "normal" },
        { name: "발열", status: "alert" },
        { name: "통증 NRS 3/10", status: "normal" },
      ],
      relativeTime: "1시간 전",
      recordDate: redFlag.date,
    });
  });

  it("단계 카드는 운동 안내 중단 카드로 바뀌고, 체중 카드는 숨는다", () => {
    expect(vm.stageCard).toEqual({
      kind: "redFlag",
      title: "운동 안내를 멈췄어요",
      body: "최근 기록에서 병원 확인이 필요한 신호가 있어요. 먼저 의료진을 만난 뒤 운동을 이어가세요.",
    });
    expect(vm.weightPlan).toBeNull();
  });

  it("마음 연계 카드는 레드플래그 중에도 숨기지 않는다", () => {
    const withMood = buildHomeViewModel({ ...s, moodChecks: noAnswers(3) }, NOW);
    expect(withMood.showMoodCard).toBe(true);
    expect(withMood.stageCard?.kind).toBe("redFlag");
  });

  it("출산일·분만 방식이 없어도 레드플래그 카드는 나온다(주차와 무관)", () => {
    const bare = stateWith({ symptomHistory: [redFlag] });
    expect(buildHomeViewModel(bare, NOW).stageCard?.kind).toBe("redFlag");
  });

  it("레드플래그는 가장 최근 기록 하나로만 본다 — 새 기록이 신호 없음이면 풀린다", () => {
    const later = record({ id: "r2", date: new Date(2026, 8, 27, 13, 30).toISOString(), redFlagCode: null });
    const vm2 = buildHomeViewModel({ ...s, symptomHistory: [later, redFlag] }, NOW);
    expect(vm2.stageCard?.kind).toBe("stage");
    expect(vm2.weightPlan).not.toBeNull();
    expect(vm2.recoveryState).toMatchObject({ label: "양호", tone: "normal" });
  });
});

describe("오늘의 회복 상태 카드", () => {
  it("관찰 — 통증 4~7", () => {
    const card = recoveryStateCard({ symptomHistory: [record({ painNrs: 5 })] }, NOW);
    expect(card).toEqual({
      kind: "filled",
      title: "오늘의 회복 상태",
      label: "관찰",
      tone: "watch",
      descriptor: "몇 가지 지표를 지켜보고 있어요.",
    });
  });

  it("양호", () => {
    const card = recoveryStateCard({ symptomHistory: [record()] }, NOW);
    expect(card).toMatchObject({ label: "양호", tone: "normal", descriptor: "회복이 순조롭게 진행되고 있어요." });
  });

  it("오늘 기록이 아니면 제목에 기록 날짜를 붙인다(HomeView.swift:213-218)", () => {
    const old = record({ date: new Date(2026, 8, 20, 22, 0).toISOString() });
    expect(recoveryStateCard({ symptomHistory: [old] }, NOW)).toMatchObject({ title: "최근 회복 상태 · 9월 20일 기록" });
  });

  it("산후 10일 전 기록은 오로 항목이 없다", () => {
    const vm = buildHomeViewModel(stateWith({ symptomHistory: [record({ postpartumDays: 5, painNrs: 8 })] }), NOW);
    expect(vm.metrics?.items).toEqual([
      { name: "발열", status: "normal" },
      { name: "통증 NRS 8/10", status: "alert" },
    ]);
  });
});

describe("낡은 화면 시계 — 기록이 시계보다 늦을 때", () => {
  // 화면 시계(useNow)는 1분마다 갱신되고, 다른 창이 저장한 기록은 곧바로 들어온다.
  it("시계보다 늦은 기록도 \"…후\"로 보이지 않는다", () => {
    for (const aheadMs of [1_000, 40_000, 59_999, 5 * 60_000]) {
      const fresh = record({ date: new Date(NOW.getTime() + aheadMs).toISOString() });
      const vm = buildHomeViewModel(stateWith({ symptomHistory: [fresh] }), NOW);
      expect(vm.metrics?.relativeTime).not.toMatch(/후$/);
      expect(vm.metrics?.relativeTime).toBe("지금");
    }
  });

  it("자정 직후 기록을 자정 직전 시계로 그려도 \"오늘의 회복 상태\"", () => {
    const beforeMidnight = new Date(2026, 8, 27, 23, 59, 30);
    const fresh = record({ date: new Date(2026, 8, 28, 0, 0, 10).toISOString() });
    expect(recoveryStateCard({ symptomHistory: [fresh] }, beforeMidnight)).toMatchObject({ title: "오늘의 회복 상태" });
  });

  it("기준 시각 — 지금과 기록 중 늦은 쪽, 기록이 없거나 날짜가 틀리면 지금", () => {
    const later = new Date(NOW.getTime() + 40_000);
    expect(recordReferenceTime({ date: later.toISOString() }, NOW)).toEqual(later);
    expect(recordReferenceTime(record(), NOW)).toBe(NOW);
    expect(recordReferenceTime(null, NOW)).toBe(NOW);
    expect(recordReferenceTime({ date: "not-a-date" }, NOW)).toBe(NOW);
  });

  it("지난 기록의 상대 시간은 그대로(1시간 전)", () => {
    const vm = buildHomeViewModel(stateWith({ symptomHistory: [record()] }), NOW);
    expect(vm.metrics?.relativeTime).toBe("1시간 전");
  });
});

describe("히어로 — 산후 일차·칩", () => {
  it("출산일이 없거나 형식이 틀리면 일차를 그리지 않는다", () => {
    expect(homeDayCount({ deliveryDate: null }, NOW)).toBeNull();
    expect(homeDayCount({ deliveryDate: "2026-02-31" }, NOW)).toBeNull();
    expect(homeDayCount({ deliveryDate: "26-07-26" }, NOW)).toBeNull();
  });

  it("출산일 당일 0일차, 미래 출산일도 0(Swift max(0, …))", () => {
    expect(homeDayCount({ deliveryDate: "2026-09-27" }, NOW)).toBe(0);
    expect(homeDayCount({ deliveryDate: "2026-10-05" }, NOW)).toBe(0);
  });

  it("일차는 로컬 자정에 바뀐다", () => {
    const p = { deliveryDate: "2026-09-20" };
    expect(homeDayCount(p, new Date(2026, 8, 27, 23, 59))).toBe(7);
    expect(homeDayCount(p, new Date(2026, 8, 28, 0, 0))).toBe(8);
  });

  it("출산일이 없으면 단계 카드도 그리지 않는다(주차를 모름)", () => {
    const s = stateWith({ profile: { deliveryMethod: "vaginal" } });
    expect(buildHomeViewModel(s, NOW).stageCard).toBeNull();
  });

  it("분만 방식이 없으면 단계 카드가 없다", () => {
    const s = stateWith({ profile: { deliveryDate: "2026-07-26" } });
    expect(buildHomeViewModel(s, NOW).stageCard).toBeNull();
  });

  it("복직 D-day / D-n, 지난 날짜면 목표 이름", () => {
    const rtw = (returnToWorkDate: string | null, goal: "homemaker" | "returningToWork" | null = "returningToWork") =>
      returnToWorkChip({ goal, returnToWorkDate }, NOW);
    expect(rtw("2026-09-27")).toBe("복직 D-day");
    expect(rtw("2026-09-28")).toBe("복직 D-1");
    expect(rtw("2027-01-05")).toBe("복직 D-100");
    expect(rtw("2026-09-26")).toBeNull();
    expect(rtw(null)).toBeNull();
    expect(rtw("2026-10-01", "homemaker")).toBeNull();

    expect(heroChips({ deliveryMethod: "vaginal", goal: "returningToWork", returnToWorkDate: "2026-10-07" }, NOW)).toEqual([
      "자연분만",
      "복직 D-10",
    ]);
    expect(heroChips({ deliveryMethod: "vaginal", goal: "returningToWork", returnToWorkDate: "2026-09-01" }, NOW)).toEqual([
      "자연분만",
      "복직 예정",
    ]);
    expect(heroChips({ deliveryMethod: "cesarean", goal: "returningToWork", returnToWorkDate: null }, NOW)).toEqual([
      "제왕절개",
      "복직 예정",
    ]);
    expect(heroChips({ deliveryMethod: null, goal: null, returnToWorkDate: "2026-10-07" }, NOW)).toEqual(["분만"]);
  });
});

describe("마음 연계 카드 — home_mood_card.png", () => {
  it("기분 신호가 없으면 그리지 않는다", () => {
    expect(buildHomeViewModel(stateWith({ moodChecks: noAnswers(2) }), NOW).showMoodCard).toBe(false);
  });

  it("「아니요」 3일 연속이면 그린다", () => {
    expect(buildHomeViewModel(stateWith({ moodChecks: noAnswers(3) }), NOW).showMoodCard).toBe(true);
  });

  it("접어둔 기간에는 그리지 않고, 기한이 지나면 다시 그린다", () => {
    const snoozed = stateWith({ moodChecks: noAnswers(5), moodCardSnoozedUntil: new Date(2026, 9, 4, 14).toISOString() });
    expect(buildHomeViewModel(snoozed, NOW).showMoodCard).toBe(false);
    const expired = { ...snoozed, moodCardSnoozedUntil: new Date(2026, 8, 27, 13, 59).toISOString() };
    expect(buildHomeViewModel(expired, NOW).showMoodCard).toBe(true);
  });

  it("전화 링크는 숫자만", () => {
    expect(MOOD_CALLS.map((c) => telHref(c.number))).toEqual(["tel:15770199", "tel:0222762276"]);
  });
});

describe("체중 목표 카드", () => {
  it("키·현재 체중이 없으면 그리지 않는다", () => {
    expect(buildHomeViewModel(stateWith({ profile: { heightCm: 160 } }), NOW).weightPlan).toBeNull();
  });

  it("회복 목표", () => {
    const vm = buildHomeViewModel(stateWith({ profile: { heightCm: 165, currentWeightKg: 55 } }), NOW);
    expect(vm.weightPlan).toMatchObject({ kind: "recovery", title: "체중 회복 목표", chips: ["BMI 20.2", "12개월 복귀"] });
  });
});

describe("화면 문구 — Swift·content.json 원문", () => {
  it("면책 문구는 content.json에서", () => {
    expect(HOME_TEXT.footer).toBe(
      "온맘은 의료기기가 아니며, 제공되는 정보는 참고용입니다. 진단·치료에 관한 판단은 반드시 의료진과 상담하세요.",
    );
    expect(HOME_TEXT.moodDisclaimer).toBe("이 안내는 진단이 아니에요. 기분 살피기 답을 바탕으로 띄웠어요.");
  });
});
