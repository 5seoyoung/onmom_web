// 운동 탭 임상 규칙 — iOS `ExerciseRules.swift`를 옮긴 것. 앱이 소유한다.
//
// Video DB는 태그 필터일 뿐이고, "언제 무엇이 열리는가"는 여기서 결정한다(02 §3).
// 유일한 분만형태 분기점은 functional_strengthening(자연분만 6주 / 제왕절개 8주)이다.
//
// 단계 버킷·금기 사유 문구는 content.json(stage_buckets, blocked_rules)에서 읽고,
// 화면 문구는 Swift 원문을 그대로 옮겨 `// 원문:` 위치를 붙였다.
// 순수 함수만 둔다 — 네트워크·현재 시각은 호출하는 쪽이 넘긴다.

import content from "@/content";
import type { DeliveryMethod, MaternityRecord } from "@/domain/types";

// MARK: - 단계 버킷

export interface StageBucket {
  key: string;
  order: number;
  startWeekCesarean: number;
  startWeekVaginal: number;
  title: string;
  summary: string;
}

export const STAGE_BUCKETS: readonly StageBucket[] = content.stage_buckets.map((b) => ({
  key: b.key,
  order: b.order,
  startWeekCesarean: b.start_week_cesarean,
  startWeekVaginal: b.start_week_vaginal,
  title: b.title,
  summary: b.summary,
}));

const BUCKET_BY_KEY = new Map(STAGE_BUCKETS.map((b) => [b.key, b]));

export function bucketByKey(key: string): StageBucket | null {
  return BUCKET_BY_KEY.get(key) ?? null;
}

/** 분만 방식별로 이 단계가 열리는 주차 */
export function startWeek(bucket: StageBucket, delivery: DeliveryMethod): number {
  return delivery === "cesarean" ? bucket.startWeekCesarean : bucket.startWeekVaginal;
}

/** 분만 방식 → Video DB route 태그(include 필터). 문서의 `route_{delivery}` 템플릿은 틀렸다(감사 #11). */
export function routeTag(delivery: DeliveryMethod): string {
  return delivery === "cesarean" ? "route_cesarean_section" : "route_vaginal_delivery";
}

/** 라우트 전체 영상을 한 번에 받는다 — ExerciseRules.swift:134 `limit: 500` */
export const VIDEO_QUERY_LIMIT = 500;

/**
 * 영상 태그에서 단계 버킷을 역추적한다. 첫 번째 `stage_` 태그만 본다 —
 * 그 태그가 모르는 단계면 뒤에 다른 `stage_` 태그가 있어도 버킷 없음(Swift와 같음).
 */
export function bucketForTags(tags: readonly string[]): StageBucket | null {
  const stageTag = tags.find((t) => t.startsWith("stage_"));
  if (stageTag === undefined) return null;
  return bucketByKey(stageTag.slice("stage_".length));
}

// MARK: - 산모수첩 확인 항목에 따른 단계 차단
//
// 주차가 됐어도 산모가 입력한 임상 소견 중 일부는 특정 동작을 막는다.
// 새로 만든 임상 기준이 아니라 MaternityRecord 필드 주석과 앱의 주의 문구에서 "배제·차단"이라고
// 단언한 항목만 옮긴 것이다(빈혈·출혈 과다·임신성 당뇨는 차단하지 않고 주의만).
// ⚠️ 임상 자문으로 확정해야 하는 config — 바꾸면 RULES_VERSION을 함께 올린다.

/** 차단된 단계 key → 사용자에게 보여줄 사유 */
export type BlockedBuckets = Partial<Record<string, string>>;

function blockedRule(condition: string) {
  const rule = content.blocked_rules.find((r) => r.if === condition);
  if (!rule) throw new Error(`content.blocked_rules에 '${condition}' 규칙이 없습니다`);
  if (!BUCKET_BY_KEY.has(rule.blocks)) throw new Error(`blocked_rules '${condition}'의 단계 '${rule.blocks}'를 모릅니다`);
  return rule;
}

const DRA_RULE = blockedRule("maternity.diastasisRecti");
const PREECLAMPSIA_RULE = blockedRule("maternity.preeclampsia");
const PELVIC_PAIN_RULE = blockedRule("maternity.pelvicPain");
const PREECLAMPSIA_APPEND = (() => {
  const s = PREECLAMPSIA_RULE.if_also_dra_append;
  if (typeof s !== "string") throw new Error("blocked_rules 'maternity.preeclampsia'에 if_also_dra_append가 없습니다");
  return s;
})();

