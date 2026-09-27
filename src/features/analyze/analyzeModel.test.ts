import { describe, expect, it } from "vitest";
import type { MaternityRecord, UserProfile } from "@/domain/types";
import type { Video } from "@/rules/exercise";
import { runRecoveryAnalysis, type EngineOutput, type VideoFetchResult } from "@/rules/recovery";
import { defaultMaternity, defaultProfile } from "@/store/defaults";
import {
  ANALYZE_TEXT,
  CLINICAL_TOGGLES,
  analyzePhaseKey,
  analyzeResultModel,
  canStartAnalysis,
  formValuesFromSaved,
  isValidDeliveryDate,
  maternityPatchFromForm,
  profilePatchFromForm,
  splitResultBlocks,
  todayInputValue,
  videoFetchResultFrom,
  type AnalyzeFormValues,
} from "./analyzeModel";

const NOW = new Date("2026-09-23T21:30:00+09:00");

function profile(patch: Partial<UserProfile> = {}): UserProfile {
  return { ...defaultProfile(), ...patch };
}

function maternity(patch: Partial<MaternityRecord> = {}): MaternityRecord {
  return { ...defaultMaternity(), ...patch };
}

function form(patch: Partial<AnalyzeFormValues> = {}): AnalyzeFormValues {
  return {
    deliveryMethod: "cesarean",
    deliveryDate: "2026-07-17",
    heightCm: 0,
    prePregnancyWeightKg: 0,
    currentWeightKg: 0,
    maternity: maternity(),
    ...patch,
  };
}

// 테스트 입력용 영상(화면에 쓰이지 않는다)
function video(id: string, stage: string, url = `https://www.youtube.com/watch?v=${id}`): Video {
  return { video_id: id, title: `영상 ${id}`, url, description: "", tags: [`stage_${stage}`] };
}

function analyze(p: Partial<UserProfile>, m: Partial<MaternityRecord>, videos: VideoFetchResult): EngineOutput {
  const out = runRecoveryAnalysis({ profile: profile(p), maternity: maternity(m), videos }, NOW);
  if (!out) throw new Error("분석 결과가 있어야 한다");
  return out;
}

describe("폼 문구", () => {
  it("토글 7개 — AnalyzeFlowView.swift:101-107 순서·원문", () => {
    expect(CLINICAL_TOGGLES.map((t) => [t.key, t.title])).toEqual([
      ["isPrimiparous", "첫 출산(초산)"],
      ["gdm", "임신성 당뇨(GDM)"],
      ["preeclampsia", "임신중독증(자간전증)·고혈압"],
      ["heavyBleeding", "분만 시 출혈이 많았어요"],
      ["anemia", "산후 빈혈(Hb 12 미만)"],
      ["pelvicPain", "골반통·치골결합 통증"],
      ["diastasisRecti", "복직근 이개(DRA)"],
    ]);
  });
});

