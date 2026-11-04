import { afterEach, describe, expect, it, vi } from "vitest";
import content from "@/content";
import { RISK_SYMPTOM_KEYS, type SymptomRecord } from "@/domain/types";
import {
  METRIC_STATUS_LABEL,
  RED_FLAG_CODES,
  RED_FLAG_GUIDES,
  RED_FLAG_MATCHER_CODES,
  checkRedFlags,
  metrics,
  redFlagSeverity,
  severityRank,
  type SymptomInput,
} from "./redflag";

const input = (over: Partial<SymptomInput> = {}): SymptomInput => ({
  postpartumDays: 20,
  lochiaIncreased: false,
  lochiaRed: false,
  feverEvent: false,
  painNrs: 0,
  woundPainWorsening: false,
  dizzinessFainting: false,
  chestPainBreathing: false,
  calfPainSwelling: false,
  bleedingHeavy: false,
  headacheVision: false,
  faceHandSwelling: false,
  upperBellyPain: false,
  seizure: false,
  harmThoughts: false,
  ...over,
});

const record = (over: Partial<SymptomRecord> = {}): SymptomRecord => ({
  id: "r1",
  date: "2026-09-23T01:00:00.000Z",
  lochiaIncreased: false,
  lochiaRed: false,
  feverEvent: false,
  painNrs: 0,
  redFlagCode: null,
  postpartumDays: 20,
  rulesVersion: null,
  ...over,
});

const code = (i: SymptomInput) => checkRedFlags(i).hospitalSignal?.code ?? null;

// RedFlagEngine.swift:107-143 — rules-1.1까지의 여섯(서로의 순서는 rules-1.2에서도 그대로)
const SWIFT_ORDER = ["pph_suspect", "severe_pain", "fever_infection", "neuro_flag", "cardioresp_flag", "dvt_suspect"];
// rules-1.2 평가 순서 — 등급 높은 규칙이 앞(119 → 위기 상담 → 즉시 내원), 다량 출혈은 오로 규칙 앞(임상 사전 검토 §3 T1~T5·T11)
const RULES_ORDER = [
  "heavy_bleeding_dizzy",
  "seizure",
  "harm_thoughts",
  "heavy_bleeding",
  ...SWIFT_ORDER,
  "headache_vision",
  "face_hand_swelling",
  "upper_belly_pain",
];

describe("규칙 테이블", () => {
  it("평가 순서 — Swift 여섯은 그 순서 그대로, 모든 규칙에 조건이 있다", () => {
    expect(RED_FLAG_CODES).toEqual(RULES_ORDER);
    expect([...RED_FLAG_MATCHER_CODES].sort()).toEqual([...RULES_ORDER].sort());
    expect(RED_FLAG_CODES.filter((c) => SWIFT_ORDER.includes(c))).toEqual(SWIFT_ORDER);
  });

  it("Swift 여섯의 문구·등급은 원문 그대로다", () => {
    const s = checkRedFlags(input({ postpartumDays: 12, lochiaIncreased: true, lochiaRed: true })).hospitalSignal;
    expect(s).toEqual({
      code: "pph_suspect",
      severity: "immediate",
      messagePatient:
        "산후 10일이 지난 뒤에도 오로가 늘고 다시 붉어지는 것은 즉시 병원 확인이 필요한 신호예요. 바로 산부인과에 방문하세요.",
      evidenceChips: ["오로 증가+선홍색(10일 후)", "src:임산부수첩 2023"],
    });
    expect(checkRedFlags(input({ chestPainBreathing: true })).hospitalSignal!.messagePatient).toBe(
      "흉통·가슴 압박·호흡곤란은 즉시 병원 확인이 필요한 신호예요. 심하면 119에 연락하세요.",
    );
    for (const c of SWIFT_ORDER) expect(redFlagSeverity(c), c).toBe("immediate");
  });

  it("출처 칩은 임상 사전 검토 §5에서 확인한 자료 이름만 — 예전에 칩이 없던 셋(어지러움·흉통·종아리)도 그 자료로(§2-1 제안)", () => {
    const KNOWN = new Set(["src:임산부수첩 2023", "src:CDC Hear Her 2024", "src:AWHONN 2018", "src:NICE NG194", "src:NICE NG133"]);
    for (const flag of content.red_flags) {
      const sources = flag.chips.filter((c) => c.startsWith("src:"));
      expect(sources.length, flag.code).toBeGreaterThan(0);
      for (const s of sources) expect(KNOWN.has(s), `${flag.code} ${s}`).toBe(true);
      // 첫 칩은 출처가 아니라 신호 이름(근거 설명 칩) — 안내 목록이 이 글자를 신호 이름으로 쓴다
      expect(flag.chips[0].startsWith("src:"), flag.code).toBe(false);
    }
    expect(checkRedFlags(input({ dizzinessFainting: true })).hospitalSignal!.evidenceChips).toEqual(["어지러움·실신·균형장애", "src:CDC Hear Her 2024"]);
    expect(checkRedFlags(input({ chestPainBreathing: true })).hospitalSignal!.evidenceChips).toEqual(["흉통·가슴 압박·호흡곤란", "src:AWHONN 2018"]);
    expect(checkRedFlags(input({ calfPainSwelling: true })).hospitalSignal!.evidenceChips).toEqual([
      "한쪽 종아리 통증·부종",
      "src:CDC Hear Her 2024",
      "src:NICE NG194",
    ]);
  });

  it("질병명을 말하지 않는다 — 문구·칩에 질환 이름이 없다(의료기기 경계)", () => {
    const text = content.red_flags.flatMap((f) => [f.message, ...f.chips]).join(" ");
    for (const word of ["자간", "임신중독", "혈전", "패혈", "우울증", "산후출혈", "진단", "의심"]) expect(text, word).not.toContain(word);
  });
});

