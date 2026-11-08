// 서버 합치기 — 지운 기록·고친 기록(형식 2: 삭제 표시 deleted·고친 시각 updatedAt). 순서·제한·동의는 merge.test.ts.
import { describe, expect, it } from "vitest";
import { MOOD_VERSION, RULES_VERSION } from "@/rules/version";
import {
  SYMPTOM_HISTORY_LIMIT,
  type CommunityPost,
  type DeletedEntries,
  type MoodCheckRecord,
  type PersistedState,
  type SymptomRecord,
} from "@/domain/types";
import { initialState } from "../defaults";
import { decodePersisted } from "../decode";
import { canonicalJSON } from "./canonical";
import { mergeStates } from "./merge";

const ACCOUNT = "kakao-1001";
const T1 = "2026-10-01T01:00:00.000Z";
const T2 = "2026-10-02T01:00:00.000Z";
const T3 = "2026-10-03T01:00:00.000Z";

// 테스트 입력용 기록 — 화면에 쓰이지 않는다.
function symptom(id: string, date: string, over: Partial<SymptomRecord> = {}): SymptomRecord {
  return { id, date, lochiaIncreased: false, lochiaRed: false, feverEvent: false, painNrs: 0, redFlagCode: null, postpartumDays: 20, rulesVersion: RULES_VERSION, ...over };
}
function mood(id: string, date: string, over: Partial<MoodCheckRecord> = {}): MoodCheckRecord {
  return { id, date, questionID: 1, answer: "no", moodVersion: MOOD_VERSION, ...over };
}
function post(id: string, comments: CommunityPost["comments"] = [], over: Partial<CommunityPost> = {}): CommunityPost {
  return { id, title: `제목 ${id}`, body: "", authorName: "카카오 사용자", date: T1, comments, ...over };
}
function comment(id: string, date: string) {
  return { id, text: `댓글 ${id}`, authorName: "카카오 사용자", date };
}
function state(over: Partial<PersistedState> = {}): PersistedState {
  return { ...initialState(), ...over };
}
function gone(list: keyof DeletedEntries, id: string, at: string): DeletedEntries {
  return { ...initialState().deleted, [list]: [{ id, deletedAt: at }] };
}
const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id);
/** 두 순서로 합쳐 본다 — 다른 탭의 rebase는 저장된 쪽이 서버 자리라, 자리가 바뀌어도 같은 기록이 남아야 한다 */
const both = (a: PersistedState, b: PersistedState) => [mergeStates(a, b, { accountId: ACCOUNT }), mergeStates(b, a, { accountId: ACCOUNT })];

