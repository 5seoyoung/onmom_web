// 기록 탭(이상 증상 빠른 기록)의 화면 규칙 — iOS RecordFlowView.swift를 옮긴 것.
// "무엇을 어떤 조건에서 보여주나"만 순수 함수로 둔다. 판정은 rules/record·rules/redflag, 기분 문항은 rules/mood가 한다.

import { formatMonthDayTime, postpartumDayCount } from "@/domain/date";
import type { MoodAnswer, MoodCheckRecord, RiskSymptomKey, SymptomRecord, UserProfile } from "@/domain/types";
import { STORAGE_REGION } from "@/features/privacy/dataItems";
import { DELIVERY_TITLE } from "@/rules/exercise";
import { MOOD_ANSWERS, moodAnswerLabel, questionForDay, todayMoodCheck, type MoodQuestion } from "@/rules/mood";
import { buildSymptomRecord, showsLochiaInputs, type SymptomForm } from "@/rules/record";
import { severityRank, type RedFlag, type RedFlagResult } from "@/rules/redflag";
import type { NewSymptomRecord } from "@/store/appStore";

export type { RiskSymptomKey } from "@/domain/types";

/** 화면 문구 — Swift 원문 그대로(원칙 5). 웹에서 더하거나 바꾼 문구는 아래 RECORD_WEB_TEXT에 둔다(recordView.test가 이 표를 Swift와 대조한다). */
export const RECORD_TEXT = {
  title: "이상 증상 빠른 기록", // 원문: RecordFlowView.swift:150
  deliveryFallback: "분만", // 원문: RecordFlowView.swift:153
  lochiaTitle: "오로(분비물)", // 원문: RecordFlowView.swift:166
  lochiaIncreased: "어제보다 양이 늘었나요?", // 원문: RecordFlowView.swift:169
  lochiaRed: "색이 붉은색(선홍색)인가요?", // 원문: RecordFlowView.swift:175
  feverTitle: "발열 (38.0℃ 이상)", // 원문: RecordFlowView.swift:191
  feverDescription: "최근 발열이 있었나요?", // 원문: RecordFlowView.swift:194
  painTitle: "통증 정도 (NRS)", // 원문: RecordFlowView.swift:205
  riskTitle: "위험 증상 (있으면 즉시 내원)", // 원문: RecordFlowView.swift:218
  woundPain: "수술부위·회음부 통증 급격 악화", // 원문: RecordFlowView.swift:219
  dizziness: "어지러움·실신·균형장애", // 원문: RecordFlowView.swift:221
  chestBreath: "흉통·가슴 압박·호흡곤란", // 원문: RecordFlowView.swift:223
  calfSwelling: "한쪽 종아리 통증·부종", // 원문: RecordFlowView.swift:225
  neighborhoodTitle: "내 동네 (연계 안내용)", // 원문: RecordFlowView.swift:231
  neighborhoodPlaceholder: "예: 서울 강남구 역삼동", // 원문: RecordFlowView.swift:232
  neighborhoodHelp: "위험 신호가 있으면 이 동네 기준으로 가까운 산부인과를 안내해요.", // 원문: RecordFlowView.swift:239
  submit: "확인하기", // 원문: RecordFlowView.swift:44
  retry: "다시 입력", // 원문: RecordFlowView.swift:41
  moodTitle: "오늘의 한 가지 질문", // 원문: RecordFlowView.swift:65
  // 설정 없는 빌드(브라우저 전용)만 iOS 원문 그대로 — 서버 저장 빌드는 moodNoteFor가 바꾼다
  moodNote: "매일 한 가지씩 물어요. 답은 이 기기에만 남고, 진단이 아니에요.", // 원문: RecordFlowView.swift:98
  recentTitle: "최근 기록", // 원문: RecordFlowView.swift:110
  recentNormal: "위험신호 없음", // 원문: RecordFlowView.swift:119
  recentFlagged: "병원 신호", // 원문: RecordFlowView.swift:119
} as const;

