// 기대값은 iOS Swift(ExerciseRules.swift·HomeView.swift·ExerciseView.swift)를 그대로 돌려 얻은 값이다.
// 02 §11 벡터 중 문서가 틀린 곳은 Swift를 따랐다(감사 #5 · #41 · #42).
import { describe, expect, it } from "vitest";
import type { DeliveryMethod, MaternityRecord, SymptomRecord } from "@/domain/types";
import {
  EXERCISE_TEXT,
  STAGE_BUCKETS,
  blockedBuckets,
  blockedNow,
  bucketForTags,
  currentStage,
  exerciseHeaderSubtitle,
  exercisePlan,
  exerciseTabGate,
  homeStageCard,
  isRedFlagActive,
  lockedBody,
  lockedSectionTitle,
  nextStage,
  planSections,
  routeTag,
  startWeek,
  unavailableStage,
  videoBadge,
  type PlanVideo,
  type Video,
} from "./exercise";

type Flag = Exclude<keyof MaternityRecord, "isPrimiparous">;

function maternity(...flags: Flag[]): MaternityRecord {
  const m: MaternityRecord = {
    isPrimiparous: true,
    gdm: false,
    anemia: false,
    heavyBleeding: false,
    preeclampsia: false,
    pelvicPain: false,
    diastasisRecti: false,
  };
  for (const f of flags) m[f] = true;
  return m;
}

function video(id: string, tags: string[]): Video {
  return { video_id: id, title: `T${id}`, url: `https://x/${id}`, description: "", tags };
}

// Swift 원문 사유(ExerciseRules.swift:82·86·87·91) — content.json이 이 값과 같아야 한다
const R1 = "복직근 이개(DRA)가 있어 복압을 올리는 복근 운동은 회복 전까지 피해요";
const R2 = "임신중독증·고혈압이 있어 머리가 내려가는 자세·숨 참기(발살바) 동작은 피해요";
const APPEND = " · 임신중독증·고혈압으로 숨 참기(발살바) 동작도 피해요";
const R3 = "골반통·치골결합 통증이 있어 한다리·비대칭 동작(클램·런지 등)은 피해요";

describe("단계 버킷", () => {
  it("content.json 값이 ExerciseRules.swift:43-54와 같다", () => {
    expect(STAGE_BUCKETS).toEqual([
      { key: "recovery_priority", order: 0, startWeekCesarean: 0, startWeekVaginal: 0, title: "회복 우선기", summary: "호흡·이완만. 윗몸일으키기 등 복부운동 금지" },
      { key: "early_core_activation", order: 1, startWeekCesarean: 2, startWeekVaginal: 2, title: "코어 깨우기", summary: "Drawing-in(심부 코어 활성)" },
      { key: "pelvic_floor", order: 2, startWeekCesarean: 6, startWeekVaginal: 6, title: "골반저근", summary: "케겔(골반저근 운동)" },
      { key: "functional_strengthening", order: 3, startWeekCesarean: 8, startWeekVaginal: 6, title: "기능 강화", summary: "브릿지·클램·하체 근력" },
      { key: "full_core", order: 4, startWeekCesarean: 12, startWeekVaginal: 12, title: "코어 강화", summary: "복근·코어 강화·요가 (분만 무관)" },
    ]);
  });

  it("분만 방식이 갈리는 곳은 기능 강화뿐이다", () => {
    const fs = STAGE_BUCKETS.find((b) => b.key === "functional_strengthening")!;
    expect(startWeek(fs, "vaginal")).toBe(6);
    expect(startWeek(fs, "cesarean")).toBe(8);
    for (const b of STAGE_BUCKETS.filter((x) => x.key !== "functional_strengthening")) {
      expect(startWeek(b, "vaginal")).toBe(startWeek(b, "cesarean"));
    }
  });

  it("route 태그는 route_{delivery}가 아니다(감사 #11)", () => {
    expect(routeTag("vaginal")).toBe("route_vaginal_delivery");
    expect(routeTag("cesarean")).toBe("route_cesarean_section");
  });

  it("태그에서 버킷을 찾을 때 첫 stage_ 태그만 본다", () => {
    expect(bucketForTags(["route_cesarean_section", "stage_pelvic_floor"])?.key).toBe("pelvic_floor");
    expect(bucketForTags(["route_cesarean_section"])).toBeNull();
    // 첫 stage_ 태그가 모르는 단계면 뒤에 아는 태그가 있어도 버킷 없음(Swift와 같음)
    expect(bucketForTags(["stage_unknown", "stage_pelvic_floor"])).toBeNull();
  });
});

