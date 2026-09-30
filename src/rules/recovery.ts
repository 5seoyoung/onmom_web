// 회복 단계 분석 — iOS `RecoveryAnalysis.swift`를 옮긴 것. 확인·입력한 정보에 대한 규칙 평가(지어낸 값 없음).
//
// 입력: 프로필(분만 방식·출산일) + 산모수첩 확인 항목 + (호출하는 쪽이 받아 온) Video DB 조회 결과.
// 규칙: exercise.ts의 주차 게이팅·임상 차단 + 확인 항목별 주의 오버레이(content.json caution_overlays).
// 문서 추출(OCR)은 없다 — 전부 사용자가 확인·입력한 값이라 sourceDocType "manual_input"으로 명시한다.
//
// iOS와 다른 점: iOS는 run() 안에서 영상을 조회했다. 웹은 순수 함수로 두고 조회 결과를 입력으로 받는다.
// 출산일이 없거나 형식이 틀려도 분석하지 않는다(null) — iOS는 출산일이 늘 있어(Models.swift:86) 이 경우가 없었지만,
// 웹은 온보딩 전 null이 가능하다. 0일차로 두고 분석하면 지어낸 값이다(원칙 3).
//
// 호출 규약(감사 #2): 분석 폼 값을 먼저 profile·maternity에 저장하고, 저장된 값을 넘긴다(AnalyzeFlowView.swift:192-206).
// 운동 탭·홈도 저장된 maternity로 같은 차단 판정을 쓰므로(ExerciseRules.swift:74-75), 폼 값을 바로 넘기면
// 분석은 "금지"인데 운동 탭은 열어 두는 불일치가 생긴다.

import content from "@/content";
import { parseLocalDate, postpartumDayCount, weekFromDayCount } from "@/domain/date";
import type { DeliveryMethod, MaternityRecord, UserProfile } from "@/domain/types";
import { RULES_VERSION } from "@/rules/version";
import type { RedFlag } from "@/rules/redflag";
import {
  DELIVERY_TITLE,
  STAGE_BUCKETS,
  blockedBuckets,
  exercisePlan,
  startWeek,
  type Video,
} from "@/rules/exercise";

// MARK: - 결과 타입 (iOS EngineOutput)

/** 근거 칩 토큰 — "src:" 로 시작하면 출처 칩(화면의 해석은 components/ui/evidence.ts parseEvidenceToken 한 곳) */
export interface RecItem {
  item: string;
  label: string;
  evidenceChips: string[];
}

/**
 * 병원 신호 — 이 분석은 레드플래그를 묻지 않으므로 항상 null이다(RecoveryAnalysis.swift:78).
 * 타입은 redflag.ts의 RedFlag 하나를 쓴다(severity는 content.json 값 그대로라 string, 표시는 severityLabel()로).
 */
export type HospitalSignal = RedFlag;

export interface Recommendation {
  hospitalSignal: HospitalSignal | null;
  allowed: RecItem[];
  caution: RecItem[];
  forbidden: RecItem[];
  trace: { firedRules: string[]; configVersion: string };
}

export type StageCode = "0-2w" | "3-4w" | "5-6w" | "7-12w" | "13w+";

export interface RecoveryProfile {
  deliveryMethod: DeliveryMethod;
  podDays: number;
  stage: StageCode;
  sourceDocType: string;
  provenance: { ocrConfidence: number; extractedBy: string };
}

export interface ExerciseVideo {
  id: string;
  title: string;
  matchReason: string[];
  url: string;
}

/** 영상 조회 상태 — 실패를 빈 목록으로 숨기지 않는다 */
export type VideoFetchState = "ok" | "notConfigured" | "failed";

export interface EngineOutput {
  profile: RecoveryProfile;
  recommendation: Recommendation;
  exerciseVideos: ExerciseVideo[];
  videoFetch: VideoFetchState;
  meta: { engineVersion: string; generatedAt: string };
}

/** 호출하는 쪽이 `GET /videos?include={routeTag(delivery)}&limit=500`로 받아 온 결과 */
export type VideoFetchResult =
  | { state: "ok"; videos: readonly Video[] }
  | { state: "notConfigured" }
  | { state: "failed" };

export interface RecoveryAnalysisInput {
  profile: Pick<UserProfile, "deliveryDate" | "deliveryMethod">;
  maternity: MaternityRecord;
  videos: VideoFetchResult;
}

