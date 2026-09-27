// 저장 상태의 순수 전이 — iOS AppStore.swift의 action들을 옮긴 것.
// 전부 (state, 인자) → 새 state. 현재 시각·id는 주입받는다(Date.now/new Date()/randomUUID 금지 — 테스트 가능하게).
// 바뀐 것이 없으면 같은 state 객체를 그대로 돌려준다(저장·렌더 생략 판단에 쓴다).

import {
  MOOD_CHECKS_LIMIT,
  type CommunityPost,
  type IsoDateTimeString,
  type MaternityRecord,
  type MoodCheckRecord,
  type PersistedState,
  type SymptomRecord,
  type UserProfile,
} from "@/domain/types";
import { isGuestID } from "./account";
import { decodeMaternity, decodeProfile } from "./decode";
import { initialState } from "./defaults";
// 기록·기분 규칙은 rules/가 단일 출처다(08 §3-1) — 스토어는 상태 모양에 맞춰 넘기기만 한다.
import * as MoodRules from "@/rules/mood";
import * as RecordRules from "@/rules/record";

// MARK: 온보딩·프로필

/** 동의 도장 — 동의한 문구의 판과 시각(domain/consent.ts) */
export interface ConsentStamp {
  version: string;
  at: IsoDateTimeString;
}

/**
 * 온보딩 3단계 동의 후 [온맘 시작하기] (AppStore.swift:103-107).
 * 동의의 판·시각(consentVersion·consentAcceptedAt)은 여기서 정하지 않는다 — 동의 문구를 보여 준 화면이 updateProfile로 남긴다
 * (서버 저장 동의 문구면 지금 판, "내 기기에만 저장" 문구면 판 없음). 이미 남긴 값은 그대로 둔다.
 */
export function completeOnboarding(s: PersistedState): PersistedState {
  return { ...s, hasOnboarded: true, profile: { ...s.profile, consentAccepted: true } };
}

/** 다시 동의(동의 문구의 판이 바뀌었거나, 게스트·예전 기록을 가져온 뒤) — 온보딩 완료 여부는 그대로 둔다. */
export function acceptConsent(s: PersistedState, stamp: ConsentStamp): PersistedState {
  return { ...s, profile: { ...s.profile, consentAccepted: true, consentVersion: stamp.version, consentAcceptedAt: stamp.at } };
}

/** 이 브라우저의 동의 도장을 지운다 — 가져온 기록을 다시 동의받기 전까지 올리지 않게(store/sync/engine). */
export function withoutConsentStamp(s: PersistedState): PersistedState {
  if (s.profile.consentVersion === null && s.profile.consentAcceptedAt === null) return s;
  return { ...s, profile: { ...s.profile, consentVersion: null, consentAcceptedAt: null } };
}

/** undefined 값은 "바꾸지 않음"으로 본다. */
function definedOnly<T extends object>(patch: Partial<T>): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/**
 * 프로필 일부 갱신 — 온보딩 1·2단계, 프로필 편집, 회복 분석 폼(감사 #2: 분석 시작 시 폼 값을 반드시 저장), 내 동네.
 * 저장 형식과 같은 규칙(decodeProfile)으로 정규화해서, 새로고침 전후 값이 같게 한다.
 * 못 읽는 값(빈 날짜 "", 없는 날짜, NaN, 모르는 enum)은 무시하고 이전 값을 둔다 — 기본값으로 지우지 않는다.
 * 출산일은 null로도 지울 수 없다(iOS non-optional). 분만 방식·목표·복직일은 null을 주면 비운다.
 * 키·체중을 비울 때는 0을 준다(iOS MeasurementField: 비우면 0 = 미입력, Components.swift:124-126).
 */
export function updateProfile(s: PersistedState, patch: Partial<UserProfile>): PersistedState {
  return { ...s, profile: decodeProfile({ ...s.profile, ...definedOnly(patch) }, s.profile) };
}

/** 산모수첩 7항목 일부 갱신 — 프로필 편집·회복 분석 폼(감사 #2). boolean이 아닌 값은 무시(이전 값). */
export function updateMaternity(s: PersistedState, patch: Partial<MaternityRecord>): PersistedState {
  return { ...s, maternity: decodeMaternity({ ...s.maternity, ...definedOnly(patch) }, s.maternity) };
}

// MARK: 기록

/** 증상 기록 — 최신순 맨 앞에 넣고 최대 50건(AppStore.swift:134-138). */
export function addSymptomRecord(s: PersistedState, record: SymptomRecord): PersistedState {
  return { ...s, symptomHistory: RecordRules.addSymptomRecord(s.symptomHistory, record) };
}

/** 기분 살피기 답 — 최신순 맨 앞에 넣고 최대 60건(AppStore.swift:89-93). */
export function addMoodCheck(s: PersistedState, record: MoodCheckRecord): PersistedState {
  return { ...s, moodChecks: [record, ...s.moodChecks].slice(0, MOOD_CHECKS_LIMIT) };
}

export const MOOD_CARD_SNOOZE_DAYS = MoodRules.MOOD_CARD_SNOOZE_DAYS;

