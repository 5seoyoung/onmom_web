// 기록 고치기·지우기의 순수 전이(store/state.ts)와 형식 1·2의 읽기(store/decode.ts).
import { describe, expect, it } from "vitest";
import type { CommunityPost, MoodCheckRecord, PersistedState, SymptomRecord } from "@/domain/types";
import { MOOD_VERSION, RULES_VERSION } from "@/rules/version";
import { decodeDeleted, decodePersisted } from "./decode";
import { initialState } from "./defaults";
import * as S from "./state";

const T0 = new Date("2026-11-01T10:00:00+09:00");
const NOW = new Date("2026-11-08T10:00:00+09:00");
const deps = { now: NOW, newId: () => "new-id" };

function symptom(id: string, over: Partial<SymptomRecord> = {}): SymptomRecord {
  return { id, date: T0.toISOString(), lochiaIncreased: false, lochiaRed: false, feverEvent: false, painNrs: 3, redFlagCode: null, postpartumDays: 25, rulesVersion: RULES_VERSION, ...over };
}
function mood(id: string, over: Partial<MoodCheckRecord> = {}): MoodCheckRecord {
  return { id, date: T0.toISOString(), questionID: 2, answer: "no", moodVersion: MOOD_VERSION, ...over };
}
function post(id: string, over: Partial<CommunityPost> = {}): CommunityPost {
  return {
    id,
    title: "제목",
    body: "본문",
    authorName: "게스트",
    date: T0.toISOString(),
    comments: [
      { id: "c1", text: "하나", authorName: "게스트", date: T0.toISOString() },
      { id: "c2", text: "둘", authorName: "게스트", date: T0.toISOString() },
    ],
    ...over,
  };
}
function state(over: Partial<PersistedState> = {}): PersistedState {
  return { ...initialState(), ...over };
}

describe("증상 기록 고치기·지우기", () => {
  const values = (over: Partial<S.SymptomRecordPatch> = {}): S.SymptomRecordPatch => ({
    lochiaIncreased: false,
    lochiaRed: false,
    feverEvent: true,
    painNrs: 3,
    redFlagCode: "fever",
    postpartumDays: 25,
    rulesVersion: RULES_VERSION,
    ...over,
  });

  it("고치면 값이 바뀌고 고친 시각이 찍힌다 — 기록 시각·id는 그대로", () => {
    const s = state({ symptomHistory: [symptom("a"), symptom("b")] });
    const next = S.updateSymptomRecord(s, "b", values(), NOW);
    expect(next.symptomHistory[1]).toEqual({ ...symptom("b"), feverEvent: true, redFlagCode: "fever", updatedAt: NOW.toISOString() });
    expect(next.symptomHistory[0]).toBe(s.symptomHistory[0]);
  });

  it("바뀐 것이 없거나 없는 기록이면 같은 객체(저장·동기화 없음)", () => {
    const s = state({ symptomHistory: [symptom("a")] });
    const same = values({ feverEvent: false, redFlagCode: null });
    expect(S.updateSymptomRecord(s, "a", same, NOW)).toBe(s);
    expect(S.updateSymptomRecord(s, "zzz", values(), NOW)).toBe(s);
  });

  it("위험 증상 토글은 true/false인 칸만 남긴다(새 기록과 같은 규칙)", () => {
    const s = state({ symptomHistory: [symptom("a")] });
    const next = S.updateSymptomRecord(s, "a", { ...values(), seizure: true, harmThoughts: null }, NOW);
    expect(next.symptomHistory[0].seizure).toBe(true);
    expect("harmThoughts" in next.symptomHistory[0]).toBe(false);
  });

  it("지우면 목록에서 빠지고 삭제 표시(id·시각만)가 남는다", () => {
    const s = state({ symptomHistory: [symptom("a"), symptom("b", { painNrs: 9 })] });
    const next = S.deleteSymptomRecord(s, "b", NOW);
    expect(next.symptomHistory.map((r) => r.id)).toEqual(["a"]);
    expect(next.deleted.symptomHistory).toEqual([{ id: "b", deletedAt: NOW.toISOString() }]);
    expect(JSON.stringify(next.deleted)).not.toContain("painNrs");
    expect(S.deleteSymptomRecord(next, "b", NOW)).toBe(next);
  });

  it("가장 최근 기록을 지우면 그다음 기록이 홈의 근거가 된다", () => {
    const s = state({ symptomHistory: [symptom("new", { redFlagCode: "pph_suspect" }), symptom("old")] });
    expect(S.latestRecord(S.deleteSymptomRecord(s, "new", NOW))?.id).toBe("old");
  });
});

describe("기분 답 고치기·지우기", () => {
  it("답만 바꾼다 — 문항·문항 버전·답한 시각은 그대로", () => {
    const s = state({ moodChecks: [mood("m")] });
    const next = S.updateMoodAnswer(s, "m", "yes", NOW);
    expect(next.moodChecks[0]).toEqual({ ...mood("m"), answer: "yes", updatedAt: NOW.toISOString() });
    expect(S.updateMoodAnswer(next, "m", "yes", NOW)).toBe(next);
  });

  it("오늘 답을 지우면 오늘의 질문을 다시 묻는다", () => {
    const today = mood("m", { date: NOW.toISOString() });
    const s = state({ moodChecks: [today] });
    expect(S.todayMoodCheck(s, NOW)?.id).toBe("m");
    const next = S.deleteMoodCheck(s, "m", NOW);
    expect(S.todayMoodCheck(next, NOW)).toBeNull();
    expect(next.deleted.moodChecks.map((t) => t.id)).toEqual(["m"]);
  });
});

