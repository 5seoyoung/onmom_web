import { describe, expect, it } from "vitest";
import { initialState } from "./defaults";
import { decodeCalendarDate, decodeInstant, decodeOwner, decodePersisted, type DecodeDeps } from "./decode";
import { bindToAccount, shouldEraseOnBind } from "./state";

const NOW = new Date("2026-09-23T10:00:00+09:00");

function deps(): DecodeDeps {
  let n = 0;
  return { now: NOW, newId: () => `gen-${++n}` };
}

// iOS AppStore.save()가 쓴 모양 그대로 — JSONEncoder 기본값이라 날짜가 2001 기준 초(Double)다.
const IOS_JSON = {
  hasOnboarded: true,
  profile: {
    deliveryDate: 779760000.0, // 2025-09-17T00:00:00Z = 한국 2025-09-17 09:00
    deliveryMethod: "cesarean",
    goal: "returningToWork",
    returnToWorkDate: 800000000.0,
    isBreastfeeding: false,
    consentAccepted: true,
    heightCm: 162,
    currentWeightKg: 64.5,
    prePregnancyWeightKg: 56,
    neighborhood: "서울 동대문구 회기동",
  },
  symptomHistory: [
    {
      id: "6F9619FF-8B86-D011-B42D-00C04FC964FF",
      date: 780000000.5,
      lochiaIncreased: false,
      lochiaRed: true,
      feverEvent: true,
      painNrs: 3,
      redFlagCode: "fever_infection",
      postpartumDays: 2,
    },
  ],
  communityPosts: [
    {
      id: "A1",
      title: "오늘 첫 산책",
      body: "10분 걸었는데 괜찮았다.",
      authorName: "게스트",
      date: 779800000,
      comments: [{ id: "C1", text: "잘했어", authorName: "게스트", date: 779800100 }],
    },
  ],
  maternity: { isPrimiparous: false, gdm: true, anemia: false, heavyBleeding: false, preeclampsia: false, pelvicPain: true, diastasisRecti: true },
  ownerAccountID: "kakao-4012345678",
  moodChecks: [{ id: "M1", date: 779900000, questionID: 3, answer: "no" }],
  moodCardSnoozedUntil: 780100000,
};

describe("decodePersisted — iOS 저장 JSON(Double 날짜)", () => {
  const s = decodePersisted(IOS_JSON, deps());

  it("출산일 Double은 2001 기준 초 → 그 시각의 로컬(한국) 날짜", () => {
    expect(s.profile.deliveryDate).toBe("2025-09-17");
    // 800000000 = 2026-05-09T06:13:20Z → 한국 2026-05-09
    expect(s.profile.returnToWorkDate).toBe("2026-05-09");
  });

  it("UTC 날짜와 로컬 날짜가 다른 시각은 로컬 날짜를 쓴다", () => {
    // 779727600 = 2025-09-16T15:00:00Z = 한국 2025-09-17 00:00
    expect(decodeCalendarDate(779727600)).toBe("2025-09-17");
    // 1초 전은 한국 9/16 23:59:59
    expect(decodeCalendarDate(779727599)).toBe("2025-09-16");
  });

  it("기록 시각 Double은 ISO 시각으로(소수 초 유지)", () => {
    expect(s.symptomHistory[0].date).toBe("2025-09-19T18:40:00.500Z");
    expect(s.communityPosts[0].date).toBe(new Date((779800000 + 978307200) * 1000).toISOString());
    expect(s.communityPosts[0].comments[0].date).toBe(new Date((779800100 + 978307200) * 1000).toISOString());
    expect(s.moodChecks[0].date).toBe(new Date((779900000 + 978307200) * 1000).toISOString());
    expect(s.moodCardSnoozedUntil).toBe(new Date((780100000 + 978307200) * 1000).toISOString());
  });

  it("나머지 필드는 그대로", () => {
    expect(s.hasOnboarded).toBe(true);
    expect(s.profile).toMatchObject({
      deliveryMethod: "cesarean",
      goal: "returningToWork",
      isBreastfeeding: false,
      consentAccepted: true,
      heightCm: 162,
      currentWeightKg: 64.5,
      prePregnancyWeightKg: 56,
      neighborhood: "서울 동대문구 회기동",
    });
    expect(s.symptomHistory[0]).toMatchObject({
      id: "6F9619FF-8B86-D011-B42D-00C04FC964FF",
      lochiaRed: true,
      feverEvent: true,
      painNrs: 3,
      redFlagCode: "fever_infection",
      postpartumDays: 2,
    });
    expect(s.maternity).toEqual(IOS_JSON.maternity);
    expect(s.ownerAccountID).toBe("kakao-4012345678");
    expect(s.moodChecks[0]).toMatchObject({ id: "M1", questionID: 3, answer: "no" });
    expect(s.communityPosts[0].comments).toHaveLength(1);
  });

  it("디코딩 결과를 저장했다 다시 읽으면 같다", () => {
    const again = decodePersisted(JSON.parse(JSON.stringify(s)), deps());
    expect(again).toEqual(s);
  });
});

