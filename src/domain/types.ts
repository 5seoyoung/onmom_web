// 온맘 저장 상태의 도메인 타입 — iOS `Models.swift`·`AppStore.swift`를 옮긴 것.
// 필드명·enum 값은 iOS와 같게 둔다(04_DATA_MODEL). 달라진 점은 날짜 표기뿐이다:
//   - 달력 날짜(출산일·복직일)는 "YYYY-MM-DD" 로컬 날짜 문자열
//   - 시각(기록 시각 등)은 ISO 8601 문자열
// iOS JSON은 날짜를 2001-01-01 기준 초(Double)로 저장했으므로, 읽을 때 숫자도 받아들인다(store/decode).

export type DeliveryMethod = "vaginal" | "cesarean";
export type RecoveryGoal = "homemaker" | "returningToWork";
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

export interface SymptomRecord {
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
}

export interface MoodCheckRecord {
  id: string;
  date: IsoDateTimeString;
  questionID: number;
  answer: MoodAnswer;
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
}

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
}

export const SYMPTOM_HISTORY_LIMIT = 50;
export const MOOD_CHECKS_LIMIT = 60;