describe("기록장 글 고치기·지우기, 댓글 지우기", () => {
  it("글 고치기 — 제목·본문을 trim, 작성자·쓴 시각·댓글은 그대로", () => {
    const s = state({ communityPosts: [post("p")] });
    const next = S.updatePost(s, "p", { title: "  새 제목 ", body: " 새 본문\n" }, NOW);
    expect(next.communityPosts[0]).toEqual({ ...post("p"), title: "새 제목", body: "새 본문", updatedAt: NOW.toISOString() });
  });

  it("제목이 비거나 바뀐 것이 없으면 그대로", () => {
    const s = state({ communityPosts: [post("p")] });
    expect(S.updatePost(s, "p", { title: "   ", body: "x" }, NOW)).toBe(s);
    expect(S.updatePost(s, "p", { title: "제목 ", body: "본문" }, NOW)).toBe(s);
    expect(S.updatePost(s, "nope", { title: "x", body: "" }, NOW)).toBe(s);
  });

  it("글 지우기 — 댓글째 빠지고 표시는 글 하나", () => {
    const s = state({ communityPosts: [post("p"), post("q")] });
    const next = S.deletePost(s, "p", NOW);
    expect(next.communityPosts.map((p) => p.id)).toEqual(["q"]);
    expect(next.deleted.communityPosts).toEqual([{ id: "p", deletedAt: NOW.toISOString() }]);
    expect(next.deleted.comments).toEqual([]);
  });

  it("댓글 지우기 — 그 댓글만, 없는 글·댓글이면 그대로", () => {
    const s = state({ communityPosts: [post("p")] });
    const next = S.deleteComment(s, "p", "c1", NOW);
    expect(next.communityPosts[0].comments.map((c) => c.id)).toEqual(["c2"]);
    expect(next.deleted.comments).toEqual([{ id: "c1", deletedAt: NOW.toISOString() }]);
    expect(S.deleteComment(next, "p", "c1", NOW)).toBe(next);
    expect(S.deleteComment(s, "nope", "c1", NOW)).toBe(s);
  });
});

describe("읽기 — 형식 1은 그대로, 형식 2의 표시는 적용", () => {
  /** 형식 1(이 작업 전)의 저장 JSON — deleted 칸·updatedAt 칸이 없다 */
  const V1 = {
    hasOnboarded: true,
    profile: { deliveryDate: "2026-10-01", consentAccepted: true },
    symptomHistory: [{ ...symptom("a") }],
    communityPosts: [{ ...post("p") }],
    maternity: {},
    ownerAccountID: "guest-1",
    moodChecks: [{ ...mood("m") }],
    moodCardSnoozedUntil: null,
  };

  it("형식 1의 기록은 읽은 뒤에도 같은 모양 — 고친 시각 칸이 생기지 않고 삭제 표시는 비어 있다", () => {
    const s = decodePersisted(JSON.parse(JSON.stringify(V1)), deps);
    expect(s.symptomHistory).toEqual(V1.symptomHistory);
    expect(s.moodChecks).toEqual(V1.moodChecks);
    expect(s.communityPosts).toEqual(V1.communityPosts);
    expect(s.deleted).toEqual(initialState().deleted);
    expect(JSON.stringify(s.symptomHistory)).not.toContain("updatedAt");
  });

  it("형식 2 — 고친 시각을 읽고, 표시가 있는 기록은 목록에서 뺀다", () => {
    const raw = {
      ...V1,
      symptomHistory: [{ ...symptom("a"), updatedAt: NOW.toISOString() }, { ...symptom("gone") }],
      communityPosts: [{ ...post("p"), updatedAt: NOW.toISOString() }],
      deleted: { symptomHistory: [{ id: "gone", deletedAt: NOW.toISOString() }], comments: [{ id: "c2", deletedAt: NOW.toISOString() }] },
    };
    const s = decodePersisted(JSON.parse(JSON.stringify(raw)), deps);
    expect(s.symptomHistory.map((r) => r.id)).toEqual(["a"]);
    expect(s.symptomHistory[0].updatedAt).toBe(NOW.toISOString());
    expect(s.communityPosts[0].updatedAt).toBe(NOW.toISOString());
    expect(s.communityPosts[0].comments.map((c) => c.id)).toEqual(["c1"]);
    expect(s.deleted.moodChecks).toEqual([]); // 없는 칸은 빈 목록
  });

  it("못 읽는 고친 시각은 칸 없음, 못 읽는 표시(id·시각 없음)는 버린다 — 지어낸 표시로 기록을 지우지 않는다", () => {
    const raw = {
      ...V1,
      symptomHistory: [{ ...symptom("a"), updatedAt: "어제" }],
      deleted: {
        symptomHistory: [{ id: "a" }, { deletedAt: NOW.toISOString() }, { id: "", deletedAt: NOW.toISOString() }, "a", { id: "a", deletedAt: "2026-02-31T00:00:00Z" }],
        moodChecks: "깨짐",
      },
    };
    const s = decodePersisted(raw, deps);
    expect(s.symptomHistory.map((r) => r.id)).toEqual(["a"]);
    expect("updatedAt" in s.symptomHistory[0]).toBe(false);
    expect(s.deleted).toEqual(initialState().deleted);
  });

  it("삭제 표시 묶음은 칸마다 따로 읽는다", () => {
    expect(decodeDeleted(null)).toEqual(initialState().deleted);
    expect(decodeDeleted({ moodChecks: [{ id: "m", deletedAt: NOW.toISOString() }], comments: 3 }).moodChecks).toEqual([
      { id: "m", deletedAt: NOW.toISOString() },
    ]);
  });
});