describe("decodePersisted — 없는 키는 기본값", () => {
  it("빈 객체 → 초기 상태", () => {
    expect(decodePersisted({}, deps())).toEqual(initialState());
  });

  it("프로필 기본값: 수유 true, 출산일 없음은 null(오늘로 지어내지 않음)", () => {
    const s = decodePersisted({ profile: {} }, deps());
    expect(s.profile).toEqual({
      deliveryDate: null,
      deliveryMethod: null,
      goal: null,
      returnToWorkDate: null,
      isBreastfeeding: true,
      consentAccepted: false,
      heightCm: 0,
      currentWeightKg: 0,
      prePregnancyWeightKg: 0,
      neighborhood: "",
    });
  });

  it("산모수첩: 초산만 기본 true, 나머지 6개 false — 키가 일부만 있어도", () => {
    expect(decodePersisted({}, deps()).maternity).toEqual({
      isPrimiparous: true,
      gdm: false,
      anemia: false,
      heavyBleeding: false,
      preeclampsia: false,
      pelvicPain: false,
      diastasisRecti: false,
    });
    const partial = decodePersisted({ maternity: { gdm: true } }, deps()).maternity;
    expect(partial.isPrimiparous).toBe(true);
    expect(partial.gdm).toBe(true);
  });

  it("기록에 id·날짜가 없으면 새 id·지금 시각(iOS UUID()·Date()와 같음)", () => {
    const s = decodePersisted({ symptomHistory: [{}], moodChecks: [{}], communityPosts: [{ comments: [{}] }] }, deps());
    expect(s.symptomHistory[0]).toEqual({
      id: "gen-1",
      date: NOW.toISOString(),
      lochiaIncreased: false,
      lochiaRed: false,
      feverEvent: false,
      painNrs: 0,
      redFlagCode: null,
      postpartumDays: null,
    });
    expect(s.communityPosts[0]).toMatchObject({ title: "", body: "", authorName: "", date: NOW.toISOString() });
    expect(s.communityPosts[0].comments[0]).toMatchObject({ text: "", authorName: "", date: NOW.toISOString() });
    expect(s.moodChecks[0]).toMatchObject({ date: NOW.toISOString(), questionID: 0, answer: "unsure" });
  });

  it("구버전 기록의 postpartumDays 없음은 null(오로 판정 보류)", () => {
    const s = decodePersisted({ symptomHistory: [{ id: "x", date: 780000000 }] }, deps());
    expect(s.symptomHistory[0].postpartumDays).toBeNull();
  });
});

