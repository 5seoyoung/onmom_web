// 레드플래그(즉시 병원 신호)와 홈 회복 지표 — iOS `RedFlagEngine.swift`를 옮긴 것.
// 판정은 전부 아래 규칙 조회 결과다. 문구·근거 칩은 content.json `red_flags`에서 읽고, 여기엔 조건만 둔다.
// 순수 함수만 둔다(React·DOM·시계 없음).
//
// rules-1.2(임상 사전 검토 §0-2 B1~B3 · §3 T1~T5·T11): 산후 일수와 상관없는 다량 출혈, 자간전증·자간증 신호(심한 두통·시야 이상,
// 얼굴·손 부종, 명치·오른쪽 윗배 통증, 경련), 나·아기를 해칠 것 같은 생각을 더했다. 등급도 둘 더했다 — "emergency"(지금 바로 119)와
// "crisis"(병원 찾기 대신 위기 상담 전화 안내). 출처 칩은 임상 사전 검토 §5에 원문으로 확인한 자료만 쓴다(지어내지 않는다).
// 웹 신규 문구 — CPO 확인 필요 (content.json red_flags의 heavy_bleeding_dizzy·seizure·harm_thoughts·heavy_bleeding·headache_vision·
// face_hand_swelling·upper_belly_pain 문구·칩, neuro_flag·cardioresp_flag·dvt_suspect에 더한 출처 칩)
//
// rules-1.3(2026-11-13, 임상 자체 검토 docs/dev/clinical/CLINICAL_SELF_REVIEW_2026-11.md §2 — 공식 지침 원문 대조, 임상의가 쓴 것이 아님):
// 흉통·호흡곤란·빠른 심장박동을 119로(T10 — AWHONN 911), 10일 이후 오로는 "늘거나 또는 붉으면" 즉시 내원(R-PPH — NICE NG194 1.2.13),
// 발열 토글에 오한을 합침(R-FEVER·T6), 상처 토글에 감염 신호(T8)·종아리 토글에 허벅지·팔(T9)을 넣고, 오로 냄새(T7)·심한 구토(T12)·
// 유방 붉음 하루 넘게(T13)·갑자기 몹시 지침(T15) 신호를 더했다(모두 즉시 내원 — CDC "immediately", NICE "without delay").
// 웹 신규 문구 — CPO 확인 필요 (content.json red_flags의 pph_suspect·severe_pain·fever_infection·neuro_flag·cardioresp_flag·dvt_suspect 문구·칩,
// lochia_odor·severe_vomiting·breast_red_swelling·extreme_tiredness 문구·칩, ui.home.metric_names.fever "발열·오한")

import content from "@/content";
import { compileTemplate } from "@/content/template";
import type { MetricStatus, RiskSymptomKey, SymptomRecord } from "@/domain/types";
import { RULES_VERSION } from "./version";

/**
 * 증상 입력 — 앞 아홉 필드명은 iOS `SymptomInput`과 같다(02 §1). 위험 증상 토글은 domain/types RISK_SYMPTOM_KEYS와 같은 이름이다
 * (extends가 빠진 토글을 컴파일에서 잡는다).
 */
