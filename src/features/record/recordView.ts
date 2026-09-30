// 기록 탭(이상 증상 빠른 기록)의 화면 규칙 — iOS RecordFlowView.swift를 옮긴 것.
// "무엇을 어떤 조건에서 보여주나"만 순수 함수로 둔다. 판정은 rules/record·rules/redflag, 기분 문항은 rules/mood가 한다.

import { postpartumDayCount } from "@/domain/date";
import type { MoodAnswer, MoodCheckRecord, SymptomRecord, UserProfile } from "@/domain/types";
import { STORAGE_REGION } from "@/features/privacy/dataItems";
import { DELIVERY_TITLE } from "@/rules/exercise";
import { MOOD_ANSWERS, moodAnswerLabel, questionForDay, todayMoodCheck, type MoodQuestion } from "@/rules/mood";
import { buildSymptomRecord, showsLochiaInputs, type SymptomForm } from "@/rules/record";
import type { RedFlag, RedFlagResult } from "@/rules/redflag";
import type { NewSymptomRecord } from "@/store/appStore";

/** 화면 문구 — Swift 원문 그대로(원칙 5). */
export const RECORD_TEXT = {
  title: "이상 증상 빠른 기록", // 원문: RecordFlowView.swift:150
  deliveryFallback: "분만", // 원문: RecordFlowView.swift:153
  lochiaTitle: "오로(분비물)", // 원문: RecordFlowView.swift:166
  lochiaIncreased: "어제보다 양이 늘었나요?", // 원문: RecordFlowView.swift:169
  lochiaRed: "색이 붉은색(선홍색)인가요?", // 원문: RecordFlowView.swift:175
  lochiaEarly:
    "산후 10일 이내에는 붉은 오로가 정상이에요. 10일이 지난 뒤부터 오로가 늘거나 다시 붉어지는지 확인해요.", // 원문: RecordFlowView.swift:180
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

/** 위험 증상 토글 4개 — 화면 순서(RecordFlowView.swift:219-225) */
export const RISK_TOGGLES = [
  { key: "woundPainWorsening", label: RECORD_TEXT.woundPain },
  { key: "dizzinessFainting", label: RECORD_TEXT.dizziness },
  { key: "chestPainBreathing", label: RECORD_TEXT.chestBreath },
  { key: "calfPainSwelling", label: RECORD_TEXT.calfSwelling },
] as const satisfies readonly { key: keyof SymptomForm; label: string }[];

export type RiskSymptomKey = (typeof RISK_TOGGLES)[number]["key"];

/**
 * 기록에 남기는 위험 증상 토글 4개(04 §1 "웹에서는 저장을 권장", 검수 #46, DEV_NOTES §3 CPO 3).
 * 필드명은 SymptomInput(RedFlagEngine.swift:18-21)과 같다. `null` = 이 필드가 생기기 전 기록(false와 구분).
 * 규칙은 바뀌지 않는다(판정은 여전히 rules/redflag) — 어떤 신호가 걸렸는지 기록에서 되짚을 수 있게 할 뿐이다.
 *
 * 지금 domain/types SymptomRecord에는 이 필드가 없다(CPO 확정 전). 그래서 화면 쪽은 "있으면 보여 준다"로 두었다:
 * - submitSymptomCheck는 폼 값을 늘 싣는다 — 스토어(appStore.addSymptomRecord)가 아는 필드만 옮기므로 필드가 생길 때까지는 버려진다.
 * - firedRiskLabels는 필드가 없거나 null인 기록(옛 기록·iOS 기록)에는 빈 배열을 돌려준다.
 * domain/types·store/decode(기본 null)·appStore.addSymptomRecord에 네 필드를 더하면 그대로 저장·표시된다.
 */
export type RiskSymptomFlags = Record<RiskSymptomKey, boolean | null>;

/** 기록 + (있을 수도 있는) 위험 증상 토글 */
export type SymptomRecordWithRisk = SymptomRecord & Partial<RiskSymptomFlags>;

/** 폼의 위험 증상 토글 4개만 */
export function riskFlagsFromForm(form: SymptomForm): Record<RiskSymptomKey, boolean> {
  return {
    woundPainWorsening: form.woundPainWorsening,
    dizzinessFainting: form.dizzinessFainting,
    chestPainBreathing: form.chestPainBreathing,
    calfPainSwelling: form.calfPainSwelling,
  };
}

/**
 * 기록에서 켜져 있던 위험 증상의 라벨(화면 순서, RECORD_TEXT 원문). 필드가 없거나 null이면(옛 기록) 빈 배열 —
 * "없었다"고 지어내지 않고 줄을 그리지 않는다.
 */
export function firedRiskLabels(record: SymptomRecordWithRisk): string[] {
  return RISK_TOGGLES.filter(({ key }) => record[key] === true).map(({ label }) => label);
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
  // 위험 증상 토글 4개도 함께 싣는다(RiskSymptomFlags 주석) — 스토어에 필드가 생기면 그대로 저장된다.
  const newRecord: NewSymptomRecord & Record<RiskSymptomKey, boolean> = {
    date: record.date,
    lochiaIncreased: record.lochiaIncreased,
    lochiaRed: record.lochiaRed,
    feverEvent: record.feverEvent,
    painNrs: record.painNrs,
    redFlagCode: record.redFlagCode,
    postpartumDays: record.postpartumDays,
    ...riskFlagsFromForm(form),
  };
  return { newRecord, result };
}

/**
 * 화면 배치(RecordFlowView.swift:35-49).
 * - 입력 단계: 폼 → [확인하기] → 오늘의 한 가지 질문 → 최근 기록(기록이 있을 때만) → 면책
 * - 결과 단계: 병원 신호면 레드플래그 카드 + 가까운 산부인과, 아니면 "위험 신호 없음" 카드 → [다시 입력] → 면책
 *   (결과 단계에서 폰은 폼·질문·최근 기록을 숨긴다 — PC 두 열에서는 폼 옆에 결과가 오고 나머지도 남는다. recordColumns)
 */
export type RecordLayout =
  | { phase: "form"; showsRecent: boolean }
  | { phase: "result"; redFlag: RedFlag; showsClinics: true; showsRecent: boolean }
  | { phase: "result"; redFlag: null; showsClinics: false; showsRecent: boolean };

export function recordLayout(result: RedFlagResult | null, historyCount: number): RecordLayout {
  const showsRecent = historyCount > 0;
  if (result === null) return { phase: "form", showsRecent };
  const flag = result.hospitalSignal;
  return flag
    ? { phase: "result", redFlag: flag, showsClinics: true, showsRecent }
    : { phase: "result", redFlag: null, showsClinics: false, showsRecent };
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

const RECORD_DATE_FORMAT = new Intl.DateTimeFormat("ko-KR", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** iOS `.dateTime.month().day().hour().minute()`(ko_KR) = "9월 23일 오후 3:05" (RecordFlowView.swift:116) */
export function formatRecordDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : RECORD_DATE_FORMAT.format(d);
}

/** 최신순 기록에서 앞 5건 — 점 색과 함께 글자로도 "위험신호 없음"/"병원 신호"를 보여준다(색만으로 구분하지 않음). */
export function recentRecordRows(history: readonly SymptomRecordWithRisk[]): RecentRecordRow[] {
  return history.slice(0, RECENT_RECORDS_LIMIT).map((r) => {
    const flagged = r.redFlagCode != null;
    return {
      id: r.id,
      iso: r.date,
      dateText: formatRecordDateTime(r.date),
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
