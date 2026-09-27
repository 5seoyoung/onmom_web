// 서버 상태와 이 브라우저 상태 합치기 — 순수 함수(시각·id·네트워크 없음).
//
// 원칙
// - 기록은 지우지 않는다: 증상 기록·기분 답·기록장 글(과 댓글)은 id로 합친다(합집합). 앱에 개별 삭제가 없어서
//   합집합이 곧 "양쪽에서 쓴 것 전부"다. 같은 id가 양쪽에 있으면 서버 쪽을 쓴다(기록은 쓴 뒤 바뀌지 않는다).
// - 순서는 날짜(최신순, 댓글은 오래된 순), 같은 시각이면 id — 어느 기기에서 합쳐도 같은 순서가 나와
//   기기끼리 순서만 바꿔 서로 덮어쓰는 일이 없다. 개수 제한은 저장 규칙과 같다(기록 50·기분 60, domain/types).
// - 프로필·산모수첩·온보딩 완료: 서버가 온보딩을 마친 상태면 서버, 아니면 이 브라우저(첫 합치기 규칙).
//   이미 한 번 맞춘 적이 있으면(base = 마지막으로 서버와 같았던 상태) 그 뒤 이 브라우저에서 바꾼 칸만 이 브라우저 값을 쓴다
//   — 두 기기에서 동시에 고쳤을 때(충돌 뒤 다시 합치기), 올리기 전에 페이지를 닫았다 다시 열 때 이 브라우저의 고친 값을
//   서버 값으로 덮지 않게.
// - 마음 카드 접어두기 기한은 둘 중 늦은 쪽. 데이터 주인은 로그인한 계정.

import {
  MOOD_CHECKS_LIMIT,
  SYMPTOM_HISTORY_LIMIT,
  type CommunityComment,
  type CommunityPost,
  type IsoDateTimeString,
  type MaternityRecord,
  type MoodCheckRecord,
  type PersistedState,
  type SymptomRecord,
  type UserProfile,
} from "@/domain/types";

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
  return {
    hasOnboarded: server.hasOnboarded || local.hasOnboarded,
    profile: personal.profile,
    symptomHistory: mergeById<SymptomRecord>(server.symptomHistory, local.symptomHistory, newestFirst).slice(0, SYMPTOM_HISTORY_LIMIT),
    communityPosts: mergePosts(server.communityPosts, local.communityPosts),
    maternity: personal.maternity,
    ownerAccountID: opts.accountId,
    moodChecks: mergeById<MoodCheckRecord>(server.moodChecks, local.moodChecks, newestFirst).slice(0, MOOD_CHECKS_LIMIT),
    moodCardSnoozedUntil: laterInstant(server.moodCardSnoozedUntil, local.moodCardSnoozedUntil),
  };
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

/** id 합집합 — 같은 id면 서버 쪽. 정렬해서 돌려준다. */
function mergeById<T extends Dated>(server: readonly T[], local: readonly T[], order: (a: T, b: T) => number): T[] {
  const map = new Map<string, T>();
  for (const item of local) map.set(item.id, item);
  for (const item of server) map.set(item.id, item);
  return [...map.values()].sort(order);
}

/** 글은 id로 합치고(같은 글이면 서버의 제목·본문), 댓글은 양쪽 댓글을 id로 합친다. */
function mergePosts(server: readonly CommunityPost[], local: readonly CommunityPost[]): CommunityPost[] {
  const localById = new Map(local.map((p) => [p.id, p] as const));
  const merged = mergeById<CommunityPost>(server, local, newestFirst);
  return merged.map((post) => {
    const other = localById.get(post.id);
    if (other === undefined || other === post) return post;
    return { ...post, comments: mergeById<CommunityComment>(post.comments, other.comments, oldestFirst) };
  });
}

// MARK: 시각

function laterInstant(a: IsoDateTimeString | null, b: IsoDateTimeString | null): IsoDateTimeString | null {
  if (a === null) return b;
  if (b === null) return a;
  return time(b) > time(a) ? b : a;
}
