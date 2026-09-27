import { describe, expect, it } from "vitest";
import type { MoodCheckRecord, PersistedState, SymptomRecord } from "@/domain/types";
import { displayName, isGuestID, kakaoAccountID, makeGuestID, decodeAccount } from "./account";
import { initialState } from "./defaults";
import {
  addComment,
  addMoodCheck,
  addPost,
  addSymptomRecord,
  bindToAccount,
  canSubmitComment,
  canSubmitPost,
  completeOnboarding,
  eraseAll,
  isMoodCardSnoozed,
  latestRecord,
  shouldEraseOnBind,
  snoozeMoodCard,
  todayMoodCheck,
  updateMaternity,
  updateProfile,
} from "./state";

const NOW = new Date("2026-09-23T21:30:00+09:00");

function symptom(i: number): SymptomRecord {
  return {
    id: `s${i}`,
    date: new Date(NOW.getTime() - i * 60_000).toISOString(),
    lochiaIncreased: false,
    lochiaRed: false,
    feverEvent: false,
    painNrs: 0,
    redFlagCode: null,
    postpartumDays: 10,
  };
}

function mood(i: number, date = NOW): MoodCheckRecord {
  return { id: `m${i}`, date: date.toISOString(), questionID: 1, answer: "no" };
}

/** 건강 데이터가 조금 들어 있는 상태 */
function withData(owner: string | null): PersistedState {
  let s = completeOnboarding(initialState());
  s = updateProfile(s, { deliveryDate: "2026-07-17", deliveryMethod: "cesarean" });
  s = updateMaternity(s, { diastasisRecti: true });
  s = addSymptomRecord(s, symptom(0));
  return { ...s, ownerAccountID: owner };
}

describe("온보딩·프로필", () => {
  it("completeOnboarding은 동의와 온보딩 완료를 함께 켠다", () => {
    const s = completeOnboarding(initialState());
    expect(s.hasOnboarded).toBe(true);
    expect(s.profile.consentAccepted).toBe(true);
  });

  it("updateProfile은 주어진 필드만 바꾸고 undefined는 무시한다", () => {
    const s = updateProfile(initialState(), { deliveryDate: "2026-07-17", goal: "homemaker", isBreastfeeding: undefined });
    expect(s.profile.deliveryDate).toBe("2026-07-17");
    expect(s.profile.goal).toBe("homemaker");
    expect(s.profile.isBreastfeeding).toBe(true);
  });

  it("updateProfile은 저장 형식으로 정규화한다(ISO 시각 → 로컬 날짜, 없는 날짜는 받지 않음)", () => {
    expect(updateProfile(initialState(), { deliveryDate: "2026-07-16T15:30:00Z" }).profile.deliveryDate).toBe("2026-07-17");
    expect(updateProfile(initialState(), { deliveryDate: "2026-02-31" }).profile.deliveryDate).toBeNull();
  });

  it("출산일은 한 번 들어가면 빈 입력·null·없는 날짜로 지워지지 않는다(Models.swift:69 non-optional)", () => {
    const s = withData(null);
    expect(s.profile.deliveryDate).toBe("2026-07-17");
    for (const bad of ["", null, "2026-02-31", "어제"]) {
      const next = updateProfile(s, { deliveryDate: bad as unknown as string });
      expect(next.profile.deliveryDate).toBe("2026-07-17");
    }
    expect(updateProfile(s, { deliveryDate: "2026-07-20" }).profile.deliveryDate).toBe("2026-07-20");
  });

  it("못 읽는 값은 기본값이 아니라 이전 값 — 분만 방식·목표·복직일은 null로 비울 수 있다", () => {
    let s = updateProfile(initialState(), {
      goal: "returningToWork",
      returnToWorkDate: "2026-12-01",
      heightCm: 162,
      isBreastfeeding: false,
    });
    s = updateProfile(s, {
      goal: "retired" as unknown as "homemaker",
      returnToWorkDate: "",
      heightCm: Number.NaN,
      isBreastfeeding: "no" as unknown as boolean,
    });
    expect(s.profile).toMatchObject({
      goal: "returningToWork",
      returnToWorkDate: "2026-12-01",
      heightCm: 162,
      isBreastfeeding: false,
    });

    s = updateProfile(s, { deliveryMethod: "vaginal" });
    s = updateProfile(s, { goal: null, returnToWorkDate: null, deliveryMethod: null, heightCm: 0 });
    expect(s.profile).toMatchObject({ goal: null, returnToWorkDate: null, deliveryMethod: null, heightCm: 0 });
  });

  it("updateMaternity는 boolean이 아닌 값을 무시한다(이전 값 유지)", () => {
    const s = updateMaternity(initialState(), { isPrimiparous: false, diastasisRecti: true });
    const next = updateMaternity(s, { isPrimiparous: "yes" as unknown as boolean, diastasisRecti: null as unknown as boolean });
    expect(next.maternity).toEqual(s.maternity);
  });

  it("updateMaternity는 7항목 중 주어진 것만 바꾼다(분석 폼 저장 — 감사 #2)", () => {
    const s = updateMaternity(initialState(), { pelvicPain: true, isPrimiparous: false });
    expect(s.maternity).toEqual({
      isPrimiparous: false,
      gdm: false,
      anemia: false,
      heavyBleeding: false,
      preeclampsia: false,
      pelvicPain: true,
      diastasisRecti: false,
    });
  });
});