describe("금기(차단) — blockedBuckets", () => {
  it("content.json 사유가 Swift 원문과 같다", () => {
    expect(blockedBuckets(maternity("diastasisRecti"))).toEqual({ full_core: R1 });
    expect(blockedBuckets(maternity("preeclampsia"))).toEqual({ full_core: R2 });
    expect(blockedBuckets(maternity("pelvicPain"))).toEqual({ functional_strengthening: R3 });
  });

  it("DRA + 임신중독증이면 사유를 이어 붙인다(R1 + APPEND)", () => {
    expect(blockedBuckets(maternity("diastasisRecti", "preeclampsia"))).toEqual({ full_core: R1 + APPEND });
  });

  it("세 규칙이 모두 켜지면 두 단계가 막힌다", () => {
    expect(blockedBuckets(maternity("pelvicPain", "diastasisRecti", "preeclampsia"))).toEqual({
      full_core: R1 + APPEND,
      functional_strengthening: R3,
    });
  });

  it("빈혈·출혈 과다·임신성 당뇨·초산 여부는 차단하지 않는다", () => {
    expect(blockedBuckets(maternity("anemia", "heavyBleeding", "gdm"))).toEqual({});
    expect(blockedBuckets({ ...maternity(), isPrimiparous: false })).toEqual({});
  });
});

describe("영상 플랜 — exercisePlan", () => {
  const videos = [
    video("v10", ["route_cesarean_section", "stage_full_core"]),
    video("v02", ["route_cesarean_section", "stage_functional_strengthening"]),
    video("v01", ["route_cesarean_section", "stage_functional_strengthening"]),
    video("v03", ["route_cesarean_section", "stage_pelvic_floor"]),
    video("v04", ["stage_recovery_priority"]),
    video("v05", ["route_cesarean_section"]),
    video("v06", ["stage_unknown", "stage_pelvic_floor"]),
    video("V07", ["stage_early_core_activation"]),
    video("a08", ["stage_early_core_activation"]),
  ];
  const summary = (p: PlanVideo[]) =>
    p.map((x) => [x.video.video_id, x.bucket.key, x.weekReached, x.unlockWeek, x.blockedReason, x.unlocked]);

  it("단계순 → video_id 코드 단위순(대문자 먼저)으로 정렬하고, 단계를 모르는 영상은 뺀다", () => {
    expect(summary(exercisePlan(videos, "cesarean", 6, maternity()))).toEqual([
      ["v04", "recovery_priority", true, 0, null, true],
      ["V07", "early_core_activation", true, 2, null, true],
      ["a08", "early_core_activation", true, 2, null, true],
      ["v03", "pelvic_floor", true, 6, null, true],
      ["v01", "functional_strengthening", false, 8, null, false],
      ["v02", "functional_strengthening", false, 8, null, false],
      ["v10", "full_core", false, 12, null, false],
    ]);
  });

  it("자연분만 6주 — 기능 강화 열림, 코어 강화 12주부터", () => {
    expect(summary(exercisePlan(videos, "vaginal", 6, maternity()))).toEqual([
      ["v04", "recovery_priority", true, 0, null, true],
      ["V07", "early_core_activation", true, 2, null, true],
      ["a08", "early_core_activation", true, 2, null, true],
      ["v03", "pelvic_floor", true, 6, null, true],
      ["v01", "functional_strengthening", true, 6, null, true],
      ["v02", "functional_strengthening", true, 6, null, true],
      ["v10", "full_core", false, 12, null, false],
    ]);
  });

  it("주차가 됐어도 차단되면 잠긴다 — 제왕절개 9주 + 골반통", () => {
    expect(summary(exercisePlan(videos, "cesarean", 9, maternity("pelvicPain")))).toEqual([
      ["v04", "recovery_priority", true, 0, null, true],
      ["V07", "early_core_activation", true, 2, null, true],
      ["a08", "early_core_activation", true, 2, null, true],
      ["v03", "pelvic_floor", true, 6, null, true],
      ["v01", "functional_strengthening", true, 8, R3, false],
      ["v02", "functional_strengthening", true, 8, R3, false],
      ["v10", "full_core", false, 12, null, false],
    ]);
  });

  it("제왕절개 13주 + DRA — 코어 강화만 차단", () => {
    const p = exercisePlan(videos, "cesarean", 13, maternity("diastasisRecti"));
    expect(p.filter((x) => !x.unlocked).map((x) => [x.video.video_id, x.weekReached, x.blockedReason])).toEqual([
      ["v10", true, R1],
    ]);
  });

  it("입력 배열을 바꾸지 않는다", () => {
    const before = videos.map((v) => v.video_id);
    exercisePlan(videos, "cesarean", 6, maternity());
    expect(videos.map((v) => v.video_id)).toEqual(before);
  });
});

