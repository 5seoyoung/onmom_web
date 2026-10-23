// PDF 리포트의 내용 — 스토어 스냅샷(상태·계정)과 시각을 받아 섹션·행을 만든다(순수 함수, 브라우저 API·네트워크 없음).
// 내 데이터 내려받기(JSON, features/settings/dataExport.ts)와 같은 원본을 쓴다 — 이 브라우저의 앱 상태. 서버 저장 빌드에서도 동기화
// 엔진이 서버와 합친 스토어 상태 그대로다(요청 없음). 화면(ReportScreen)은 여기서 고른 글자만 그리고, 인쇄는 브라우저(window.print)가 한다.
//
// 순서: 머리(만든 날짜·계정 종류) → 프로필 → 재활 고려사항(산모수첩 확인 항목) → 증상 기록(표) → 오늘의 한 가지 질문(표)
//       → 기록장(고를 때만) → 바닥글(면책·현재 앱의 안내 규칙 버전·만든 곳).
// 버전(감사 추적): 증상 기록·기분 답 줄마다 그 기록을 남길 때의 규칙·질문 버전(SymptomRecord.rulesVersion·MoodCheckRecord.moodVersion)을
//   보인다 — 버전이 없는 옛 기록·iOS 기록(null)에는 그리지 않는다. 바닥글의 버전은 리포트를 만든 이 앱의 지금 버전이다.
// 원칙
// - 앱 화면과 같은 말: 표시명·행 이름은 그 화면의 문구·함수를 가져다 쓴다(profileView·settingsView·recordView·journalView·rules/mood).
//   새 문구는 reportText.ts(REPORT_TEXT)에만 둔다.
// - 진단·점수·등급 없음: 입력한 값만 보인다. BMI·체중 회복 목표 같은 계산값을 만들지 않는다(키·체중은 0이 아닐 때 입력값 그대로).
// - 닉네임·이메일 없음: 계정은 종류만("게스트"/"카카오 사용자" — 닉네임을 뺀 displayName). 기록장 댓글의 작성 이름(authorName —
//   작성 당시 닉네임일 수 있다)도 넣지 않는다 — 기록장은 본인 메모라 이름 없이 시각·내용만.
// - 지어내지 않음: 산후 10일 전에는 오로를 묻지 않으므로(rules/record showsLochiaInputs) "아니요" 대신 값 없음(null — 화면은 "-").
//   산후 일수가 없는 옛 기록·모르는 기분 문항도 null. 지금과 다른 질문 버전으로 답한 기록의 문항도 null — 같은 번호라도 그 버전의
//   질문이 지금 질문과 같다고 할 수 없다(답과 그 버전은 그대로 보인다). 버전이 없는 옛 기록은 지금처럼 지금 질문으로 보인다.
// - 기록이 없는 섹션도 제목은 남긴다(화면이 "기록이 없어요." 한 줄을 그린다). 기록장은 고르지 않으면 섹션 자체가 없다.

import content from "@/content";
import { formatNrs, formatMeasurement } from "@/components/ui/numbers";
import { splitFirstSentence } from "@/components/ui/labels";
import { formatMonthDayTime, parseLocalDate, toLocalDateString } from "@/domain/date";
import { SYMPTOM_HISTORY_LIMIT, type CommunityPost, type MoodCheckRecord, type PersistedState } from "@/domain/types";
import { JOURNAL_TEXT, commentCountLabel } from "@/features/journal/journalView";
import { PROFILE_TEXT, deliveryMethodLabel, goalLabel, maternityFlags, postpartumLine } from "@/features/profile/profileView";
import { RECORD_TEXT, firedRiskLabels, type SymptomRecordWithRisk } from "@/features/record/recordView";
import { PROFILE_EDIT_TEXT, SETTINGS_TEXT } from "@/features/settings/settingsView";
import { MOOD_QUESTIONS, moodAnswerLabel, normalizeMoodAnswer } from "@/rules/mood";
import { showsLochiaInputs } from "@/rules/record";
import { MOOD_VERSION, RULES_VERSION } from "@/rules/version";
import { displayName, type Account } from "@/store/account";
import { REPORT_TEXT } from "./reportText";

export interface ReportOptions {
  /** 기록장 글(제목·시각·본문·댓글)을 넣을지 — 화면의 체크박스, 기본 꺼짐 */
  includeJournal: boolean;
}

/** 이름·값 한 줄 */
export interface ReportRow {
  key: string;
  label: string;
  value: string;
}

