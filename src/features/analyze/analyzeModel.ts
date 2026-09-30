// 회복 단계 분석 화면 모델 — iOS AnalyzeFlowView.swift(폼 → 로딩 → 결과) · AnalyzeResultView.swift.
// 판정은 rules/recovery(runRecoveryAnalysis)가 하고, 여기서는 폼 값 ↔ 저장 값, 결과 화면에 무엇을 그릴지만 정한다.

import type { FetchVideosResult } from "@/api/video";
import { safeExternalUrl } from "@/api/safeUrl";
import { parseLocalDate, toLocalDateString } from "@/domain/date";
import type { DeliveryMethod, LocalDateString, MaternityRecord, UserProfile } from "@/domain/types";
import { OFFLINE_TEXT } from "@/features/home/useOnline";
import { HOME_STAGE_TEXT } from "@/rules/exercise";
import {
  ANALYSIS_GROUPS,
  ANALYSIS_TEXT,
  analysisProfileSubtitle,
  analysisSections,
  docTypeLabel,
  stageLabel,
  videoMatchReasonText,
  type AnalysisTone,
  type EngineOutput,
  type HospitalSignal,
  type RecItem,
  type VideoFetchResult,
} from "@/rules/recovery";

// MARK: - 화면 문구 (Swift 원문)

export const ANALYZE_TEXT = {
  title: "회복 단계 분석", // 원문: AnalyzeFlowView.swift:69
  // 원문: AnalyzeFlowView.swift:72
  intro: "산모수첩·진료기록을 보면서 아래 정보를 확인해주세요. 입력한 내용만으로 지금 가능한 운동과 피해야 할 동작을 정리해드려요.",
  deliverySection: "분만 방식", // 원문: AnalyzeFlowView.swift:80
  deliveryDate: "출산일", // 원문: AnalyzeFlowView.swift:91
  historySection: "임신·분만 이력 (산모수첩·EMR)", // 원문: AnalyzeFlowView.swift:100
  weightSection: "체중 (선택 — 체중 관리·강도 조절)", // 원문: AnalyzeFlowView.swift:113
  height: "키(cm)", // 원문: AnalyzeFlowView.swift:114
  preWeight: "임신 전 체중(kg)", // 원문: AnalyzeFlowView.swift:115
  currentWeight: "현재 체중(kg)", // 원문: AnalyzeFlowView.swift:116
  // 원문: AnalyzeFlowView.swift:120
  lochiaNote: "오로(양·색) 변화는 매일 '기록' 탭에서 확인해요. 붉은 오로 재발·양 증가 시 운동을 낮추도록 안내됩니다.",
  start: "분석 시작", // 원문: AnalyzeFlowView.swift:124
  loadingTitle: "입력한 정보로 회복 단계를 분석하고 있어요", // 원문: AnalyzeFlowView.swift:240
  loadingBody: "입력한 정보를 회복 단계 기준과 대조해 가능/주의/금지를 정리해요.", // 원문: AnalyzeFlowView.swift:243
  errorTitle: "분석을 마치지 못했어요", // 원문: AnalyzeFlowView.swift:56
  // 원문: AnalyzeFlowView.swift:215 — iOS는 분석이 nil로 끝나면 늘 이 문구를 띄운다. 웹도 출산일이 없는 경우까지 같은 문구를 쓴다
  // ([분석 시작]은 올바른 출산일이 있어야 켜지고 저장된 출산일은 지워지지 않아 실제로는 닿지 않는 방어 분기다).
  errorNoDelivery: "분만 방식을 먼저 선택해주세요.",
} as const;

/** 임신·분만 이력 토글 7개 — 순서·문구 원문: AnalyzeFlowView.swift:101-107 */
export const CLINICAL_TOGGLES: readonly { key: keyof MaternityRecord; title: string; subtitle: string }[] = [
  { key: "isPrimiparous", title: "첫 출산(초산)", subtitle: "초산 여부에 따라 안내가 달라져요" },
  { key: "gdm", title: "임신성 당뇨(GDM)", subtitle: "회복 후 유산소 강도를 단계적으로 높여요" },
  { key: "preeclampsia", title: "임신중독증(자간전증)·고혈압", subtitle: "머리 내려가는 자세·힘주기(발살바) 운동 제한" },
  { key: "heavyBleeding", title: "분만 시 출혈이 많았어요", subtitle: "초기 운동 강도를 제한해요" },
  { key: "anemia", title: "산후 빈혈(Hb 12 미만)", subtitle: "어지럼·낙상 위험 — 앉거나 누워서 위주" },
  { key: "pelvicPain", title: "골반통·치골결합 통증", subtitle: "비대칭·한다리·다리 벌리는 동작 배제" },
  { key: "diastasisRecti", title: "복직근 이개(DRA)", subtitle: "윗몸일으키기·레그레이즈 등 복압 올리는 동작 배제" },
];