/**
 * 서버 저장 빌드(Supabase 설정 있음)의 기분 각주. iOS "이 기기에만 남고"는 답이 동의 뒤 서버(서울)에 올라가는 빌드에서 사실이 아니다
 * (03 §8 각주 "웹은 저장 위치에 맞게 수정"). 기록장 배너(journalView localOnlyNoticeFor)·설정 개인정보 문구와 같은 사실을 말한다.
 * "서버에만"이라고 하지 않는다 — 답은 이 브라우저에도 남는다(동기화 캐시).
 */
export const RECORD_SERVER_TEXT = {
  // 웹 신규 문구 — CPO 확인 필요
  moodNote: `매일 한 가지씩 물어요. 답은 동의를 받은 뒤 온맘 서버(${STORAGE_REGION})에 저장되고, 진단이 아니에요.`,
} as const;

/** 오늘의 한 가지 질문 각주 — 서버 저장 빌드면 서버 안내, 아니면 iOS 원문("이 기기"). */
export function moodNoteFor(serverStorage: boolean): string {
  return serverStorage ? RECORD_SERVER_TEXT.moodNote : RECORD_TEXT.moodNote;
}

/**
 * 웹에서 더하거나 바꾼 기록 탭 문구(iOS에 없음) — 임상 사전 검토 §0-2 B1~B3(rules-1.2 위험 증상)·법률 사전 검토 H5(결과 문구).
 * RECORD_TEXT(Swift 원문)와 섞지 않는다.
 */
export const RECORD_WEB_TEXT = {
  // 웹 신규 문구 — CPO 확인 필요 (산후 10일 전 오로 카드의 안내. iOS 원문 "…붉은 오로가 정상이에요…"를 바꿈 — '정상'이라고 말하지 않고,
  // 날짜와 상관없이 묻는 다량 출혈 토글을 가리킨다. 임상 사전 검토 L-GATE·B1)
  lochiaEarly:
    "산후 10일 이내에는 붉은 오로가 흔해요. 오로가 늘거나 다시 붉어지는지는 10일이 지난 뒤부터 물어요. 다만 피가 많이 나면 날짜와 상관없이 아래 위험 증상에서 체크하세요.",
  // 웹 신규 문구 — CPO 확인 필요 (위험 증상 토글과 설명 — 임상 사전 검토 §3-2 T1: 산후 일수와 상관없이 늘 보인다)
  bleedingHeavy: "피가 많이 나요",
  bleedingHeavyHint: "1시간 안에 패드 1장 이상이 흠뻑 젖거나, 달걀만 한 핏덩이가 나와요",
  // 웹 신규 문구 — CPO 확인 필요 (위험 증상 토글과 설명 — §3-2 T2)
  headacheVision: "두통이 심하거나 눈이 잘 안 보여요",
  headacheVisionHint: "약을 먹어도 두통이 낫지 않거나, 눈앞이 흐리거나 번쩍거려요",
  // 웹 신규 문구 — CPO 확인 필요 (위험 증상 토글 — §3-2 T3)
  faceHandSwelling: "얼굴이나 손이 갑자기 심하게 부었어요",
  // 웹 신규 문구 — CPO 확인 필요 (위험 증상 토글 — §3-2 T4)
  upperBellyPain: "명치나 오른쪽 윗배가 심하게 아파요",
  // 웹 신규 문구 — CPO 확인 필요 (위험 증상 토글 — §3-2 T5)
  seizure: "경련(발작)을 했어요",
  // 웹 신규 문구 — CPO 확인 필요 (위험 증상 토글과 설명 — §3-2 T11. 탓하지 않고, 켜면 무엇을 보여 주는지만 말한다)
  harmThoughts: "나 자신이나 아기를 해칠 것 같은 생각이 들어요",
  harmThoughtsHint: "체크하면 바로 연락할 수 있는 상담 전화를 알려 드려요",
  // 웹 신규 문구 — CPO 확인 필요 (119 등급 결과 카드 안의 전화 버튼)
  call119: "119에 전화 걸기",
} as const;