export interface SymptomInput extends Record<RiskSymptomKey, boolean> {
  /** 기록 시점의 산후 경과일(10일 게이팅용) */
  postpartumDays: number;
  /** 오로가 어제보다 늘었는가 */
  lochiaIncreased: boolean;
  /** 오로가 붉은색(선홍색)인가 */
  lochiaRed: boolean;
  /** 체온계로 38.0°C 이상이었거나 몸이 덜덜 떨리는 오한(rules-1.3 — 오한을 합침, 임상 자체 검토 R-FEVER·T6) */
  feverEvent: boolean;
  /** 통증 0~10 */
  painNrs: number;
  // 위험 증상 토글 — 판정에 쓰고, rules-1.2부터 기록에도 남긴다(rules/record buildSymptomRecord).
  /** 수술·회음부 상처가 점점 더 아프거나 붉게 붓거나 고름·냄새 나는 진물·벌어짐(rules-1.3에서 감염 신호까지 넓힘 — T8) */
  woundPainWorsening: boolean;
  dizzinessFainting: boolean;
  /** 흉통·숨참·가만히 있어도 빠른 심장박동(rules-1.3에서 넓히고 119로 — T10) */
  chestPainBreathing: boolean;
  /** 한쪽 다리(종아리·허벅지)나 팔의 붓기·통증·붉음·열감(rules-1.3에서 허벅지·팔까지 — T9. 칸 이름은 그대로) */
  calfPainSwelling: boolean;
  /** 피가 많이 남(1시간 안에 패드 1장 이상이 흠뻑 젖거나 달걀만 한 핏덩이) — 산후 일수와 상관없이 묻는다(§3 T1) */
  bleedingHeavy: boolean;
  /** 심한 두통(약을 먹어도 낫지 않음) 또는 시야 이상(§3 T2) */
  headacheVision: boolean;
  /** 얼굴·손이 갑자기 심하게 부음(§3 T3) */
  faceHandSwelling: boolean;
  /** 명치·오른쪽 윗배가 심하게 아픔(§3 T4) */
  upperBellyPain: boolean;
  /** 경련(발작)(§3 T5) */
  seizure: boolean;
  /** 나 자신이나 아기를 해칠 것 같은 생각(§3 T11) */
  harmThoughts: boolean;
  /** 오로(분비물)의 심한 냄새(rules-1.3 — 임상 자체 검토 T7) */
  lochiaOdor: boolean;
  /** 계속 토해서 물도 넘기지 못함(rules-1.3 — T12) */
  severeVomiting: boolean;
  /** 유방이 붉게 붓고 아픈 것이 하루 넘게 이어짐(rules-1.3 — T13) */
  breastRedSwollen: boolean;
  /** 갑자기 몹시 지치고 힘이 없음(rules-1.3 — T15) */
  extremeTiredness: boolean;
}

export interface RedFlag {
  code: string;
  /** "emergency" | "crisis" | "immediate" | "urgent" — content.json 값을 그대로 싣는다(표시는 rules/recovery severityLabel) */
  severity: string;
  messagePatient: string;
  /** "src:" 접두 칩이 출처 칩이다. 출처가 확정되지 않은 규칙에는 없다(지어내지 않는다). */
  evidenceChips: string[];
}

export interface RedFlagResult {
  /** 대표 신호 — signals의 첫 항목(없으면 null). 기록의 redFlagCode가 이 값이다. */
  hospitalSignal: RedFlag | null;
  /** 걸린 신호 전부 — 등급이 높은 순, 같으면 평가 순서(RED_FLAG_ORDER). 기록 결과 화면이 이 목록으로 안내 카드를 그린다. */
  signals: RedFlag[];
  trace: { firedRules: string[]; configVersion: string };
}

// 판정 기준값 — 레드플래그와 홈 회복 지표(아래 metrics)가 같은 값을 쓴다. 바꾸면 RULES_VERSION을 함께 올린다
// (src/rules/version.test.ts가 판마다 기록해 둔 값과 비교한다). 근거는 아래 "홈 회복 지표" 머리말.

/** 오로를 묻고 판정하는 산후 경과일 — 이 날부터(RedFlagEngine.swift:57-78, RecordFlowView.swift:167). 그 전의 붉은 오로는 정상이다. */
export const LOCHIA_GATE_DAYS = 10;
/** 통증 NRS 이 값 이상 = 즉시 병원 신호(severe_pain)이자 홈 지표 "확인 필요" */
export const SEVERE_PAIN_NRS = 8;
/** 통증 NRS 이 값 이상(SEVERE_PAIN_NRS 미만) = 홈 지표 "관찰" — 임상 판정이 아니라 표시 구간 */
export const PAIN_WATCH_NRS = 4;

// 규칙 집합과 평가 순서는 코드가 정한다(RedFlagEngine.swift:107-143). 순서는 대표 신호 동률 처리와 trace 순서를 바꾸므로
// content.json 교체(임상 회신 반영)로 규칙이 빠지거나 순서가 바뀌면 안 된다.
// rules-1.2: 등급이 높은 규칙을 앞에 둔다(119 → 위기 상담 → 즉시 내원). rules-1.1의 여섯 규칙은 서로의 순서를 그대로 둔다.
// 다량 출혈은 오로 규칙보다 앞 — 둘 다 걸리면 양 기준과 119 안내가 있는 쪽이 대표 신호다.
// rules-1.3: cardioresp_flag가 119 등급이 되어 119 묶음(seizure 뒤)으로 올렸다. 오로 냄새는 오로 규칙 바로 뒤, 새 신호 셋은 맨 뒤.
const RED_FLAG_ORDER = [
  "heavy_bleeding_dizzy",
  "seizure",
  "cardioresp_flag",
  "harm_thoughts",
  "heavy_bleeding",
  "pph_suspect",
  "lochia_odor",
  "severe_pain",
  "fever_infection",
  "neuro_flag",
  "dvt_suspect",
  "headache_vision",
  "face_hand_swelling",
  "upper_belly_pain",
  "severe_vomiting",
  "breast_red_swelling",
  "extreme_tiredness",
] as const;
type RedFlagCode = (typeof RED_FLAG_ORDER)[number];

