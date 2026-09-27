// 저장 JSON을 관대하게 읽는다 — iOS의 init(from:)들(Models.swift:118-135, AppStore.swift:275-356)을 옮긴 것.
//
// 원칙(04 §4): 절대 throw하지 않는다. 없는 키는 기본값, 모르는 enum 값은 null(기분 답은 "unsure").
// iOS와 다른 점(의도적): iOS는 타입이 틀린 값 하나만 있어도 저장 전체를 버렸다(try? decode).
// 웹은 그 필드(배열이면 그 원소)만 기본값으로 둔다 — 업데이트·손상이 건강 기록 전체를 날리지 않게.
// 예외는 주인 계정 id — 못 읽으면 "알 수 없는 실제 계정"으로 두어 다음 로그인에서 지운다(decodeOwner).
//
// decodeProfile·decodeMaternity는 fallback을 받는다: 저장 JSON을 읽을 때는 기본값,
// action(updateProfile 등)이 쓸 때는 이전 값 — 잘못된 입력 하나가 이미 입력한 값을 기본값으로 지우지 않게.
//
// 날짜(감사 #23): iOS JSONEncoder 기본값(.deferredToDate)은 Date를 2001-01-01 UTC 기준 초(Double)로 저장했다.
// 값이 숫자면 그 기준으로 시각을 만들고, 달력 날짜 필드(출산일·복직일)는 그 시각의 "로컬" 날짜로 바꾼다.
// 문자열은 ISO 8601 시각 또는 "YYYY-MM-DD"를 받는다. 그 밖의 값은 기본값.

import { parseLocalDate, toLocalDateString } from "@/domain/date";
import { normalizeMoodAnswer } from "@/rules/mood";
import type {
  CommunityComment,
  CommunityPost,
  DeliveryMethod,
  IsoDateTimeString,
  LocalDateString,
  MaternityRecord,
  MoodCheckRecord,
  PersistedState,
  RecoveryGoal,
  SymptomRecord,
  UserProfile,
} from "@/domain/types";
import { defaultMaternity, defaultProfile, initialState } from "./defaults";

/** 기록에 id·날짜가 없을 때 채울 값. iOS는 UUID()·Date()를 썼다 — 순수 함수로 두려고 주입받는다. */
export interface DecodeDeps {
  now: Date;
  newId: () => string;
}

/** 2001-01-01T00:00:00Z의 유닉스 초 — Apple 기준 시각(NSDate reference date) */
export const APPLE_REFERENCE_EPOCH_SECONDS = 978_307_200;

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
// 오프셋이 없으면 ECMAScript 규칙대로 로컬 시각으로 읽는다.
const DATE_TIME_RE = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/;

type Json = Record<string, unknown>;

export function isRecord(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);
const num = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const int = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isInteger(v) ? v : fallback);
const str = (v: unknown, fallback: string): string => (typeof v === "string" ? v : fallback);
const nonEmptyString = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

