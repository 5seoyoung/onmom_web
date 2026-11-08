// 지운 기록의 삭제 표시(tombstone)와 고친 기록의 시각(updatedAt) — 순수 함수(시각·id·네트워크 없음).
//
// 왜 필요한가: 여러 탭 합치기(store/tabRebase)와 서버 합치기(store/sync/merge)는 증상 기록·기분 답·기록장 글·댓글을 id로 합친다(합집합).
// 그냥 목록에서 빼기만 하면 다른 탭의 낡은 사본이나 서버 사본이 그 기록을 다시 넣는다. 그래서 지울 때 id와 지운 시각만 남기고
// (내용은 남기지 않는다 — domain/types Tombstone), 합칠 때 표시가 있는 id는 어느 쪽에 있든 버린다. 지우기는 고치기보다 이긴다
// (지운 뒤 다른 탭에서 고친 사본이 와도 지운 채로 둔다 — id는 무작위라 다시 쓰이지 않는다).
// 고친 기록은 updatedAt이 늦은 쪽이 이긴다(compareEditStamps). 칸이 없으면 고치기 전이다.
//
// 상태의 불변식: 목록(symptomHistory·moodChecks·communityPosts·각 글의 comments)에는 표시가 있는 id가 없다 — 읽기(store/decode)·
// 합치기·지우기가 모두 applyDeleted로 맞춘다. 그래서 기록을 읽는 화면·규칙(홈·회복 분석·PDF 리포트·내려받기)과 관리자 집계(0011 —
// 목록 배열만 센다)는 따로 거를 것이 없다.

import {
  DELETED_LISTS,
  TOMBSTONE_LIMIT,
  type CommunityPost,
  type DeletedEntries,
  type IsoDateTimeString,
  type PersistedState,
  type Tombstone,
} from "@/domain/types";

export function emptyDeleted(): DeletedEntries {
  return { symptomHistory: [], moodChecks: [], communityPosts: [], comments: [] };
}

export function hasDeletions(d: DeletedEntries): boolean {
  return DELETED_LISTS.some((k) => d[k].length > 0);
}

