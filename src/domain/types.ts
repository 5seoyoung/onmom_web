// 온맘 저장 상태의 도메인 타입 — iOS `Models.swift`·`AppStore.swift`를 옮긴 것.
// 필드명·enum 값은 iOS와 같게 둔다(04_DATA_MODEL). 달라진 점은 날짜 표기뿐이다:
//   - 달력 날짜(출산일·복직일)는 "YYYY-MM-DD" 로컬 날짜 문자열
//   - 시각(기록 시각 등)은 ISO 8601 문자열
// iOS JSON은 날짜를 2001-01-01 기준 초(Double)로 저장했으므로, 읽을 때 숫자도 받아들인다(store/decode).

/**
 * 분만 방식 — 값과 순서는 Swift DeliveryMethod.allCases(Models.swift:6-29). 이 배열 하나를
 * 선택지(rules/exercise.ts DELIVERY_OPTIONS — 온보딩·분석·프로필 편집)와 저장 읽기(store/decode.ts)가 같이 쓴다.
 */
export const DELIVERY_METHODS = ["vaginal", "cesarean"] as const;
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];
/**
 * 회복 목표 — 값과 순서는 Swift RecoveryGoal.allCases(Models.swift:32-48). 이 배열 하나를
 * 온보딩 선택지(onboardingModel.ts GOAL_OPTIONS)·프로필 편집 선택지·저장 읽기(store/decode.ts)가 같이 쓴다.
 */
export const RECOVERY_GOALS = ["homemaker", "returningToWork"] as const;
export type RecoveryGoal = (typeof RECOVERY_GOALS)[number];
export type MetricStatus = "normal" | "watch" | "alert";
export type MoodAnswer = "yes" | "unsure" | "no";

/** "YYYY-MM-DD" — 사용자 로컬 달력 날짜 */
export type LocalDateString = string;
/** ISO 8601 datetime */
export type IsoDateTimeString = string;

export interface UserProfile {
  /** 출산일 — 앱의 기준점. 온보딩 전에는 null(iOS는 오늘로 두고 숨겼다). */
  deliveryDate: LocalDateString | null;
  deliveryMethod: DeliveryMethod | null;
  goal: RecoveryGoal | null;
  returnToWorkDate: LocalDateString | null;
  isBreastfeeding: boolean; // 기본 true
  consentAccepted: boolean; // 기본 false
  /**
   * 동의한 동의 문구의 판(src/domain/consent.ts CURRENT_CONSENT_VERSION). 동의 전·예전 판·서버 저장이 없던 빌드의 동의는 null.
   * 서버로 올리는 것은 이 값이 지금 판일 때만(hasCurrentConsent).
   */
  consentVersion: string | null;
  /** 그 동의를 받은 시각 — 동의 전이면 null */
  consentAcceptedAt: IsoDateTimeString | null;
  /** 체중 관리(선택) — 0이면 미입력 */
  heightCm: number;
  currentWeightKg: number;
  prePregnancyWeightKg: number;
  /** 내 동네(자유 입력) — 가까운 산부인과 연계용 */
  neighborhood: string;
}

/** 산모수첩·EMR 확인 항목 7개. isPrimiparous만 기본 true(AppStore.swift:207). */
export interface MaternityRecord {
  isPrimiparous: boolean;
  gdm: boolean;
  anemia: boolean;
  heavyBleeding: boolean;
  preeclampsia: boolean;
  pelvicPain: boolean;
  diastasisRecti: boolean;
}