/** 마음 연계 카드를 접어둔다(기본 7일). 기록은 그대로라 기한이 지나면 다시 판정한다(AppStore.swift:95-99). */
export function snoozeMoodCard(s: PersistedState, now: Date, days: number = MOOD_CARD_SNOOZE_DAYS): PersistedState {
  return { ...s, moodCardSnoozedUntil: MoodRules.moodCardSnoozeUntil(now, days) };
}

// MARK: 기록장 (개인 메모 — 공유 게시판 아님)

export interface WriteMeta {
  id: string;
  /** 작성 시점의 displayName 스냅샷 — 나중에 닉네임이 바뀌어도 글에 남은 이름은 그대로(감사 #58). */
  authorName: string;
  now: Date;
}

/** [등록] 활성 조건 — 제목은 앞뒤 공백을 빼고 한 글자 이상(CommunityView.swift:157). 본문은 선택. */
export function canSubmitPost(title: string): boolean {
  return title.trim().length > 0;
}

/** 빈 댓글은 받지 않는다(CommunityView.swift:223-224). */
export function canSubmitComment(text: string): boolean {
  return text.trim().length > 0;
}

/** 글 등록 — 제목·본문을 trim해 최신순 맨 앞에 넣는다(CommunityView.swift:150-154, AppStore.swift:142-146). 제목이 비면 그대로. */
export function addPost(s: PersistedState, input: { title: string; body: string }, meta: WriteMeta): PersistedState {
  if (!canSubmitPost(input.title)) return s;
  const post: CommunityPost = {
    id: meta.id,
    title: input.title.trim(),
    body: input.body.trim(),
    authorName: meta.authorName,
    date: meta.now.toISOString(),
    comments: [],
  };
  return { ...s, communityPosts: [post, ...s.communityPosts] };
}

/** 댓글 — 오래된 순으로 뒤에 붙인다(AppStore.swift:148-153). 빈 댓글·없는 글이면 그대로. */
export function addComment(s: PersistedState, postId: string, text: string, meta: WriteMeta): PersistedState {
  if (!canSubmitComment(text)) return s;
  const i = s.communityPosts.findIndex((p) => p.id === postId);
  if (i < 0) return s;
  const post = s.communityPosts[i];
  const comment = { id: meta.id, text: text.trim(), authorName: meta.authorName, date: meta.now.toISOString() };
  const communityPosts = s.communityPosts.slice();
  communityPosts[i] = { ...post, comments: [...post.comments, comment] };
  return { ...s, communityPosts };
}

// MARK: 계정 귀속

/**
 * 계정 전환 시 이전 데이터를 지워야 하는가 — 주인이 "실제 계정"이고 들어온 id가 다를 때만.
 * 이전 사람이 로그아웃한 뒤 들어온 사람(다른 실제 계정이든 게스트든)에게 건강 정보를 보여주지 않는다.
 */
export function shouldEraseOnBind(ownerAccountID: string | null, id: string): boolean {
  return ownerAccountID !== null && ownerAccountID !== id && !isGuestID(ownerAccountID);
}

/**
 * 로그인한 계정에 데이터를 묶는다(AppStore.swift:38-54). 전환 규칙 3×3:
 * - 주인 없음(신규·구버전) → 누가 오든 귀속 — 업데이트로 데이터를 날리지 않는다
 * - 게스트 소유 → 실제 계정이든 게스트든 귀속(보존) — 게스트로 쓰다 로그인하는 흐름, 게스트 데이터엔 경쟁하는 주인이 없다
 * - 실제 계정 소유 → 같은 계정이면 보존, 다른 실제 계정·게스트면 전부 삭제 후 귀속
 * 저장소 부수효과(게스트 id 폐기 등)는 appStore가 shouldEraseOnBind로 판단해 처리한다.
 */
export function bindToAccount(s: PersistedState, id: string): PersistedState {
  if (id.length === 0) return s;
  if (shouldEraseOnBind(s.ownerAccountID, id)) return { ...eraseAll(), ownerAccountID: id };
  if (s.ownerAccountID === id) return s;
  return { ...s, ownerAccountID: id };
}

/** 모든 건강 데이터를 초기 상태로(AppStore.swift:115-132). 저장 키·게스트 id 삭제는 appStore가 한다. */
export function eraseAll(): PersistedState {
  return initialState();
}

// MARK: 파생값 (저장하지 않음)

/** 가장 최근 증상 기록 — 홈 회복 상태의 유일한 근거(AppStore.swift:58-59). */
export function latestRecord(s: PersistedState): SymptomRecord | null {
  return RecordRules.latestRecord(s.symptomHistory);
}

/** 오늘(로컬 날짜) 이미 답한 기분 기록 — 하루 1문항이라 답한 뒤에는 다시 묻지 않는다(AppStore.swift:77-80). */
export function todayMoodCheck(s: PersistedState, now: Date): MoodCheckRecord | null {
  return MoodRules.todayMoodCheck(s.moodChecks, now);
}

/** 마음 연계 카드를 접어둔 기간인가(AppStore.swift:85) — 이 동안은 신호가 있어도 카드를 숨긴다. */
export function isMoodCardSnoozed(s: PersistedState, now: Date): boolean {
  return MoodRules.isMoodCardSnoozed(s.moodCardSnoozedUntil, now);
}