export function blockedBuckets(m: MaternityRecord): BlockedBuckets {
  const blocked: Record<string, string> = {};
  // 복직근 이개 — 윗몸일으키기·레그레이즈 등 복압 상승 동작 배제
  if (m.diastasisRecti) {
    blocked[DRA_RULE.blocks] = DRA_RULE.reason;
  }
  // 임신중독증·고혈압 — 머리 내려가는 자세·발살바 차단. DRA로 이미 막혔으면 사유를 이어 붙인다.
  if (m.preeclampsia) {
    const prev = blocked[PREECLAMPSIA_RULE.blocks];
    blocked[PREECLAMPSIA_RULE.blocks] = prev !== undefined ? prev + PREECLAMPSIA_APPEND : PREECLAMPSIA_RULE.reason;
  }
  // 골반통·치골결합 이개 — 비대칭·한다리·와이드 동작 배제
  if (m.pelvicPain) {
    blocked[PELVIC_PAIN_RULE.blocks] = PELVIC_PAIN_RULE.reason;
  }
  return blocked;
}

// MARK: - 영상 플랜

/** Video DB 영상 한 건 — GET /videos 응답의 videos[] (02 §3) */
export interface Video {
  video_id: string;
  title: string;
  url: string;
  description: string;
  tags: string[];
}

export interface PlanVideo {
  video: Video;
  bucket: StageBucket;
  /** 주차가 됐는가 — blockedReason이 있으면 그래도 잠긴다. 화면은 `unlocked`를 볼 것. */
  weekReached: boolean;
  /** 이 단계가 열리는 주차(분만 방식 기준) */
  unlockWeek: number;
  /** 산모수첩 확인 항목 때문에 막힌 사유. null이면 임상 차단 없음. */
  blockedReason: string | null;
  /** 지금 할 수 있는가 — 주차도 됐고 임상 차단도 없어야 한다. */
  unlocked: boolean;
}

/**
 * 라우트 전체 영상에 주차 게이팅 + 임상 차단을 적용하고 단계순(같으면 video_id순)으로 정렬한다.
 * 단계를 알 수 없는 영상은 뺀다. 영상 선별·순서·잠금은 전부 여기서 정한다(서버는 태그 필터일 뿐).
 */