/**
 * 위기 상담 카드(harm_thoughts)의 전화 — 병원 찾기 대신 바로 걸 수 있는 곳(임상 사전 검토 §3-2 T11).
 * 자살예방상담전화 109(2024-01 통합·24시간, 임상 사전 검토 K3), 정신건강위기상담전화 1577-0199(K4), 지금 위험하면 119(구급)·112(경찰).
 * 번호는 domain/phone telHref로 tel: 링크가 된다.
 */
export const CRISIS_CALLS: readonly { name: string; number: string }[] = [
  // 웹 신규 문구 — CPO 확인 필요 (위기 상담 카드의 전화 이름 넷)
  { name: "자살예방상담전화 (24시간)", number: "109" },
  { name: "정신건강위기상담전화", number: "1577-0199" },
  { name: "지금 위험할 때 (구급)", number: "119" },
  { name: "지금 위험할 때 (경찰)", number: "112" },
];

/** 위험 증상 토글 한 줄 — key는 SymptomInput·기록 필드 이름(domain/types RISK_SYMPTOM_KEYS) */
export interface RiskToggle {
  key: RiskSymptomKey;
  label: string;
  /** 라벨 아래 설명(기준을 구체적으로) — 스위치의 aria-describedby */
  description?: string;
}

/**
 * 위험 증상 토글 — 화면 순서. iOS의 넷(RecordFlowView.swift:219-225)은 그 순서 그대로 두고, rules-1.2에 더한 여섯을 앞뒤에 둔다:
 * 다량 출혈은 맨 앞(산후 일수와 상관없이 가장 먼저 물을 것 — 임상 사전 검토 순위 1), 자간전증·자간증 신호와 위기 생각은 뒤.
 */
export const RISK_TOGGLES: readonly RiskToggle[] = [
  { key: "bleedingHeavy", label: RECORD_WEB_TEXT.bleedingHeavy, description: RECORD_WEB_TEXT.bleedingHeavyHint },
  { key: "woundPainWorsening", label: RECORD_TEXT.woundPain },
  { key: "dizzinessFainting", label: RECORD_TEXT.dizziness },
  { key: "chestPainBreathing", label: RECORD_TEXT.chestBreath },
  { key: "calfPainSwelling", label: RECORD_TEXT.calfSwelling },
  { key: "headacheVision", label: RECORD_WEB_TEXT.headacheVision, description: RECORD_WEB_TEXT.headacheVisionHint },
  { key: "faceHandSwelling", label: RECORD_WEB_TEXT.faceHandSwelling },
  { key: "upperBellyPain", label: RECORD_WEB_TEXT.upperBellyPain },
  { key: "seizure", label: RECORD_WEB_TEXT.seizure },
  { key: "harmThoughts", label: RECORD_WEB_TEXT.harmThoughts, description: RECORD_WEB_TEXT.harmThoughtsHint },
];

/**
 * 기록에 남기는 위험 증상 토글(04 §1 "웹에서는 저장을 권장", 검수 #46, DEV_NOTES §3 CPO 3, 임상 사전 검토 R-STORE).
 * 필드는 domain/types SymptomRecord에 있다(RiskSymptomFlags) — 칸이 없는 옛 기록(rules-1.2 전·iOS)은 묻지 않은 것으로 본다.
 */
export type RiskSymptomFlags = Record<RiskSymptomKey, boolean | null>;

/** 기록 + 위험 증상 토글 — domain/types SymptomRecord가 이미 그 칸을 가진다(옛 이름을 남겨 둔다) */
export type SymptomRecordWithRisk = SymptomRecord;