// 조건은 코드로, 문구는 content.json으로. 각 규칙이 겨냥하는 상태는 임상 검토용 주석에만 남긴다
// (사용자에게 질병명을 추정해 말하지 않는다 — 의료기기 경계). 코드 이름도 질병명이 아니라 증상으로 짓는다(내려받기 파일에 실린다).
const MATCHERS: Record<RedFlagCode, (i: SymptomInput) => boolean> = {
  // 겨냥: 산후출혈 + 순환 저하. 다량 출혈에 어지러움·실신이 함께면 119(§3 T1·T14 — 등급은 임상 사전 검토의 보수적 제안)
  heavy_bleeding_dizzy: (i) => i.bleedingHeavy && i.dizzinessFainting,
  // 겨냥: 산후 자간증 등. 경련은 119(§3 T5, AWHONN 911)
  seizure: (i) => i.seizure,
  // 겨냥: 산후 우울증·산후 정신병의 자해·영아 위해 위험(§3 T11, AWHONN 911) — 병원 찾기 대신 위기 상담 안내
  harm_thoughts: (i) => i.harmThoughts,
  // 겨냥: 1차·2차 산후출혈 — 산후 일수와 상관없이(§3 T1. 10일 게이트는 오로 색 질문에만 둔다)
  heavy_bleeding: (i) => i.bleedingHeavy,
  // 겨냥: 산후출혈·자궁복고부전. 산후 10일 이전의 붉은 오로는 흔해서 판정하지 않는다(양이 많으면 heavy_bleeding이 날짜와 상관없이 본다).
  // rules-1.3: 둘 다가 아니라 하나만이어도(늘거나 또는 붉음) — NICE NG194 1.2.13 "the bleeding increases", 1.2.4 "persistent or increased"
  pph_suspect: (i) => i.postpartumDays >= LOCHIA_GATE_DAYS && (i.lochiaIncreased || i.lochiaRed),
  // 겨냥: 자궁내막염 등 감염(rules-1.3 T7 — CDC "discharge that smells bad")
  lochia_odor: (i) => i.lochiaOdor,
  // 겨냥: 상처 감염·혈종 등(rules-1.3에서 상처 토글이 감염 신호까지 — T8)
  severe_pain: (i) => i.painNrs >= SEVERE_PAIN_NRS || i.woundPainWorsening,
  // 겨냥: 산욕열·감염·패혈증(rules-1.3에서 오한까지 — T6)
  fever_infection: (i) => i.feverEvent,
  // 겨냥: 빈혈·저혈압·자간전증 등 신경학적 징후
  neuro_flag: (i) => i.dizzinessFainting,
  // 겨냥: 폐색전증·심근병증 등 심폐 징후 — rules-1.3에서 119(T10, AWHONN 911)
  cardioresp_flag: (i) => i.chestPainBreathing,
  // 겨냥: 심부정맥혈전증(rules-1.3에서 허벅지·팔까지 — T9)
  dvt_suspect: (i) => i.calfPainSwelling,
  // 겨냥: 산후 자간전증(§3 T2)
  headache_vision: (i) => i.headacheVision,
  // 겨냥: 산후 자간전증(§3 T3 — 이것만 있을 때 당일 진료로 둘지는 임상 결정이라 보수적으로 즉시 내원)
  face_hand_swelling: (i) => i.faceHandSwelling,
  // 겨냥: 산후 자간전증·HELLP(§3 T4)
  upper_belly_pain: (i) => i.upperBellyPain,
  // 겨냥: 탈수·감염 등(rules-1.3 T12 — CDC "Severe nausea and throwing up")
  severe_vomiting: (i) => i.severeVomiting,
  // 겨냥: 유선염·유방 농양(rules-1.3 T13 — NICE NG194 1.2.4 "more than 24 hours despite self-management")
  breast_red_swelling: (i) => i.breastRedSwollen,
  // 겨냥: 산후 심근병증·빈혈·감염 등(rules-1.3 T15 — CDC "Overwhelming tiredness")
  extreme_tiredness: (i) => i.extremeTiredness,
};

interface RedFlagRule {
  code: RedFlagCode;
  severity: string;
  message: string;
  chips: string[];
  matches: (i: SymptomInput) => boolean;
}