describe("단계 전환 초점", () => {
  it("단계마다(폼은 다시 채울 때마다) 영역 key가 달라 새로 만들어진다", () => {
    const keys = [
      analyzePhaseKey({ kind: "form", formKey: 0 }),
      analyzePhaseKey({ kind: "loading" }),
      analyzePhaseKey({ kind: "result" }),
      analyzePhaseKey({ kind: "form", formKey: 1 }),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("실패 문구", () => {
  it("Swift 원문 하나만 쓴다(AnalyzeFlowView.swift:215) — 닿지 않는 웹 신규 문구를 두지 않는다", () => {
    expect(ANALYZE_TEXT.errorNoDelivery).toBe("분만 방식을 먼저 선택해주세요.");
    expect(Object.keys(ANALYZE_TEXT)).not.toContain("errorNoDeliveryDate");
  });
});

describe("프리필", () => {
  it("저장된 프로필·산모수첩으로 채운다 — 출산일이 없으면 오늘로 채우지 않고 비운다", () => {
    const m = maternity({ diastasisRecti: true, isPrimiparous: false });
    const v = formValuesFromSaved(profile({ deliveryMethod: "vaginal", heightCm: 160, currentWeightKg: 58.5 }), m);
    expect(v).toEqual({
      deliveryMethod: "vaginal",
      deliveryDate: "",
      heightCm: 160,
      prePregnancyWeightKg: 0,
      currentWeightKg: 58.5,
      maternity: m,
    });
    expect(v.maternity).not.toBe(m);
    expect(formValuesFromSaved(profile({ deliveryDate: "2026-07-17" }), m).deliveryDate).toBe("2026-07-17");
  });
});

describe("출산일 · [분석 시작] 활성", () => {
  it("오늘까지(로컬 달력)만 허용 — 키보드로 넣은 미래 날짜·없는 날짜는 거부", () => {
    expect(todayInputValue(NOW)).toBe("2026-09-23");
    expect(isValidDeliveryDate("2026-09-23", NOW)).toBe(true);
    expect(isValidDeliveryDate("2026-09-24", NOW)).toBe(false);
    expect(isValidDeliveryDate("2026-02-31", NOW)).toBe(false);
    expect(isValidDeliveryDate("", NOW)).toBe(false);
  });

  it("분만 방식과 출산일이 모두 있어야 시작할 수 있다(D10)", () => {
    expect(canStartAnalysis(form(), NOW)).toBe(true);
    expect(canStartAnalysis(form({ deliveryMethod: null }), NOW)).toBe(false);
    expect(canStartAnalysis(form({ deliveryDate: "" }), NOW)).toBe(false);
  });
});

describe("저장할 값", () => {
  it("분만 방식·출산일·키·체중, 산모수첩 7항목(AnalyzeFlowView.swift:194-205)", () => {
    const m = maternity({ gdm: true });
    const v = form({ heightCm: 160, prePregnancyWeightKg: 55, currentWeightKg: 60, maternity: m });
    expect(profilePatchFromForm(v)).toEqual({
      deliveryMethod: "cesarean",
      deliveryDate: "2026-07-17",
      heightCm: 160,
      prePregnancyWeightKg: 55,
      currentWeightKg: 60,
    });
    expect(maternityPatchFromForm(v)).toEqual(m);
  });

  it("분만 방식·출산일이 비었으면 싣지 않는다(저장값을 지우지 않음) — 키·체중은 0으로 비운다", () => {
    expect(profilePatchFromForm(form({ deliveryMethod: null, deliveryDate: "" }))).toEqual({
      heightCm: 0,
      prePregnancyWeightKg: 0,
      currentWeightKg: 0,
    });
  });
});

describe("영상 조회 결과 → 분석 입력(DEV_NOTES §4)", () => {
  it("ok / notConfigured / 그 밖의 실패", () => {
    const videos = [video("a", "recovery_priority")];
    expect(videoFetchResultFrom({ ok: true, videos })).toEqual({ state: "ok", videos });
    expect(videoFetchResultFrom({ ok: false, kind: "notConfigured", message: "" })).toEqual({ state: "notConfigured" });
    expect(videoFetchResultFrom({ ok: false, kind: "server", message: "", status: 503 })).toEqual({ state: "failed" });
    expect(videoFetchResultFrom({ ok: false, kind: "network", message: "" })).toEqual({ state: "failed" });
  });
});

describe("결과 화면", () => {
  const P = { deliveryMethod: "cesarean" as const, deliveryDate: "2026-07-17" };

  it("프로필 요약 — 단계 라벨·분만·일차·'직접 입력'·규칙 안내 문구(AnalyzeResultView.swift:47-74)", () => {
    const model = analyzeResultModel(analyze(P, {}, { state: "notConfigured" }), false);
    expect(model.hospitalSignal).toBeNull();
    expect(model.profile).toEqual({
      stage: "산후 7–12주",
      subtitle: "제왕절개 · 산후 68일차",
      source: "직접 입력",
      note: "오로·발열·통증 등 당일 증상은 '기록' 탭에서 확인해요. 이 결과는 입력한 회복 정보에 대한 규칙 안내입니다.",
    });
    expect(model.done).toBe("완료");
    expect(model.restart).toBe("다시 분석하기");
  });

  it("가능/주의/금지 순, 항목이 없는 '주의'는 그리지 않는다", () => {
    const model = analyzeResultModel(analyze(P, {}, { state: "notConfigured" }), false);
    expect(model.blocks.map((b) => (b.kind === "group" ? [b.group.title, b.group.items.length] : b.kind))).toEqual([
      ["가능", 4],
      ["금지", 1],
    ]);
    const forbidden = model.blocks[1];
    if (forbidden.kind !== "group") throw new Error("group");
    expect(forbidden.group.items[0]).toEqual({
      item: "full_core",
      label: "코어 강화 — 복근·코어 강화·요가 (분만 무관)",
      evidenceChips: ["12주차부터 (현재 9주차)", "src:회복 단계 기준"],
    });
  });

  it("주의 항목에는 content.json 칩(출처 포함)이 그대로 붙는다", () => {
    const model = analyzeResultModel(analyze(P, { anemia: true }, { state: "notConfigured" }), false);
    const caution = model.blocks.find((b) => b.kind === "group" && b.group.key === "caution");
    expect(caution).toEqual({
      kind: "group",
      group: {
        key: "caution",
        title: "주의",
        tone: "accent",
        items: [{ item: "anemia", label: "빈혈 — 어지럼·낙상 위험, 앉거나 누운 자세 위주로", evidenceChips: ["Hb<12", "src:산모수첩 확인항목"] }],
      },
    });
  });

  it("영상 3상태 — 미설정 · 실패 · 목록(가능한 영상만, 주소는 safeExternalUrl)", () => {
    expect(analyzeResultModel(analyze(P, {}, { state: "notConfigured" }), false).videos).toEqual({
      kind: "info",
      title: "운동 영상은 준비 중이에요",
      body: "가능/주의/금지 안내는 위에서 확인하실 수 있어요.",
    });
    expect(analyzeResultModel(analyze(P, {}, { state: "failed" }), false).videos).toEqual({
      kind: "info",
      title: "운동 영상을 불러오지 못했어요",
      body: "네트워크 상태를 확인한 뒤 다시 분석해 주세요. 위 안내는 그대로 유효해요.",
    });
    const ok = analyze(P, {}, {
      state: "ok",
      videos: [video("a", "early_core_activation"), video("z", "full_core"), video("b", "pelvic_floor", "https://evil.example/b")],
    });
    expect(analyzeResultModel(ok, false).videos).toEqual({
      kind: "list",
      title: "추천 운동 영상",
      videos: [
        { id: "a", title: "영상 a", reason: "코어 깨우기 · 9주차 가능", href: "https://www.youtube.com/watch?v=a" },
        { id: "b", title: "영상 b", reason: "골반저근 · 9주차 가능", href: null },
      ],
    });
  });

  it("조회는 됐지만 지금 볼 영상이 없으면 영상 영역을 그리지 않는다(빈 카드 금지)", () => {
    const ok = analyze(P, {}, { state: "ok", videos: [video("z", "full_core")] });
    expect(analyzeResultModel(ok, false).videos).toBeNull();
  });

  it("D1 — 최근 기록에 레드플래그가 있으면 '가능'·영상 대신 '운동 안내를 멈췄어요', 주의·금지는 그대로", () => {
    const out = analyze(P, { anemia: true }, { state: "ok", videos: [video("a", "early_core_activation")] });
    const model = analyzeResultModel(out, true);
    expect(model.blocks.map((b) => (b.kind === "group" ? b.group.title : b.kind))).toEqual(["exerciseStopped", "주의", "금지"]);
    expect(model.blocks[0]).toEqual({
      kind: "exerciseStopped",
      title: "운동 안내를 멈췄어요",
      body: "최근 기록에서 병원 확인이 필요한 신호가 있어요. 먼저 의료진을 만난 뒤 운동을 이어가세요.",
    });
    expect(model.videos).toBeNull();
    // 레드플래그 중에는 '준비 중' 안내도 내지 않는다(영상 영역 자체를 숨김)
    expect(analyzeResultModel(analyze(P, {}, { state: "notConfigured" }), true).videos).toBeNull();
  });

  it("병원 신호가 있는 결과는 가능/주의/금지·영상을 모두 건너뛴다(AnalyzeResultView.swift:26)", () => {
    const out = analyze(P, { anemia: true }, { state: "notConfigured" });
    const signal = { code: "x", severity: "immediate", messagePatient: "m", evidenceChips: [] };
    const model = analyzeResultModel({ ...out, recommendation: { ...out.recommendation, hospitalSignal: signal } }, false);
    expect(model.hospitalSignal).toBe(signal);
    expect(model.blocks).toEqual([]);
    expect(model.videos).toBeNull();
  });
});

describe("PC 두 열 배치 — 순서를 지키며 높이가 비슷하게", () => {
  type Block = ReturnType<typeof analyzeResultModel>["blocks"][number];
  const group = (key: "allowed" | "caution" | "forbidden", n: number): Block => ({
    kind: "group",
    group: {
      key,
      title: key,
      tone: "normal",
      items: Array.from({ length: n }, (_, i) => ({ item: `${key}${i}`, label: `${key}${i}`, evidenceChips: [] })),
    },
  });
  const stopped: Block = { kind: "exerciseStopped", title: "t", body: "b" };
  const keys = (bs: Block[]) => bs.map((b) => (b.kind === "group" ? b.group.key : "stopped"));

  it("묶음이 하나 이하면 한 열", () => {
    expect(splitResultBlocks([])).toEqual({ left: [], right: [] });
    expect(keys(splitResultBlocks([group("caution", 2)]).right)).toEqual([]);
  });

  it("가능이 길면 왼쪽에 가능, 오른쪽에 주의·금지", () => {
    const { left, right } = splitResultBlocks([group("allowed", 3), group("caution", 1), group("forbidden", 2)]);
    expect(keys(left)).toEqual(["allowed"]);
    expect(keys(right)).toEqual(["caution", "forbidden"]);
  });

  it("레드플래그(가능 자리 멈춤 안내)면 멈춤·주의 | 금지", () => {
    const { left, right } = splitResultBlocks([stopped, group("caution", 1), group("forbidden", 2)]);
    expect(keys(left)).toEqual(["stopped", "caution"]);
    expect(keys(right)).toEqual(["forbidden"]);
  });

  it("합치면 늘 원래 순서(읽는 순서 = iOS 순서)", () => {
    const blocks = [group("allowed", 1), group("caution", 5), group("forbidden", 1)];
    const { left, right } = splitResultBlocks(blocks);
    expect([...left, ...right]).toEqual(blocks);
    expect(left.length).toBeGreaterThan(0);
    expect(right.length).toBeGreaterThan(0);
  });
});