/** 폼의 위험 증상 토글만 */
export function riskFlagsFromForm(form: SymptomForm): Record<RiskSymptomKey, boolean> {
  return {
    woundPainWorsening: form.woundPainWorsening,
    dizzinessFainting: form.dizzinessFainting,
    chestPainBreathing: form.chestPainBreathing,
    calfPainSwelling: form.calfPainSwelling,
    bleedingHeavy: form.bleedingHeavy,
    headacheVision: form.headacheVision,
    faceHandSwelling: form.faceHandSwelling,
    upperBellyPain: form.upperBellyPain,
    seizure: form.seizure,
    harmThoughts: form.harmThoughts,
  };
}

/**
 * 기록에서 켜져 있던 위험 증상의 라벨(화면 순서). 필드가 없거나 null이면(옛 기록) 빈 배열 —
 * "없었다"고 지어내지 않고 줄을 그리지 않는다. omit의 칸은 빼고 본다(PDF 리포트가 따로 칸을 둔 다량 출혈).
 */
export function firedRiskLabels(record: SymptomRecordWithRisk, omit: readonly RiskSymptomKey[] = []): string[] {
  return RISK_TOGGLES.filter(({ key }) => record[key] === true && !omit.includes(key)).map(({ label }) => label);
}

/** 폼 초기값 — 전부 꺼짐, 통증 0(RecordFlowView.swift:14-25: 손대지 않으면 "통증 없음"으로 기록). */
export const INITIAL_SYMPTOM_FORM: Readonly<SymptomForm> = Object.freeze({
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
});

/**
 * 머리 부제 "산후 n일차 · {분만}" (RecordFlowView.swift:153).
 * iOS는 출산일이 늘 있었다. 웹은 출산일이 없으면(온보딩 전) 일차를 지어내지 않고 분만 방식만, 그것도 없으면 부제를 뺀다.
 */
export function recordSubtitle(profile: Pick<UserProfile, "deliveryDate" | "deliveryMethod">, now: Date): string | null {
  const delivery = profile.deliveryMethod ? DELIVERY_TITLE[profile.deliveryMethod] : null;
  if (profile.deliveryDate === null) return delivery;
  const day = postpartumDayCount(profile.deliveryDate, now);
  return `산후 ${day}일차 · ${delivery ?? RECORD_TEXT.deliveryFallback}`;
}

/** 오로 질문을 보일지 — 산후 10일부터(RecordFlowView.swift:167). 판정·저장과 같은 규칙 함수를 쓴다. */
export function recordShowsLochia(deliveryDate: string | null, now: Date): boolean {
  return showsLochiaInputs(postpartumDayCount(deliveryDate, now));
}

/**
 * [확인하기] — 판정 + 저장할 기록(RecordFlowView.swift:304-327).
 * 기록은 결과와 무관하게 저장한다. id·date는 스토어가 붙이지만 date는 판정 시각을 그대로 넘긴다(DEV_NOTES §4).
 */
export function submitSymptomCheck(
  form: SymptomForm,
  deliveryDate: string | null,
  now: Date,
): { newRecord: NewSymptomRecord & Record<RiskSymptomKey, boolean>; result: RedFlagResult } {
  // id는 스토어가 새로 붙인다(DEV_NOTES §4).
  const { record, result } = buildSymptomRecord(form, deliveryDate, now);
  const newRecord: NewSymptomRecord & Record<RiskSymptomKey, boolean> = {
    date: record.date,
    lochiaIncreased: record.lochiaIncreased,
    lochiaRed: record.lochiaRed,
    feverEvent: record.feverEvent,
    painNrs: record.painNrs,
    redFlagCode: record.redFlagCode,
    postpartumDays: record.postpartumDays,
    // 결과를 낸 규칙의 버전 — rules/record buildSymptomRecord가 찍은 값 그대로(여기서 다시 정하지 않는다)
    rulesVersion: record.rulesVersion,
    // 위험 증상 토글 — 판정에 쓴 값 그대로 기록에 남긴다(rules-1.2 — buildSymptomRecord의 record에 든 값과 같은 폼 값)
    ...riskFlagsFromForm(form),
  };
  return { newRecord, result };
}