describe("운동 탭 문구 — 섹션·배지·본문(ExerciseView.swift)", () => {
  const fsVideo = video("f1", ["route_cesarean_section", "stage_functional_strengthening"]);
  const pfVideo = video("p1", ["route_cesarean_section", "stage_pelvic_floor"]);
  const fcVideo = video("c1", ["route_cesarean_section", "stage_full_core"]);

  it("02 §11 #10 — 제왕절개 6주, 소견 없음: 기능 강화 잠김 '8주에 열림' / '아직 이른 운동'(감사 #5)", () => {
    const plan = exercisePlan([fsVideo, pfVideo], "cesarean", 6, maternity());
    const fs = plan.find((p) => p.bucket.key === "functional_strengthening")!;
    expect(fs.unlocked).toBe(false);
    expect(videoBadge(fs)).toEqual({ text: "8주에 열림", tone: "watch" });
    expect(lockedBody(fs)).toEqual({ text: "브릿지·클램·하체 근력", tone: "secondary" });
    expect(planSections(plan).map((s) => [s.title, s.items.map((i) => i.video.video_id)])).toEqual([
      ["지금 가능한 운동", ["p1"]],
      ["아직 이른 운동", ["f1"]],
    ]);
  });

  it("02 §11 #8 — 제왕절개 9주 + 골반통: '지금은 권하지 않는 운동' / '지금은 권장 안 함' / 사유 본문", () => {
    const plan = exercisePlan([fsVideo, pfVideo, fcVideo], "cesarean", 9, maternity("pelvicPain"));
    const fs = plan.find((p) => p.bucket.key === "functional_strengthening")!;
    expect(videoBadge(fs)).toEqual({ text: "지금은 권장 안 함", tone: "alert" });
    expect(lockedBody(fs)).toEqual({ text: R3, tone: "alert" });
    // 잠긴 묶음에 차단 항목이 하나라도 있으면 묶음 제목이 바뀐다(주차 미도달 코어 강화가 섞여 있어도)
    expect(planSections(plan).map((s) => [s.title, s.items.map((i) => i.video.video_id)])).toEqual([
      ["지금 가능한 운동", ["p1"]],
      ["지금은 권하지 않는 운동", ["f1", "c1"]],
    ]);
    const fc = plan.find((p) => p.bucket.key === "full_core")!;
    expect(videoBadge(fc)).toEqual({ text: "12주에 열림", tone: "watch" });
  });

  it("열린 영상 배지는 '가능'", () => {
    const [p] = exercisePlan([pfVideo], "cesarean", 6, maternity());
    expect(videoBadge(p)).toEqual({ text: "가능", tone: "normal" });
  });

  it("빈 묶음은 뺀다", () => {
    expect(planSections([])).toEqual([]);
    expect(lockedSectionTitle([])).toBe("아직 이른 운동");
    const allOpen = exercisePlan([pfVideo], "vaginal", 20, maternity());
    expect(planSections(allOpen).map((s) => s.title)).toEqual(["지금 가능한 운동"]);
  });

  it("헤더 부제", () => {
    expect(EXERCISE_TEXT.headerTitle).toBe("오늘의 운동");
    expect(exerciseHeaderSubtitle(9, "cesarean")).toBe("산후 9주차 · 제왕절개 기준");
    expect(exerciseHeaderSubtitle(3, "vaginal")).toBe("산후 3주차 · 자연분만 기준");
    expect(exerciseHeaderSubtitle(3, null)).toBe("산후 3주차");
  });

  it("레드플래그 문구는 '의료기관에 방문하세요'(감사 #28 원문)", () => {
    expect(EXERCISE_TEXT.redFlagBody.endsWith("먼저 의료기관에 방문하세요.")).toBe(true);
  });

  it("분만 방식이 없으면 레드플래그보다 먼저 입력을 요청한다", () => {
    expect(exerciseTabGate(null, true)).toBe("needsDelivery");
    expect(exerciseTabGate("vaginal", true)).toBe("redFlag");
    expect(exerciseTabGate("cesarean", false)).toBe("plan");
  });
});

