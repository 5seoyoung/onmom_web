// 기대값은 iOS `RecoveryAnalysis.run`을 Swift로 그대로 돌려 얻은 값이다(영상 조회 제외 — 순수 함수라 입력으로 받음).
// 02 §11 분석 벡터 + 감사 #25(단계 라벨) · #41(키·주의 항목) · #43(firedRules·configVersion·engineVersion).
import { describe, expect, it } from "vitest";
import content from "@/content";
import { toLocalDateString } from "@/domain/date";
import type { DeliveryMethod, MaternityRecord } from "@/domain/types";
import { blockedBuckets, currentStage, exercisePlan, homeStageCard, type Video } from "./exercise";
import {
  ANALYSIS_GROUPS,
  ENGINE_VERSION,
  analysisProfileSubtitle,
  analysisSections,
  docTypeLabel,
  recoveryRecommendation,
  runRecoveryAnalysis,
  severityLabel,
  stageCodeForWeek,
  stageLabel,
  type EngineOutput,
  type HospitalSignal,
  type RecItem,
  type StageCode,
  type VideoFetchResult,
} from "./recovery";

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

// 2026-09-23 10:00 KST
const NOW = new Date(2026, 8, 23, 10, 0, 0);

function deliveryDateDaysAgo(days: number): string {
  return toLocalDateString(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - days));
}

function analyze(delivery: DeliveryMethod | null, days: number, m: MaternityRecord, videos: VideoFetchResult = { state: "notConfigured" }) {
  return runRecoveryAnalysis({ profile: { deliveryMethod: delivery, deliveryDate: deliveryDateDaysAgo(days) }, maternity: m, videos }, NOW);
}

interface SwiftVector {
  name: string;
  delivery: DeliveryMethod;
  days: number;
  flags: Flag[];
  stage: StageCode;
  allowed: RecItem[];
  caution: RecItem[];
  forbidden: RecItem[];
  firedRules: string[];
}