// MARK: - 폼

export interface AnalyzeFormValues {
  deliveryMethod: DeliveryMethod | null;
  /** "YYYY-MM-DD" — 비어 있으면 "" (출산일을 지어내지 않는다: iOS는 오늘로 채웠지만 웹 프로필은 null일 수 있다) */
  deliveryDate: string;
  /** 0 = 미입력 */
  heightCm: number;
  prePregnancyWeightKg: number;
  currentWeightKg: number;
  maternity: MaternityRecord;
}

/** 폼을 저장된 프로필·산모수첩 값으로 채운다(AnalyzeFlowView.swift:177-190 prefillForm). */
export function formValuesFromSaved(profile: UserProfile, maternity: MaternityRecord): AnalyzeFormValues {
  return {
    deliveryMethod: profile.deliveryMethod,
    deliveryDate: profile.deliveryDate ?? "",
    heightCm: profile.heightCm,
    prePregnancyWeightKg: profile.prePregnancyWeightKg,
    currentWeightKg: profile.currentWeightKg,
    maternity: { ...maternity },
  };
}

/** 날짜 입력의 max — 오늘(로컬 달력). iOS DatePicker `in: ...Date()` */
export function todayInputValue(now: Date): LocalDateString {
  return toLocalDateString(now);
}

/** 출산일 — 올바른 달력 날짜이고 오늘 이전(오늘 포함)이어야 한다. 키보드로 미래 날짜를 넣을 수 있어 max만 믿지 않는다. */
export function isValidDeliveryDate(value: string, now: Date): boolean {
  const d = parseLocalDate(value);
  if (d === null) return false;
  return value <= toLocalDateString(now);
}

/** [분석 시작] 활성 — iOS는 분만 방식만 봤다(:124). 웹은 출산일도 필수(D10: 비어 있을 수 있어서). */
export function canStartAnalysis(values: AnalyzeFormValues, now: Date): boolean {
  return values.deliveryMethod !== null && isValidDeliveryDate(values.deliveryDate, now);
}

/** 저장할 프로필 값 — 분만 방식·출산일·키·체중(AnalyzeFlowView.swift:194-198). 분만 방식이 없으면 싣지 않는다(iOS `if let`). */
export function profilePatchFromForm(values: AnalyzeFormValues): Partial<UserProfile> {
  const patch: Partial<UserProfile> = {
    heightCm: values.heightCm,
    prePregnancyWeightKg: values.prePregnancyWeightKg,
    currentWeightKg: values.currentWeightKg,
  };
  if (values.deliveryMethod !== null) patch.deliveryMethod = values.deliveryMethod;
  if (values.deliveryDate !== "") patch.deliveryDate = values.deliveryDate;
  return patch;
}

/** 저장할 산모수첩 7항목(AnalyzeFlowView.swift:199-205) */
export function maternityPatchFromForm(values: AnalyzeFormValues): MaternityRecord {
  return { ...values.maternity };
}

/**
 * 단계 영역의 React key — 단계가 바뀌면(폼은 다시 채울 때마다) 영역을 새로 만들어 초점이 실제로 옮겨가게 한다.
 * 같은 요소에 focus()를 다시 부르면 초점 이벤트가 없어 스크린리더가 결과가 떴다는 걸 알리지 않는다.
 */
export function analyzePhaseKey(phase: { kind: "form"; formKey: number } | { kind: "loading" } | { kind: "result" }): string {
  return phase.kind === "form" ? `form-${phase.formKey}` : phase.kind;
}

/** fetchVideos 결과 → 분석 입력(docs/DEV_NOTES.md §4). 예외로 끝난 조회는 "failed"로 본다. */
export function videoFetchResultFrom(res: FetchVideosResult): VideoFetchResult {
  if (res.ok) return { state: "ok", videos: res.videos };
  return res.kind === "notConfigured" ? { state: "notConfigured" } : { state: "failed" };
}

// MARK: - 결과 화면

export interface RecGroupModel {
  key: "allowed" | "caution" | "forbidden";
  title: string;
  tone: AnalysisTone;
  items: RecItem[];
}

export type ResultBlock =
  | { kind: "group"; group: RecGroupModel }
  /** 레드플래그 중 '가능' 자리에 대신 그리는 안내(D1) — 홈 "운동 안내를 멈췄어요" 카드 문구(HomeView.swift:392-394) */
  | { kind: "exerciseStopped"; title: string; body: string };

export type ResultVideos =
  | { kind: "info"; title: string; body: string }
  | { kind: "list"; title: string; videos: { id: string; title: string; reason: string; href: string | null }[] };