describe("지금 단계 / 다음 단계 — 분만 방식별 경계", () => {
  // [주차, 현재, 다음] — Swift HomeView 로직을 그대로 돌린 결과
  const table: Record<DeliveryMethod, [number, string, string | null][]> = {
    vaginal: [
      [0, "recovery_priority", "early_core_activation"],
      [1, "recovery_priority", "early_core_activation"],
      [2, "early_core_activation", "pelvic_floor"],
      [3, "early_core_activation", "pelvic_floor"],
      [4, "early_core_activation", "pelvic_floor"],
      [5, "early_core_activation", "pelvic_floor"],
      [6, "functional_strengthening", "full_core"],
      [7, "functional_strengthening", "full_core"],
      [8, "functional_strengthening", "full_core"],
      [11, "functional_strengthening", "full_core"],
      [12, "full_core", null],
      [13, "full_core", null],
    ],
    cesarean: [
      [0, "recovery_priority", "early_core_activation"],
      [1, "recovery_priority", "early_core_activation"],
      [2, "early_core_activation", "pelvic_floor"],
      [3, "early_core_activation", "pelvic_floor"],
      [4, "early_core_activation", "pelvic_floor"],
      [5, "early_core_activation", "pelvic_floor"],
      [6, "pelvic_floor", "functional_strengthening"],
      [7, "pelvic_floor", "functional_strengthening"],
      [8, "functional_strengthening", "full_core"],
      [11, "functional_strengthening", "full_core"],
      [12, "full_core", null],
      [13, "full_core", null],
    ],
  };
  for (const delivery of ["vaginal", "cesarean"] as const) {
    for (const [week, cur, next] of table[delivery]) {
      it(`${delivery} ${week}주 → 현재 ${cur}, 다음 ${next}`, () => {
        expect(currentStage(delivery, week, maternity())?.key).toBe(cur);
        expect(nextStage(delivery, week, maternity())?.key ?? null).toBe(next);
      });
    }
  }

  it("다음 단계 동률이면 목록 앞쪽이 이긴다 — 자연분만 2~5주는 골반저근·기능 강화 모두 6주 → '골반저근'", () => {
    for (const week of [2, 3, 4, 5]) {
      const next = nextStage("vaginal", week, maternity());
      expect(next?.key).toBe("pelvic_floor");
      expect(startWeek(STAGE_BUCKETS.find((b) => b.key === "functional_strengthening")!, "vaginal")).toBe(6);
    }
  });

  it("다음 단계는 차단된 단계를 건너뛴다 — 제왕절개 6주 + 골반통이면 기능 강화(8주) 대신 코어 강화(12주)", () => {
    expect(nextStage("cesarean", 6, maternity("pelvicPain"))?.key).toBe("full_core");
    expect(nextStage("cesarean", 8, maternity("pelvicPain", "diastasisRecti"))).toBeNull();
  });

  it("차단된 단계는 지금 단계가 될 수 없다(감사 #4) — 제왕절개 9주 + 골반통 → 골반저근", () => {
    expect(currentStage("cesarean", 9, maternity("pelvicPain"))?.key).toBe("pelvic_floor");
    expect(currentStage("vaginal", 13, maternity("diastasisRecti"))?.key).toBe("functional_strengthening");
    expect(currentStage("vaginal", 13, maternity("pelvicPain", "diastasisRecti", "preeclampsia"))?.key).toBe("pelvic_floor");
  });

  it("주차 미도달 단계는 차단돼도 '제외' 줄에 나오지 않는다", () => {
    expect(blockedNow("cesarean", 3, maternity("pelvicPain"))).toEqual([]);
    expect(blockedNow("vaginal", 13, maternity("pelvicPain", "diastasisRecti")).map((b) => b.bucket.key)).toEqual([
      "functional_strengthening",
      "full_core",
    ]);
  });
});