function time(d: IsoDateTimeString): number {
  const t = Date.parse(d);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

/** 최근에 지운 것부터, 같은 시각이면 id순 — 어느 기기에서 합쳐도 같은 순서·같은 잘림 */
function newestDeletedFirst(a: Tombstone, b: Tombstone): number {
  const d = time(b.deletedAt) - time(a.deletedAt);
  if (d !== 0 && !Number.isNaN(d)) return d;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** 같은 id의 표시 둘 — 먼저 지운 시각(실제로 지운 때)을 남긴다. 시각이 같거나 못 읽으면 글자가 작은 쪽(어느 쪽에서 합쳐도 같다). */
function earlier(a: Tombstone, b: Tombstone): Tombstone {
  const ta = time(a.deletedAt);
  const tb = time(b.deletedAt);
  if (ta !== tb) return ta < tb ? a : b;
  return a.deletedAt <= b.deletedAt ? a : b;
}

/** 표시 목록 합치기 — id 하나에 하나(먼저 지운 시각), 최근 것부터 TOMBSTONE_LIMIT개. 칸은 id·deletedAt만 옮긴다(다른 칸을 실어 나르지 않게). */
export function unionTombstones(...lists: readonly (readonly Tombstone[])[]): Tombstone[] {
  const byId = new Map<string, Tombstone>();
  for (const list of lists) {
    for (const t of list) {
      const clean: Tombstone = { id: t.id, deletedAt: t.deletedAt };
      const seen = byId.get(t.id);
      byId.set(t.id, seen === undefined ? clean : earlier(seen, clean));
    }
  }
  return [...byId.values()].sort(newestDeletedFirst).slice(0, TOMBSTONE_LIMIT);
}

export function mergeDeleted(a: DeletedEntries, b: DeletedEntries): DeletedEntries {
  return {
    symptomHistory: unionTombstones(a.symptomHistory, b.symptomHistory),
    moodChecks: unionTombstones(a.moodChecks, b.moodChecks),
    communityPosts: unionTombstones(a.communityPosts, b.communityPosts),
    comments: unionTombstones(a.comments, b.comments),
  };
}

/** 목록에 표시 하나를 더한다(이미 있으면 먼저 지운 시각 그대로) */
export function withTombstone(d: DeletedEntries, list: keyof DeletedEntries, id: string, at: IsoDateTimeString): DeletedEntries {
  return { ...d, [list]: unionTombstones(d[list], [{ id, deletedAt: at }]) };
}

export function deletedIds(list: readonly Tombstone[]): ReadonlySet<string> {
  return new Set(list.map((t) => t.id));
}

function without<T extends { id: string }>(items: readonly T[], gone: ReadonlySet<string>): T[] | null {
  if (gone.size === 0 || !items.some((x) => gone.has(x.id))) return null;
  return items.filter((x) => !gone.has(x.id));
}

/** 글 목록에서 지운 글과 지운 댓글을 뺀다 — 바뀐 것이 없으면 null */
function postsWithout(posts: readonly CommunityPost[], gonePosts: ReadonlySet<string>, goneComments: ReadonlySet<string>): CommunityPost[] | null {
  let changed = false;
  const out: CommunityPost[] = [];
  for (const post of posts) {
    if (gonePosts.has(post.id)) {
      changed = true;
      continue;
    }
    const comments = without(post.comments, goneComments);
    if (comments === null) out.push(post);
    else {
      changed = true;
      out.push({ ...post, comments });
    }
  }
  return changed ? out : null;
}

/**
 * 표시가 있는 기록을 목록에서 뺀다(불변식을 맞춘다). 표시 목록도 정리한다(중복·순서·개수).
 * 바뀐 것이 없으면 같은 객체를 돌려준다(저장·렌더 생략 판단 — store/state.ts와 같은 약속).
 */
export function applyDeleted(s: PersistedState): PersistedState {
  const d = s.deleted;
  const symptomHistory = without(s.symptomHistory, deletedIds(d.symptomHistory));
  const moodChecks = without(s.moodChecks, deletedIds(d.moodChecks));
  const communityPosts = postsWithout(s.communityPosts, deletedIds(d.communityPosts), deletedIds(d.comments));
  if (symptomHistory === null && moodChecks === null && communityPosts === null) return s;
  return {
    ...s,
    symptomHistory: symptomHistory ?? s.symptomHistory,
    moodChecks: moodChecks ?? s.moodChecks,
    communityPosts: communityPosts ?? s.communityPosts,
  };
}

/** 다른 곳(이 브라우저의 따로 둔 사본 — persistence DELETED_KEY)의 표시를 더하고 목록에 적용한다. 더할 것이 없으면 같은 객체. */
export function withExtraDeleted(s: PersistedState, extra: DeletedEntries): PersistedState {
  if (!hasDeletions(extra)) return s;
  return applyDeleted({ ...s, deleted: mergeDeleted(s.deleted, extra) });
}

/**
 * 고친 시각 비교 — a가 더 나중에 고쳤으면 양수, 먼저면 음수, 같으면 0. 칸이 없거나 못 읽으면 "고치기 전"(가장 이르다).
 * 합치기는 양수·음수일 때 그쪽을 고르고, 0이면 지금까지의 규칙(서버 쪽 + 빠진 칸 채우기)을 쓴다.
 */
export function compareEditStamps(a: IsoDateTimeString | undefined, b: IsoDateTimeString | undefined): number {
  const ta = a === undefined ? Number.NEGATIVE_INFINITY : time(a);
  const tb = b === undefined ? Number.NEGATIVE_INFINITY : time(b);
  if (ta === tb) return 0;
  return ta > tb ? 1 : -1;
}