describe("지운 기록은 되살아나지 않는다", () => {
  it("이 브라우저에서 지운 증상 기록 — 서버 사본에 있어도 빠지고, 표시는 남는다", () => {
    const server = state({ symptomHistory: [symptom("x", T1), symptom("y", T1)] });
    const local = state({ symptomHistory: [symptom("y", T1)], deleted: gone("symptomHistory", "x", T2) });
    for (const m of both(server, local)) {
      expect(ids(m.symptomHistory)).toEqual(["y"]);
      expect(m.deleted.symptomHistory).toEqual([{ id: "x", deletedAt: T2 }]);
    }
  });

  it("다른 기기가 지운 기분 답 — 이 브라우저의 사본이 빠진다", () => {
    const server = state({ deleted: gone("moodChecks", "m", T2) });
    const local = state({ moodChecks: [mood("m", T1)] });
    for (const m of both(server, local)) expect(m.moodChecks).toEqual([]);
  });

  it("지우기가 고치기보다 이긴다 — 지운 뒤에 고친 사본이 와도 지운 채", () => {
    const server = state({ deleted: gone("symptomHistory", "x", T1) });
    const local = state({ symptomHistory: [symptom("x", T1, { painNrs: 7, updatedAt: T3 })] });
    for (const m of both(server, local)) expect(m.symptomHistory).toEqual([]);
  });

  it("글을 지우면 댓글도 함께 빠지고, 지운 댓글은 어느 쪽에 있든 빠진다", () => {
    const server = state({ communityPosts: [post("p", [comment("c1", T1), comment("c2", T2)]), post("q", [comment("c3", T1)])] });
    const local = state({
      communityPosts: [post("p", [comment("c1", T1)])],
      deleted: { ...gone("communityPosts", "q", T3), comments: [{ id: "c2", deletedAt: T3 }] },
    });
    for (const m of both(server, local)) {
      expect(ids(m.communityPosts)).toEqual(["p"]);
      expect(ids(m.communityPosts[0].comments)).toEqual(["c1"]);
    }
  });

  it("한쪽에만 있는 글의 지운 댓글도 빠진다(댓글 순서는 그대로)", () => {
    const server = state({ deleted: { ...initialState().deleted, comments: [{ id: "c2", deletedAt: T3 }] } });
    const local = state({ communityPosts: [post("p", [comment("c3", T2), comment("c2", T2), comment("c1", T1)])] });
    for (const m of both(server, local)) expect(ids(m.communityPosts[0].comments)).toEqual(["c3", "c1"]);
  });

  it("양쪽 표시는 합친다 — 같은 id는 먼저 지운 시각", () => {
    const server = state({ deleted: { ...gone("symptomHistory", "x", T2), moodChecks: [{ id: "m", deletedAt: T1 }] } });
    const local = state({ deleted: gone("symptomHistory", "x", T1) });
    for (const m of both(server, local)) {
      expect(m.deleted.symptomHistory).toEqual([{ id: "x", deletedAt: T1 }]);
      expect(m.deleted.moodChecks).toEqual([{ id: "m", deletedAt: T1 }]);
    }
  });

  it("형식 1의 서버 행(삭제 표시 칸 없음)과 합쳐도 이 브라우저의 지우기가 남는다", () => {
    const v1 = JSON.parse(JSON.stringify(state({ symptomHistory: [symptom("x", T1)], moodChecks: [mood("m", T1)] }))) as Record<string, unknown>;
    delete v1.deleted;
    const server = decodePersisted(v1, { now: new Date(T3), newId: () => "new" });
    expect(server.deleted).toEqual(initialState().deleted);
    const local = state({ deleted: { ...gone("symptomHistory", "x", T2), moodChecks: [{ id: "m", deletedAt: T2 }] } });
    const merged = mergeStates(server, local, { accountId: ACCOUNT });
    expect(merged.symptomHistory).toEqual([]);
    expect(merged.moodChecks).toEqual([]);
    expect(ids(merged.deleted.symptomHistory)).toEqual(["x"]);
  });

  it("지운 자리만큼 비어 있다 — 지운 기록이 50건 안으로 다시 들어오지 않는다", () => {
    const day = (i: number) => new Date(Date.UTC(2026, 0, 1) + i * 3_600_000).toISOString();
    const all = Array.from({ length: SYMPTOM_HISTORY_LIMIT }, (_, i) => symptom(`s${i}`, day(i)));
    const server = state({ symptomHistory: all });
    const local = state({ symptomHistory: all.filter((r) => r.id !== "s49"), deleted: gone("symptomHistory", "s49", day(60)) });
    const merged = mergeStates(server, local, { accountId: ACCOUNT });
    expect(merged.symptomHistory).toHaveLength(SYMPTOM_HISTORY_LIMIT - 1);
    expect(ids(merged.symptomHistory)).not.toContain("s49");
  });
});