const SWIFT_VECTORS: SwiftVector[] = [
  {
    name: "cesarean 63일 pelvicPain",
    delivery: "cesarean", days: 63, flags: ["pelvicPain"], stage: "7-12w",
    allowed: [
      { item: "recovery_priority", label: "회복 우선기 — 호흡·이완만. 윗몸일으키기 등 복부운동 금지", evidenceChips: ["0주차부터 가능", "src:회복 단계 기준"] },
      { item: "early_core_activation", label: "코어 깨우기 — Drawing-in(심부 코어 활성)", evidenceChips: ["2주차부터 가능", "src:회복 단계 기준"] },
      { item: "pelvic_floor", label: "골반저근 — 케겔(골반저근 운동)", evidenceChips: ["6주차부터 가능", "src:회복 단계 기준"] },
    ],
    caution: [
      { item: "pelvic_pain", label: "골반통·치골결합 이개 — 비대칭·한다리·와이드 동작 피하기", evidenceChips: ["골반통", "src:산모수첩 확인항목"] },
    ],
    forbidden: [
      { item: "functional_strengthening", label: "기능 강화 — 골반통·치골결합 통증이 있어 한다리·비대칭 동작(클램·런지 등)은 피해요", evidenceChips: ["산모수첩 확인 항목", "src:산모수첩 확인항목"] },
      { item: "full_core", label: "코어 강화 — 복근·코어 강화·요가 (분만 무관)", evidenceChips: ["12주차부터 (현재 9주차)", "src:회복 단계 기준"] },
    ],
    firedRules: ["stage:recovery_priority", "stage:early_core_activation", "stage:pelvic_floor", "blocked:functional_strengthening", "caution:pelvic_pain"],
  },
  {
    name: "vaginal 42일 소견 없음",
    delivery: "vaginal", days: 42, flags: [], stage: "5-6w",
    allowed: [
      { item: "recovery_priority", label: "회복 우선기 — 호흡·이완만. 윗몸일으키기 등 복부운동 금지", evidenceChips: ["0주차부터 가능", "src:회복 단계 기준"] },
      { item: "early_core_activation", label: "코어 깨우기 — Drawing-in(심부 코어 활성)", evidenceChips: ["2주차부터 가능", "src:회복 단계 기준"] },
      { item: "pelvic_floor", label: "골반저근 — 케겔(골반저근 운동)", evidenceChips: ["6주차부터 가능", "src:회복 단계 기준"] },
      { item: "functional_strengthening", label: "기능 강화 — 브릿지·클램·하체 근력", evidenceChips: ["6주차부터 가능", "src:회복 단계 기준"] },
    ],
    caution: [],
    forbidden: [
      { item: "full_core", label: "코어 강화 — 복근·코어 강화·요가 (분만 무관)", evidenceChips: ["12주차부터 (현재 6주차)", "src:회복 단계 기준"] },
    ],
    firedRules: ["stage:recovery_priority", "stage:early_core_activation", "stage:pelvic_floor", "stage:functional_strengthening"],
  },
  {
    name: "cesarean 42일 소견 없음",
    delivery: "cesarean", days: 42, flags: [], stage: "5-6w",
    allowed: [
      { item: "recovery_priority", label: "회복 우선기 — 호흡·이완만. 윗몸일으키기 등 복부운동 금지", evidenceChips: ["0주차부터 가능", "src:회복 단계 기준"] },
      { item: "early_core_activation", label: "코어 깨우기 — Drawing-in(심부 코어 활성)", evidenceChips: ["2주차부터 가능", "src:회복 단계 기준"] },
      { item: "pelvic_floor", label: "골반저근 — 케겔(골반저근 운동)", evidenceChips: ["6주차부터 가능", "src:회복 단계 기준"] },
    ],
    caution: [],
    forbidden: [
      { item: "functional_strengthening", label: "기능 강화 — 브릿지·클램·하체 근력", evidenceChips: ["8주차부터 (현재 6주차)", "src:회복 단계 기준"] },
      { item: "full_core", label: "코어 강화 — 복근·코어 강화·요가 (분만 무관)", evidenceChips: ["12주차부터 (현재 6주차)", "src:회복 단계 기준"] },
    ],
    firedRules: ["stage:recovery_priority", "stage:early_core_activation", "stage:pelvic_floor"],
  },
  {
    name: "vaginal 91일 diastasisRecti+preeclampsia",
    delivery: "vaginal", days: 91, flags: ["diastasisRecti", "preeclampsia"], stage: "13w+",
    allowed: [
      { item: "recovery_priority", label: "회복 우선기 — 호흡·이완만. 윗몸일으키기 등 복부운동 금지", evidenceChips: ["0주차부터 가능", "src:회복 단계 기준"] },
      { item: "early_core_activation", label: "코어 깨우기 — Drawing-in(심부 코어 활성)", evidenceChips: ["2주차부터 가능", "src:회복 단계 기준"] },
      { item: "pelvic_floor", label: "골반저근 — 케겔(골반저근 운동)", evidenceChips: ["6주차부터 가능", "src:회복 단계 기준"] },
      { item: "functional_strengthening", label: "기능 강화 — 브릿지·클램·하체 근력", evidenceChips: ["6주차부터 가능", "src:회복 단계 기준"] },
    ],
    caution: [
      { item: "preeclampsia", label: "임신중독증·고혈압 — 머리가 아래로 가는 자세·숨 참기(발살바) 금지", evidenceChips: ["자간전증", "src:산모수첩 확인항목"] },
      { item: "diastasis_recti", label: "복직근 이개(DRA) — 윗몸일으키기·레그레이즈 등 복압을 올리는 동작 피하기", evidenceChips: ["DRA", "src:산모수첩 확인항목"] },
    ],
    forbidden: [
      { item: "full_core", label: "코어 강화 — 복직근 이개(DRA)가 있어 복압을 올리는 복근 운동은 회복 전까지 피해요 · 임신중독증·고혈압으로 숨 참기(발살바) 동작도 피해요", evidenceChips: ["산모수첩 확인 항목", "src:산모수첩 확인항목"] },
    ],
    firedRules: ["stage:recovery_priority", "stage:early_core_activation", "stage:pelvic_floor", "stage:functional_strengthening", "blocked:full_core", "caution:preeclampsia", "caution:diastasis_recti"],
  },
  {
    name: "vaginal 0일 anemia+pelvicPain+preeclampsia+heavyBleeding+gdm+diastasisRecti",
    delivery: "vaginal", days: 0, flags: ["anemia", "pelvicPain", "preeclampsia", "heavyBleeding", "gdm", "diastasisRecti"], stage: "0-2w",
    allowed: [
      { item: "recovery_priority", label: "회복 우선기 — 호흡·이완만. 윗몸일으키기 등 복부운동 금지", evidenceChips: ["0주차부터 가능", "src:회복 단계 기준"] },
    ],
    caution: [
      { item: "anemia", label: "빈혈 — 어지럼·낙상 위험, 앉거나 누운 자세 위주로", evidenceChips: ["Hb<12", "src:산모수첩 확인항목"] },
      { item: "pelvic_pain", label: "골반통·치골결합 이개 — 비대칭·한다리·와이드 동작 피하기", evidenceChips: ["골반통", "src:산모수첩 확인항목"] },
      { item: "preeclampsia", label: "임신중독증·고혈압 — 머리가 아래로 가는 자세·숨 참기(발살바) 금지", evidenceChips: ["자간전증", "src:산모수첩 확인항목"] },
      { item: "heavy_bleeding", label: "분만 시 출혈 과다 — 초기에는 저강도로 제한", evidenceChips: ["출혈 과다", "src:산모수첩 확인항목"] },
      { item: "gdm", label: "임신성 당뇨 — 유산소 강도는 점진적으로 올리기", evidenceChips: ["GDM", "src:산모수첩 확인항목"] },
      { item: "diastasis_recti", label: "복직근 이개(DRA) — 윗몸일으키기·레그레이즈 등 복압을 올리는 동작 피하기", evidenceChips: ["DRA", "src:산모수첩 확인항목"] },
    ],
    forbidden: [
      { item: "early_core_activation", label: "코어 깨우기 — Drawing-in(심부 코어 활성)", evidenceChips: ["2주차부터 (현재 0주차)", "src:회복 단계 기준"] },
      { item: "pelvic_floor", label: "골반저근 — 케겔(골반저근 운동)", evidenceChips: ["6주차부터 (현재 0주차)", "src:회복 단계 기준"] },
      { item: "functional_strengthening", label: "기능 강화 — 브릿지·클램·하체 근력", evidenceChips: ["6주차부터 (현재 0주차)", "src:회복 단계 기준"] },
      { item: "full_core", label: "코어 강화 — 복근·코어 강화·요가 (분만 무관)", evidenceChips: ["12주차부터 (현재 0주차)", "src:회복 단계 기준"] },
    ],
    // iOS는 Dictionary 순서(실행마다 다름) — 웹은 단계순으로 고정
    firedRules: ["stage:recovery_priority", "blocked:functional_strengthening", "blocked:full_core", "caution:anemia", "caution:pelvic_pain", "caution:preeclampsia", "caution:heavy_bleeding", "caution:gdm", "caution:diastasis_recti"],
  },
  {
    name: "cesarean 20일 preeclampsia",
    delivery: "cesarean", days: 20, flags: ["preeclampsia"], stage: "0-2w",
    allowed: [
      { item: "recovery_priority", label: "회복 우선기 — 호흡·이완만. 윗몸일으키기 등 복부운동 금지", evidenceChips: ["0주차부터 가능", "src:회복 단계 기준"] },
      { item: "early_core_activation", label: "코어 깨우기 — Drawing-in(심부 코어 활성)", evidenceChips: ["2주차부터 가능", "src:회복 단계 기준"] },
    ],
    caution: [
      { item: "preeclampsia", label: "임신중독증·고혈압 — 머리가 아래로 가는 자세·숨 참기(발살바) 금지", evidenceChips: ["자간전증", "src:산모수첩 확인항목"] },
    ],
    forbidden: [
      { item: "pelvic_floor", label: "골반저근 — 케겔(골반저근 운동)", evidenceChips: ["6주차부터 (현재 2주차)", "src:회복 단계 기준"] },
      { item: "functional_strengthening", label: "기능 강화 — 브릿지·클램·하체 근력", evidenceChips: ["8주차부터 (현재 2주차)", "src:회복 단계 기준"] },
      { item: "full_core", label: "코어 강화 — 복근·코어 강화·요가 (분만 무관)", evidenceChips: ["12주차부터 (현재 2주차)", "src:회복 단계 기준"] },
    ],
    firedRules: ["stage:recovery_priority", "stage:early_core_activation", "blocked:full_core", "caution:preeclampsia"],
  },
];