/** 증상 기록 표의 한 줄. null = 값 없음(묻지 않았거나 옛 기록) — 화면은 "-" */
export interface ReportSymptomRow {
  id: string;
  /** <time dateTime> */
  iso: string;
  /** "9월 23일 오후 3:05"(기록 탭 최근 기록과 같은 형식) */
  dateText: string;
  /** "40일차" — 기록 시점의 산후 일수. 옛 기록이면 null */
  dayText: string | null;
  lochiaIncreased: string | null;
  lochiaRed: string | null;
  fever: string;
  /** "3/10" */
  pain: string;
  flagged: boolean;
  /** "위험신호 없음" / "병원 신호" */
  result: string;
  /** 그 기록에서 켜져 있던 위험 증상 라벨(firedRiskLabels — 필드가 없는 기록은 빈 배열) */
  signals: string[];
  /** "규칙 버전 rules-1.1" — 그 기록을 남길 때의 안내 규칙 버전. 버전이 없는 옛 기록·iOS 기록이면 null(그리지 않는다) */
  rulesVersionText: string | null;
}

/** 기분 답 표의 한 줄 */
export interface ReportMoodRow {
  id: string;
  iso: string;
  /** "2026-10-14"(로컬 날짜). 못 읽는 시각이면 빈 문자열 */
  dateText: string;
  /** 문항 — 모르는 questionID(다음 버전 문항 등)·지금과 다른 질문 버전으로 답한 기록이면 null */
  question: string | null;
  /** "네" / "글쎄요" / "아니요" */
  answer: string;
  /** "질문 버전 mood-draft-0.1" — 답할 때의 질문 버전. 버전이 없는 옛 기록·iOS 기록이면 null(그리지 않는다) */
  moodVersionText: string | null;
}

export interface ReportJournalComment {
  id: string;
  iso: string;
  dateText: string;
  text: string;
}

export interface ReportJournalPost {
  id: string;
  iso: string;
  title: string;
  dateText: string;
  body: string;
  /** "댓글 n" — 댓글이 없으면 null */
  commentsLabel: string | null;
  /** 오래된 순(저장 순서 — 기록장 글 상세와 같다) */
  comments: ReportJournalComment[];
}

export type ReportSection =
  | { key: "profile"; title: string; rows: ReportRow[] }
  | { key: "maternity"; title: string; note: string; items: string[] }
  | { key: "symptoms"; title: string; columns: readonly string[]; rows: ReportSymptomRow[]; showsNoValueNote: boolean }
  | { key: "moods"; title: string; columns: readonly string[]; rows: ReportMoodRow[] }
  | { key: "journal"; title: string; posts: ReportJournalPost[] };

export type ReportSectionKey = ReportSection["key"];

export interface Report {
  /** 화면 제목(h1) */
  title: string;
  /** document.title — 브라우저가 PDF 파일 이름으로 제안한다("온맘 기록 리포트 2026-10-14") */
  documentTitle: string;
  /** 머리 — 만든 날짜 · 계정 종류 */
  meta: ReportRow[];
  sections: ReportSection[];
  /** rulesVersion = "현재 앱의 안내 규칙 버전 rules-1.1"(리포트를 만든 이 앱의 지금 버전 — 기록마다의 버전은 각 줄에) */
  footer: { disclaimer: string; rulesVersion: string; origin: string };
}

/** 증상 기록 표의 열 — 발열·통증·산후 일수는 앱 원문(기록 탭·설정), 나머지는 새 문구 */
export const SYMPTOM_COLUMNS: readonly string[] = [
  REPORT_TEXT.colRecordedAt,
  SETTINGS_TEXT.dayCount, // "산후 일수" — 원문: MoreView.swift:49
  REPORT_TEXT.colLochiaIncreased,
  REPORT_TEXT.colLochiaRed,
  RECORD_TEXT.feverTitle, // "발열 (38.0℃ 이상)" — 원문: RecordFlowView.swift:191
  RECORD_TEXT.painTitle, // "통증 정도 (NRS)" — 원문: RecordFlowView.swift:205
  REPORT_TEXT.colResult,
];

export const MOOD_COLUMNS: readonly string[] = [REPORT_TEXT.colDate, REPORT_TEXT.colQuestion, REPORT_TEXT.colAnswer];

/** "복직 예정일 (선택)"(입력 칸 라벨 원문)에서 입력 안내 "(선택)"만 뗀 행 이름 */
const RETURN_TO_WORK_LABEL = PROFILE_EDIT_TEXT.returnToWork.replace(/\s*\(선택\)\s*$/, "");

