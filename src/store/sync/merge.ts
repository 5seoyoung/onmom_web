// 서버 상태와 이 브라우저 상태 합치기 — 순수 함수(시각·id·네트워크 없음).
//
// 원칙
// - 기록은 id로 합친다(합집합): 증상 기록·기분 답·기록장 글(과 댓글). 합집합이 곧 "양쪽에서 쓴 것 전부"다.
//   · 지운 기록: 양쪽의 삭제 표시(deleted — id·지운 시각만, store/tombstones)를 합치고, 표시가 있는 id는 어느 쪽에 있든 버린다.
//     지우기가 고치기보다 이긴다(지운 뒤 다른 쪽에서 고친 사본이 와도 지운 채로). 표시는 목록마다 최근 TOMBSTONE_LIMIT개까지.
//   · 고친 기록: 같은 id가 양쪽에 있으면 고친 시각(updatedAt)이 늦은 쪽을 쓴다(칸이 없으면 고치기 전 — 고친 쪽이 이긴다).
//     시각이 같으면(둘 다 고치기 전이 대부분) 지금까지처럼 서버 쪽을 쓴다 — 어느 기기에서 합쳐도 같은 결과.
//   다만 시각이 같을 때, 증상 기록의 규칙 버전(rulesVersion)·기분 답의 문항 버전(moodVersion)이 서버 쪽에만 없으면(null) 다른 쪽 값을 남긴다 —
//   그 칸을 모르는 옛 웹(칸이 생기기 전에 열어 둔 탭)이 기록을 읽고 다시 저장하며 떨어뜨린 것이라, 감사용 버전을 잃지 않게(keepVersion).
//   증상 기록의 위험 증상 토글 칸(rules-1.2 — domain/types RISK_SYMPTOM_KEYS)도 같다: 서버 쪽에 없는 칸은 이 브라우저 쪽 값으로 채운다.
//   (고친 시각이 다르면 이긴 쪽 그대로 — 고친 기록은 이 웹이 모든 칸을 다시 쓴 것이다.)
// - 순서는 날짜(최신순, 댓글은 오래된 순), 같은 시각이면 id — 어느 기기에서 합쳐도 같은 순서가 나와
//   기기끼리 순서만 바꿔 서로 덮어쓰는 일이 없다. 개수 제한은 저장 규칙과 같다(기록 50·기분 60, domain/types).
// - 프로필·산모수첩·온보딩 완료: 서버가 온보딩을 마친 상태면 서버, 아니면 이 브라우저(첫 합치기 규칙).
//   이미 한 번 맞춘 적이 있으면(base = 마지막으로 서버와 같았던 상태) 그 뒤 이 브라우저에서 바꾼 칸만 이 브라우저 값을 쓴다
//   — 두 기기에서 동시에 고쳤을 때(충돌 뒤 다시 합치기), 올리기 전에 페이지를 닫았다 다시 열 때 이 브라우저의 고친 값을
//   서버 값으로 덮지 않게.
// - 마음 카드 접어두기 기한은 둘 중 늦은 쪽. 데이터 주인은 로그인한 계정.
// - 동의(consentAccepted·consentVersion·consentAcceptedAt)는 한 묶음으로 다룬다: 위 규칙으로 고른 프로필에 지금 판의 동의가 없고
//   다른 쪽에 있으면 그쪽 묶음을 쓴다 — 같은 계정의 주인이 한 기기에서 지금 판에 동의했으면 계정의 동의다(예: 게스트로 동의한 뒤
//   이미 있던 카카오 계정으로 옮김). 다른 사람일 수 있는 가져온 기록은 합친 뒤 동기화 엔진이 동의를 지운다(engine.ts guardAdopted).

import { hasCurrentConsent } from "@/domain/consent";
import {
  MOOD_CHECKS_LIMIT,
  RISK_SYMPTOM_KEYS,
  SYMPTOM_HISTORY_LIMIT,
  pickRiskFlags,
  type CommunityComment,
  type CommunityPost,
  type EditStamp,
  type IsoDateTimeString,
  type MaternityRecord,
  type MoodCheckRecord,
  type PersistedState,
  type SymptomRecord,
  type UserProfile,
} from "@/domain/types";
import { applyDeleted, compareEditStamps, deletedIds, mergeDeleted } from "../tombstones";

export interface MergeOptions {
  /** 로그인한 계정 id("kakao-…") — 합친 상태의 주인 */
  accountId: string;
  /**
   * 마지막으로 서버와 같았던 상태(이 브라우저가 알던 서버 상태). 없으면(첫 합치기) 서버가 온보딩을 마쳤을 때 서버 프로필이 이긴다.
   * 있으면 프로필·산모수첩은 칸마다: 이 브라우저가 base에서 바꾼 칸은 이 브라우저 값, 아니면 서버 값.
   * 기록은 id로 합치므로 프로필·산모수첩만 본다(페이지를 다시 열 때는 marks.ts에 저장해 둔 두 칸이 온다).
   */
  base?: Pick<PersistedState, "profile" | "maternity"> | null;
}