describe("checkRedFlags — 02 §11 벡터", () => {
  it("12일 · 증가 · 붉음 → pph_suspect", () => {
    const r = checkRedFlags(input({ postpartumDays: 12, lochiaIncreased: true, lochiaRed: true }));
    expect(r.hospitalSignal?.code).toBe("pph_suspect");
    expect(r.trace).toEqual({ firedRules: ["redflag:pph_suspect"], configVersion: "rules-1.2" });
  });

  it("5일 · 증가 · 붉음 → 신호 없음(10일 게이팅)", () => {
    const r = checkRedFlags(input({ postpartumDays: 5, lochiaIncreased: true, lochiaRed: true }));
    expect(r.hospitalSignal).toBeNull();
    expect(r.signals).toEqual([]);
    expect(r.trace).toEqual({ firedRules: ["redflag:none"], configVersion: "rules-1.2" });
  });

  it("NRS 8 → severe_pain, NRS 7 → 없음", () => {
    expect(code(input({ painNrs: 8 }))).toBe("severe_pain");
    expect(code(input({ painNrs: 7 }))).toBeNull();
  });

  it("NRS 9 + 발열 + 종아리 → 대표 severe_pain, 걸린 규칙 3개(순서대로)", () => {
    const r = checkRedFlags(input({ painNrs: 9, feverEvent: true, calfPainSwelling: true }));
    expect(r.hospitalSignal?.code).toBe("severe_pain");
    expect(r.trace.firedRules).toEqual(["redflag:severe_pain", "redflag:fever_infection", "redflag:dvt_suspect"]);
  });

  it("발열만 → fever_infection", () => {
    expect(code(input({ feverEvent: true }))).toBe("fever_infection");
  });
});

describe("checkRedFlags — 경계", () => {
  it("오로 게이팅: 9일은 없음, 10일부터 판정", () => {
    expect(code(input({ postpartumDays: 9, lochiaIncreased: true, lochiaRed: true }))).toBeNull();
    expect(code(input({ postpartumDays: 10, lochiaIncreased: true, lochiaRed: true }))).toBe("pph_suspect");
  });

  it("오로는 증가와 붉음이 둘 다여야 한다", () => {
    expect(code(input({ postpartumDays: 30, lochiaIncreased: true }))).toBeNull();
    expect(code(input({ postpartumDays: 30, lochiaRed: true }))).toBeNull();
  });

  it("NRS 3·4·7은 신호 없음, 8·10은 severe_pain", () => {
    expect([3, 4, 7, 8, 10].map((n) => code(input({ painNrs: n })))).toEqual([
      null,
      null,
      null,
      "severe_pain",
      "severe_pain",
    ]);
  });

  it("위험 증상 토글 하나만 켜도 해당 신호", () => {
    expect(code(input({ woundPainWorsening: true }))).toBe("severe_pain");
    expect(code(input({ dizzinessFainting: true }))).toBe("neuro_flag");
    expect(code(input({ chestPainBreathing: true }))).toBe("cardioresp_flag");
    expect(code(input({ calfPainSwelling: true }))).toBe("dvt_suspect");
  });

  it("6개가 다 걸리면 trace는 규칙 순서, 대표는 첫 규칙(전부 immediate)", () => {
    const r = checkRedFlags(
      input({
        postpartumDays: 14,
        lochiaIncreased: true,
        lochiaRed: true,
        painNrs: 10,
        feverEvent: true,
        dizzinessFainting: true,
        chestPainBreathing: true,
        calfPainSwelling: true,
      }),
    );
    expect(r.trace.firedRules).toEqual([
      "redflag:pph_suspect",
      "redflag:severe_pain",
      "redflag:fever_infection",
      "redflag:neuro_flag",
      "redflag:cardioresp_flag",
      "redflag:dvt_suspect",
    ]);
    expect(r.hospitalSignal?.code).toBe("pph_suspect");
  });

  it("결과의 칩을 고쳐도 규칙 테이블은 그대로다", () => {
    checkRedFlags(input({ feverEvent: true })).hospitalSignal!.evidenceChips.push("x");
    expect(checkRedFlags(input({ feverEvent: true })).hospitalSignal!.evidenceChips).toEqual([
      "전신 고열 38°C+",
      "src:임산부수첩 2023",
    ]);
  });
});