describe("운동 탭 '영상 준비 중' 현재 단계", () => {
  it("제왕절개 9주 + 골반통 → 막힌 기능 강화가 아니라 골반저근(iOS 버그 수정, 감사 #4)", () => {
    expect(unavailableStage("cesarean", 9, maternity("pelvicPain"))).toEqual({
      line: "지금은 9주차 · 골반저근 단계예요",
      summary: "케겔(골반저근 운동)",
    });
  });

  it("소견이 없으면 iOS와 같다", () => {
    expect(unavailableStage("vaginal", 6, maternity())).toEqual({
      line: "지금은 6주차 · 기능 강화 단계예요",
      summary: "브릿지·클램·하체 근력",
    });
  });
});

describe("홈 '지금 회복 단계' 카드", () => {
  it("02 §11 #8 — 제왕절개 9주 + 골반통(키 early_core_activation, 감사 #41)", () => {
    expect(homeStageCard("cesarean", 9, maternity("pelvicPain"), false)).toEqual({
      kind: "stage",
      heading: "지금 회복 단계 — 9주차",
      current: "골반저근 · 케겔(골반저근 운동)",
      next: "12주차부터 '코어 강화' 단계가 열려요.",
      excluded: [`기능 강화 제외 — ${R3}`],
    });
  });

  it("02 §11 #11 — DRA + 임신중독증, 13주: 코어 강화 제외 사유 = R1 + APPEND, 다음 단계 없음", () => {
    expect(homeStageCard("vaginal", 13, maternity("diastasisRecti", "preeclampsia"), false)).toEqual({
      kind: "stage",
      heading: "지금 회복 단계 — 13주차",
      current: "기능 강화 · 브릿지·클램·하체 근력",
      next: null,
      excluded: [`코어 강화 제외 — ${R1}${APPEND}`],
    });
  });

  it("임신중독증 단독(R2) — 제왕절개 13주", () => {
    expect(homeStageCard("cesarean", 13, maternity("preeclampsia"), false)).toMatchObject({
      current: "기능 강화 · 브릿지·클램·하체 근력",
      excluded: [`코어 강화 제외 — ${R2}`],
    });
  });

  it("02 §11 #9 — 자연분만 6주, 소견 없음", () => {
    expect(homeStageCard("vaginal", 6, maternity(), false)).toEqual({
      kind: "stage",
      heading: "지금 회복 단계 — 6주차",
      current: "기능 강화 · 브릿지·클램·하체 근력",
      next: "12주차부터 '코어 강화' 단계가 열려요.",
      excluded: [],
    });
  });

  it("레드플래그면 분만 방식과 무관하게 운동 안내를 멈춘다", () => {
    const card = {
      kind: "redFlag",
      title: "운동 안내를 멈췄어요",
      body: "최근 기록에서 병원 확인이 필요한 신호가 있어요. 먼저 의료진을 만난 뒤 운동을 이어가세요.",
    };
    expect(homeStageCard("cesarean", 9, maternity(), true)).toEqual(card);
    expect(homeStageCard(null, 9, maternity(), true)).toEqual(card);
  });

  it("분만 방식이 없으면 카드를 그리지 않는다", () => {
    expect(homeStageCard(null, 9, maternity(), false)).toBeNull();
  });
});

describe("레드플래그 활성 여부", () => {
  const rec = (redFlagCode: string | null): SymptomRecord => ({
    id: "x",
    date: "2026-09-23T00:00:00.000Z",
    lochiaIncreased: false,
    lochiaRed: false,
    feverEvent: false,
    painNrs: 0,
    redFlagCode,
    postpartumDays: 10,
  });

  it("최신 기록(첫 건)만 본다", () => {
    expect(isRedFlagActive([])).toBe(false);
    expect(isRedFlagActive([rec("pph_suspect")])).toBe(true);
    expect(isRedFlagActive([rec(null), rec("pph_suspect")])).toBe(false);
  });
});