/**
 * 기록 탭 "위험 증상" 카드의 토글 — 필드명은 rules/redflag SymptomInput과 같다(화면 순서·라벨은 features/record RISK_TOGGLES).
 * 앞 넷은 iOS SymptomInput에 있던 것(RedFlagEngine.swift:18-21), 다음 여섯은 rules-1.2에 더한 신호(임상 사전 검토 §3 T1~T5·T11),
 * 끝 넷은 rules-1.3에 더한 신호(임상 자체 검토 2026-11 §2 T7·T12·T13·T15 — 오로 냄새·심한 구토·유방 붉음 하루 넘게·갑자기 몹시 지침).
 * rules-1.3에서 앞 넷 중 woundPainWorsening(상처 감염 신호까지)·calfPainSwelling(다리·팔)·chestPainBreathing(빠른 심장박동까지)은 뜻이 넓어졌다 —
 * 칸 이름은 그대로 두고 기록의 rulesVersion으로 가린다.
 * rules-1.2부터 판정에 쓴 값을 기록에도 남긴다(임상 사전 검토 R-STORE·§3-3, DEV_NOTES §3 CPO 3) — 최근 기록·PDF 리포트에서
 * 어떤 신호였는지 되짚을 수 있게. rules-1.3 전 기록에는 끝 넷의 칸이 없다(묻지 않은 것).
 */
export const RISK_SYMPTOM_KEYS = [
  "woundPainWorsening",
  "dizzinessFainting",
  "chestPainBreathing",
  "calfPainSwelling",
  "bleedingHeavy",
  "headacheVision",
  "faceHandSwelling",
  "upperBellyPain",
  "seizure",
  "harmThoughts",
  "lochiaOdor",
  "severeVomiting",
  "breastRedSwollen",
  "extremeTiredness",
] as const;
export type RiskSymptomKey = (typeof RISK_SYMPTOM_KEYS)[number];

/**
 * 기록에 남긴 위험 증상 토글. 칸이 없으면(rules-1.2 전의 웹 기록·iOS 기록) 묻지 않았거나 모르는 것 — false(물었고 아니었다)와 구분한다.
 * 저장소에서 읽을 때는 true/false만 남기고 나머지는 칸을 비운다(store/decode). null은 옛 화면 코드와의 호환으로만 받는다.
 */
export type RiskSymptomFlags = { [K in RiskSymptomKey]?: boolean | null };

/**
 * 위험 증상 토글 칸만 — true/false인 칸만 옮기고, 없거나 다른 값(null 포함)이면 칸을 비운다(묻지 않은 것 — false로 지어내지 않는다).
 * 그래서 옛 기록은 읽고 다시 써도 모양이 그대로다. 저장소 읽기(store/decode)·새 기록(appStore.addSymptomRecord)·동기화 합치기
 * (store/sync/merge)가 같은 규칙을 쓴다.
 */
export function pickRiskFlags(raw: object): RiskSymptomFlags {
  const fields = raw as Readonly<Record<string, unknown>>;
  const out: RiskSymptomFlags = {};
  for (const key of RISK_SYMPTOM_KEYS) {
    const v = fields[key];
    if (typeof v === "boolean") out[key] = v;
  }
  return out;
}

export interface SymptomRecord extends RiskSymptomFlags {
  id: string;
  date: IsoDateTimeString;
  lochiaIncreased: boolean;
  lochiaRed: boolean;
  feverEvent: boolean;
  painNrs: number; // 0..10
  /** 검출된 레드플래그 코드 — 없으면 null */
  redFlagCode: string | null;
  /** 기록 시점의 산후 경과일. 구버전 기록에는 없어서 null이면 오로 판정 보류. */
  postpartumDays: number | null;
  /**
   * 이 기록의 결과(redFlagCode)를 낸 안내 규칙의 버전(src/rules/version.ts RULES_VERSION) — 만들 때 찍는다(감사 추적).
   * 이 칸이 생기기 전의 웹 기록·iOS 기록에는 없어서 null(지어내지 않는다).
   * 기록을 고치면 고친 답으로 지금 규칙을 다시 돌려 redFlagCode와 함께 이 값도 그때의 버전으로 바뀐다(rules/record rebuildSymptomRecord).
   */
  rulesVersion: string | null;
  /** 고친 시각 — 고친 적이 없으면 칸이 없다(EditStamp). */
  updatedAt?: IsoDateTimeString;
}

export interface MoodCheckRecord {
  id: string;
  date: IsoDateTimeString;
  questionID: number;
  answer: MoodAnswer;
  /**
   * 답할 때의 기분 문항·기준 버전(src/rules/version.ts MOOD_VERSION) — 같은 questionID라도 버전마다 문항이 다를 수 있다.
   * 이 칸이 생기기 전의 웹 기록·iOS 기록에는 없어서 null. 답을 고쳐도 문항은 그대로라 이 값도 그대로다.
   */
  moodVersion: string | null;
  /** 답을 고친 시각 — 고친 적이 없으면 칸이 없다(EditStamp). */
  updatedAt?: IsoDateTimeString;
}

