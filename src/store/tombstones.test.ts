import { describe, expect, it } from "vitest";
import { TOMBSTONE_LIMIT, type CommunityPost, type PersistedState, type Tombstone } from "@/domain/types";
import { RULES_VERSION } from "@/rules/version";
import { initialState } from "./defaults";
import {
  applyDeleted,
  compareEditStamps,
  emptyDeleted,
  hasDeletions,
  mergeDeleted,
  unionTombstones,
  withExtraDeleted,
  withTombstone,
} from "./tombstones";

const t = (id: string, deletedAt: string): Tombstone => ({ id, deletedAt });
const symptom = (id: string) => ({
  id,
  date: "2026-10-01T01:00:00.000Z",
  lochiaIncreased: false,
  lochiaRed: false,
  feverEvent: false,
  painNrs: 1,
  redFlagCode: null,
  postpartumDays: 20,
  rulesVersion: RULES_VERSION,
});
const post = (id: string, commentIds: string[] = []): CommunityPost => ({
  id,
  title: `글 ${id}`,
  body: "",
  authorName: "게스트",
  date: "2026-10-01T01:00:00.000Z",
  comments: commentIds.map((c) => ({ id: c, text: c, authorName: "게스트", date: "2026-10-01T02:00:00.000Z" })),
});
const state = (over: Partial<PersistedState> = {}): PersistedState => ({ ...initialState(), ...over });

describe("unionTombstones", () => {
  it("같은 id는 하나 — 먼저 지운 시각을 남긴다(어느 쪽을 먼저 넘겨도 같다)", () => {
    const a = [t("x", "2026-10-02T00:00:00.000Z")];
    const b = [t("x", "2026-10-01T00:00:00.000Z")];
    expect(unionTombstones(a, b)).toEqual([t("x", "2026-10-01T00:00:00.000Z")]);
    expect(unionTombstones(b, a)).toEqual([t("x", "2026-10-01T00:00:00.000Z")]);
  });

  it("최근에 지운 것부터, 같은 시각이면 id순", () => {
    const at = "2026-10-01T00:00:00.000Z";
    expect(unionTombstones([t("b", at), t("old", "2026-09-01T00:00:00.000Z"), t("a", at)]).map((x) => x.id)).toEqual(["a", "b", "old"]);
  });

  it(`목록마다 최근 ${TOMBSTONE_LIMIT}개까지 — 가장 오래 전에 지운 표시부터 버린다`, () => {
    const many = Array.from({ length: TOMBSTONE_LIMIT + 5 }, (_, i) => t(`d${i}`, new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString()));
    const kept = unionTombstones(many);
    expect(kept).toHaveLength(TOMBSTONE_LIMIT);
    expect(kept[0].id).toBe(`d${TOMBSTONE_LIMIT + 4}`);
    expect(kept.some((x) => x.id === "d0")).toBe(false);
  });

  it("id·지운 시각 말고 다른 칸은 옮기지 않는다(건강 기록 내용이 섞여 들어오지 않게)", () => {
    const dirty = { id: "x", deletedAt: "2026-10-01T00:00:00.000Z", painNrs: 9, title: "제목" } as Tombstone;
    expect(Object.keys(unionTombstones([dirty])[0]).sort()).toEqual(["deletedAt", "id"]);
  });
});

describe("applyDeleted", () => {
  it("표시가 있는 기록·기분 답·글·댓글을 목록에서 뺀다", () => {
    const s = state({
      symptomHistory: [symptom("keep"), symptom("gone")],
      moodChecks: [{ id: "m-gone", date: "2026-10-01T01:00:00.000Z", questionID: 1, answer: "no", moodVersion: null }],
      communityPosts: [post("p-keep", ["c-keep", "c-gone"]), post("p-gone", ["c-under-gone-post"])],
      deleted: {
        symptomHistory: [t("gone", "2026-10-02T00:00:00.000Z")],
        moodChecks: [t("m-gone", "2026-10-02T00:00:00.000Z")],
        communityPosts: [t("p-gone", "2026-10-02T00:00:00.000Z")],
        comments: [t("c-gone", "2026-10-02T00:00:00.000Z")],
      },
    });
    const out = applyDeleted(s);
    expect(out.symptomHistory.map((r) => r.id)).toEqual(["keep"]);
    expect(out.moodChecks).toEqual([]);
    expect(out.communityPosts.map((p) => p.id)).toEqual(["p-keep"]);
    expect(out.communityPosts[0].comments.map((c) => c.id)).toEqual(["c-keep"]);
    expect(out.deleted).toBe(s.deleted);
  });

  it("뺄 것이 없으면 같은 객체(저장·렌더 생략)", () => {
    const s = state({ symptomHistory: [symptom("a")], communityPosts: [post("p", ["c"])], deleted: withTombstone(emptyDeleted(), "comments", "other", "2026-10-02T00:00:00.000Z") });
    expect(applyDeleted(s)).toBe(s);
  });
});

describe("withExtraDeleted — 따로 둔 사본의 표시", () => {
  it("예전 판 웹이 표시를 떨어뜨리고 기록을 되살렸어도 사본의 표시로 다시 뺀다", () => {
    const resurrected = state({ symptomHistory: [symptom("a"), symptom("gone")] }); // deleted 칸 없음(예전 판이 다시 씀)
    const extra = withTombstone(emptyDeleted(), "symptomHistory", "gone", "2026-10-02T00:00:00.000Z");
    const out = withExtraDeleted(resurrected, extra);
    expect(out.symptomHistory.map((r) => r.id)).toEqual(["a"]);
    expect(out.deleted.symptomHistory.map((x) => x.id)).toEqual(["gone"]);
  });

  it("사본이 비었으면 같은 객체", () => {
    const s = state();
    expect(withExtraDeleted(s, emptyDeleted())).toBe(s);
  });
});

describe("mergeDeleted·hasDeletions", () => {
  it("목록마다 합집합", () => {
    const a = withTombstone(emptyDeleted(), "moodChecks", "m1", "2026-10-02T00:00:00.000Z");
    const b = withTombstone(emptyDeleted(), "comments", "c1", "2026-10-03T00:00:00.000Z");
    const m = mergeDeleted(a, b);
    expect(m.moodChecks.map((x) => x.id)).toEqual(["m1"]);
    expect(m.comments.map((x) => x.id)).toEqual(["c1"]);
    expect(hasDeletions(m)).toBe(true);
    expect(hasDeletions(emptyDeleted())).toBe(false);
  });
});

describe("compareEditStamps", () => {
  it("나중에 고친 쪽이 크다, 칸이 없으면 고치기 전(가장 이르다), 같으면 0", () => {
    expect(compareEditStamps("2026-10-02T00:00:00.000Z", "2026-10-01T00:00:00.000Z")).toBe(1);
    expect(compareEditStamps("2026-10-01T00:00:00.000Z", "2026-10-02T00:00:00.000Z")).toBe(-1);
    expect(compareEditStamps("2026-10-01T00:00:00.000Z", undefined)).toBe(1);
    expect(compareEditStamps(undefined, "2026-10-01T00:00:00.000Z")).toBe(-1);
    expect(compareEditStamps(undefined, undefined)).toBe(0);
    expect(compareEditStamps("2026-10-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z")).toBe(0);
  });
});