describe("회복 단계 분석 — Swift 벡터", () => {
  for (const v of SWIFT_VECTORS) {
    it(v.name, () => {
      const out = analyze(v.delivery, v.days, maternity(...v.flags))!;
      expect(out.profile).toEqual({
        deliveryMethod: v.delivery,
        podDays: v.days,
        stage: v.stage,
        sourceDocType: "manual_input",
        provenance: { ocrConfidence: 0, extractedBy: "manual" },
      });
      expect(out.recommendation).toEqual({
        hospitalSignal: null,
        allowed: v.allowed,
        caution: v.caution,
        forbidden: v.forbidden,
        trace: { firedRules: v.firedRules, configVersion: "rules-1.1" },
      });
    });
  }
});

describe("회복 단계 분석 — 입력·메타", () => {
  it("분만 방식이 없으면 분석하지 않는다", () => {
    expect(analyze(null, 30, maternity())).toBeNull();
  });

  it("출산일이 없거나 형식이 틀리면 분석하지 않는다 — 0일차로 추정하지 않는다(원칙 3)", () => {
    for (const deliveryDate of [null, "", "2026-02-31", "2026/07/22"]) {
      expect(
        runRecoveryAnalysis({ profile: { deliveryMethod: "vaginal", deliveryDate }, maternity: maternity(), videos: { state: "notConfigured" } }, NOW),
      ).toBeNull();
    }
    // 오늘 출산(0일차)은 실제 값이라 분석한다
    expect(analyze("vaginal", 0, maternity())?.profile).toMatchObject({ podDays: 0, stage: "0-2w" });
  });

  it("출산일 → 산후 경과일은 로컬 달력 차이(2026-07-22 → 2026-09-23 = 63일, 9주차)", () => {
    const out = runRecoveryAnalysis(
      { profile: { deliveryMethod: "cesarean", deliveryDate: "2026-07-22" }, maternity: maternity(), videos: { state: "failed" } },
      new Date(2026, 8, 23, 0, 5),
    )!;
    expect(out.profile.podDays).toBe(63);
    expect(out.profile.stage).toBe("7-12w");
  });

  it("meta — engineVersion 'onmom-rules/1.0', generatedAt은 소수점 초 없는 UTC ISO", () => {
    const out = analyze("vaginal", 10, maternity())!;
    expect(ENGINE_VERSION).toBe("onmom-rules/1.0");
    expect(out.meta).toEqual({ engineVersion: "onmom-rules/1.0", generatedAt: "2026-09-23T01:00:00Z" });
  });

  it("영상 조회 실패·미설정은 빈 목록 + 상태로 전달한다", () => {
    expect(analyze("vaginal", 50, maternity(), { state: "notConfigured" })).toMatchObject({ exerciseVideos: [], videoFetch: "notConfigured" });
    expect(analyze("vaginal", 50, maternity(), { state: "failed" })).toMatchObject({ exerciseVideos: [], videoFetch: "failed" });
  });

  it("영상은 지금 할 수 있는 것만, 단계순으로 — 제왕절개 63일(9주) + 골반통", () => {
    const v = (id: string, stage: string): Video => ({
      video_id: id,
      title: `영상 ${id}`,
      url: `https://example.invalid/${id}`,
      description: "",
      tags: ["route_cesarean_section", `stage_${stage}`],
    });
    const videos = [v("c", "full_core"), v("b", "functional_strengthening"), v("a", "pelvic_floor"), v("z", "recovery_priority")];
    const out = analyze("cesarean", 63, maternity("pelvicPain"), { state: "ok", videos })!;
    expect(out.videoFetch).toBe("ok");
    expect(out.exerciseVideos).toEqual([
      { id: "z", title: "영상 z", matchReason: ["회복 우선기", "9주차 가능"], url: "https://example.invalid/z" },
      { id: "a", title: "영상 a", matchReason: ["골반저근", "9주차 가능"], url: "https://example.invalid/a" },
    ]);
  });

  it("각 주의 오버레이는 해당 항목 하나만 켜면 그 항목만 나온다(순서: 빈혈·골반통·임신중독증·출혈·GDM·DRA)", () => {
    const expected: [Flag, string][] = [
      ["anemia", "anemia"],
      ["pelvicPain", "pelvic_pain"],
      ["preeclampsia", "preeclampsia"],
      ["heavyBleeding", "heavy_bleeding"],
      ["gdm", "gdm"],
      ["diastasisRecti", "diastasis_recti"],
    ];
    for (const [flag, item] of expected) {
      const rec = recoveryRecommendation("vaginal", 13, maternity(flag));
      expect(rec.caution.map((c) => c.item)).toEqual([item]);
      expect(rec.trace.firedRules.filter((r) => r.startsWith("caution:"))).toEqual([`caution:${item}`]);
    }
    expect(recoveryRecommendation("vaginal", 13, maternity()).caution).toEqual([]);
  });

  it("주차 미도달 단계가 차단돼도 firedRules에는 blocked로 남는다(Swift와 같음)", () => {
    const rec = recoveryRecommendation("cesarean", 3, maternity("pelvicPain"));
    expect(rec.forbidden.find((f) => f.item === "functional_strengthening")?.evidenceChips).toEqual(["8주차부터 (현재 3주차)", "src:회복 단계 기준"]);
    expect(rec.trace.firedRules).toContain("blocked:functional_strengthening");
  });

  it("같은 입력이면 같은 결과(순수 함수)", () => {
    expect(analyze("vaginal", 91, maternity("diastasisRecti", "preeclampsia"))).toEqual(analyze("vaginal", 91, maternity("diastasisRecti", "preeclampsia")));
  });
});