describe("rules-1.2 — 다량 출혈·자간전증·자간증 신호·위기 생각(임상 사전 검토 B1~B3, §3 T1~T5·T11)", () => {
  it("다량 출혈은 산후 일수와 상관없이 즉시 내원 — 0일·5일·9일·10일·40일, 출산일 없음(0일로 계산)", () => {
    for (const postpartumDays of [0, 5, 9, 10, 40]) {
      const s = checkRedFlags(input({ postpartumDays, bleedingHeavy: true })).hospitalSignal;
      expect(s?.code, String(postpartumDays)).toBe("heavy_bleeding");
      expect(s?.severity).toBe("immediate");
    }
    expect(checkRedFlags(input({ bleedingHeavy: true })).hospitalSignal!.messagePatient).toBe(
      "피가 많이 나는 것은 즉시 병원 확인이 필요한 신호예요. 어지럽거나 쓰러질 것 같으면 119에 연락하세요.",
    );
  });

  it("다량 출혈 + 어지러움·실신 → 119(대표), 출혈·어지러움 각각의 즉시 내원도 함께 걸린다", () => {
    const r = checkRedFlags(input({ postpartumDays: 3, bleedingHeavy: true, dizzinessFainting: true }));
    expect(r.hospitalSignal).toMatchObject({ code: "heavy_bleeding_dizzy", severity: "emergency" });
    expect(r.signals.map((s) => s.code)).toEqual(["heavy_bleeding_dizzy", "heavy_bleeding", "neuro_flag"]);
    expect(r.hospitalSignal!.messagePatient).toContain("지금 바로 119");
    // 어지러움만이면 지금처럼 즉시 내원
    expect(code(input({ dizzinessFainting: true }))).toBe("neuro_flag");
  });

  it("자간전증 신호 셋은 즉시 내원, 경련은 119", () => {
    expect(checkRedFlags(input({ headacheVision: true })).hospitalSignal).toMatchObject({ code: "headache_vision", severity: "immediate" });
    expect(checkRedFlags(input({ faceHandSwelling: true })).hospitalSignal).toMatchObject({ code: "face_hand_swelling", severity: "immediate" });
    expect(checkRedFlags(input({ upperBellyPain: true })).hospitalSignal).toMatchObject({ code: "upper_belly_pain", severity: "immediate" });
    const seizure = checkRedFlags(input({ seizure: true })).hospitalSignal!;
    expect(seizure).toMatchObject({ code: "seizure", severity: "emergency" });
    expect(seizure.messagePatient).toContain("지금 바로 119");
  });

  it("나·아기를 해칠 것 같은 생각 → 위기 상담(crisis) — 109·1577-0199, 지금 위험하면 119·112", () => {
    const s = checkRedFlags(input({ harmThoughts: true })).hospitalSignal!;
    expect(s).toMatchObject({ code: "harm_thoughts", severity: "crisis" });
    for (const n of ["109", "1577-0199", "119", "112"]) expect(s.messagePatient, n).toContain(n);
    expect(s.messagePatient).toContain("혼자 견디지 마세요");
  });

  it("대표 신호 — 119·위기 상담이 즉시 내원보다 앞, 같은 높이면 평가 순서(119 신호가 앞)", () => {
    expect(code(input({ feverEvent: true, seizure: true }))).toBe("seizure");
    expect(code(input({ feverEvent: true, harmThoughts: true }))).toBe("harm_thoughts");
    expect(code(input({ seizure: true, harmThoughts: true }))).toBe("seizure");
    const all = checkRedFlags(input({ harmThoughts: true, feverEvent: true, seizure: true, headacheVision: true }));
    expect(all.signals.map((s) => s.code)).toEqual(["seizure", "harm_thoughts", "fever_infection", "headache_vision"]);
    expect(all.trace.firedRules).toEqual(["redflag:seizure", "redflag:harm_thoughts", "redflag:fever_infection", "redflag:headache_vision"]);
  });

  it("등급 높낮이와 모르는 code", () => {
    expect(["emergency", "crisis", "immediate", "urgent", "routine"].map(severityRank)).toEqual([3, 3, 2, 1, 0]);
    expect(redFlagSeverity("harm_thoughts")).toBe("crisis");
    expect(redFlagSeverity("no_such_code")).toBeNull();
    expect(redFlagSeverity(null)).toBeNull();
  });

  it("위험 증상 토글마다 그 토글 하나로 걸리는 규칙이 있다 — 빠진 토글이 없다(domain/types RISK_SYMPTOM_KEYS)", () => {
    for (const key of RISK_SYMPTOM_KEYS) expect(code(input({ [key]: true })), key).not.toBeNull();
  });

  it("안내 목록(RED_FLAG_GUIDES)은 입력과 상관없이 모든 규칙을 평가 순서로 — 문구·칩은 content.json 그대로", () => {
    expect(RED_FLAG_GUIDES.map((g) => g.code)).toEqual(RULES_ORDER);
    for (const g of RED_FLAG_GUIDES) {
      const flag = content.red_flags.find((f) => f.code === g.code)!;
      expect(g).toEqual({ code: flag.code, severity: flag.severity, message: flag.message, chips: flag.chips });
    }
  });
});

