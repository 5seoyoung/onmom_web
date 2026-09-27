// 레드플래그(즉시 병원 신호)와 홈 회복 지표 — iOS `RedFlagEngine.swift`를 옮긴 것.
// 판정은 전부 아래 규칙 조회 결과다. 문구·근거 칩은 content.json `red_flags`에서 읽고, 여기엔 조건만 둔다.
// 순수 함수만 둔다(React·DOM·시계 없음).

import content from "@/content";
import type { MetricStatus, SymptomRecord } from "@/domain/types";
import { RULES_VERSION } from "./version";

/** 증상 입력 — 필드명은 iOS `SymptomInput`과 같다(02 §1). */
export interface SymptomInput {
  /** 기록 시점의 산후 경과일(10일 게이팅용) */
  postpartumDays: number;
  /** 오로가 어제보다 늘었는가 */
  lochiaIncreased: boolean;
  /** 오로가 붉은색(선홍색)인가 */
  lochiaRed: boolean;
  /** 38°C 이상 전신 고열·오한·몸살 */
  feverEvent: boolean;
  /** 통증 0~10 */
  painNrs: number;
  // 절대 금기 위험 증상(가이드라인 §1) — 판정에만 쓰고 기록에는 저장하지 않는다(iOS와 같음).
  woundPainWorsening: boolean;
  dizzinessFainting: boolean;
  chestPainBreathing: boolean;
  calfPainSwelling: boolean;
}

export interface RedFlag {
  code: string;
  /** "immediate" | "urgent" — content.json 값을 그대로 싣는다 */
  severity: string;
  messagePatient: string;
  /** "src:" 접두 칩이 출처 칩이다. 출처가 확정되지 않은 규칙에는 없다(지어내지 않는다). */
  evidenceChips: string[];
}

export interface RedFlagResult {
  hospitalSignal: RedFlag | null;
  trace: { firedRules: string[]; configVersion: string };
}

// 규칙 집합과 평가 순서는 코드가 정한다(RedFlagEngine.swift:107-143). 순서는 대표 신호 동률 처리와 trace 순서를 바꾸므로
// content.json 교체(임상 회신 반영)로 규칙이 빠지거나 순서가 바뀌면 안 된다.
const RED_FLAG_ORDER = [
  "pph_suspect",
  "severe_pain",
  "fever_infection",
  "neuro_flag",
  "cardioresp_flag",
  "dvt_suspect",
] as const;
type RedFlagCode = (typeof RED_FLAG_ORDER)[number];

// 조건은 코드로, 문구는 content.json으로. 각 규칙이 겨냥하는 상태는 임상 검토용 주석에만 남긴다
// (사용자에게 질병명을 추정해 말하지 않는다 — 의료기기 경계).
const MATCHERS: Record<RedFlagCode, (i: SymptomInput) => boolean> = {
  // 겨냥: 산후출혈·자궁복고부전. 산후 10일 이전의 붉은 오로는 정상이라 판정하지 않는다.
  pph_suspect: (i) => i.postpartumDays >= 10 && i.lochiaIncreased && i.lochiaRed,
  // 겨냥: 상처 감염·혈종 등
  severe_pain: (i) => i.painNrs >= 8 || i.woundPainWorsening,
  // 겨냥: 산욕열·감염
  fever_infection: (i) => i.feverEvent,
  // 겨냥: 빈혈·저혈압·자간전증 등 신경학적 징후
  neuro_flag: (i) => i.dizzinessFainting,
  // 겨냥: 폐색전증·심근병증 등 심폐 징후
  cardioresp_flag: (i) => i.chestPainBreathing,
  // 겨냥: 심부정맥혈전증
  dvt_suspect: (i) => i.calfPainSwelling,
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

function severityRank(s: string): number {
  return s === "immediate" ? 2 : s === "urgent" ? 1 : 0;
}

/**
 * 증상 입력 → 즉시 병원 신호. 걸린 규칙이 없으면 hospitalSignal = null.
 * 대표 신호는 severity가 가장 높은 규칙(immediate > urgent), 같으면 먼저 걸린 규칙(RedFlagEngine.swift:34-35).
 */
export function checkRedFlags(input: SymptomInput): RedFlagResult {
  const fired = RULES.filter((r) => r.matches(input));
  const trace = {
    firedRules: fired.length ? fired.map((r) => `redflag:${r.code}`) : ["redflag:none"],
    configVersion: RULES_VERSION,
  };
  // Swift `max(by:)`와 같게 — 더 높은 것만 교체하므로 동률이면 첫 규칙이 남는다
  let top: RedFlagRule | null = null;
  for (const r of fired) {
    if (!top || severityRank(r.severity) > severityRank(top.severity)) top = r;
  }
  if (!top) return { hospitalSignal: null, trace };
  return {
    hospitalSignal: {
      code: top.code,
      severity: top.severity,
      messagePatient: top.message,
      evidenceChips: [...top.chips],
    },
    trace,
  };
}

// MARK: 홈 회복 지표
//
// 레드플래그까지는 아니어도 "지켜볼 만한" 구간을 홈에서 보여준다. 임계값을 레드플래그와 같은 파일에 두는 이유:
// iOS에서 한때 홈이 자체 임계값을 가져, 산후 10일 이내 붉은 오로를 기록 탭은 "정상", 홈은 "확인 필요"로 말했다.
// 근거: 오로 "10일 이후 선홍색 재발·양 증가"(임산부수첩 2023 p.60), 발열 38°C 이상, 통증 NRS 8 이상 = 즉시 내원 기준.
// NRS 4~7의 "관찰"은 임상 판정이 아니라 중등도 통증을 눈에 띄게 하려는 표시 구간이다.

export interface RecoveryMetric {
  name: string;
  status: MetricStatus;
}

/** 지표 상태 라벨 — 웰니스 앱이라 "이상" 대신 "확인 필요". 원문: Models.swift:59-61 */
export const METRIC_STATUS_LABEL: Record<MetricStatus, string> = {
  normal: "정상",
  watch: "관찰",
  alert: "확인 필요",
};

/**
 * 최근 기록 → 홈 회복 지표. 기록이 없으면 빈 배열(카드 숨김).
 * 오로: 기록 당시 일수가 null(구버전 기록)이면 항목은 보이되 판정 보류(normal), 10일 미만이면 항목 없음,
 * 10일 이상이면 판정(RedFlagEngine.swift:57-78). content.json home_metrics.lochia.gate 문구는 틀렸다(감사 #40).
 */
export function metrics(record: SymptomRecord | null | undefined): RecoveryMetric[] {
  if (!record) return [];
  const days = record.postpartumDays;
  const items: RecoveryMetric[] = [];

  if (days == null || days >= 10) {
    let lochia: MetricStatus = "normal";
    if (days != null && days >= 10) {
      lochia =
        record.lochiaIncreased && record.lochiaRed
          ? "alert"
          : record.lochiaIncreased || record.lochiaRed
            ? "watch"
            : "normal";
    }
    items.push({ name: "오로(분비물)", status: lochia }); // 원문: RedFlagEngine.swift:72
  }
  items.push({ name: "발열", status: record.feverEvent ? "alert" : "normal" }); // 원문: RedFlagEngine.swift:74
  const nrs = record.painNrs;
  items.push({
    name: `통증 NRS ${nrs}/10`, // 원문: RedFlagEngine.swift:75
    status: nrs >= 8 ? "alert" : nrs >= 4 ? "watch" : "normal",
  });
  return items;
}
