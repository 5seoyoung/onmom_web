import { describe, expect, it } from "vitest";
import { defaultMaternity, defaultProfile } from "@/store/defaults";
import type { UserProfile } from "@/domain/types";
import {
  PROFILE_MENU,
  deliveryMethodLabel,
  goalLabel,
  maternityFlags,
  neighborhoodValue,
  postpartumLine,
  profileInfoRows,
} from "./profileView";

const profile = (patch: Partial<UserProfile> = {}): UserProfile => ({ ...defaultProfile(), ...patch });

describe("postpartumLine", () => {
  it("로컬 달력 날짜 차이로 일차·주차를 센다", () => {
    // 2026-07-26 → 2026-09-27 = 63일 = 9주차 (profile.png)
    expect(postpartumLine("2026-07-26", new Date(2026, 8, 27, 0, 5))).toBe("산후 63일차 · 9주차");
    expect(postpartumLine("2026-09-27", new Date(2026, 8, 27, 23, 59))).toBe("산후 0일차 · 0주차");
    expect(postpartumLine("2026-09-20", new Date(2026, 8, 27, 9))).toBe("산후 7일차 · 1주차");
  });

  it("출산일이 없거나 못 읽으면 줄을 만들지 않는다(0일차를 지어내지 않음)", () => {
    expect(postpartumLine(null, new Date(2026, 8, 27))).toBeNull();
    expect(postpartumLine("", new Date(2026, 8, 27))).toBeNull();
    expect(postpartumLine("2026-02-31", new Date(2026, 8, 27))).toBeNull();
  });

  it("미래 출산일은 0일차(postpartumDayCount와 같음)", () => {
    expect(postpartumLine("2026-10-01", new Date(2026, 8, 27))).toBe("산후 0일차 · 0주차");
  });
});

describe("labels", () => {
  it("분만 방식·목표가 없으면 미설정", () => {
    expect(deliveryMethodLabel(null)).toBe("미설정");
    expect(deliveryMethodLabel("cesarean")).toBe("제왕절개");
    expect(deliveryMethodLabel("vaginal")).toBe("자연분만");
    expect(goalLabel(null)).toBe("미설정");
    expect(goalLabel("homemaker")).toBe("전업");
    expect(goalLabel("returningToWork")).toBe("복직 예정");
  });

  it("내 동네는 공백만 있으면 없는 값", () => {
    expect(neighborhoodValue("")).toBeNull();
    expect(neighborhoodValue("   ")).toBeNull();
    expect(neighborhoodValue(" 서울 동대문구 회기동 ")).toBe("서울 동대문구 회기동");
  });
});

describe("profileInfoRows", () => {
  it("기본 프로필 — 분만 방식·목표만, 둘 다 미설정", () => {
    expect(profileInfoRows(profile())).toEqual([
      { key: "deliveryMethod", label: "분만 방식", value: "미설정" },
      { key: "goal", label: "목표", value: "미설정" },
    ]);
  });

  it("동네·BMI가 있으면 그 순서로 붙는다(profile.png)", () => {
    const rows = profileInfoRows(
      profile({ deliveryMethod: "cesarean", neighborhood: "서울 동대문구 회기동", heightCm: 160, currentWeightKg: 62.5 }),
    );
    expect(rows.map((r) => [r.label, r.value])).toEqual([
      ["분만 방식", "제왕절개"],
      ["목표", "미설정"],
      ["내 동네", "서울 동대문구 회기동"],
      ["BMI", "24.4"],
    ]);
  });

  it("BMI는 키와 현재 체중이 둘 다 있어야 — 임신 전 체중만으로는 없음", () => {
    expect(profileInfoRows(profile({ heightCm: 160 })).some((r) => r.key === "bmi")).toBe(false);
    expect(profileInfoRows(profile({ currentWeightKg: 60, prePregnancyWeightKg: 55 })).some((r) => r.key === "bmi")).toBe(
      false,
    );
  });

  it("BMI 표기는 iOS %.1f(정확한 절반은 짝수 쪽)", () => {
    // 200cm · 89kg → 22.25 → "22.2"
    const rows = profileInfoRows(profile({ heightCm: 200, currentWeightKg: 89 }));
    expect(rows.find((r) => r.key === "bmi")?.value).toBe("22.2");
  });
});

describe("maternityFlags", () => {
  it("기본값(초산만 켜짐)이면 칩이 없다", () => {
    expect(maternityFlags(defaultMaternity())).toEqual([]);
  });

  it("다분만부는 초산이 꺼졌을 때만", () => {
    expect(maternityFlags({ ...defaultMaternity(), isPrimiparous: false })).toEqual(["다분만부"]);
  });

  it("모두 켜면 Swift 순서 그대로", () => {
    expect(
      maternityFlags({
        isPrimiparous: false,
        gdm: true,
        anemia: true,
        heavyBleeding: true,
        preeclampsia: true,
        pelvicPain: true,
        diastasisRecti: true,
      }),
    ).toEqual(["다분만부", "임신성 당뇨", "임신중독증·고혈압", "분만 출혈 많음", "산후 빈혈", "골반통", "복직근 이개"]);
  });

  it("profile.png — 골반통·복직근 이개", () => {
    expect(maternityFlags({ ...defaultMaternity(), pelvicPain: true, diastasisRecti: true })).toEqual(["골반통", "복직근 이개"]);
  });
});

describe("PROFILE_MENU", () => {
  it("7개, 순서·경로 고정, 모든 경로는 /로 끝난다", () => {
    expect(PROFILE_MENU.map((m) => [m.title, m.href])).toEqual([
      ["지원사업 추천", "/support/"],
      ["생활 권고", "/lifestyle/"],
      ["약물·음식 체크", "/substance/"],
      ["AI 상담", "/chat/"],
      ["지역 연계", "/region/"],
      ["회복 가이드", "/guide/"],
      ["설정", "/settings/"],
    ]);
    expect(PROFILE_MENU.map((m) => m.subtitle)).toEqual([
      "내 상황에 맞는 산모 지원사업",
      "수면·영양·정신건강",
      "수유 중 안전 분류",
      "산후 회복 질문하기",
      "내 동네 가까운 산부인과 찾기",
      "검증된 가이드라인",
      "계정·알림·개인정보",
    ]);
  });
});