/**
 * 화면 배치(RecordFlowView.swift:35-49).
 * - 입력 단계: 폼 → [확인하기] → 오늘의 한 가지 질문 → 최근 기록(기록이 있을 때만) → 면책
 * - 결과 단계: 안내 카드(resultCards) + 병원 신호가 있으면 가까운 산부인과, 걸린 신호가 없으면 "해당 없음" 안내 카드 → [다시 입력] → 면책
 *   (결과 단계에서 폰은 폼·질문·최근 기록을 숨긴다 — PC 두 열에서는 폼 옆에 결과가 오고 나머지도 남는다. recordColumns)
 * iOS는 대표 신호 하나만 카드로 보였다. 웹(rules-1.2)은 위기 상담 카드와 병원 신호 카드를 함께 보일 수 있다(resultCards).
 */
export type RecordLayout =
  | { phase: "form"; showsRecent: boolean }
  | {
      phase: "result";
      /** 결과 안내 카드로 그릴 신호(등급 높은 순) — 비었으면 "해당 없음" 안내 카드 */
      cards: readonly RedFlag[];
      /** 가까운 산부인과 — 병원 신호(위기 상담이 아닌 것)가 하나라도 있을 때만 */
      showsClinics: boolean;
      showsRecent: boolean;
    };

/**
 * 결과 화면에 카드로 그릴 신호 — 걸린 신호(등급 높은 순, rules/redflag signals) 가운데
 *  · 위기 상담(crisis) 신호는 늘: 다른 신호가 있어도 상담 전화 안내를 빠뜨리지 않는다(임상 사전 검토 §3-2 T11)
 *  · 병원 신호는 가장 높은 등급의 것만: 119 신호가 있으면 "즉시 내원" 카드는 겹쳐 보이지 않는다(서로 다른 행동을 권하지 않게).
 *    같은 등급이면 모두 — 대표 신호 하나만 보이던 iOS와 달리 함께 걸린 신호의 안내(예: 흉통의 "심하면 119")를 놓치지 않는다.
 * 순서는 걸린 신호의 순서 그대로다(등급 높은 순, 같으면 평가 순서).
 */
export function resultCards(result: RedFlagResult): RedFlag[] {
  const hospital = result.signals.filter((s) => s.severity !== "crisis");
  const topRank = hospital.length > 0 ? severityRank(hospital[0].severity) : null;
  return result.signals.filter((s) => s.severity === "crisis" || severityRank(s.severity) === topRank);
}

export function recordLayout(result: RedFlagResult | null, historyCount: number): RecordLayout {
  const showsRecent = historyCount > 0;
  if (result === null) return { phase: "form", showsRecent };
  const cards = resultCards(result);
  return { phase: "result", cards, showsClinics: cards.some((c) => c.severity !== "crisis"), showsRecent };
}

export interface RecordColumns {
  body: string;
  form: string;
  side: string;
  sideExtras: string;
  /**
   * 폼을 잠글지 — 결과 단계에서는 판정에 쓴 답을 보여 주기만 한다(iOS: 결과가 뜨면 [다시 입력]을 눌러야 고칠 수 있다).
   * PC는 결과 옆에 폼이 남으므로, 잠그지 않으면 답을 바꿔도 이전 판정이 그대로 떠 있게 된다.
   */
  formLocked: boolean;
  /** [확인하기]는 입력 단계에서만 — 결과가 떠 있는 동안 다시 눌러 같은 기록이 겹쳐 저장되지 않게(iOS와 같음). */
  showsSubmit: boolean;
}

/**
 * 본문 열 배치 — 폰은 세로 한 줄(간격 16), PC(lg 이상)는 두 열: 왼쪽 폼 + [확인하기], 오른쪽 결과 + 질문 + 최근 기록.
 * 결과 단계에서 폰에 숨기는 묶음은 `hidden`(display:none — 보이지도 낭독되지도 초점이 가지도 않음)이고 PC에서만 `lg:flex`.
 * 그래서 폰 화면·낭독 순서는 iOS와 같고, PC는 결과가 폼 옆 오른쪽 열 맨 위에 떠서 스크롤 없이 보인다.
 * 결과 단계의 PC 폼은 잠기고 [확인하기]는 사라진다 — 고치려면 [다시 입력](폰과 같은 흐름).
 */