export interface CommunityComment {
  id: string;
  text: string;
  authorName: string;
  date: IsoDateTimeString;
}

/** 기록장 글 — 개인 메모(공유 게시판 아님) */
export interface CommunityPost {
  id: string;
  title: string;
  body: string;
  authorName: string;
  date: IsoDateTimeString;
  comments: CommunityComment[]; // 오래된 순 append
  /** 제목·본문을 고친 시각 — 고친 적이 없으면 칸이 없다(EditStamp). 댓글은 고치지 않는다(지우기만). */
  updatedAt?: IsoDateTimeString;
}

/**
 * 고친 기록의 표시 — 증상 기록·기분 답·기록장 글의 updatedAt. 같은 id가 두 곳(다른 탭·서버)에 있으면 이 시각이 늦은 쪽이 이긴다
 * (칸이 없으면 고치기 전 — 고친 쪽이 이긴다. 같으면 지금까지처럼 서버 쪽, store/sync/merge.ts). 기록이 처음 생긴 시각(date)은 바꾸지 않는다 —
 * 순서·통계(관리자 집계 0011)는 date를 본다.
 */
export type EditStamp = Pick<SymptomRecord, "updatedAt">;

/**
 * 삭제 표시(tombstone) — 지운 기록의 id와 지운 시각만 둔다. 건강 기록의 내용은 남기지 않는다.
 * 여러 탭·서버 합치기는 기록을 id로 합집합하므로(store/sync/merge.ts), 지운 기록이 다른 쪽 사본에서 되살아나지 않게 이 표시로 막는다 —
 * 표시가 있는 id는 어느 쪽에 있든 버린다(지우기가 고치기보다 이긴다).
 */
export interface Tombstone {
  id: string;
  deletedAt: IsoDateTimeString;
}

/** 목록별 삭제 표시 — 칸 이름은 지운 기록이 있던 목록(댓글은 글 안에 있어 따로 둔다). 목록마다 최근 TOMBSTONE_LIMIT개까지. */
export interface DeletedEntries {
  symptomHistory: Tombstone[];
  moodChecks: Tombstone[];
  communityPosts: Tombstone[];
  comments: Tombstone[];
}

export const DELETED_LISTS = ["symptomHistory", "moodChecks", "communityPosts", "comments"] as const satisfies readonly (keyof DeletedEntries)[];

/** 저장 루트 — iOS `AppStore.Persisted` */
export interface PersistedState {
  hasOnboarded: boolean;
  profile: UserProfile;
  symptomHistory: SymptomRecord[]; // 최신순, 최대 50
  communityPosts: CommunityPost[]; // 최신순
  maternity: MaternityRecord;
  /** 이 데이터의 주인 계정 id — 게스트는 "guest-…", 카카오는 "kakao-…" */
  ownerAccountID: string | null;
  moodChecks: MoodCheckRecord[]; // 최신순, 최대 60
  moodCardSnoozedUntil: IsoDateTimeString | null;
  /** 지운 기록의 삭제 표시(id·시각만) — 위 목록에는 지운 기록이 없다(store/tombstones applyDeleted). 웹 전용(iOS에 없음). */
  deleted: DeletedEntries;
}

export const SYMPTOM_HISTORY_LIMIT = 50;
export const MOOD_CHECKS_LIMIT = 60;
/**
 * 목록마다 남기는 삭제 표시 수 — 지운 시각이 최근인 것부터. 표시 하나는 70바이트쯤이라 네 목록을 다 채워도 60KB 안쪽이다(서버 상한 1MB, 0007).
 * 이보다 오래된 표시는 버린다 — 그만큼 오래 합치지 않은 사본(오래 꺼 둔 기기)이 있으면 그 기록이 다시 보일 수 있다.
 */
export const TOMBSTONE_LIMIT = 200;