describe("단계 코드·라벨(감사 #25)", () => {
  it("주차 경계 2/3/4/5/6/7/12/13", () => {
    const cases: [number, StageCode][] = [
      [0, "0-2w"],
      [2, "0-2w"],
      [3, "3-4w"],
      [4, "3-4w"],
      [5, "5-6w"],
      [6, "5-6w"],
      [7, "7-12w"],
      [12, "7-12w"],
      [13, "13w+"],
      [40, "13w+"],
    ];
    for (const [week, code] of cases) expect(stageCodeForWeek(week)).toBe(code);
  });

  it("라벨은 en dash(–)로 고정 매핑", () => {
    expect(stageLabel("0-2w")).toBe("산후 0–2주");
    expect(stageLabel("3-4w")).toBe("산후 3–4주");
    expect(stageLabel("5-6w")).toBe("산후 5–6주");
    expect(stageLabel("7-12w")).toBe("산후 7–12주");
    expect(stageLabel("13w+")).toBe("산후 13주+");
  });

  it("severity·문서 종류 라벨", () => {
    expect(severityLabel("immediate")).toBe("즉시 내원");
    expect(severityLabel("urgent")).toBe("당일 진료");
    // 모르는 코드는 null — 화면은 배지를 빼고 코드를 그대로 내지 않는다
    expect(severityLabel("routine")).toBeNull();
    expect(severityLabel("")).toBeNull();
    // content.json의 레드플래그 심각도는 전부 라벨이 있다
    for (const f of content.red_flags) expect(severityLabel(f.severity)).not.toBeNull();
    expect(docTypeLabel("manual_input")).toBe("직접 입력");
    expect(docTypeLabel("EMR")).toBe("진료기록(EMR)");
    expect(docTypeLabel("maternity_handbook")).toBe("산모수첩");
    expect(docTypeLabel("??")).toBe("확인 불가");
  });

  it("프로필 부제", () => {
    const out = analyze("cesarean", 63, maternity())!;
    expect(analysisProfileSubtitle(out.profile)).toBe("제왕절개 · 산후 63일차");
  });
});

