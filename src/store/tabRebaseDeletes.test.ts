// 여러 탭 보호 — 고치기·지우기. 두 탭(스토어 둘)이 한 저장소를 나눠 쓰고, 다른 탭의 변경 알림은 오지 않는다(늦음·뒤로 가기 캐시).
// 그리고 예전 판의 웹(삭제 표시·고친 시각을 모르는 번들 — 업데이트 전에 열어 둔 탭, 서비스 워커가 캐시한 화면)이 같은 저장소를 다시 쓰는 경우.
import { describe, expect, it } from "vitest";
import type { PersistedState } from "@/domain/types";
import { RULES_VERSION } from "@/rules/version";
import { createAppStore, type AppStore } from "./appStore";
import { DELETED_KEY, STATE_KEY, createMemoryStorage, createStoragePersistence, type StorageLike } from "./persistence";

const NOW = new Date("2026-11-08T10:00:00+09:00");

const SYMPTOM = {
  lochiaIncreased: false,
  lochiaRed: false,
  feverEvent: false,
  painNrs: 2,
  redFlagCode: null,
  postpartumDays: 30,
  rulesVersion: RULES_VERSION,
} as const;

function tab(storage: StorageLike, prefix: string): AppStore {
  let n = 0;
  return createAppStore({
    persistence: createStoragePersistence(() => storage),
    now: () => NOW,
    newId: () => `${prefix}-${++n}`,
    watchExternalChanges: () => () => {}, // 변경 알림이 오지 않는다
  });
}

function saved(storage: StorageLike): PersistedState {
  return JSON.parse(storage.getItem(STATE_KEY)!) as PersistedState;
}

/** 두 탭이 같은 게스트로 온보딩을 마치고, A가 기록 둘·기분 답 하나·글 하나(댓글 둘)를 남긴 뒤 둘 다 화면을 연 상태 */
function twoTabs() {
  const storage = createMemoryStorage();
  const a = tab(storage, "a");
  const b = tab(storage, "b");
  a.subscribe(() => {});
  a.actions.signInGuest();
  a.actions.completeOnboarding();
  const r1 = a.actions.addSymptomRecord({ ...SYMPTOM, date: "2026-11-01T01:00:00.000Z" });
  const r2 = a.actions.addSymptomRecord({ ...SYMPTOM, date: "2026-11-02T01:00:00.000Z" });
  const m = a.actions.addMoodCheck({ questionID: 1, answer: "no" });
  const postId = a.actions.addPost({ title: "제목", body: "본문" })!;
  a.actions.addComment(postId, "첫 댓글");
  a.actions.addComment(postId, "둘째 댓글");
  b.subscribe(() => {}); // B가 A의 상태를 읽음
  const comments = b.getSnapshot().state.communityPosts[0].comments.map((c) => c.id);
  return { storage, a, b, r1: r1.id, r2: r2.id, m: m.id, postId, comments };
}

const symptomIds = (s: PersistedState) => s.symptomHistory.map((r) => r.id);

describe("여러 탭 — 지운 기록을 낡은 탭이 되살리지 않는다", () => {
  it("B가 기록을 지운 뒤 낡은 A가 기분 답을 저장해도 지운 기록은 돌아오지 않는다", () => {
    const { storage, a, b, r1, r2 } = twoTabs();
    expect(b.actions.deleteSymptomRecord(r1)).toBe(true);
    expect(symptomIds(a.getSnapshot().state)).toContain(r1); // A는 아직 모른다

    a.actions.addMoodCheck({ questionID: 2, answer: "yes" });
    expect(symptomIds(saved(storage))).toEqual([r2]);
    expect(saved(storage).deleted.symptomHistory.map((t) => t.id)).toEqual([r1]);
    expect(symptomIds(a.getSnapshot().state)).toEqual([r2]);
    expect(saved(storage).moodChecks).toHaveLength(2);
  });

  it("B가 지운 기록을 낡은 A가 고쳐도 지운 채로 남는다(지우기가 이긴다)", () => {
    const { storage, a, b, r1 } = twoTabs();
    b.actions.deleteSymptomRecord(r1);
    a.actions.updateSymptomRecord(r1, { ...SYMPTOM, painNrs: 9 });
    expect(symptomIds(saved(storage))).not.toContain(r1);
    expect(symptomIds(a.getSnapshot().state)).not.toContain(r1);
  });

  it("B가 글을 지우고 낡은 A가 그 글에 댓글을 달아도 글은 돌아오지 않는다", () => {
    const { storage, a, b, postId } = twoTabs();
    b.actions.deletePost(postId);
    a.actions.addComment(postId, "늦은 댓글");
    expect(saved(storage).communityPosts).toEqual([]);
    expect(a.getSnapshot().state.communityPosts).toEqual([]);
  });

  it("두 탭이 서로 다른 댓글을 지우면 둘 다 빠진다", () => {
    const { storage, a, b, postId, comments } = twoTabs();
    b.actions.deleteComment(postId, comments[0]);
    a.actions.deleteComment(postId, comments[1]);
    expect(saved(storage).communityPosts[0].comments).toEqual([]);
    expect(saved(storage).deleted.comments.map((t) => t.id).sort()).toEqual([...comments].sort());
  });
});