export function mergeStates(server: PersistedState, local: PersistedState, opts: MergeOptions): PersistedState {
  const base = opts.base ?? null;
  const personal = base === null ? firstMergePersonal(server, local) : threeWayPersonal(server, local, base);
  const deleted = mergeDeleted(server.deleted, local.deleted);
  const keepRulesVersion = keepVersion("rulesVersion");
  const symptomHistory = mergeById<SymptomRecord>(
    server.symptomHistory,
    local.symptomHistory,
    newestFirst,
    deletedIds(deleted.symptomHistory),
    (s, l) => keepRiskFlags(keepRulesVersion(s, l), l),
  );
  const moodChecks = mergeById<MoodCheckRecord>(
    server.moodChecks,
    local.moodChecks,
    newestFirst,
    deletedIds(deleted.moodChecks),
    keepVersion("moodVersion"),
  );
  // 합친 목록에는 지운 기록이 없다 — 한쪽에만 표시가 있던 기록도 위에서 걸렀다. applyDeleted는 불변식을 한 번 더 맞출 뿐이다.
  return applyDeleted({
    hasOnboarded: server.hasOnboarded || local.hasOnboarded,
    profile: withCurrentConsent(personal.profile, server.profile, local.profile),
    symptomHistory: symptomHistory.slice(0, SYMPTOM_HISTORY_LIMIT),
    communityPosts: mergePosts(server.communityPosts, local.communityPosts, deletedIds(deleted.communityPosts), deletedIds(deleted.comments)),
    maternity: personal.maternity,
    ownerAccountID: opts.accountId,
    moodChecks: moodChecks.slice(0, MOOD_CHECKS_LIMIT),
    moodCardSnoozedUntil: laterInstant(server.moodCardSnoozedUntil, local.moodCardSnoozedUntil),
    deleted,
  });
}

// MARK: 프로필·산모수첩

interface Personal {
  profile: UserProfile;
  maternity: MaternityRecord;
}

/** 첫 합치기 — 서버가 온보딩을 마쳤으면 서버, 아니면 이 브라우저. */
function firstMergePersonal(server: PersistedState, local: PersistedState): Personal {
  const src = server.hasOnboarded ? server : local;
  return { profile: { ...src.profile }, maternity: { ...src.maternity } };
}

/** 충돌 뒤 다시 합치기 — 이 브라우저가 base 이후 바꾼 칸만 이 브라우저 값. */
function threeWayPersonal(server: PersistedState, local: PersistedState, base: Pick<PersistedState, "profile" | "maternity">): Personal {
  return {
    profile: pickChanged(server.profile, local.profile, base.profile),
    maternity: pickChanged(server.maternity, local.maternity, base.maternity),
  };
}

function pickChanged<T extends object>(server: T, local: T, base: T): T {
  const out = { ...server };
  for (const k of Object.keys(local) as (keyof T)[]) {
    if (local[k] !== base[k]) out[k] = local[k];
  }
  return out;
}

// MARK: 동의

type ConsentFields = Pick<UserProfile, "consentAccepted" | "consentVersion" | "consentAcceptedAt">;

function consentOf(p: UserProfile): ConsentFields {
  return { consentAccepted: p.consentAccepted, consentVersion: p.consentVersion, consentAcceptedAt: p.consentAcceptedAt };
}

/** 고른 프로필에 지금 판의 동의가 없으면, 있는 쪽(이 브라우저 → 서버 순)의 동의 묶음을 쓴다. 칸을 섞지 않는다. */
function withCurrentConsent(picked: UserProfile, server: UserProfile, local: UserProfile): UserProfile {
  if (hasCurrentConsent(picked)) return picked;
  const donor = hasCurrentConsent(local) ? local : hasCurrentConsent(server) ? server : null;
  return donor === null ? picked : { ...picked, ...consentOf(donor) };
}

// MARK: 목록

interface Dated {
  id: string;
  date: IsoDateTimeString;
}

function time(d: IsoDateTimeString): number {
  const t = Date.parse(d);
  return Number.isNaN(t) ? 0 : t;
}

function byId(a: Dated, b: Dated): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** 최신순, 같은 시각이면 id순 */
function newestFirst(a: Dated, b: Dated): number {
  return time(b.date) - time(a.date) || byId(a, b);
}

/** 오래된 순, 같은 시각이면 id순 — 댓글 */
function oldestFirst(a: Dated, b: Dated): number {
  return time(a.date) - time(b.date) || byId(a, b);
}

/**
 * id 합집합 — 지운 id(gone)는 빼고, 같은 id면 고친 시각이 늦은 쪽(pickNewer). 시각이 같으면 서버 쪽
 * (same이 있으면 same(서버 쪽, 이 브라우저 쪽)의 결과). 정렬해서 돌려준다.
 */