describe("묶음", () => {
  it("가능/주의/금지 묶음 순서와 색", () => {
    expect(ANALYSIS_GROUPS.map((g) => [g.key, g.title, g.tone])).toEqual([
      ["allowed", "가능", "normal"],
      ["caution", "주의", "accent"],
      ["forbidden", "금지", "alert"],
    ]);
  });
});

describe("레드플래그 활성 중 표시 범위(감사 #3 — CPO 결정 대기)", () => {
  const out = analyze("vaginal", 50, maternity())!;

  it("분석 결과 자체는 레드플래그를 모른다 — hospitalSignal은 늘 null", () => {
    expect(out.recommendation.hospitalSignal).toBeNull();
  });

  it("기본(iOS 동작): 최근 기록에 레드플래그가 있어도 모두 보여준다", () => {
    expect(analysisSections(out, { activeRedFlag: true, suppressExerciseOnRedFlag: false })).toEqual({
      allowed: true,
      caution: true,
      forbidden: true,
      videos: true,
    });
  });

  it("가림 정책을 켜면 '가능'과 영상만 가린다 — 결과 객체는 그대로", () => {
    const before = JSON.stringify(out);
    expect(analysisSections(out, { activeRedFlag: true, suppressExerciseOnRedFlag: true })).toEqual({
      allowed: false,
      caution: true,
      forbidden: true,
      videos: false,
    });
    expect(analysisSections(out, { activeRedFlag: false, suppressExerciseOnRedFlag: true }).allowed).toBe(true);
    expect(JSON.stringify(out)).toBe(before);
  });

  it("병원 신호가 실린 결과면 가능/주의/금지·영상을 모두 건너뛴다(AnalyzeResultView.swift:26)", () => {
    const withSignal: EngineOutput = {
      ...out,
      recommendation: {
        ...out.recommendation,
        hospitalSignal: { code: "x", severity: "immediate", messagePatient: "", evidenceChips: [] },
      },
    };
    expect(analysisSections(withSignal, { activeRedFlag: false, suppressExerciseOnRedFlag: false })).toEqual({
      allowed: false,
      caution: false,
      forbidden: false,
      videos: false,
    });
  });
});