const yesNo = (value: boolean): string => (value ? REPORT_TEXT.yes : REPORT_TEXT.no);

/** "규칙 버전 rules-1.1" — 버전이 없으면(옛 기록·iOS 기록) null. 칸 자체가 없는 객체(undefined)도 없음으로 본다. */
const versionText = (label: string, version: string | null | undefined): string | null =>
  typeof version === "string" && version.length > 0 ? `${label} ${version}` : null;

/** 시각 문자열 → ms. 못 읽으면 null(맨 뒤로 보낸다). */
function timeOf(iso: string): number | null {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

/** 최신순(못 읽는 시각은 맨 뒤, 같은 시각은 원래 순서) — 저장소가 이미 최신순이지만 다른 기기·옛 데이터에 기대지 않는다. */
function newestFirst<T extends { date: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const ta = timeOf(a.date);
    const tb = timeOf(b.date);
    if (ta === null || tb === null) return ta === tb ? 0 : ta === null ? 1 : -1;
    return tb - ta;
  });
}

function oldestFirst<T extends { date: string }>(items: readonly T[]): T[] {
  return newestFirst(items).reverse();
}

/** 계정 종류만 — 닉네임을 뺀 표시 이름("게스트"/"카카오 사용자", 원문: AccountStore.swift:77-78) */
function accountKindLabel(account: Account): string {
  return displayName({ ...account, name: null });
}

function profileRows(state: PersistedState, now: Date): ReportRow[] {
  const p = state.profile;
  const rows: ReportRow[] = [];

  // 출산일 + "산후 n일차 · n주차"(프로필 머리와 같은 줄). 없으면 "미설정" — 0일차를 지어내지 않는다.
  const line = postpartumLine(p.deliveryDate, now);
  rows.push({
    key: "deliveryDate",
    label: PROFILE_EDIT_TEXT.deliveryDate,
    value: line !== null && p.deliveryDate !== null ? `${p.deliveryDate} (${line})` : PROFILE_TEXT.unset,
  });
  rows.push({ key: "deliveryMethod", label: PROFILE_TEXT.deliveryMethod, value: deliveryMethodLabel(p.deliveryMethod) });
  rows.push({ key: "goal", label: PROFILE_TEXT.goal, value: goalLabel(p.goal) });
  if (p.returnToWorkDate !== null && parseLocalDate(p.returnToWorkDate)) {
    rows.push({ key: "returnToWork", label: RETURN_TO_WORK_LABEL, value: p.returnToWorkDate });
  }
  rows.push({ key: "breastfeeding", label: PROFILE_EDIT_TEXT.breastfeeding, value: yesNo(p.isBreastfeeding) });

  // 키·체중 — 0은 "미입력"(Components.swift:117). 입력한 값 그대로, 계산값(BMI 등)은 만들지 않는다.
  const measurements = [
    { key: "height", label: PROFILE_EDIT_TEXT.height, value: p.heightCm },
    { key: "currentWeight", label: PROFILE_EDIT_TEXT.currentWeight, value: p.currentWeightKg },
    { key: "preWeight", label: PROFILE_EDIT_TEXT.preWeight, value: p.prePregnancyWeightKg },
  ];
  for (const m of measurements) {
    const value = formatMeasurement(m.value);
    if (value !== "") rows.push({ key: m.key, label: m.label, value });
  }
  return rows;
}

/** 오로 칸 — 산후 10일 전(묻지 않음)·산후 일수를 모르는 옛 기록의 "아니요"는 값 없음(null). "예"는 늘 그대로. */
function lochiaCell(value: boolean, postpartumDays: number | null): string | null {
  if (value) return REPORT_TEXT.yes;
  if (postpartumDays === null || !showsLochiaInputs(postpartumDays)) return null;
  return REPORT_TEXT.no;
}

function symptomRows(history: readonly SymptomRecordWithRisk[]): ReportSymptomRow[] {
  return newestFirst(history)
    .slice(0, SYMPTOM_HISTORY_LIMIT)
    .map((r) => {
      const flagged = r.redFlagCode != null;
      const days = typeof r.postpartumDays === "number" && Number.isFinite(r.postpartumDays) ? r.postpartumDays : null;
      return {
        id: r.id,
        iso: r.date,
        dateText: formatMonthDayTime(r.date),
        dayText: days === null ? null : `${days}일차`, // 설정 "산후 일수" 값과 같은 형식 — 원문: MoreView.swift:49
        lochiaIncreased: lochiaCell(r.lochiaIncreased, days),
        lochiaRed: lochiaCell(r.lochiaRed, days),
        fever: yesNo(r.feverEvent),
        pain: formatNrs(r.painNrs),
        flagged,
        result: flagged ? RECORD_TEXT.recentFlagged : RECORD_TEXT.recentNormal,
        signals: firedRiskLabels(r),
        rulesVersionText: versionText(REPORT_TEXT.recordRulesVersion, r.rulesVersion),
      };
    });
}