describe("고친 기록은 나중에 고친 쪽", () => {
  it("이 브라우저에서 고친 증상 기록이 서버의 고치기 전 사본을 이긴다(양쪽 순서 모두)", () => {
    const server = state({ symptomHistory: [symptom("x", T1, { painNrs: 2 })] });
    const local = state({ symptomHistory: [symptom("x", T1, { painNrs: 8, redFlagCode: "severe_pain", updatedAt: T2 })] });
    for (const m of both(server, local)) {
      expect(m.symptomHistory[0]).toMatchObject({ painNrs: 8, redFlagCode: "severe_pain", updatedAt: T2 });
    }
  });

  it("둘 다 고쳤으면 나중에 고친 쪽 — 서버가 나중이면 서버", () => {
    const server = state({ symptomHistory: [symptom("x", T1, { painNrs: 5, updatedAt: T3 })] });
    const local = state({ symptomHistory: [symptom("x", T1, { painNrs: 8, updatedAt: T2 })] });
    for (const m of both(server, local)) expect(m.symptomHistory[0].painNrs).toBe(5);
  });

  it("기분 답 고치기 — 나중에 고친 답", () => {
    const server = state({ moodChecks: [mood("m", T1, { answer: "no" })] });
    const local = state({ moodChecks: [mood("m", T1, { answer: "yes", updatedAt: T2 })] });
    for (const m of both(server, local)) expect(m.moodChecks[0]).toMatchObject({ answer: "yes", updatedAt: T2 });
  });

  it("글 고치기 — 나중에 고친 제목·본문, 댓글은 양쪽 합집합 그대로", () => {
    const server = state({ communityPosts: [post("p", [comment("c1", T1)], { title: "처음 제목" })] });
    const local = state({ communityPosts: [post("p", [comment("c2", T2)], { title: "고친 제목", body: "고친 본문", updatedAt: T3 })] });
    for (const m of both(server, local)) {
      expect(m.communityPosts[0]).toMatchObject({ title: "고친 제목", body: "고친 본문", updatedAt: T3 });
      expect(ids(m.communityPosts[0].comments)).toEqual(["c1", "c2"]);
    }
  });

  it("고친 시각이 같으면 지금까지처럼 서버 쪽(+ 빠진 버전 칸만 채움)", () => {
    const server = state({ symptomHistory: [symptom("x", T1, { painNrs: 3, rulesVersion: null })] });
    const local = state({ symptomHistory: [symptom("x", T1, { painNrs: 5 })] });
    const m = mergeStates(server, local, { accountId: ACCOUNT });
    expect(m.symptomHistory[0].painNrs).toBe(3);
    expect(m.symptomHistory[0].rulesVersion).toBe(RULES_VERSION);
    expect(m.symptomHistory[0].updatedAt).toBeUndefined();
  });

  it("형식 1만 아는 웹이 고친 시각을 떨어뜨린 사본 — 고친 내용은 그 사본에도 있어, 고친 값이 남는다", () => {
    const edited = symptom("x", T1, { painNrs: 8, updatedAt: T2 });
    const withoutStamp: SymptomRecord = { ...edited };
    delete withoutStamp.updatedAt;
    const server = state({ symptomHistory: [edited] });
    const local = state({ symptomHistory: [withoutStamp] });
    for (const m of both(server, local)) expect(m.symptomHistory[0]).toMatchObject({ painNrs: 8, updatedAt: T2 });
  });
});

describe("같은 결과를 다시 합쳐도 그대로(멱등) — 기기끼리 서로 덮어쓰지 않는다", () => {
  it("지우기·고치기가 섞인 상태", () => {
    const server = state({
      symptomHistory: [symptom("a", T1), symptom("b", T1, { painNrs: 4, updatedAt: T2 })],
      communityPosts: [post("p", [comment("c1", T1), comment("c2", T1)])],
      deleted: gone("moodChecks", "m-old", T1),
    });
    const local = state({
      symptomHistory: [symptom("b", T1, { painNrs: 6, updatedAt: T3 })],
      moodChecks: [mood("m", T2)],
      communityPosts: [post("p", [comment("c1", T1)], { title: "고침", updatedAt: T2 })],
      deleted: { ...gone("symptomHistory", "a", T2), comments: [{ id: "c2", deletedAt: T2 }] },
    });
    const once = mergeStates(server, local, { accountId: ACCOUNT });
    expect(canonicalJSON(mergeStates(once, local, { accountId: ACCOUNT }))).toBe(canonicalJSON(once));
    expect(canonicalJSON(mergeStates(server, once, { accountId: ACCOUNT }))).toBe(canonicalJSON(once));
    expect(canonicalJSON(mergeStates(once, server, { accountId: ACCOUNT }))).toBe(canonicalJSON(once));
    expect(ids(once.symptomHistory)).toEqual(["b"]);
    expect(once.symptomHistory[0].painNrs).toBe(6);
    expect(ids(once.moodChecks)).toEqual(["m"]);
    expect(ids(once.communityPosts[0].comments)).toEqual(["c1"]);
    expect(once.communityPosts[0].title).toBe("고침");
    expect(ids(once.deleted.symptomHistory)).toEqual(["a"]);
    expect(ids(once.deleted.moodChecks)).toEqual(["m-old"]);
  });
});