function isRedFlagCode(code: string): code is RedFlagCode {
  return (RED_FLAG_ORDER as readonly string[]).includes(code);
}

// 규칙과 문구는 양방향으로 짝이 맞아야 한다. 어긋나면 조용히 건너뛰지 않고 모듈 로드(정적 빌드) 때 실패시킨다
// — 문구가 빠진 규칙은 그 레드플래그를 검사하지 않게 되고, 조건 없는 문구는 판정되지 않는다.
const seenCodes = new Set<string>();
for (const r of content.red_flags) {
  if (!isRedFlagCode(r.code)) {
    throw new Error(`레드플래그 규칙 '${r.code}'에 조건이 없습니다 (src/rules/redflag.ts MATCHERS)`);
  }
  if (seenCodes.has(r.code)) throw new Error(`레드플래그 규칙 '${r.code}'이 content.json red_flags에 중복돼 있습니다`);
  // 모르는 등급은 대표 신호 고르기에서 맨 뒤로 밀리고 화면에 등급 이름도 없다 — 조용히 넘기지 않는다
  if (severityRank(r.severity) === 0) throw new Error(`레드플래그 규칙 '${r.code}'의 등급 '${r.severity}'을 모릅니다 (src/rules/redflag.ts severityRank)`);
  seenCodes.add(r.code);
}
const RULES: RedFlagRule[] = RED_FLAG_ORDER.map((code) => {
  const r = content.red_flags.find((x) => x.code === code);
  if (!r) throw new Error(`레드플래그 규칙 '${code}'의 문구가 content.json red_flags에 없습니다`);
  return { code, severity: r.severity, message: r.message, chips: r.chips, matches: MATCHERS[code] };
});

/** 평가 순서의 code 목록(Swift 순서) — 테스트·감사용 */
export const RED_FLAG_CODES: readonly string[] = RULES.map((r) => r.code);
/** 조건이 정의된 code 목록 — 테스트·감사용 */
export const RED_FLAG_MATCHER_CODES: readonly string[] = Object.keys(MATCHERS);

/**
 * 안내 등급의 높낮이 — emergency(지금 바로 119)·crisis(위기 상담 전화) > immediate(즉시 내원) > urgent(당일 진료). 모르는 등급은 0.
 * crisis는 emergency와 같은 높이다(AWHONN은 자해 생각을 911로 둔다) — 같으면 평가 순서(emergency 규칙이 앞)를 따른다.
 */
export function severityRank(s: string): number {
  switch (s) {
    case "emergency":
    case "crisis":
      return 3;
    case "immediate":
      return 2;
    case "urgent":
      return 1;
    default:
      return 0;
  }
}

/**
 * 증상 입력 → 즉시 병원 신호. 걸린 규칙이 없으면 hospitalSignal = null, signals = [].
 * 대표 신호는 severity가 가장 높은 규칙, 같으면 먼저 걸린 규칙(RedFlagEngine.swift:34-35 — Swift `max(by:)`와 같은 결과).
 * signals는 걸린 규칙 전부를 같은 기준(등급 높은 순, 같으면 평가 순서)으로 늘어놓은 것이다 — 첫 항목이 대표 신호.
 */
export function checkRedFlags(input: SymptomInput): RedFlagResult {
  const fired = RULES.filter((r) => r.matches(input));
  const trace = {
    firedRules: fired.length ? fired.map((r) => `redflag:${r.code}`) : ["redflag:none"],
    configVersion: RULES_VERSION,
  };
  // 안정 정렬 — 같은 등급이면 평가 순서 그대로(동률이면 첫 규칙이 대표 신호로 남는다)
  const signals: RedFlag[] = [...fired]
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
    .map((r) => ({ code: r.code, severity: r.severity, messagePatient: r.message, evidenceChips: [...r.chips] }));
  return { hospitalSignal: signals[0] ?? null, signals, trace };
}

/** 규칙 code의 등급(content.json red_flags) — 모르는 code(옛 판·다른 기기의 기록)는 null */
export function redFlagSeverity(code: string | null | undefined): string | null {
  if (code == null) return null;
  return RULES.find((r) => r.code === code)?.severity ?? null;
}

/** 규칙 하나의 안내 — 등급·문구·칩(content.json red_flags 그대로) */
export interface RedFlagGuide {
  code: string;
  severity: string;
  message: string;
  chips: readonly string[];
}

/**
 * 모든 규칙의 안내(평가 순서). 입력과 상관없는 일반 안내다(개인 판정이 아님) — 기록 결과 화면이 결과와 상관없이 늘 보이는
 * "바로 병원에 가야 하는 신호" 목록을 여기서 만든다(features/record warningSignGroups).
 */