export function recordColumns(phase: RecordLayout["phase"]): RecordColumns {
  const column = "flex min-w-0 flex-col gap-4";
  const wideOnly = "hidden min-w-0 flex-col gap-4 lg:flex";
  const result = phase === "result";
  return {
    body: "flex flex-col gap-4 focus:outline-none lg:grid lg:grid-cols-2 lg:items-start",
    form: result ? wideOnly : column,
    side: column,
    sideExtras: result ? wideOnly : column,
    formLocked: result,
    showsSubmit: !result,
  };
}

// MARK: 최근 기록 (RecordFlowView.swift:106-129)

export const RECENT_RECORDS_LIMIT = 5;

export interface RecentRecordRow {
  id: string;
  /** <time dateTime> 값 */
  iso: string;
  /** "9월 23일 오후 3:05" — 읽을 수 없는 날짜면 빈 문자열 */
  dateText: string;
  flagged: boolean;
  label: string;
  /**
   * 그 기록에서 켜져 있던 위험 증상 토글의 라벨(firedRiskLabels) — 어떤 신호였는지 되짚을 수 있게 줄 아래에 보인다.
   * 필드가 없거나 null인 기록(옛 기록·iOS 기록·필드 도입 전)은 빈 배열이라 줄을 그리지 않는다.
   */
  signals: string[];
}

/** 최신순 기록에서 앞 5건 — 점 색과 함께 글자로도 "위험신호 없음"/"병원 신호"를 보여준다(색만으로 구분하지 않음). */
export function recentRecordRows(history: readonly SymptomRecordWithRisk[]): RecentRecordRow[] {
  return history.slice(0, RECENT_RECORDS_LIMIT).map((r) => {
    const flagged = r.redFlagCode != null;
    return {
      id: r.id,
      iso: r.date,
      dateText: formatMonthDayTime(r.date),
      flagged,
      label: flagged ? RECORD_TEXT.recentFlagged : RECORD_TEXT.recentNormal,
      signals: firedRiskLabels(r),
    };
  });
}

// MARK: 오늘의 한 가지 질문 (RecordFlowView.swift:57-104, MoodCheckRules.swift)

export type MoodCardModel =
  | { kind: "answered"; text: string }
  /** note: 답 버튼 아래 각주 — 저장 위치에 맞는 문구(moodNoteFor) */
  | { kind: "ask"; question: MoodQuestion; answers: { answer: MoodAnswer; label: string }[]; note: string };

/** 답한 뒤 문구 — 원문: RecordFlowView.swift:70 */
export function answeredMoodText(label: string): string {
  return `오늘은 「${label}」라고 답했어요. 내일 또 물어볼게요.`;
}

export interface MoodCardOptions {
  /** 서버 저장 빌드(isSupabaseConfigured) — 각주가 "이 기기" 대신 서버 저장을 말한다. 기본 false(브라우저 전용). */
  serverStorage?: boolean;
}

/** 오늘 이미 답했으면 답 문구, 아니면 오늘의 문항과 답 버튼 3개(네/글쎄요/아니요) + 각주. */
export function moodCardModel(checks: readonly MoodCheckRecord[], now: Date, opts: MoodCardOptions = {}): MoodCardModel {
  const answered = todayMoodCheck(checks, now);
  if (answered) return { kind: "answered", text: answeredMoodText(moodAnswerLabel(answered.answer)) };
  return {
    kind: "ask",
    question: questionForDay(now),
    answers: MOOD_ANSWERS.map((answer) => ({ answer, label: moodAnswerLabel(answer) })),
    note: moodNoteFor(opts.serverStorage ?? false),
  };
}