describe("기록 상한", () => {
  it("증상 기록은 맨 앞에 넣고 50건까지 — 51번째에서 가장 오래된 것이 빠진다", () => {
    let s = initialState();
    for (let i = 1; i <= 51; i++) s = addSymptomRecord(s, symptom(i));
    expect(s.symptomHistory).toHaveLength(50);
    expect(s.symptomHistory[0].id).toBe("s51");
    expect(s.symptomHistory[49].id).toBe("s2");
    expect(latestRecord(s)?.id).toBe("s51");
  });

  it("기분 답은 맨 앞에 넣고 60건까지", () => {
    let s = initialState();
    for (let i = 1; i <= 61; i++) s = addMoodCheck(s, mood(i));
    expect(s.moodChecks).toHaveLength(60);
    expect(s.moodChecks[0].id).toBe("m61");
    expect(s.moodChecks[59].id).toBe("m2");
  });

  it("기록이 없으면 latestRecord는 null", () => {
    expect(latestRecord(initialState())).toBeNull();
  });
});

describe("기분 살피기", () => {
  it("todayMoodCheck는 로컬 오늘 날짜의 답만", () => {
    const yesterday = new Date("2026-09-22T23:59:00+09:00");
    const todayEarly = new Date("2026-09-23T00:01:00+09:00"); // UTC로는 9/22
    let s = addMoodCheck(initialState(), mood(1, yesterday));
    expect(todayMoodCheck(s, NOW)).toBeNull();
    s = addMoodCheck(s, mood(2, todayEarly));
    expect(todayMoodCheck(s, NOW)?.id).toBe("m2");
  });

  it("스누즈는 기본 7일 — 기한 전까지만 숨긴다", () => {
    const s = snoozeMoodCard(initialState(), NOW);
    expect(s.moodCardSnoozedUntil).toBe(new Date("2026-09-30T21:30:00+09:00").toISOString());
    expect(isMoodCardSnoozed(s, new Date("2026-09-30T21:29:59+09:00"))).toBe(true);
    expect(isMoodCardSnoozed(s, new Date("2026-09-30T21:30:00+09:00"))).toBe(false);
    expect(isMoodCardSnoozed(initialState(), NOW)).toBe(false);
  });

  it("스누즈 일수를 줄 수 있다", () => {
    const s = snoozeMoodCard(initialState(), NOW, 1);
    expect(s.moodCardSnoozedUntil).toBe(new Date("2026-09-24T21:30:00+09:00").toISOString());
  });
});

describe("기록장 글·댓글", () => {
  const meta = (id: string, authorName = "게스트", now = NOW) => ({ id, authorName, now });

  it("제목은 trim 후 필수, 본문은 선택(trim)", () => {
    expect(canSubmitPost("   ")).toBe(false);
    expect(canSubmitPost("\n\t")).toBe(false);
    expect(canSubmitPost(" 산책 ")).toBe(true);

    const empty = initialState();
    expect(addPost(empty, { title: "  ", body: "내용" }, meta("p0"))).toBe(empty);

    const s = addPost(empty, { title: "  오늘 첫 산책 ", body: "  " }, meta("p1"));
    expect(s.communityPosts[0]).toEqual({
      id: "p1",
      title: "오늘 첫 산책",
      body: "",
      authorName: "게스트",
      date: NOW.toISOString(),
      comments: [],
    });
  });

  it("글은 최신순(맨 앞)", () => {
    let s = addPost(initialState(), { title: "첫 글", body: "" }, meta("p1"));
    s = addPost(s, { title: "둘째 글", body: "" }, meta("p2"));
    expect(s.communityPosts.map((p) => p.id)).toEqual(["p2", "p1"]);
  });

  it("댓글은 오래된 순으로 뒤에 붙고, 빈 댓글·없는 글은 거부", () => {
    let s = addPost(initialState(), { title: "글", body: "" }, meta("p1"));
    expect(canSubmitComment("  ")).toBe(false);
    expect(addComment(s, "p1", "   ", meta("c0"))).toBe(s);
    expect(addComment(s, "없는글", "안녕", meta("c0"))).toBe(s);

    s = addComment(s, "p1", " 첫 댓글 ", meta("c1", "게스트", new Date("2026-09-23T21:31:00+09:00")));
    s = addComment(s, "p1", "둘째 댓글", meta("c2", "게스트", new Date("2026-09-23T21:32:00+09:00")));
    expect(s.communityPosts[0].comments.map((c) => [c.id, c.text])).toEqual([
      ["c1", "첫 댓글"],
      ["c2", "둘째 댓글"],
    ]);
  });

  it("작성자 이름은 작성 시점 스냅샷", () => {
    let s = addPost(initialState(), { title: "글", body: "" }, meta("p1", "게스트"));
    s = addComment(s, "p1", "댓글", meta("c1", "민지"));
    expect(s.communityPosts[0].authorName).toBe("게스트");
    expect(s.communityPosts[0].comments[0].authorName).toBe("민지");
  });

  it("원래 state는 바꾸지 않는다", () => {
    const s0 = addPost(initialState(), { title: "글", body: "" }, meta("p1"));
    const snapshot = JSON.stringify(s0);
    addComment(s0, "p1", "댓글", meta("c1"));
    expect(JSON.stringify(s0)).toBe(snapshot);
  });
});