function mergeById<T extends Dated & EditStamp>(
  server: readonly T[],
  local: readonly T[],
  order: (a: T, b: T) => number,
  gone: ReadonlySet<string>,
  same?: (serverItem: T, localItem: T) => T,
): T[] {
  const localById = new Map<string, T>();
  for (const item of local) if (!gone.has(item.id)) localById.set(item.id, item);
  const map = new Map(localById);
  for (const item of server) {
    if (gone.has(item.id)) continue;
    const mine = localById.get(item.id);
    map.set(item.id, mine === undefined ? item : pickNewer(item, mine, same));
  }
  return [...map.values()].sort(order);
}

/** 같은 id의 두 사본 — 나중에 고친 쪽. 고친 시각이 같으면 서버 쪽(same이 있으면 그 결과 — 빠진 칸 채우기). */
function pickNewer<T extends EditStamp>(serverItem: T, localItem: T, same?: (serverItem: T, localItem: T) => T): T {
  const c = compareEditStamps(serverItem.updatedAt, localItem.updatedAt);
  if (c > 0) return serverItem;
  if (c < 0) return localItem;
  return same === undefined ? serverItem : same(serverItem, localItem);
}

/**
 * 같은 기록이 양쪽에 있을 때 — 서버 쪽을 쓰되, 서버 쪽에 없는(null) 버전 칸은 이 브라우저 쪽 값으로 채운다(머리 주석).
 * 기록은 쓴 뒤 바뀌지 않으므로 둘 다 있으면 같아야 하고, 그때는 서버 쪽 그대로다(어느 기기에서 합쳐도 같은 결과).
 */
function keepVersion<K extends "rulesVersion" | "moodVersion">(key: K) {
  return <T extends Dated & Record<K, string | null>>(serverItem: T, localItem: T): T =>
    serverItem[key] === null && localItem[key] !== null ? { ...serverItem, [key]: localItem[key] } : serverItem;
}

/**
 * 같은 증상 기록 — 서버 쪽에 없는(칸이 없거나 true/false가 아닌) 위험 증상 토글 칸은 이 브라우저 쪽 값으로 채운다(머리 주석, keepVersion과 같은 까닭).
 * 서버 쪽에 값이 있으면 그대로 — 기록은 쓴 뒤 바뀌지 않는다. 채울 것이 없으면 서버 쪽 객체 그대로(같은 결과를 같은 모양으로).
 */
function keepRiskFlags(serverItem: SymptomRecord, localItem: SymptomRecord): SymptomRecord {
  const mine = pickRiskFlags(localItem);
  const theirs = pickRiskFlags(serverItem);
  const missing = RISK_SYMPTOM_KEYS.filter((k) => theirs[k] === undefined && mine[k] !== undefined);
  if (missing.length === 0) return serverItem;
  const filled: SymptomRecord = { ...serverItem };
  for (const k of missing) filled[k] = mine[k];
  return filled;
}

/**
 * 글은 id로 합치고(같은 글이면 나중에 고친 쪽의 제목·본문, 같으면 서버 쪽), 댓글은 양쪽 댓글을 id로 합친다.
 * 지운 글은 댓글째 빠지고, 지운 댓글은 어느 쪽에 있든 빠진다.
 */
function mergePosts(
  server: readonly CommunityPost[],
  local: readonly CommunityPost[],
  gonePosts: ReadonlySet<string>,
  goneComments: ReadonlySet<string>,
): CommunityPost[] {
  const serverById = new Map(server.map((p) => [p.id, p] as const));
  const localById = new Map(local.map((p) => [p.id, p] as const));
  const merged = mergeById<CommunityPost>(server, local, newestFirst, gonePosts);
  return merged.map((post) => {
    const a = serverById.get(post.id);
    const b = localById.get(post.id);
    // 한쪽에만 있는 글은 댓글 순서도 그대로(지운 댓글만 뺀다) — 지금까지와 같은 모양
    const comments =
      a !== undefined && b !== undefined
        ? mergeById<CommunityComment>(a.comments, b.comments, oldestFirst, goneComments)
        : post.comments.filter((c) => !goneComments.has(c.id));
    return sameComments(post.comments, comments) ? post : { ...post, comments };
  });
}

/** 같은 댓글 목록인가(같은 객체가 같은 순서) — 바뀐 것이 없으면 글 객체를 그대로 둔다 */
function sameComments(a: readonly CommunityComment[], b: readonly CommunityComment[]): boolean {
  return a.length === b.length && a.every((c, i) => c === b[i]);
}

// MARK: 시각

function laterInstant(a: IsoDateTimeString | null, b: IsoDateTimeString | null): IsoDateTimeString | null {
  if (a === null) return b;
  if (b === null) return a;
  return time(b) > time(a) ? b : a;
}