// 지금 규칙은 전부 immediate라 대표 선택이 순서와 같다. 임상 자문으로 content.json에 urgent가 섞여도
// Swift처럼 "severity 최고 → 동률이면 먼저 걸린 것"을 고르고, severity를 하드코딩하지 않는지 본다(감사 #39).
describe("대표 신호 — severity 우선, 동률은 먼저 걸린 규칙", () => {
  afterEach(() => {
    vi.doUnmock("@/content");
    vi.resetModules();
  });

  async function withSeverities(sev: Record<string, string>) {
    vi.resetModules();
    const real = (await vi.importActual<typeof import("@/content")>("@/content")).default;
    vi.doMock("@/content", () => ({
      default: { ...real, red_flags: real.red_flags.map((r) => ({ ...r, severity: sev[r.code] ?? r.severity })) },
    }));
    return (await import("./redflag")).checkRedFlags;
  }

  it("앞 규칙이 urgent, 뒤 규칙이 immediate면 뒤 규칙이 대표", async () => {
    const check = await withSeverities({ severe_pain: "urgent" });
    const r = check(input({ painNrs: 9, feverEvent: true }));
    expect(r.hospitalSignal?.code).toBe("fever_infection");
    expect(r.hospitalSignal?.severity).toBe("immediate");
    expect(r.trace.firedRules).toEqual(["redflag:severe_pain", "redflag:fever_infection"]);
  });

  it("urgent끼리 동률이면 먼저 걸린 규칙, severity는 urgent 그대로", async () => {
    const check = await withSeverities({ severe_pain: "urgent", fever_infection: "urgent" });
    const r = check(input({ painNrs: 9, feverEvent: true }));
    expect(r.hospitalSignal?.code).toBe("severe_pain");
    expect(r.hospitalSignal?.severity).toBe("urgent");
  });
});