/** 비울 수 있는 필드(iOS Optional) — null은 "비움", 못 읽는 값은 fallback. */
function nullable<T>(v: unknown, decode: (v: unknown) => T | null, fallback: T | null): T | null {
  return v === null ? null : (decode(v) ?? fallback);
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

function validDate(d: Date): Date | null {
  return Number.isNaN(d.getTime()) ? null : d;
}

/** iOS 레거시 숫자 날짜(2001 기준 초) → Date */
export function dateFromAppleSeconds(seconds: number): Date | null {
  if (!Number.isFinite(seconds)) return null;
  return validDate(new Date((seconds + APPLE_REFERENCE_EPOCH_SECONDS) * 1000));
}

/** 저장값 하나를 시각으로 읽는다 — 숫자(iOS 레거시)·ISO 시각·"YYYY-MM-DD"(로컬 자정). 못 읽으면 null. */
function toInstant(v: unknown): Date | null {
  if (typeof v === "number") return dateFromAppleSeconds(v);
  if (typeof v !== "string") return null;
  if (DATE_ONLY_RE.test(v)) return parseLocalDate(v);
  const m = DATE_TIME_RE.exec(v);
  // Date.parse는 2026-02-31을 3월로 넘겨 버리므로 날짜 부분을 따로 검사한다.
  if (!m || !parseLocalDate(m[1])) return null;
  return validDate(new Date(v));
}

/** 시각 필드(기록 시각·스누즈 기한) → ISO 문자열. 못 읽으면 null. */
export function decodeInstant(v: unknown): IsoDateTimeString | null {
  return toInstant(v)?.toISOString() ?? null;
}

/** 달력 날짜 필드(출산일·복직일) → 로컬 "YYYY-MM-DD". 못 읽으면 null. */
export function decodeCalendarDate(v: unknown): LocalDateString | null {
  if (typeof v === "string" && DATE_ONLY_RE.test(v)) return parseLocalDate(v) ? v : null;
  const d = toInstant(v);
  return d ? toLocalDateString(d) : null;
}

const DELIVERY_METHODS: readonly DeliveryMethod[] = ["vaginal", "cesarean"];
const RECOVERY_GOALS: readonly RecoveryGoal[] = ["homemaker", "returningToWork"];

/** 프로필 — 없거나 못 읽는 필드는 fallback(기본: 기본값) */
export function decodeProfile(raw: unknown, fallback: UserProfile = defaultProfile()): UserProfile {
  const f = fallback;
  if (!isRecord(raw)) return { ...f };
  return {
    // 출산일은 비울 수 없다(Models.swift:69 non-optional, 편집은 DatePicker뿐 — MoreView.swift:199).
    // 한 번 들어간 출산일이 빈 입력("")·null로 지워지면 산후 일수가 0이 되어 오로 레드플래그(10일 이후)가 꺼진다.
    deliveryDate: decodeCalendarDate(raw.deliveryDate) ?? f.deliveryDate,
    // 모르는 enum 값(다음 버전이 추가한 case)은 null — 온보딩/프로필이 다시 받는다(Models.swift:123-126).
    deliveryMethod: nullable(raw.deliveryMethod, (v) => oneOf(v, DELIVERY_METHODS), f.deliveryMethod),
    goal: nullable(raw.goal, (v) => oneOf(v, RECOVERY_GOALS), f.goal),
    returnToWorkDate: nullable(raw.returnToWorkDate, decodeCalendarDate, f.returnToWorkDate),
    isBreastfeeding: bool(raw.isBreastfeeding, f.isBreastfeeding),
    consentAccepted: bool(raw.consentAccepted, f.consentAccepted),
    // 동의의 판·시각(domain/consent.ts) — 없으면(예전 저장·iOS) null = 지금 판의 동의 없음
    consentVersion: nullable(raw.consentVersion, nonEmptyString, f.consentVersion),
    consentAcceptedAt: nullable(raw.consentAcceptedAt, decodeInstant, f.consentAcceptedAt),
    heightCm: num(raw.heightCm, f.heightCm),
    currentWeightKg: num(raw.currentWeightKg, f.currentWeightKg),
    prePregnancyWeightKg: num(raw.prePregnancyWeightKg, f.prePregnancyWeightKg),
    neighborhood: str(raw.neighborhood, f.neighborhood),
  };
}

/** 산모수첩 7항목 — 없거나 못 읽는 필드는 fallback(기본: 기본값, 초산만 true) */
export function decodeMaternity(raw: unknown, fallback: MaternityRecord = defaultMaternity()): MaternityRecord {
  const f = fallback;
  if (!isRecord(raw)) return { ...f };
  return {
    isPrimiparous: bool(raw.isPrimiparous, f.isPrimiparous),
    gdm: bool(raw.gdm, f.gdm),
    anemia: bool(raw.anemia, f.anemia),
    heavyBleeding: bool(raw.heavyBleeding, f.heavyBleeding),
    preeclampsia: bool(raw.preeclampsia, f.preeclampsia),
    pelvicPain: bool(raw.pelvicPain, f.pelvicPain),
    diastasisRecti: bool(raw.diastasisRecti, f.diastasisRecti),
  };
}

/**
 * 데이터 주인 계정 id. 문자열은 빈 문자열까지 그대로, 없거나 null이면 주인 없음(누가 오든 귀속).
 * 문자열이 아닌 값(손상)은 "" — 알 수 없는 실제 계정으로 보고 다음 로그인에서 지운다.
 * 주인을 모르는 건강 기록을 다음 사람에게 넘기지 않는다(AppStore.swift:31-33). iOS도 같다:
 * ""는 실제 계정으로 취급돼 bind에서 삭제되고(AppStore.swift:49), 문자열이 아니면 저장 전체를 버렸다(:352·:190).
 */
export function decodeOwner(v: unknown): string | null {
  if (typeof v === "string") return v;
  return v === null || v === undefined ? null : "";
}

function decodeSymptomRecord(raw: Json, deps: DecodeDeps): SymptomRecord {
  return {
    id: nonEmptyString(raw.id) ?? deps.newId(),
    date: decodeInstant(raw.date) ?? deps.now.toISOString(),
    lochiaIncreased: bool(raw.lochiaIncreased, false),
    lochiaRed: bool(raw.lochiaRed, false),
    feverEvent: bool(raw.feverEvent, false),
    painNrs: int(raw.painNrs, 0),
    redFlagCode: typeof raw.redFlagCode === "string" ? raw.redFlagCode : null,
    // 구버전 기록에는 없다 — null이면 오로 판정을 보류한다(AppStore.swift:243-246).
    postpartumDays: typeof raw.postpartumDays === "number" && Number.isInteger(raw.postpartumDays) ? raw.postpartumDays : null,
  };
}

function decodeMoodCheck(raw: Json, deps: DecodeDeps): MoodCheckRecord {
  return {
    id: nonEmptyString(raw.id) ?? deps.newId(),
    date: decodeInstant(raw.date) ?? deps.now.toISOString(),
    questionID: int(raw.questionID, 0),
    // 모르는 답 값(미래 버전)은 "글쎄요"로 — 신호로 세지 않는다(AppStore.swift:313-315). 규칙은 rules/mood.ts 한 곳.
    answer: normalizeMoodAnswer(raw.answer),
  };
}

function decodeComment(raw: Json, deps: DecodeDeps): CommunityComment {
  return {
    id: nonEmptyString(raw.id) ?? deps.newId(),
    text: str(raw.text, ""),
    authorName: str(raw.authorName, ""),
    date: decodeInstant(raw.date) ?? deps.now.toISOString(),
  };
}

function decodePost(raw: Json, deps: DecodeDeps): CommunityPost {
  return {
    id: nonEmptyString(raw.id) ?? deps.newId(),
    title: str(raw.title, ""),
    body: str(raw.body, ""),
    authorName: str(raw.authorName, ""),
    date: decodeInstant(raw.date) ?? deps.now.toISOString(),
    comments: decodeList(raw.comments, (c) => decodeComment(c, deps)),
  };
}

/** 배열이 아니면 빈 배열, 객체가 아닌 원소는 버린다. */
function decodeList<T>(v: unknown, decodeItem: (raw: Json) => T): T[] {
  return Array.isArray(v) ? v.filter(isRecord).map(decodeItem) : [];
}

/** 저장 루트(파싱된 JSON) → PersistedState. 어떤 입력에도 throw하지 않는다. */
export function decodePersisted(raw: unknown, deps: DecodeDeps): PersistedState {
  if (!isRecord(raw)) return initialState();
  return {
    hasOnboarded: bool(raw.hasOnboarded, false),
    profile: decodeProfile(raw.profile),
    symptomHistory: decodeList(raw.symptomHistory, (r) => decodeSymptomRecord(r, deps)),
    communityPosts: decodeList(raw.communityPosts, (r) => decodePost(r, deps)),
    maternity: decodeMaternity(raw.maternity),
    ownerAccountID: decodeOwner(raw.ownerAccountID),
    moodChecks: decodeList(raw.moodChecks, (r) => decodeMoodCheck(r, deps)),
    moodCardSnoozedUntil: decodeInstant(raw.moodCardSnoozedUntil),
  };
}