/** 원문: RecoveryAnalysis.swift:102 */
export const ENGINE_VERSION = "onmom-rules/1.0";

// MARK: - 근거 칩 (content.json에 없는 것은 Swift 원문)

const SRC_STAGE_BASIS = "src:회복 단계 기준"; // 원문: RecoveryAnalysis.swift:29
const BLOCKED_CHIPS = ["산모수첩 확인 항목", "src:산모수첩 확인항목"] as const; // 원문: RecoveryAnalysis.swift:35

// MARK: - 주의 오버레이 (산모수첩 확인 항목 → MaternityRecord 필드와 1:1)

type MaternityFlag = Exclude<keyof MaternityRecord, "isPrimiparous">;
const MATERNITY_FLAGS: readonly string[] = ["gdm", "anemia", "heavyBleeding", "preeclampsia", "pelvicPain", "diastasisRecti"] satisfies MaternityFlag[];

function isMaternityFlag(s: string): s is MaternityFlag {
  return MATERNITY_FLAGS.includes(s);
}

const CAUTION_OVERLAYS = content.caution_overlays.map((o) => {
  if (!isMaternityFlag(o.if)) throw new Error(`caution_overlays의 '${o.if}'는 산모수첩 확인 항목이 아닙니다`);
  return { field: o.if, item: o.item, label: o.label, chips: o.chips };
});

// MARK: - 분석

/** 주차 → 단계 코드 (RecoveryAnalysis.swift:126-133) */
export function stageCodeForWeek(week: number): StageCode {
  if (week <= 2) return "0-2w";
  if (week <= 4) return "3-4w";
  if (week <= 6) return "5-6w";
  if (week <= 12) return "7-12w";
  return "13w+";
}

/**
 * 가능 / 주의 / 금지 판정. 산모수첩 확인 항목이 막는 단계는 주차가 됐어도 "금지"다.
 * firedRules = 가능 단계 → 차단 단계 → 주의 순. 차단 단계는 단계순으로 싣는다
 * (iOS는 Dictionary 순서라 실행마다 달랐다).
 */
export function recoveryRecommendation(delivery: DeliveryMethod, week: number, maternity: MaternityRecord): Recommendation {
  const blocked = blockedBuckets(maternity);
  const weekReached = STAGE_BUCKETS.filter((b) => week >= startWeek(b, delivery));
  const notYet = STAGE_BUCKETS.filter((b) => week < startWeek(b, delivery));

  const allowed: RecItem[] = weekReached
    .filter((b) => blocked[b.key] === undefined)
    .map((b) => ({
      item: b.key,
      label: `${b.title} — ${b.summary}`, // 원문: RecoveryAnalysis.swift:28
      evidenceChips: [`${startWeek(b, delivery)}주차부터 가능`, SRC_STAGE_BASIS], // 원문: RecoveryAnalysis.swift:29
    }));

  const forbidden: RecItem[] = [];
  // ① 임상 소견으로 막힌 단계 (주차는 됐지만 지금은 안 됨)
  for (const b of weekReached) {
    const reason = blocked[b.key];
    if (reason === undefined) continue;
    forbidden.push({
      item: b.key,
      label: `${b.title} — ${reason}`, // 원문: RecoveryAnalysis.swift:34
      evidenceChips: [...BLOCKED_CHIPS],
    });
  }
  // ② 아직 주차가 안 된 단계
  for (const b of notYet) {
    forbidden.push({
      item: b.key,
      label: `${b.title} — ${b.summary}`, // 원문: RecoveryAnalysis.swift:39
      evidenceChips: [`${startWeek(b, delivery)}주차부터 (현재 ${week}주차)`, SRC_STAGE_BASIS], // 원문: RecoveryAnalysis.swift:40
    });
  }

  const caution: RecItem[] = CAUTION_OVERLAYS.filter((o) => maternity[o.field]).map((o) => ({
    item: o.item,
    label: o.label,
    evidenceChips: [...o.chips],
  }));

  const firedRules = [
    ...allowed.map((a) => `stage:${a.item}`),
    ...STAGE_BUCKETS.filter((b) => blocked[b.key] !== undefined).map((b) => `blocked:${b.key}`),
    ...caution.map((c) => `caution:${c.item}`),
  ];

  // 이 플로우는 레드플래그 증상을 묻지 않는다(기록 탭 담당) — hospitalSignal 없음
  return { hospitalSignal: null, allowed, caution, forbidden, trace: { firedRules, configVersion: RULES_VERSION } };
}