export function exercisePlan(
  videos: readonly Video[],
  delivery: DeliveryMethod,
  week: number,
  maternity: MaternityRecord,
): PlanVideo[] {
  const blocked = blockedBuckets(maternity);
  const plan: PlanVideo[] = [];
  for (const video of videos) {
    const bucket = bucketForTags(video.tags);
    if (!bucket) continue;
    const start = startWeek(bucket, delivery);
    const weekReached = week >= start;
    const blockedReason = blocked[bucket.key] ?? null;
    plan.push({ video, bucket, weekReached, unlockWeek: start, blockedReason, unlocked: weekReached && blockedReason === null });
  }
  // Swift 튜플 비교 (order, id)와 같게 — id는 로케일이 아닌 코드 단위 순서로 비교한다.
  return plan.sort((a, b) => a.bucket.order - b.bucket.order || compareCodeUnits(a.video.video_id, b.video.video_id));
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// MARK: - 지금 단계 / 다음 단계 / 제외된 단계 (홈 카드·운동 탭 "영상 준비 중")
//
// 주차로 열린 단계 중 산모수첩 소견으로 막힌 단계는 뺀다. 막힌 단계를 "지금 단계"라고 보여주면
// 운동 탭에서는 잠겨 있어 서로 다른 말을 하게 된다(HomeView.swift:404-405).

/** 지금 회복 단계 — 주차가 됐고 차단되지 않은 단계 중 order가 가장 큰 것 */
export function currentStage(delivery: DeliveryMethod, week: number, maternity: MaternityRecord): StageBucket | null {
  const blocked = blockedBuckets(maternity);
  let current: StageBucket | null = null;
  for (const b of STAGE_BUCKETS) {
    if (week >= startWeek(b, delivery) && blocked[b.key] === undefined && (current === null || b.order > current.order)) {
      current = b;
    }
  }
  return current;
}

/**
 * 다음에 열릴 단계 — 아직 주차가 안 됐고 차단되지 않은 단계 중 여는 주차가 가장 이른 것.
 * 여는 주차가 같으면 목록 앞쪽(order가 작은 것)이 이긴다 — Swift `min(by:)`는 더 작은 원소가 나올 때만
 * 바꾸므로 첫 원소가 남는다. 예: 자연분만 2~5주는 골반저근·기능 강화가 모두 6주라 '골반저근'.
 */
export function nextStage(delivery: DeliveryMethod, week: number, maternity: MaternityRecord): StageBucket | null {
  const blocked = blockedBuckets(maternity);
  let next: StageBucket | null = null;
  for (const b of STAGE_BUCKETS) {
    if (week < startWeek(b, delivery) && blocked[b.key] === undefined && (next === null || startWeek(b, delivery) < startWeek(next, delivery))) {
      next = b;
    }
  }
  return next;
}

/** 주차는 됐지만 산모수첩 소견으로 막힌 단계와 사유(단계순) */
export function blockedNow(
  delivery: DeliveryMethod,
  week: number,
  maternity: MaternityRecord,
): { bucket: StageBucket; reason: string }[] {
  const blocked = blockedBuckets(maternity);
  const out: { bucket: StageBucket; reason: string }[] = [];
  for (const b of STAGE_BUCKETS) {
    const reason = blocked[b.key];
    if (week >= startWeek(b, delivery) && reason !== undefined) out.push({ bucket: b, reason });
  }
  return out;
}

// MARK: - 레드플래그

/** 최근 기록(최신순 첫 건)에 레드플래그가 있는가 — ExerciseView.swift:25, HomeView.swift:123. 규칙은 record.ts 한 곳에 둔다. */
export { isRedFlagActive } from "./record";

// MARK: - 화면 문구 (Swift 원문)

export const DELIVERY_TITLE: Readonly<Record<DeliveryMethod, string>> = {
  vaginal: "자연분만", // 원문: Models.swift:13
  cesarean: "제왕절개", // 원문: Models.swift:14
};

export const EXERCISE_TEXT = {
  headerTitle: "오늘의 운동", // 원문: ExerciseView.swift:107
  needsDeliveryTitle: "분만 방식이 필요해요", // 원문: ExerciseView.swift:122
  // 원문: ExerciseView.swift:124
  needsDeliveryBody: "자연분만과 제왕절개는 운동이 열리는 시기가 달라요. 프로필 > 설정 > 프로필 편집에서 분만 방식을 골라주세요.",
  redFlagTitle: "운동 영상 추천을 멈췄어요", // 원문: ExerciseView.swift:137
  // 원문: ExerciseView.swift:140
  redFlagBody: "최근 기록에서 즉시 내원이 필요한 위험 신호가 확인됐어요. 회복을 위해 모든 운동 추천을 일시 중단합니다. 먼저 의료기관에 방문하세요.",
  emptyPlan: "이 단계에 표시할 영상이 없어요.", // 원문: ExerciseView.swift:60
  unlockedSection: "지금 가능한 운동", // 원문: ExerciseView.swift:67
  lockedSectionBlocked: "지금은 권하지 않는 운동", // 원문: ExerciseView.swift:72
  lockedSectionEarly: "아직 이른 운동", // 원문: ExerciseView.swift:72
  unavailableTitle: "영상 준비 중", // 원문: ExerciseView.swift:160
  // 서버 미설정 안내 — VideoDBClient가 던지는 notConfigured 메시지를 그대로 보여준다(ExerciseView.swift:87)
  unavailableBody: "운동 영상 추천은 준비 중이에요. 곧 만나보실 수 있어요.", // 원문: VideoDBClient.swift:39
  failedTitle: "연결 실패", // 원문: ExerciseView.swift:179
  failedServer: "영상을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.", // 원문: VideoDBClient.swift:40
  failedUnreachable: "네트워크에 연결할 수 없어요. 연결 상태를 확인해 주세요.", // 원문: VideoDBClient.swift:41
  failedFallback: "영상을 불러오지 못했어요.", // 원문: ExerciseView.swift:89
  retry: "다시 시도", // 원문: ExerciseView.swift:184
  watchVideo: "영상 보기", // 원문: ExerciseView.swift:239
} as const;

export const HOME_STAGE_TEXT = {
  redFlagTitle: "운동 안내를 멈췄어요", // 원문: HomeView.swift:392
  // 원문: HomeView.swift:394
  redFlagBody: "최근 기록에서 병원 확인이 필요한 신호가 있어요. 먼저 의료진을 만난 뒤 운동을 이어가세요.",
} as const;

/** 운동 탭 헤더 부제 — "산후 n주차 · {분만} 기준" */
export function exerciseHeaderSubtitle(week: number, delivery: DeliveryMethod | null): string {
  return delivery
    ? `산후 ${week}주차 · ${DELIVERY_TITLE[delivery]} 기준` // 원문: ExerciseView.swift:110
    : `산후 ${week}주차`; // 원문: ExerciseView.swift:110
}

/**
 * 운동 탭 본문 분기(ExerciseView.swift:33-39). 분만 방식이 없으면 레드플래그보다 먼저 막는다.
 * - needsDelivery: 분만 방식 입력 유도
 * - redFlag: 운동 영상 추천 전면 중단(영상 조회도 하지 않는다)
 * - plan: 영상 조회 후 플랜 표시
 */
export type ExerciseTabGate = "needsDelivery" | "redFlag" | "plan";

export function exerciseTabGate(delivery: DeliveryMethod | null, activeRedFlag: boolean): ExerciseTabGate {
  if (!delivery) return "needsDelivery";
  if (activeRedFlag) return "redFlag";
  return "plan";
}

/** 상태 색 — 06 토큰 stateNormal / stateWatch / stateAlert */
export type StateTone = "normal" | "watch" | "alert";

/** 영상 카드 배지 — "가능" / "지금은 권장 안 함" / "{n}주에 열림" (ExerciseView.swift:198-214) */
export function videoBadge(item: PlanVideo): { text: string; tone: StateTone } {
  if (item.unlocked) return { text: "가능", tone: "normal" }; // 원문: ExerciseView.swift:212
  if (item.blockedReason !== null) return { text: "지금은 권장 안 함", tone: "alert" }; // 원문: ExerciseView.swift:213
  return { text: `${item.unlockWeek}주에 열림`, tone: "watch" }; // 원문: ExerciseView.swift:214
}

/**
 * 잠긴 카드 본문 — 임상 소견으로 막혔으면 "왜 안 되는지"(stateAlert 색),
 * 아니면 단계 요약(보조 글씨색). ExerciseView.swift:247-251
 */
export function lockedBody(item: PlanVideo): { text: string; tone: "alert" | "secondary" } {
  return item.blockedReason !== null
    ? { text: item.blockedReason, tone: "alert" }
    : { text: item.bucket.summary, tone: "secondary" };
}

/** 잠긴 묶음 제목 — 하나라도 임상 차단이면 "지금은 권하지 않는 운동", 아니면 "아직 이른 운동" */
export function lockedSectionTitle(locked: readonly PlanVideo[]): string {
  return locked.some((p) => p.blockedReason !== null) ? EXERCISE_TEXT.lockedSectionBlocked : EXERCISE_TEXT.lockedSectionEarly;
}

export interface PlanSection {
  title: string;
  items: PlanVideo[];
}

/** 운동 탭 목록 — 가능한 운동, 잠긴 운동 순. 빈 묶음은 뺀다(ExerciseView.swift:64-74). */
export function planSections(plan: readonly PlanVideo[]): PlanSection[] {
  const unlocked = plan.filter((p) => p.unlocked);
  const locked = plan.filter((p) => !p.unlocked);
  const sections: PlanSection[] = [];
  if (unlocked.length > 0) sections.push({ title: EXERCISE_TEXT.unlockedSection, items: unlocked });
  if (locked.length > 0) sections.push({ title: lockedSectionTitle(locked), items: locked });
  return sections;
}

/**
 * "영상 준비 중" 카드의 현재 단계 줄. iOS unavailableBlock은 차단을 빼지 않아
 * 막힌 단계를 "지금 단계"로 보여줬다(감사 #4) — 웹은 홈과 같은 currentStage를 쓴다.
 */
export function unavailableStage(
  delivery: DeliveryMethod,
  week: number,
  maternity: MaternityRecord,
): { line: string; summary: string } | null {
  const current = currentStage(delivery, week, maternity);
  if (!current) return null;
  return {
    line: `지금은 ${week}주차 · ${current.title} 단계예요`, // 원문: ExerciseView.swift:166
    summary: current.summary,
  };
}

export type HomeStageCard =
  | { kind: "redFlag"; title: string; body: string }
  | {
      kind: "stage";
      /** "지금 회복 단계 — n주차" */
      heading: string;
      /** "{단계} · {요약}" */
      current: string;
      /** "{n}주차부터 '{단계}' 단계가 열려요." — 다음 단계가 없으면 null */
      next: string | null;
      /** "{단계} 제외 — {사유}" (stateWatch 색) */
      excluded: string[];
    };

/**
 * 홈 "지금 회복 단계" 카드(HomeView.swift:384-438). 레드플래그면 운동 안내를 멈춘다는 카드로 대체,
 * 분만 방식이 없거나 현재 단계가 없으면 카드를 그리지 않는다(null).
 */
export function homeStageCard(
  delivery: DeliveryMethod | null,
  week: number,
  maternity: MaternityRecord,
  activeRedFlag: boolean,
): HomeStageCard | null {
  if (activeRedFlag) return { kind: "redFlag", title: HOME_STAGE_TEXT.redFlagTitle, body: HOME_STAGE_TEXT.redFlagBody };
  if (!delivery) return null;
  const current = currentStage(delivery, week, maternity);
  if (!current) return null;
  const next = nextStage(delivery, week, maternity);
  return {
    kind: "stage",
    heading: `지금 회복 단계 — ${week}주차`, // 원문: HomeView.swift:415
    current: `${current.title} · ${current.summary}`, // 원문: HomeView.swift:418
    next: next ? `${startWeek(next, delivery)}주차부터 '${next.title}' 단계가 열려요.` : null, // 원문: HomeView.swift:423
    excluded: blockedNow(delivery, week, maternity).map(({ bucket, reason }) => `${bucket.title} 제외 — ${reason}`), // 원문: HomeView.swift:428
  };
}