describe("분석과 운동 탭·홈은 같은 저장값으로 같은 판정(감사 #2, ExerciseRules.swift:74-75)", () => {
  it("DRA 저장 후 제왕절개 13주: 분석 '금지: 코어 강화' = 운동 탭 잠금 = 홈 '코어 강화 제외 — …'", () => {
    const stored = maternity("diastasisRecti");
    const reason = blockedBuckets(stored).full_core!;
    expect(reason).toBeTruthy();
    const out = analyze("cesarean", 91, stored)!;
    expect(out.recommendation.forbidden.find((f) => f.item === "full_core")?.label).toBe(`코어 강화 — ${reason}`);
    expect(out.recommendation.allowed.map((a) => a.item)).not.toContain("full_core");

    const fc: Video = { video_id: "fc", title: "코어", url: "https://example.invalid/fc", description: "", tags: ["route_cesarean_section", "stage_full_core"] };
    const plan = exercisePlan([fc], "cesarean", 13, stored);
    expect(plan.map((p) => [p.unlocked, p.blockedReason])).toEqual([[false, reason]]);

    expect(currentStage("cesarean", 13, stored)?.key).not.toBe("full_core");
    const card = homeStageCard("cesarean", 13, stored, false);
    expect(card?.kind === "stage" && card.excluded).toEqual([`코어 강화 제외 — ${reason}`]);
  });

  it("병원 신호 타입은 레드플래그 모양(severity: string)을 그대로 받는다", () => {
    const f = content.red_flags[0];
    const signal: HospitalSignal = { code: f.code, severity: f.severity, messagePatient: f.message, evidenceChips: [...f.chips] };
    expect(severityLabel(signal.severity)).toBe("즉시 내원");
  });
});
