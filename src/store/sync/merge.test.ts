import { describe, expect, it } from "vitest";
import {
  MOOD_CHECKS_LIMIT,
  SYMPTOM_HISTORY_LIMIT,
  type CommunityPost,
  type MoodCheckRecord,
  type PersistedState,
  type SymptomRecord,
} from "@/domain/types";
import { initialState } from "../defaults";
import { canonicalJSON } from "./canonical";
import { mergeStates } from "./merge";

const ACCOUNT = "kakao-1001";

// 테스트 입력용 기록 — 화면에 쓰이지 않는다.
function symptom(id: string, date: string, over: Partial<SymptomRecord> = {}): SymptomRecord {
  return { id, date, lochiaIncreased: false, lochiaRed: false, feverEvent: false, painNrs: 0, redFlagCode: null, postpartumDays: 20, ...over };
}
function mood(id: string, date: string): MoodCheckRecord {
  return { id, date, questionID: 1, answer: "no" };
}
function post(id: string, date: string, comments: CommunityPost["comments"] = [], over: Partial<CommunityPost> = {}): CommunityPost {
  return { id, title: `제목 ${id}`, body: "", authorName: "카카오 사용자", date, comments, ...over };
}
function comment(id: string, date: string) {
  return { id, text: `댓글 ${id}`, authorName: "카카오 사용자", date };
}
function state(over: Partial<PersistedState> = {}): PersistedState {
  return { ...initialState(), ...over };
}
function onboarded(over: Partial<PersistedState> = {}): PersistedState {
  const s = initialState();
  return {
    ...s,
    hasOnboarded: true,
    profile: { ...s.profile, consentAccepted: true, deliveryDate: "2026-08-01", deliveryMethod: "vaginal", heightCm: 160 },
    ...over,
  };
}

const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id);

describe("mergeStates — 기록 목록", () => {
  it("증상 기록은 id로 합치고 최신순(같은 id는 한 번)", () => {
    const server = state({ symptomHistory: [symptom("b", "2026-09-20T10:00:00.000Z"), symptom("a", "2026-09-10T10:00:00.000Z")] });
    const local = state({ symptomHistory: [symptom("c", "2026-09-25T10:00:00.000Z"), symptom("a", "2026-09-10T10:00:00.000Z")] });
    expect(ids(mergeStates(server, local, { accountId: ACCOUNT }).symptomHistory)).toEqual(["c", "b", "a"]);
  });

  it("같은 id가 양쪽에 있으면 서버 쪽을 쓴다(기록은 쓴 뒤 바뀌지 않는다 — 기기끼리 같은 결과)", () => {
    const server = state({ symptomHistory: [symptom("a", "2026-09-10T10:00:00.000Z", { painNrs: 3 })] });
    const local = state({ symptomHistory: [symptom("a", "2026-09-10T10:00:00.000Z", { painNrs: 5 })] });
    expect(mergeStates(server, local, { accountId: ACCOUNT }).symptomHistory[0].painNrs).toBe(3);
  });

  it("증상 기록 50건·기분 답 60건 제한 — 가장 오래된 것부터 버린다", () => {
    const day = (i: number) => new Date(Date.UTC(2026, 0, 1) + i * 3_600_000).toISOString();
    const server = state({
      symptomHistory: Array.from({ length: 40 }, (_, i) => symptom(`s${i}`, day(i * 2))),
      moodChecks: Array.from({ length: 40 }, (_, i) => mood(`s${i}`, day(i * 2))),
    });
    const local = state({
      symptomHistory: Array.from({ length: 40 }, (_, i) => symptom(`l${i}`, day(i * 2 + 1))),
      moodChecks: Array.from({ length: 40 }, (_, i) => mood(`l${i}`, day(i * 2 + 1))),
    });
    const merged = mergeStates(server, local, { accountId: ACCOUNT });
    expect(merged.symptomHistory).toHaveLength(SYMPTOM_HISTORY_LIMIT);
    expect(merged.moodChecks).toHaveLength(MOOD_CHECKS_LIMIT);
    // 가장 최근 것(79시)이 맨 앞, 남은 것 중 가장 오래된 것은 30시(기록)·20시(기분)
    expect(merged.symptomHistory[0].id).toBe("l39");
    expect(merged.symptomHistory.at(-1)!.id).toBe("s15");
    expect(merged.moodChecks.at(-1)!.id).toBe("s10");
  });

  it("같은 시각이면 id순 — 어느 기기에서 합쳐도 같은 순서", () => {
    const t = "2026-09-20T10:00:00.000Z";
    const a = state({ moodChecks: [mood("x", t)] });
    const b = state({ moodChecks: [mood("y", t)] });
    expect(ids(mergeStates(a, b, { accountId: ACCOUNT }).moodChecks)).toEqual(["x", "y"]);
    expect(ids(mergeStates(b, a, { accountId: ACCOUNT }).moodChecks)).toEqual(["x", "y"]);
  });

  it("기록장 글은 id로 합치고, 같은 글의 댓글도 id로 합쳐 오래된 순", () => {
    const server = state({
      communityPosts: [
        post("p1", "2026-09-01T00:00:00.000Z", [comment("c1", "2026-09-02T00:00:00.000Z"), comment("c3", "2026-09-04T00:00:00.000Z")]),
      ],
    });
    const local = state({
      communityPosts: [
        post("p2", "2026-09-05T00:00:00.000Z"),
        post("p1", "2026-09-01T00:00:00.000Z", [comment("c1", "2026-09-02T00:00:00.000Z"), comment("c2", "2026-09-03T00:00:00.000Z")]),
      ],
    });
    const merged = mergeStates(server, local, { accountId: ACCOUNT });
    expect(ids(merged.communityPosts)).toEqual(["p2", "p1"]);
    expect(ids(merged.communityPosts[1].comments)).toEqual(["c1", "c2", "c3"]);
  });

  it("합치기를 다시 해도 같다(서버에 올린 결과를 다른 기기가 합쳐도 바뀌지 않음)", () => {
    const server = onboarded({ symptomHistory: [symptom("a", "2026-09-10T10:00:00.000Z")], communityPosts: [post("p1", "2026-09-01T00:00:00.000Z", [comment("c1", "2026-09-02T00:00:00.000Z")])] });
    const local = state({ symptomHistory: [symptom("b", "2026-09-11T10:00:00.000Z")], communityPosts: [post("p1", "2026-09-01T00:00:00.000Z", [comment("c2", "2026-09-03T00:00:00.000Z")])] });
    const once = mergeStates(server, local, { accountId: ACCOUNT });
    expect(canonicalJSON(mergeStates(once, local, { accountId: ACCOUNT }))).toBe(canonicalJSON(once));
    expect(canonicalJSON(mergeStates(server, once, { accountId: ACCOUNT }))).toBe(canonicalJSON(once));
  });
});