describe("계정 귀속 bindToAccount — 3×3 (AppStore.swift:38-54)", () => {
  const G1 = makeGuestID("11111111-1111-4111-8111-111111111111");
  const G2 = makeGuestID("22222222-2222-4222-8222-222222222222");
  const A = kakaoAccountID(4012345678);
  const B = kakaoAccountID(5000000001);

  // [주인, 들어온 id, 기대: "keep"(데이터 보존) | "erase"(삭제 후 시작)]
  const table: [string, string | null, string, "keep" | "erase"][] = [
    ["주인 없음 → 게스트", null, G1, "keep"],
    ["주인 없음 → 실제 계정", null, A, "keep"],
    ["게스트 → 같은 게스트", G1, G1, "keep"],
    ["게스트 → 다른 게스트", G1, G2, "keep"],
    ["게스트 → 실제 계정", G1, A, "keep"],
    ["실제 A → 같은 A", A, A, "keep"],
    ["실제 A → 다른 실제 B", A, B, "erase"],
    ["실제 A → 게스트", A, G1, "erase"],
    // 주인을 알 수 없음(빈 문자열 — 손상·다른 버전 데이터): iOS처럼 실제 계정으로 취급해 누구에게도 넘기지 않는다.
    ["알 수 없는 주인(\"\") → 게스트", "", G1, "erase"],
    ["알 수 없는 주인(\"\") → 실제 계정", "", A, "erase"],
  ];

  it.each(table)("%s", (_label, owner, id, expected) => {
    const before = withData(owner);
    const after = bindToAccount(before, id);
    expect(after.ownerAccountID).toBe(id);
    expect(shouldEraseOnBind(owner, id)).toBe(expected === "erase");
    if (expected === "keep") {
      expect({ ...after, ownerAccountID: owner }).toEqual(before);
    } else {
      expect(after).toEqual({ ...initialState(), ownerAccountID: id });
    }
  });

  it("주인과 같은 id면 같은 객체(저장 생략)", () => {
    const s = withData(A);
    expect(bindToAccount(s, A)).toBe(s);
  });

  it("빈 id는 무시", () => {
    const s = withData(A);
    expect(bindToAccount(s, "")).toBe(s);
  });

  it("eraseAll은 초기 상태(산모수첩 초산 true 포함)", () => {
    expect(eraseAll()).toEqual(initialState());
    expect(eraseAll().maternity.isPrimiparous).toBe(true);
  });
});

describe("계정 표시", () => {
  it("isGuestID는 guest- 접두만 본다", () => {
    expect(isGuestID("guest-abc")).toBe(true);
    expect(isGuestID("kakao-1")).toBe(false);
    expect(isGuestID("")).toBe(false);
  });

  it("displayName 폴백(AccountStore.swift:74-82)", () => {
    expect(displayName({ id: "kakao-1", name: "민지", provider: "kakao" })).toBe("민지");
    expect(displayName({ id: "kakao-1", name: "", provider: "kakao" })).toBe("카카오 사용자");
    expect(displayName({ id: "kakao-1", name: null, provider: "kakao" })).toBe("카카오 사용자");
    expect(displayName({ id: "guest-1", name: null, provider: "guest" })).toBe("게스트");
    expect(displayName({ id: "x", name: null, provider: "naver" })).toBe("사용자");
    expect(displayName(null)).toBe("사용자");
  });

  it("decodeAccount: provider 없으면 guest, id 없거나 비면 로그인 안 함", () => {
    expect(decodeAccount({ id: "guest-1" })).toEqual({ id: "guest-1", name: null, provider: "guest" });
    expect(decodeAccount({ id: "", provider: "kakao" })).toBeNull();
    expect(decodeAccount({ name: "민지" })).toBeNull();
    expect(decodeAccount("guest-1")).toBeNull();
  });
});
