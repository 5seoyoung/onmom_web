// Swift에서 손으로 옮긴 화면 문구를 content.json으로 옮길 때(감사 #5·#25·#27, DEV_NOTES §3 "content.json 수정 요청") 화면에 그려지는
// 글자가 한 글자도 바뀌지 않았는지 본다. 기대값은 옮기기 전 코드가 내던 글자를 그대로 적어 둔 것이다 — 옮긴 뒤에도 이 파일은 고치지 않는다.
// 문구를 일부러 바꿀 때만(CPO 결정) 여기 기대값을 함께 바꾼다.
import { describe, expect, it } from "vitest";
import type { SymptomRecord } from "@/domain/types";
import { SUBSTANCE_TEXT } from "@/features/substance/substanceModel";
import { CHAT_FAQ_TITLE, CHAT_GREETING } from "@/rules/chat";
import {
  DELIVERY_OPTIONS,
  DELIVERY_TITLE,
  EXERCISE_TEXT,
  GOAL_TITLE,
  STAGE_BUCKETS,
  lockedSectionTitle,
  planSections,
  videoBadge,
  type PlanVideo,
} from "@/rules/exercise";
import { RECORD_NORMAL_RESULT } from "@/rules/record";
import { metrics } from "@/rules/redflag";
import { stageLabel, type StageCode } from "@/rules/recovery";
import { resolveSubstance, substanceHeader } from "@/rules/substance";
import { SUPPORT_TEXT } from "@/rules/support";
import { weightPlan } from "@/rules/weight";

const record = (over: Partial<SymptomRecord>): SymptomRecord => ({
  id: "r",
  date: "2026-09-23T01:00:00.000Z",
  lochiaIncreased: false,
  lochiaRed: false,
  feverEvent: false,
  painNrs: 0,
  redFlagCode: null,
  postpartumDays: 30,
  rulesVersion: null,
  ...over,
});

const plan = (over: Partial<PlanVideo>): PlanVideo => ({
  video: { video_id: "v", title: "t", url: "https://example.com", description: "", tags: [] },
  bucket: STAGE_BUCKETS[0],
  weekReached: true,
  unlockWeek: 0,
  blockedReason: null,
  unlocked: true,
  ...over,
});

// 2026-11-13: "발열" → "발열·오한"(rules-1.3 — 발열 토글에 오한을 합침, 임상 자체 검토 R-FEVER·T6. 웹 신규 문구 — CPO 확인 필요)
describe("홈 회복 지표 이름 — RedFlagEngine.swift:72-75", () => {
  it("오로·발열·통증(0~10)", () => {
    expect(metrics(record({ postpartumDays: 30 })).map((m) => m.name)).toEqual(["오로(분비물)", "발열·오한", "통증 NRS 0/10"]);
    expect(metrics(record({ postpartumDays: null })).map((m) => m.name)).toEqual(["오로(분비물)", "발열·오한", "통증 NRS 0/10"]);
    expect(metrics(record({ postpartumDays: 3 })).map((m) => m.name)).toEqual(["발열·오한", "통증 NRS 0/10"]);
    expect(Array.from({ length: 11 }, (_, n) => metrics(record({ painNrs: n }))[2].name)).toEqual([
      "통증 NRS 0/10",
      "통증 NRS 1/10",
      "통증 NRS 2/10",
      "통증 NRS 3/10",
      "통증 NRS 4/10",
      "통증 NRS 5/10",
      "통증 NRS 6/10",
      "통증 NRS 7/10",
      "통증 NRS 8/10",
      "통증 NRS 9/10",
      "통증 NRS 10/10",
    ]);
  });
});

describe("운동 탭 섹션·배지 — ExerciseView.swift:67-72, :212-214", () => {
  it("섹션 제목", () => {
    expect([EXERCISE_TEXT.unlockedSection, EXERCISE_TEXT.lockedSectionBlocked, EXERCISE_TEXT.lockedSectionEarly]).toEqual([
      "지금 가능한 운동",
      "지금은 권하지 않는 운동",
      "아직 이른 운동",
    ]);
    const open = plan({});
    const early = plan({ unlocked: false, weekReached: false, unlockWeek: 8 });
    const blocked = plan({ unlocked: false, blockedReason: "사유" });
    expect(planSections([open, early]).map((s) => s.title)).toEqual(["지금 가능한 운동", "아직 이른 운동"]);
    expect(planSections([open, early, blocked]).map((s) => s.title)).toEqual(["지금 가능한 운동", "지금은 권하지 않는 운동"]);
    expect(lockedSectionTitle([])).toBe("아직 이른 운동");
  });

  it("배지", () => {
    expect(videoBadge(plan({}))).toEqual({ text: "가능", tone: "normal" });
    expect(videoBadge(plan({ unlocked: false, blockedReason: "사유" }))).toEqual({ text: "지금은 권장 안 함", tone: "alert" });
    expect([0, 3, 6, 8, 12].map((w) => videoBadge(plan({ unlocked: false, weekReached: false, unlockWeek: w })).text)).toEqual([
      "0주에 열림",
      "3주에 열림",
      "6주에 열림",
      "8주에 열림",
      "12주에 열림",
    ]);
  });
});

describe("단계 라벨 — AnalyzeComponents.swift:9-13", () => {
  it("다섯 단계(– 는 en dash U+2013)", () => {
    const codes: StageCode[] = ["0-2w", "3-4w", "5-6w", "7-12w", "13w+"];
    expect(codes.map(stageLabel)).toEqual(["산후 0–2주", "산후 3–4주", "산후 5–6주", "산후 7–12주", "산후 13주+"]);
  });
});