/**
 * 회복 단계 분석 — RecoveryAnalysis.run. 분만 방식이 없으면 분석하지 않는다(null).
 * 출산일이 없거나 형식이 틀려도 null이다(웹에만 있는 경우 — 0일차로 추정하지 않는다).
 * 영상은 지금 할 수 있는 것(unlocked)만 담는다. 조회 실패·미설정은 상태로 전달한다.
 *
 * 호출 전에 폼 값(분만 방식·출산일·키·체중·산모수첩 7항목)을 profile·maternity에 저장한 뒤 저장된 값을 넘긴다
 * — AnalyzeFlowView.swift:192-206, 감사 #2. 운동 탭·홈이 같은 저장값으로 차단 판정을 하기 때문이다.
 */
export function runRecoveryAnalysis(input: RecoveryAnalysisInput, now: Date): EngineOutput | null {
  const delivery = input.profile.deliveryMethod;
  if (!delivery) return null;
  if (parseLocalDate(input.profile.deliveryDate) === null) return null;
  const days = postpartumDayCount(input.profile.deliveryDate, now);
  const week = weekFromDayCount(days);

  const exerciseVideos: ExerciseVideo[] =
    input.videos.state === "ok"
      ? exercisePlan(input.videos.videos, delivery, week, input.maternity)
          .filter((p) => p.unlocked)
          .map((p) => ({
            id: p.video.video_id,
            title: p.video.title,
            matchReason: [p.bucket.title, `${week}주차 가능`], // 원문: RecoveryAnalysis.swift:115
            url: p.video.url,
          }))
      : [];

  return {
    profile: {
      deliveryMethod: delivery,
      podDays: days,
      stage: stageCodeForWeek(week),
      sourceDocType: "manual_input", // 문서 추출(OCR)이 없다 — 전부 사용자가 확인·입력한 값이다
      provenance: { ocrConfidence: 0, extractedBy: "manual" },
    },
    recommendation: recoveryRecommendation(delivery, week, input.maternity),
    exerciseVideos,
    videoFetch: input.videos.state,
    // Swift `Date().ISO8601Format()`는 소수점 초 없이 UTC로 쓴다
    meta: { engineVersion: ENGINE_VERSION, generatedAt: now.toISOString().replace(/\.\d{3}Z$/, "Z") },
  };
}

export function hasRedFlag(output: EngineOutput): boolean {
  return output.recommendation.hospitalSignal !== null;
}

// MARK: - 결과 화면 표시 범위
//
// ⚠️ CPO 결정 대기(감사 #3): 기록 탭에서 레드플래그가 켜져 있어도 iOS 분석 화면은 "가능" 운동과
// 추천 영상을 그대로 보여준다(분석은 증상을 받지 않아 hospitalSignal이 늘 null). 운동 탭·홈은 멈추는데
// 분석만 권하는 셈이다. 결정 전까지 기본값은 iOS 동작(숨기지 않음)이고, 분석 결과 자체는 바꾸지 않는다.

export interface AnalysisSections {
  allowed: boolean;
  caution: boolean;
  forbidden: boolean;
  /** 영상 영역(목록 또는 "준비 중"·"불러오지 못했어요" 안내) */
  videos: boolean;
}

/**
 * 결과 화면에서 어떤 묶음을 그릴지. 병원 신호가 있으면 가능/주의/금지·영상을 모두 건너뛴다
 * (AnalyzeResultView.swift:26). `suppressExerciseOnRedFlag`가 켜져 있고 최근 기록에 레드플래그가
 * 있으면 "가능"과 영상만 가린다. 항목이 빈 묶음은 화면이 알아서 뺀다(:82).
 */
export function analysisSections(
  output: EngineOutput,
  opts: { activeRedFlag: boolean; suppressExerciseOnRedFlag: boolean },
): AnalysisSections {
  if (hasRedFlag(output)) return { allowed: false, caution: false, forbidden: false, videos: false };
  const suppress = opts.suppressExerciseOnRedFlag && opts.activeRedFlag;
  return { allowed: !suppress, caution: true, forbidden: true, videos: !suppress };
}

