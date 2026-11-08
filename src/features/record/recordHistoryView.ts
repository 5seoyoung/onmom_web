// 전체 기록(/record/history/)·기록 수정(/record/edit/?id=) 화면 규칙 — 웹 전용(iOS에는 최근 5건만 있었다. LAUNCH_CHECKLIST 7-4).
// 무엇을 어떤 조건에서 보여 주나만 순수 함수로 둔다. 고치기·지우기의 저장 규칙은 store/state.ts, 고친 답의 판정은 rules/record rebuildSymptomRecord.
// 지운 기록은 상태의 목록에 없다(store/tombstones) — 여기서 따로 거르지 않는다.

import { formatMonthDayTime } from "@/domain/date";
import type { MoodAnswer, MoodCheckRecord, SymptomRecord } from "@/domain/types";
import { MOOD_ANSWERS, moodAnswerLabel, normalizeMoodAnswer, questionOfCheck } from "@/rules/mood";
import { formFromRecord, recordAsksLochia, type SymptomForm } from "@/rules/record";
import { metrics } from "@/rules/redflag";
import { MOOD_VERSION } from "@/rules/version";
import { ROUTES } from "@/routes";
import { RECORD_WEB_TEXT, firedRiskLabels } from "./recordView";

export const RECORD_HISTORY_TEXT = {
  // 웹 신규 문구 — CPO 확인 필요 (기록 탭에서 전체 기록으로 가는 버튼)
  openHistory: "전체 기록 보기",
  // 웹 신규 문구 — CPO 확인 필요 (전체 기록 화면 제목·부제)
  title: "전체 기록",
  // 웹 신규 문구 — CPO 확인 필요
  subtitle: "남긴 기록을 수정하거나 삭제할 수 있어요.",
  // 웹 신규 문구 — CPO 확인 필요 (전체 기록의 첫 묶음 제목 — 둘째 묶음은 기록 탭과 같은 "오늘의 한 가지 질문")
  symptomSection: "증상 기록",
  // 웹 신규 문구 — CPO 확인 필요 (묶음이 비었을 때)
  symptomEmpty: "아직 남긴 증상 기록이 없어요.",
  // 웹 신규 문구 — CPO 확인 필요
  moodEmpty: "아직 답한 질문이 없어요.",
  // 웹 신규 문구 — CPO 확인 필요 (기록마다의 버튼 — 낭독 이름은 아래 editLabel·deleteLabel처럼 어느 기록인지 붙인다)
  edit: "수정",
  // 웹 신규 문구 — CPO 확인 필요
  delete: "삭제",
  // 웹 신규 문구 — CPO 확인 필요 (고친 적이 있는 기록·답의 날짜 옆 표시)
  edited: "수정됨",
  // 웹 신규 문구 — CPO 확인 필요 (삭제 확인 창 — 증상 기록)
  deleteRecordTitle: "이 기록을 삭제할까요?",
  // 웹 신규 문구 — CPO 확인 필요 (삭제 확인 창 — 오늘의 질문 답)
  deleteMoodTitle: "이 답을 삭제할까요?",
  // 웹 신규 문구 — CPO 확인 필요 (삭제 확인 창 본문 — 둘 다)
  deleteMessage: "삭제한 기록은 되돌릴 수 없어요.",
  cancel: "취소", // 원문과 같은 글자: MoreView.swift:97·CommunityView.swift:148
  // 웹 신규 문구 — CPO 확인 필요 (삭제한 뒤 화면 낭독기에만 들리는 알림)
  deleted: "기록을 삭제했어요.",
  // 웹 신규 문구 — CPO 확인 필요 (답 수정 창 제목·저장 버튼·저장 뒤 낭독 알림)
  moodEditTitle: "답 수정",
  // 웹 신규 문구 — CPO 확인 필요
  save: "저장",
  // 웹 신규 문구 — CPO 확인 필요
  moodEdited: "답을 수정했어요.",
  // 웹 신규 문구 — CPO 확인 필요 (기록 수정 화면 제목)
  editTitle: "기록 수정",
  // 웹 신규 문구 — CPO 확인 필요 (기록 수정 화면의 안내 — 판정이 아니라 같은 안내를 다시 확인한다는 것만)
  editNote: "저장하면 수정한 답으로 안내를 다시 확인해요. 기록한 날짜와 산후 일수는 그대로예요.",
  // 웹 신규 문구 — CPO 확인 필요 (수정할 기록이 없을 때 — 다른 탭·기기에서 지웠거나 주소가 틀림. 기록장의 원문 "삭제된 글이에요."와 같은 말투)
  editMissing: "삭제된 기록이에요.",
  // 웹 신규 문구 — CPO 확인 필요 (저장한 뒤 결과 위의 한 줄·돌아가는 버튼)
  editSaved: "기록을 수정했어요.",
  // 웹 신규 문구 — CPO 확인 필요
  backToHistory: "전체 기록으로 돌아가기",
} as const;