describe("약물 화면 헤더·'AI 답변' 칩 — SubstanceCheckView.swift:24, :56, :137-139", () => {
  it("화면 제목과 수유 안 함 안내", () => {
    expect(SUBSTANCE_TEXT.title).toBe("약물·음식 체크");
    expect(substanceHeader(false).note).toBe(
      "프로필이 '모유수유 안 함'으로 되어 있어요. 수유 중이라면 프로필 편집에서 바꿔주세요 - 분류 기준이 달라져요.",
    );
    expect(substanceHeader(true).note).toBeNull();
  });

  it("AI 답에 붙는 칩과 병기 문구", async () => {
    const r = await resolveSubstance("없는품목가나다", {
      llmLookup: async () => ({ verdict: "caution", detail: "설명.", sources: ["LactMed"] }),
    });
    expect(r.detail).toBe("설명. (AI 답변이며 진단·처방이 아닙니다. 복용 전 의료진·약사와 상담하세요.)");
    expect(r.evidenceChips).toEqual(["src:LactMed", "AI 답변"]);
  });
});

describe("챗 인사말·FAQ 제목 — ChatView.swift:13, :123", () => {
  it("글자 그대로", () => {
    expect(CHAT_GREETING).toBe(
      "안녕하세요, 온맘이에요. 산후 회복에 대해 궁금한 점을 편하게 물어보세요. (제공되는 답변은 정보 안내이며 진단·처방이 아닙니다.)",
    );
    expect(CHAT_FAQ_TITLE).toBe("자주 묻는 질문");
  });
});

describe("지원사업 화면 문구 — SupportProgramView.swift:110-152", () => {
  it("여섯 줄", () => {
    expect({ ...SUPPORT_TEXT }).toEqual({
      title: "지원사업 추천",
      intro: "해당되는 항목을 체크하면 상황에 맞는 지원사업을 안내해요.",
      universalTitle: "모든 산모 공통",
      recommendButton: "추천 받기",
      nothingChecked: "체크한 항목이 없어요. 위에서 해당되는 상황을 골라 보세요.",
      footer: "전국 공통 정부·지자체 사업 안내입니다. 대상·금액·신청 기간은 거주 지역 보건소·주민센터에서 확인하세요.",
    });
  });
});

describe("분만 방식·목표 이름 — Models.swift:13-14, :39-40", () => {
  it("글자와 선택지 순서", () => {
    expect({ ...DELIVERY_TITLE }).toEqual({ vaginal: "자연분만", cesarean: "제왕절개" });
    expect(DELIVERY_OPTIONS).toEqual([
      { value: "vaginal", title: "자연분만" },
      { value: "cesarean", title: "제왕절개" },
    ]);
    expect({ ...GOAL_TITLE }).toEqual({ homemaker: "전업", returningToWork: "복직 예정" });
  });
});

describe("걸린 신호가 없을 때의 안내와 체중 칩 — content.json 형식을 바꿔도 같은 글자(감사 #53)", () => {
  it("record_normal 제목·본문", () => {
    expect({ ...RECORD_NORMAL_RESULT }).toEqual({
      title: "체크한 항목 중에는 '바로 병원에 가야 하는 신호'에 해당하는 것이 없었어요",
      body: "증상이 계속되거나 걱정되면 의료진과 상담하세요. 아래 목록에 없는 증상이라도 걱정되면 병원에 문의하세요. 이 안내는 진단이 아니에요.",
    });
  });

  it("체중 계획 — 감량(BMI·남은 체중)·회복, 제목·본문·칩", () => {
    const p = (heightCm: number, currentWeightKg: number, prePregnancyWeightKg = 0) => ({ heightCm, currentWeightKg, prePregnancyWeightKg });
    const loss = {
      kind: "loss",
      title: "체중 감량 목표",
      detail: "주당 0.5kg 감량을 목표로 걷기 등 유산소 운동을 권해요. 6개월에 걸쳐 체중의 5~10%를 줄이는 걸 목표로 해요.",
    };
    const recovery = {
      kind: "recovery",
      title: "체중 회복 목표",
      detail: "출산 후 12개월에 걸쳐 임신 전 체중으로 돌아가는 걸 목표로, 회복 단계에 맞는 운동을 이어가요.",
    };
    const tail = ["주당 0.5kg", "유산소(걷기)", "6개월 5~10% 감량"];
    expect(weightPlan(p(162, 64, 56))).toEqual({ ...loss, chips: ["BMI 24.4", ...tail] });
    expect(weightPlan(p(160, 54.5, 50))).toEqual({ ...loss, chips: ["임신 전 +4.5kg", ...tail] });
    expect(weightPlan(p(170, 60.25, 55))).toEqual({ ...loss, chips: ["임신 전 +5.2kg", ...tail] });
    expect(weightPlan(p(100, 22.25))).toEqual({ ...recovery, chips: ["BMI 22.2", "12개월 복귀"] });
    expect(weightPlan(p(160, 52, 50))).toEqual({ ...recovery, chips: ["BMI 20.3", "12개월 복귀"] });
    expect(weightPlan(p(160, 58.8))).toEqual({ ...recovery, chips: ["BMI 23.0", "12개월 복귀"] });
    expect(weightPlan(p(160, 0))).toBeNull();
  });
});
