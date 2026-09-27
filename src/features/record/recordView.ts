// 기록 탭(이상 증상 빠른 기록)의 화면 규칙 — iOS RecordFlowView.swift를 옮긴 것.
// "무엇을 어떤 조건에서 보여주나"만 순수 함수로 둔다. 판정은 rules/record·rules/redflag, 기분 문항은 rules/mood가 한다.

import { postpartumDayCount } from "@/domain/date";
import type { MoodAnswer, MoodCheckRecord, SymptomRecord, UserProfile } from "@/domain/types";
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
  moodNote: "매일 한 가지씩 물어요. 답은 이 기기에만 남고, 진단이 아니에요.", // 원문: RecordFlowView.swift:98 (D5 — "이 기기" 그대로)
  recentTitle: "최근 기록", // 원문: RecordFlowView.swift:110
  recentNormal: "위험신호 없음", // 원문: RecordFlowView.swift:119
  recentFlagged: "병원 신호", // 원문: RecordFlowView.swift:119
} as const;

/** 위험 증상 토글 4개 — 화면 순서(RecordFlowView.swift:219-225) */
export const RISK_TOGGLES = [
  { key: "woundPainWorsening", label: RECORD_TEXT.woundPain },
  { key: "dizzinessFainting", label: RECORD_TEXT.dizziness },
  { key: "chestPainBreathing", label: RECORD_TEXT.chestBreath },
  { key: "calfPainSwelling", label: RECORD_TEXT.calfSwelling },
] as const satisfies readonly { key: keyof SymptomForm; label: string }[];

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
): { newRecord: NewSymptomRecord; result: RedFlagResult } {
  // id 인자는 저장에 쓰이지 않는다 — 스토어가 새 id를 붙인다(DEV_NOTES §4).
  const { record, result } = buildSymptomRecord(form, deliveryDate, now, "");
  const newRecord: NewSymptomRecord = {
    date: record.date,
    lochiaIncreased: record.lochiaIncreased,
    lochiaRed: record.lochiaRed,
    feverEvent: record.feverEvent,
    painNrs: record.painNrs,
    redFlagCode: record.redFlagCode,
    postpartumDays: record.postpartumDays,
  };
  return { newRecord, result };
}

/**
 * 화면 배치(RecordFlowView.swift:35-49).
 * - 입력 단계: 폼 → [확인하기] → 오늘의 한 가지 질문 → 최근 기록(기록이 있을 때만) → 면책
 * - 결과 단계: 병원 신호면 레드플래그 카드 + 가까운 산부인과, 아니면 "위험 신호 없음" 카드 → [다시 입력] → 면책
 *   (결과 단계에서는 질문·최근 기록을 숨긴다)
 */
export type RecordLayout =
  | { phase: "form"; showsRecent: boolean }
  | { phase: "result"; redFlag: RedFlag; showsClinics: true }
  | { phase: "result"; redFlag: null; showsClinics: false };

export function recordLayout(result: RedFlagResult | null, historyCount: number): RecordLayout {
  if (result === null) return { phase: "form", showsRecent: historyCount > 0 };
  const flag = result.hospitalSignal;
  return flag ? { phase: "result", redFlag: flag, showsClinics: true } : { phase: "result", redFlag: null, showsClinics: false };
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
export function recentRecordRows(history: readonly SymptomRecord[]): RecentRecordRow[] {
  return history.slice(0, RECENT_RECORDS_LIMIT).map((r) => {
    const flagged = r.redFlagCode != null;
    return {
      id: r.id,
      iso: r.date,
      dateText: formatRecordDateTime(r.date),
      flagged,
      label: flagged ? RECORD_TEXT.recentFlagged : RECORD_TEXT.recentNormal,
    };
  });
}

// MARK: 오늘의 한 가지 질문 (RecordFlowView.swift:57-104, MoodCheckRules.swift)

export type MoodCardModel =
  | { kind: "answered"; text: string }
  | { kind: "ask"; question: MoodQuestion; answers: { answer: MoodAnswer; label: string }[] };

/** 답한 뒤 문구 — 원문: RecordFlowView.swift:70 */
export function answeredMoodText(label: string): string {
  return `오늘은 「${label}」라고 답했어요. 내일 또 물어볼게요.`;
}

/** 오늘 이미 답했으면 답 문구, 아니면 오늘의 문항과 답 버튼 3개(네/글쎄요/아니요). */
export function moodCardModel(checks: readonly MoodCheckRecord[], now: Date): MoodCardModel {
  const answered = todayMoodCheck(checks, now);
  if (answered) return { kind: "answered", text: answeredMoodText(moodAnswerLabel(answered.answer)) };
  return {
    kind: "ask",
    question: questionForDay(now),
    answers: MOOD_ANSWERS.map((answer) => ({ answer, label: moodAnswerLabel(answer) })),
  };
}