/** "9월 23일 오후 3:05 기록 수정" — 보이는 글자("수정")가 낭독 이름 안에 그대로 있다(WCAG 2.5.3) */
export function recordActionLabel(dateText: string, action: string): string {
  // 웹 신규 문구 — CPO 확인 필요 (낭독 이름만 — "{날짜} 기록 수정"·"{날짜} 기록 삭제")
  return dateText ? `${dateText} 기록 ${action}` : `기록 ${action}`;
}

/** "9월 23일 오후 3:05 답 수정" */
export function moodActionLabel(dateText: string, action: string): string {
  // 웹 신규 문구 — CPO 확인 필요 (낭독 이름만 — "{날짜} 답 수정"·"{날짜} 답 삭제")
  return dateText ? `${dateText} 답 ${action}` : `답 ${action}`;
}

export function recordEditHref(id: string): string {
  return `${ROUTES.recordEdit}?id=${encodeURIComponent(id)}`;
}

/** 전체 기록의 증상 기록 한 줄 */
export interface HistoryRecordRow {
  id: string;
  iso: string;
  dateText: string;
  flagged: boolean;
  /** "해당 없음"/"병원 확인 신호" — 최근 기록과 같은 글자 */
  label: string;
  edited: boolean;
  /**
   * 그 기록에서 살펴볼 값 — 홈 지표 가운데 해당 없음이 아닌 것(오로·발열·통증 NRS n/10)과 켜져 있던 위험 증상 토글의 라벨.
   * 무엇을 고칠지 알아볼 수 있게 줄 아래에 보인다. 칸이 없는 옛 기록은 있는 값만.
   */
  signals: string[];
  editHref: string;
}

/** 최신순 전체 — 상태의 목록 순서 그대로(이미 최신순, 지운 기록은 없다) */
export function historyRecordRows(history: readonly SymptomRecord[]): HistoryRecordRow[] {
  return history.map((r) => {
    const flagged = r.redFlagCode != null;
    const watched = metrics(r)
      .filter((m) => m.status !== "normal")
      .map((m) => m.name);
    return {
      id: r.id,
      iso: r.date,
      dateText: formatMonthDayTime(r.date),
      flagged,
      label: flagged ? RECORD_WEB_TEXT.recentFlagged : RECORD_WEB_TEXT.recentNormal,
      edited: r.updatedAt !== undefined,
      signals: [...watched, ...firedRiskLabels(r)],
      editHref: recordEditHref(r.id),
    };
  });
}

/** 전체 기록의 오늘의 질문 답 한 줄 */
export interface HistoryMoodRow {
  id: string;
  iso: string;
  dateText: string;
  /** 그때 물은 문항 — 지금 문항표로 찾을 수 없는 다른 버전의 답이면 null(문항 줄을 그리지 않는다) */
  question: string | null;
  answer: MoodAnswer;
  answerLabel: string;
  edited: boolean;
}

export function historyMoodRows(checks: readonly MoodCheckRecord[]): HistoryMoodRow[] {
  return checks.map((c) => {
    const answer = normalizeMoodAnswer(c.answer);
    return {
      id: c.id,
      iso: c.date,
      dateText: formatMonthDayTime(c.date),
      question: questionOfCheck(c, MOOD_VERSION)?.text ?? null,
      answer,
      answerLabel: moodAnswerLabel(answer),
      edited: c.updatedAt !== undefined,
    };
  });
}

/** 답 수정 창의 고를 수 있는 답(네·글쎄요·아니요 — 기록 탭과 같은 순서·글자) */
export function moodAnswerChoices(): { answer: MoodAnswer; label: string }[] {
  return MOOD_ANSWERS.map((answer) => ({ answer, label: moodAnswerLabel(answer) }));
}

/** 전체 기록으로 가는 버튼을 보일지 — 증상 기록이나 답이 하나라도 있을 때 */
export function showsHistoryLink(state: { symptomHistory: readonly unknown[]; moodChecks: readonly unknown[] }): boolean {
  return state.symptomHistory.length > 0 || state.moodChecks.length > 0;
}

// MARK: 기록 수정 화면

export interface RecordEditModel {
  /** 수정 화면의 처음 값 — 기록의 답 */
  initialForm: SymptomForm;
  /** 그 기록의 산후 일수로 오로 질문을 물을지(rules/record recordAsksLochia) */
  showsLochia: boolean;
  dateText: string;
  iso: string;
}

export function recordEditModel(record: SymptomRecord): RecordEditModel {
  return {
    initialForm: formFromRecord(record),
    showsLochia: recordAsksLochia(record),
    dateText: formatMonthDayTime(record.date),
    iso: record.date,
  };
}

/** 폼 값이 같은가 — 바뀐 것이 없으면 [저장]을 잠근다(저장해도 고친 기록이 되지 않게) */
export function sameSymptomForm(a: SymptomForm, b: SymptomForm): boolean {
  const ka = Object.keys(a) as (keyof SymptomForm)[];
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}

/** 수정 화면 머리 아래 날짜 줄 — "9월 23일 오후 3:05에 남긴 기록" */
export function recordedAtLine(dateText: string): string {
  // 웹 신규 문구 — CPO 확인 필요 (기록 수정 화면의 날짜 줄)
  return dateText ? `${dateText}에 남긴 기록` : "";
}