export const RED_FLAG_GUIDES: readonly RedFlagGuide[] = RULES.map((r) => ({
  code: r.code,
  severity: r.severity,
  message: r.message,
  chips: [...r.chips],
}));

// MARK: 홈 회복 지표
//
// 레드플래그까지는 아니어도 "지켜볼 만한" 구간을 홈에서 보여준다. 임계값을 레드플래그와 같은 파일에 두는 이유:
// iOS에서 한때 홈이 자체 임계값을 가져, 산후 10일 이내 붉은 오로를 기록 탭과 홈이 서로 다르게 말했다.
// 근거: 오로 "10일 이후 선홍색 재발·양 증가"(임산부수첩 2023 p.60), 발열 38°C 이상, 통증 NRS 8 이상 = 즉시 내원 기준.
// NRS 4~7의 "살펴볼 신호"는 임상 판정이 아니라 중등도 통증을 눈에 띄게 하려는 표시 구간이다.
// rules-1.3: 오로는 늘거나 또는 붉으면 레드플래그(pph_suspect)와 같이 "병원 확인 신호" — "살펴볼 신호" 구간이 없어졌다(둘이 서로 다른 말을 하지 않게).

export interface RecoveryMetric {
  name: string;
  status: MetricStatus;
}

/**
 * 기록의 표시 라벨 — 건강 상태를 평가하지 않고, 기록한 값이 어떤 안내에 해당하는지만 말한다(의료기기 경계 — 법률 사전 검토 H5·4-3,
 * 임상 사전 검토 질문 16). iOS 원문 "정상/관찰/확인 필요"(Models.swift:59-61)를 바꿨다. 홈 회복 지표 배지·기록 카드·최근 기록·PDF 리포트가
 * 모두 이 세 글자를 쓴다. "기록 없음"은 쓰지 않는다 — 기록은 있고, 그 값이 목록에 해당하지 않을 뿐이다.
 */
export const METRIC_STATUS_LABEL = {
  // 웹 신규 문구 — CPO 확인 필요
  normal: "해당 없음",
  // 웹 신규 문구 — CPO 확인 필요
  watch: "살펴볼 신호",
  // 웹 신규 문구 — CPO 확인 필요
  alert: "병원 확인 신호",
} as const satisfies Record<MetricStatus, string>;

// 지표 이름 — Swift 원문을 content.json ui.home.metric_names로 옮겼다(DEV_NOTES §3 content.json 수정 요청). 원문 위치는 쓰는 줄에 둔다.
const METRIC_NAMES = content.ui.home.metric_names;
const PAIN_METRIC_NAME = compileTemplate("ui.home.metric_names.pain_nrs", METRIC_NAMES.pain_nrs, ["nrs"]);

/**
 * 최근 기록 → 홈 회복 지표. 기록이 없으면 빈 배열(카드 숨김).
 * 오로: 기록 당시 일수가 null(구버전 기록)이면 항목은 보이되 판정 보류(normal), 10일 미만이면 항목 없음,
 * 10일 이상이면 판정(RedFlagEngine.swift:57-78). content.json home_metrics.lochia.gate 설명 글도 이 세 갈래다(감사 #40 — 2026-11-08 고침, version.test.ts가 대조).
 */
export function metrics(record: SymptomRecord | null | undefined): RecoveryMetric[] {
  if (!record) return [];
  const days = record.postpartumDays;
  const items: RecoveryMetric[] = [];

  if (days == null || days >= LOCHIA_GATE_DAYS) {
    let lochia: MetricStatus = "normal";
    if (days != null && days >= LOCHIA_GATE_DAYS) {
      // rules-1.3: 레드플래그(pph_suspect)와 같은 조건 — 하나만이어도 병원 확인 신호
      lochia = record.lochiaIncreased || record.lochiaRed ? "alert" : "normal";
    }
    items.push({ name: METRIC_NAMES.lochia, status: lochia }); // 원문: RedFlagEngine.swift:72
  }
  items.push({ name: METRIC_NAMES.fever, status: record.feverEvent ? "alert" : "normal" }); // 원문: RedFlagEngine.swift:74
  const nrs = record.painNrs;
  items.push({
    name: PAIN_METRIC_NAME({ nrs }), // 원문: RedFlagEngine.swift:75
    status: nrs >= SEVERE_PAIN_NRS ? "alert" : nrs >= PAIN_WATCH_NRS ? "watch" : "normal",
  });
  return items;
}