/** 지금 질문표(MOOD_QUESTIONS)로 그 답의 질문을 찾아도 되는가 — 버전이 같거나, 버전이 없는 옛 기록(지금까지와 같게) */
function asksCurrentQuestions(check: MoodCheckRecord): boolean {
  return typeof check.moodVersion !== "string" || check.moodVersion === MOOD_VERSION;
}

function moodRows(checks: readonly MoodCheckRecord[]): ReportMoodRow[] {
  return newestFirst(checks).map((c) => {
    const t = timeOf(c.date);
    return {
      id: c.id,
      iso: c.date,
      dateText: t === null ? "" : toLocalDateString(new Date(t)),
      question: asksCurrentQuestions(c) ? (MOOD_QUESTIONS.find((q) => q.id === c.questionID)?.text ?? null) : null,
      answer: moodAnswerLabel(normalizeMoodAnswer(c.answer)),
      moodVersionText: versionText(REPORT_TEXT.recordMoodVersion, c.moodVersion),
    };
  });
}

function journalPosts(posts: readonly CommunityPost[]): ReportJournalPost[] {
  return newestFirst(posts).map((p) => ({
    id: p.id,
    iso: p.date,
    title: p.title,
    dateText: formatMonthDayTime(p.date),
    body: p.body,
    commentsLabel: p.comments.length > 0 ? commentCountLabel(p.comments.length) : null,
    // 작성 이름(authorName)은 넣지 않는다 — 머리 주석
    comments: oldestFirst(p.comments).map((c) => ({ id: c.id, iso: c.date, dateText: formatMonthDayTime(c.date), text: c.text })),
  }));
}

/** 리포트 전체. now = 만든 시각(로컬 날짜가 머리·문서 제목에, 산후 일차 계산에 쓰인다). */
export function buildReport(state: PersistedState, account: Account | null, now: Date, options: ReportOptions): Report {
  const createdDate = toLocalDateString(now);
  const meta: ReportRow[] = [{ key: "createdAt", label: REPORT_TEXT.createdAt, value: createdDate }];
  if (account !== null) meta.push({ key: "account", label: SETTINGS_TEXT.account, value: accountKindLabel(account) });

  const symptoms = symptomRows(state.symptomHistory);
  const sections: ReportSection[] = [
    { key: "profile", title: PROFILE_TEXT.title, rows: profileRows(state, now) },
    {
      key: "maternity",
      title: PROFILE_TEXT.maternityFlags, // "재활 고려사항" — 프로필·프로필 편집과 같은 이름(산모수첩 확인 항목)
      note: splitFirstSentence(PROFILE_EDIT_TEXT.maternityHelp)[0], // "산모수첩·진료기록에서 확인된 항목." — 원문 첫 문장
      items: maternityFlags(state.maternity),
    },
    {
      key: "symptoms",
      title: REPORT_TEXT.symptomsTitle,
      columns: SYMPTOM_COLUMNS,
      rows: symptoms,
      showsNoValueNote: symptoms.some((r) => r.dayText === null || r.lochiaIncreased === null || r.lochiaRed === null),
    },
    { key: "moods", title: RECORD_TEXT.moodTitle, columns: MOOD_COLUMNS, rows: moodRows(state.moodChecks) },
  ];
  if (options.includeJournal) sections.push({ key: "journal", title: JOURNAL_TEXT.title, posts: journalPosts(state.communityPosts) });

  return {
    title: REPORT_TEXT.title,
    documentTitle: `${REPORT_TEXT.title} ${createdDate}`,
    meta,
    sections,
    footer: {
      disclaimer: content.disclaimers.home_footer, // 원문 — 앱 바닥 면책(HomeView.swift:27, DisclaimerBanner·사이드바와 같은 문장)
      rulesVersion: `${REPORT_TEXT.appRulesVersion} ${RULES_VERSION}`, // 이 앱의 지금 버전 — 기록마다의 버전은 각 줄(rulesVersionText·moodVersionText)
      origin: REPORT_TEXT.origin,
    },
  };
}