export interface AnalyzeResultModel {
  hospitalSignal: HospitalSignal | null;
  profile: { stage: string; subtitle: string; source: string; note: string };
  /** 가능/주의/금지 순. 항목이 빈 묶음은 뺀다(AnalyzeResultView.swift:82). */
  blocks: ResultBlock[];
  /** 영상 영역 — null이면 그리지 않는다(병원 신호·레드플래그 중, 또는 조회는 됐지만 지금 볼 영상이 없음) */
  videos: ResultVideos | null;
  done: string;
  restart: string;
}

/**
 * 결과 화면 모델. 최근 기록에 레드플래그가 있으면 '가능'과 영상을 숨기고(D1 — analysisSections의
 * suppressExerciseOnRedFlag), '가능' 자리에 홈과 같은 "운동 안내를 멈췄어요" 안내를 둔다. 주의·금지는 그대로 보인다.
 */
export function analyzeResultModel(output: EngineOutput, activeRedFlag: boolean, ctx: { offline?: boolean } = {}): AnalyzeResultModel {
  const show = analysisSections(output, { activeRedFlag, suppressExerciseOnRedFlag: true });
  const rec = output.recommendation;
  const blocks: ResultBlock[] = [];
  for (const g of ANALYSIS_GROUPS) {
    // 병원 신호가 없는데 '가능'이 가려졌다 = 최근 기록의 레드플래그 때문(suppressExerciseOnRedFlag)
    if (g.key === "allowed" && !show.allowed && rec.hospitalSignal === null) {
      blocks.push({ kind: "exerciseStopped", title: HOME_STAGE_TEXT.redFlagTitle, body: HOME_STAGE_TEXT.redFlagBody });
      continue;
    }
    if (!show[g.key]) continue;
    const items = rec[g.key];
    if (items.length === 0) continue;
    blocks.push({ kind: "group", group: { key: g.key, title: g.title, tone: g.tone, items } });
  }

  let videos: ResultVideos | null = null;
  if (show.videos) {
    if (output.videoFetch === "notConfigured") {
      videos = { kind: "info", title: ANALYSIS_TEXT.notConfiguredTitle, body: ANALYSIS_TEXT.notConfiguredBody };
    } else if (output.videoFetch === "failed") {
      // 오프라인이면 "네트워크 상태를 확인한 뒤…" 대신 오프라인 안내(제목은 그대로) — 가능/주의/금지 안내는 그대로 유효하다
      videos = { kind: "info", title: ANALYSIS_TEXT.failedTitle, body: ctx.offline ? OFFLINE_TEXT : ANALYSIS_TEXT.failedBody };
    } else if (output.exerciseVideos.length > 0) {
      videos = {
        kind: "list",
        title: ANALYSIS_TEXT.videosTitle,
        videos: output.exerciseVideos.map((v) => ({
          id: v.id,
          title: v.title,
          reason: videoMatchReasonText(v),
          href: safeExternalUrl(v.url),
        })),
      };
    }
  }

  return {
    hospitalSignal: rec.hospitalSignal,
    profile: {
      stage: stageLabel(output.profile.stage),
      subtitle: analysisProfileSubtitle(output.profile),
      source: docTypeLabel(output.profile.sourceDocType),
      note: ANALYSIS_TEXT.profileNote,
    },
    blocks,
    videos,
    done: ANALYSIS_TEXT.done,
    restart: ANALYSIS_TEXT.restart,
  };
}

/**
 * PC(lg) 두 열 배치 — 가능/주의/금지 묶음을 순서를 지킨 채 왼쪽·오른쪽 두 묶음으로 나눈다.
 * 격자 행으로 두면 짧은 카드 옆에 큰 빈칸이 생겨, 열마다 세로로 쌓고 높이(제목 1 + 항목 수)가 비슷해지는 자리에서 자른다.
 * DOM 순서는 왼쪽 → 오른쪽 그대로라 읽는 순서·Tab 순서가 iOS와 같다. 폰은 이 나눔과 관계없이 세로 한 줄이다.
 * 묶음이 하나면 오른쪽은 비어 있다(한 열).
 */
export function splitResultBlocks(blocks: readonly ResultBlock[]): { left: ResultBlock[]; right: ResultBlock[] } {
  if (blocks.length < 2) return { left: [...blocks], right: [] };
  const weight = (b: ResultBlock) => (b.kind === "group" ? 1 + b.group.items.length : 1);
  const total = blocks.reduce((sum, b) => sum + weight(b), 0);
  let best = 1;
  let bestMax = Infinity;
  let prefix = 0;
  for (let k = 1; k < blocks.length; k++) {
    prefix += weight(blocks[k - 1]);
    const tallest = Math.max(prefix, total - prefix);
    if (tallest < bestMax) {
      bestMax = tallest;
      best = k;
    }
  }
  return { left: blocks.slice(0, best), right: blocks.slice(best) };
}