// 임상 회신은 content.json 교체로 반영된다(src/content/index.ts). 교체본이 규칙을 빼거나 순서를 바꿔도
// 검사 대상·순서는 Swift 그대로여야 하고, 짝이 안 맞으면 조용히 넘어가지 않고 로드 때 실패해야 한다.
describe("content.json 교체 방어", () => {
  afterEach(() => {
    vi.doUnmock("@/content");
    vi.resetModules();
  });

  type Flags = (typeof import("@/content"))["default"]["red_flags"];
  async function loadWith(edit: (flags: Flags) => Flags) {
    vi.resetModules();
    const real = (await vi.importActual<typeof import("@/content")>("@/content")).default;
    vi.doMock("@/content", () => ({ default: { ...real, red_flags: edit(real.red_flags) } }));
    return import("./redflag");
  }

  it("규칙이 빠진 content면 로드 때 실패", async () => {
    await expect(loadWith((f) => f.filter((r) => r.code !== "fever_infection"))).rejects.toThrow(/fever_infection/);
  });

  it("조건 없는 규칙이 섞인 content면 로드 때 실패", async () => {
    await expect(loadWith((f) => [...f, { ...f[0], code: "new_rule" }])).rejects.toThrow(/new_rule/);
  });

  it("같은 규칙이 두 번 있으면 로드 때 실패", async () => {
    await expect(loadWith((f) => [...f, f[2]])).rejects.toThrow(/fever_infection/);
  });

  it("모르는 등급이 섞인 content면 로드 때 실패(대표 신호 고르기에서 조용히 밀리지 않게)", async () => {
    await expect(loadWith((f) => f.map((r) => (r.code === "seizure" ? { ...r, severity: "asap" } : r)))).rejects.toThrow(/seizure/);
  });

  it("content 순서가 바뀌어도 평가·trace 순서와 대표 신호는 코드 순서 그대로", async () => {
    const m = await loadWith((f) => [...f].reverse());
    expect(m.RED_FLAG_CODES).toEqual(RULES_ORDER);
    const r = m.checkRedFlags(input({ painNrs: 9, feverEvent: true, calfPainSwelling: true }));
    expect(r.hospitalSignal?.code).toBe("severe_pain");
    expect(r.trace.firedRules).toEqual(["redflag:severe_pain", "redflag:fever_infection", "redflag:dvt_suspect"]);
  });
});

describe("metrics — 홈 회복 지표", () => {
  it("기록이 없으면 빈 배열", () => {
    expect(metrics(null)).toEqual([]);
    expect(metrics(undefined)).toEqual([]);
  });

  it("02 §11: 12일 · 증가만 · NRS 5 → 오로 관찰 · 발열 정상 · 통증 관찰", () => {
    expect(metrics(record({ postpartumDays: 12, lochiaIncreased: true, painNrs: 5 }))).toEqual([
      { name: "오로(분비물)", status: "watch" },
      { name: "발열", status: "normal" },
      { name: "통증 NRS 5/10", status: "watch" },
    ]);
  });

  it("02 §11: 3일 · 증가+붉음 → 오로 항목 없음", () => {
    expect(metrics(record({ postpartumDays: 3, lochiaIncreased: true, lochiaRed: true }))).toEqual([
      { name: "발열", status: "normal" },
      { name: "통증 NRS 0/10", status: "normal" },
    ]);
  });

  it("오로 경계: 9일 항목 없음 · 10일 판정 · 일수 없음(구버전)은 항목을 보이되 판정 보류", () => {
    const lochia = (days: number | null, inc: boolean, red: boolean) =>
      metrics(record({ postpartumDays: days, lochiaIncreased: inc, lochiaRed: red })).find(
        (m) => m.name === "오로(분비물)",
      )?.status ?? null;
    expect(lochia(9, true, true)).toBeNull();
    expect(lochia(10, true, true)).toBe("alert");
    expect(lochia(10, false, true)).toBe("watch");
    expect(lochia(10, true, false)).toBe("watch");
    expect(lochia(10, false, false)).toBe("normal");
    expect(lochia(null, true, true)).toBe("normal"); // 감사 #40: content.json gate 문구와 다르다
  });

  it("통증 경계: 3 정상 · 4 관찰 · 7 관찰 · 8 확인 필요", () => {
    const pain = (n: number) => metrics(record({ painNrs: n })).find((m) => m.name.startsWith("통증"))!;
    expect([0, 3, 4, 7, 8, 10].map((n) => pain(n).status)).toEqual(["normal", "normal", "watch", "watch", "alert", "alert"]);
    expect(pain(7).name).toBe("통증 NRS 7/10");
  });

  it("발열 → 확인 필요", () => {
    expect(metrics(record({ feverEvent: true })).find((m) => m.name === "발열")?.status).toBe("alert");
  });

  it("상태 라벨", () => {
    expect(METRIC_STATUS_LABEL).toEqual({ normal: "정상", watch: "관찰", alert: "확인 필요" });
  });
});