describe("mergeStates — 프로필·산모수첩·온보딩(첫 합치기)", () => {
  it("서버가 온보딩을 마쳤으면 서버의 프로필·산모수첩", () => {
    const server = onboarded({ maternity: { ...initialState().maternity, gdm: true } });
    const local = state(); // 새 브라우저 — 온보딩 전
    const merged = mergeStates(server, local, { accountId: ACCOUNT });
    expect(merged.hasOnboarded).toBe(true);
    expect(merged.profile).toEqual(server.profile);
    expect(merged.maternity.gdm).toBe(true);
  });

  it("서버가 온보딩 전이면 이 브라우저의 프로필(게스트로 쓰던 온보딩 결과를 지키기)", () => {
    const server = state();
    const local = onboarded({ profile: { ...onboarded().profile, heightCm: 158 } });
    const merged = mergeStates(server, local, { accountId: ACCOUNT });
    expect(merged.hasOnboarded).toBe(true);
    expect(merged.profile.heightCm).toBe(158);
    expect(merged.profile.consentAccepted).toBe(true);
  });

  it("마음 카드 접어두기 기한은 둘 중 늦은 쪽, 주인은 로그인한 계정", () => {
    const merged = mergeStates(
      state({ moodCardSnoozedUntil: "2026-09-30T00:00:00.000Z", ownerAccountID: "guest-x" }),
      state({ moodCardSnoozedUntil: "2026-10-02T00:00:00.000Z", ownerAccountID: "guest-y" }),
      { accountId: ACCOUNT },
    );
    expect(merged.moodCardSnoozedUntil).toBe("2026-10-02T00:00:00.000Z");
    expect(merged.ownerAccountID).toBe(ACCOUNT);
    expect(mergeStates(state({ moodCardSnoozedUntil: null }), state({ moodCardSnoozedUntil: "2026-10-02T00:00:00.000Z" }), { accountId: ACCOUNT }).moodCardSnoozedUntil).toBe(
      "2026-10-02T00:00:00.000Z",
    );
  });
});

describe("mergeStates — 충돌 뒤 다시 합치기(base 있음)", () => {
  it("이 브라우저가 base 뒤에 바꾼 칸만 이 브라우저 값, 나머지는 서버 값", () => {
    const base = onboarded();
    // 다른 기기: 키를 바꿈 / 이 브라우저: 체중·산모수첩을 바꿈
    const server = onboarded({ profile: { ...base.profile, heightCm: 162 } });
    const local = onboarded({ profile: { ...base.profile, currentWeightKg: 58 }, maternity: { ...base.maternity, anemia: true } });
    const merged = mergeStates(server, local, { accountId: ACCOUNT, base });
    expect(merged.profile.heightCm).toBe(162);
    expect(merged.profile.currentWeightKg).toBe(58);
    expect(merged.maternity.anemia).toBe(true);
  });

  it("base가 없으면(첫 합치기) 이 브라우저의 방금 고친 값보다 온보딩을 마친 서버가 이긴다", () => {
    const base = onboarded();
    const server = onboarded({ profile: { ...base.profile, heightCm: 162 } });
    const local = onboarded({ profile: { ...base.profile, currentWeightKg: 58 } });
    const merged = mergeStates(server, local, { accountId: ACCOUNT });
    expect(merged.profile.currentWeightKg).toBe(0);
  });
});