describe("decodePersisted — 모르는 값·틀린 타입", () => {
  it("모르는 enum 문자열은 null", () => {
    const s = decodePersisted({ profile: { deliveryMethod: "vbac", goal: "student" } }, deps());
    expect(s.profile.deliveryMethod).toBeNull();
    expect(s.profile.goal).toBeNull();
  });

  it("모르는 기분 답은 unsure(신호로 세지 않음)", () => {
    const s = decodePersisted(
      { moodChecks: [{ id: "a", answer: "maybe" }, { id: "b", answer: 1 }, { id: "c", answer: "yes" }] },
      deps(),
    );
    expect(s.moodChecks.map((m) => m.answer)).toEqual(["unsure", "unsure", "yes"]);
  });

  it("타입이 틀린 필드만 기본값 — 저장 전체를 버리지 않는다", () => {
    const s = decodePersisted(
      {
        hasOnboarded: "yes",
        profile: { isBreastfeeding: "no", heightCm: "162", deliveryDate: "어제", consentAccepted: true },
        maternity: { isPrimiparous: 0, gdm: true },
        symptomHistory: [{ id: "ok", painNrs: 3.5, lochiaRed: true }, "garbage", null, 42],
        ownerAccountID: 12,
        moodCardSnoozedUntil: "나중에",
      },
      deps(),
    );
    expect(s.hasOnboarded).toBe(false);
    expect(s.profile.isBreastfeeding).toBe(true);
    expect(s.profile.heightCm).toBe(0);
    expect(s.profile.deliveryDate).toBeNull();
    expect(s.profile.consentAccepted).toBe(true);
    expect(s.maternity.isPrimiparous).toBe(true);
    expect(s.maternity.gdm).toBe(true);
    expect(s.symptomHistory).toHaveLength(1);
    expect(s.symptomHistory[0]).toMatchObject({ id: "ok", painNrs: 0, lochiaRed: true });
    expect(s.ownerAccountID).toBe(""); // 주인을 못 읽으면 "알 수 없는 실제 계정" — 아래 테스트
    expect(s.moodCardSnoozedUntil).toBeNull();
  });

  it("주인 id: 없거나 null이면 주인 없음, 빈 문자열은 그대로, 문자열이 아니면 알 수 없는 실제 계정(\"\")", () => {
    expect(decodePersisted({}, deps()).ownerAccountID).toBeNull();
    expect(decodePersisted({ ownerAccountID: null }, deps()).ownerAccountID).toBeNull();
    expect(decodePersisted({ ownerAccountID: "kakao-1" }, deps()).ownerAccountID).toBe("kakao-1");
    expect(decodePersisted({ ownerAccountID: "" }, deps()).ownerAccountID).toBe("");
    for (const bad of [12, true, {}, ["kakao-1"]]) {
      expect(decodeOwner(bad)).toBe("");
    }
  });

  it("주인을 모르는 데이터는 누가 로그인해도 넘겨주지 않는다(AppStore.swift:49 — 삭제 후 귀속)", () => {
    for (const owner of ["", 12]) {
      const s = decodePersisted({ hasOnboarded: true, profile: { deliveryDate: "2026-07-17" }, ownerAccountID: owner }, deps());
      for (const id of ["guest-1", "kakao-1"]) {
        expect(shouldEraseOnBind(s.ownerAccountID, id)).toBe(true);
        expect(bindToAccount(s, id)).toEqual({ ...initialState(), ownerAccountID: id });
      }
    }
  });

  it.each([null, undefined, "text", 42, [], true])("루트가 객체가 아니면(%j) 초기 상태", (raw) => {
    expect(decodePersisted(raw, deps())).toEqual(initialState());
  });
});

describe("날짜 문자열", () => {
  it("달력 날짜: YYYY-MM-DD 그대로, ISO 시각은 로컬 날짜로, 없는 날짜는 null", () => {
    expect(decodeCalendarDate("2026-07-17")).toBe("2026-07-17");
    expect(decodeCalendarDate("2026-07-16T15:30:00Z")).toBe("2026-07-17");
    expect(decodeCalendarDate("2026-02-31")).toBeNull();
    expect(decodeCalendarDate("2026-02-31T00:00:00Z")).toBeNull();
    expect(decodeCalendarDate("7/17/2026")).toBeNull();
    expect(decodeCalendarDate(null)).toBeNull();
  });

  it("시각: ISO(오프셋 포함)는 UTC ISO로 정규화, YYYY-MM-DD는 로컬 자정", () => {
    expect(decodeInstant("2026-09-18T08:13:00+09:00")).toBe("2026-09-17T23:13:00.000Z");
    expect(decodeInstant("2026-09-18T08:13:00.123Z")).toBe("2026-09-18T08:13:00.123Z");
    expect(decodeInstant("2026-09-18")).toBe("2026-09-17T15:00:00.000Z");
    expect(decodeInstant("Fri Sep 18 2026")).toBeNull();
    expect(decodeInstant(Number.NaN)).toBeNull();
    expect(decodeInstant(1e20)).toBeNull();
  });
});