describe("여러 탭 — 고친 기록", () => {
  it("B가 고친 기록을 낡은 A의 쓰기가 고치기 전 값으로 되돌리지 않는다", () => {
    const { storage, a, b, r2 } = twoTabs();
    b.actions.updateSymptomRecord(r2, { ...SYMPTOM, painNrs: 7 });
    a.actions.addMoodCheck({ questionID: 2, answer: "yes" });
    const rec = saved(storage).symptomHistory.find((r) => r.id === r2)!;
    expect(rec.painNrs).toBe(7);
    expect(rec.updatedAt).toBe(NOW.toISOString());
  });

  it("두 탭이 서로 다른 기록을 고치면 둘 다 남는다", () => {
    const { storage, a, b, r1, r2, m } = twoTabs();
    b.actions.updateSymptomRecord(r1, { ...SYMPTOM, painNrs: 5 });
    a.actions.updateMoodAnswer(m, "yes");
    a.actions.updateSymptomRecord(r2, { ...SYMPTOM, painNrs: 6 });
    const s = saved(storage);
    expect(s.symptomHistory.find((r) => r.id === r1)!.painNrs).toBe(5);
    expect(s.symptomHistory.find((r) => r.id === r2)!.painNrs).toBe(6);
    expect(s.moodChecks.find((x) => x.id === m)!.answer).toBe("yes");
  });

  it("A가 글을 고치는 사이 B가 댓글을 달면 고친 제목과 새 댓글이 둘 다 남는다", () => {
    const { storage, a, b, postId } = twoTabs();
    b.actions.addComment(postId, "B의 댓글");
    a.actions.updatePost(postId, { title: "고친 제목", body: "본문" });
    const p = saved(storage).communityPosts[0];
    expect(p.title).toBe("고친 제목");
    expect(p.comments.map((c) => c.text)).toEqual(["첫 댓글", "둘째 댓글", "B의 댓글"]);
  });
});

describe("예전 판의 웹이 같은 저장소를 다시 쓰면", () => {
  /** 예전 판(형식 1)의 저장 — deleted 칸·고친 시각을 모르고, 메모리의 낡은 목록과 합쳐(합집합) 지운 기록을 되살려 쓴다. 사본 키는 모른다. */
  function oldBundleWrites(storage: StorageLike, resurrect: PersistedState["symptomHistory"][number]) {
    const s = saved(storage) as Partial<PersistedState>;
    delete s.deleted;
    const history = [resurrect, ...(s.symptomHistory ?? [])].map((r) => {
      const copy = { ...r };
      delete copy.updatedAt;
      return copy;
    });
    storage.setItem(STATE_KEY, JSON.stringify({ ...s, symptomHistory: history }));
  }

  it("지운 기록이 다시 써졌어도, 따로 둔 삭제 표시로 이 웹이 다시 읽을 때 빠진다 — 그리고 다음 저장에 표시가 돌아온다", () => {
    const { storage, a, b, r1, r2 } = twoTabs();
    const before = b.getSnapshot().state.symptomHistory.find((r) => r.id === r1)!;
    b.actions.deleteSymptomRecord(r1);
    expect(storage.getItem(DELETED_KEY)).not.toBeNull();

    oldBundleWrites(storage, before);
    expect(symptomIds(saved(storage))).toContain(r1); // 예전 판이 되살림

    const c = tab(storage, "c");
    c.subscribe(() => {});
    expect(symptomIds(c.getSnapshot().state)).toEqual([r2]);
    expect(c.getSnapshot().state.deleted.symptomHistory.map((t) => t.id)).toEqual([r1]);

    // 낡은 A의 쓰기도(저장된 상태를 다시 읽어 합칠 때) 사본의 표시를 본다
    a.actions.addMoodCheck({ questionID: 3, answer: "unsure" });
    expect(symptomIds(saved(storage))).toEqual([r2]);
    expect(saved(storage).deleted.symptomHistory.map((t) => t.id)).toEqual([r1]);
  });

  it("지운 기록이 없으면 사본 키를 두지 않는다 — 형식 1의 브라우저 저장소 그대로", () => {
    const { storage } = twoTabs();
    expect(storage.getItem(DELETED_KEY)).toBeNull();
    expect(Object.keys(saved(storage).symptomHistory[0])).not.toContain("updatedAt");
  });
});