// MARK: - 표시용 라벨 (AnalyzeComponents.swift EngineLabel — 코드는 화면에 그대로 내지 않는다)

export function stageLabel(code: StageCode): string {
  switch (code) {
    case "0-2w":
      return "산후 0–2주"; // 원문: AnalyzeComponents.swift:9
    case "3-4w":
      return "산후 3–4주"; // 원문: AnalyzeComponents.swift:10
    case "5-6w":
      return "산후 5–6주"; // 원문: AnalyzeComponents.swift:11
    case "7-12w":
      return "산후 7–12주"; // 원문: AnalyzeComponents.swift:12
    case "13w+":
      return "산후 13주+"; // 원문: AnalyzeComponents.swift:13
  }
}

export type Severity = "immediate" | "urgent";

/**
 * 심각도 코드 → 표시 라벨. 모르는 코드는 null — 화면은 배지를 빼고, 코드를 그대로 내지 않는다
 * (iOS EngineLabel.severity는 `default: return code`였다, AnalyzeComponents.swift:35).
 */
export function severityLabel(code: string): string | null {
  switch (code) {
    case "immediate":
      return "즉시 내원"; // 원문: AnalyzeComponents.swift:33
    case "urgent":
      return "당일 진료"; // 원문: AnalyzeComponents.swift:34
    default:
      return null;
  }
}

export function deliveryLabel(code: DeliveryMethod): string {
  return DELIVERY_TITLE[code];
}

export function docTypeLabel(code: string): string {
  switch (code) {
    case "EMR":
      return "진료기록(EMR)"; // 원문: AnalyzeComponents.swift:24
    case "maternity_handbook":
      return "산모수첩"; // 원문: AnalyzeComponents.swift:25
    case "manual_input":
      return "직접 입력"; // 원문: AnalyzeComponents.swift:26
    default:
      return "확인 불가"; // 원문: AnalyzeComponents.swift:27
  }
}

// MARK: - 결과 화면 문구 (Swift 원문)

export type AnalysisTone = "normal" | "accent" | "alert";

/** 가능 / 주의 / 금지 묶음 제목과 색(stateNormal / accent / stateAlert) — AnalyzeResultView.swift:27-32 */
export const ANALYSIS_GROUPS = [
  { key: "allowed", title: "가능", tone: "normal" }, // 원문: AnalyzeResultView.swift:27
  { key: "caution", title: "주의", tone: "accent" }, // 원문: AnalyzeResultView.swift:29
  { key: "forbidden", title: "금지", tone: "alert" }, // 원문: AnalyzeResultView.swift:31
] as const satisfies readonly { key: "allowed" | "caution" | "forbidden"; title: string; tone: AnalysisTone }[];

export const ANALYSIS_TEXT = {
  // 원문: AnalyzeResultView.swift:62
  profileNote: "오로·발열·통증 등 당일 증상은 '기록' 탭에서 확인해요. 이 결과는 입력한 회복 정보에 대한 규칙 안내입니다.",
  videosTitle: "추천 운동 영상", // 원문: AnalyzeResultView.swift:156
  notConfiguredTitle: "운동 영상은 준비 중이에요", // 원문: AnalyzeResultView.swift:129
  notConfiguredBody: "가능/주의/금지 안내는 위에서 확인하실 수 있어요.", // 원문: AnalyzeResultView.swift:129
  failedTitle: "운동 영상을 불러오지 못했어요", // 원문: AnalyzeResultView.swift:131
  failedBody: "네트워크 상태를 확인한 뒤 다시 분석해 주세요. 위 안내는 그대로 유효해요.", // 원문: AnalyzeResultView.swift:131
  done: "완료", // 원문: AnalyzeResultView.swift:193
  restart: "다시 분석하기", // 원문: AnalyzeResultView.swift:194
} as const;

/** 프로필 요약 부제 — "{분만} · 산후 {n}일차" */
export function analysisProfileSubtitle(profile: RecoveryProfile): string {
  return `${deliveryLabel(profile.deliveryMethod)} · 산후 ${profile.podDays}일차`; // 원문: AnalyzeResultView.swift:54
}

/** 추천 영상 한 줄 부제 — matchReason을 " · "로 잇는다(AnalyzeResultView.swift:174) */
export function videoMatchReasonText(video: ExerciseVideo): string {
  return video.matchReason.join(" · ");
}
