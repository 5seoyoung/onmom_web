import { describe, expect, it } from "vitest";
import type { UserProfile } from "@/domain/types";
import { defaultMaternity, defaultProfile, initialState } from "@/store/defaults";
import { updateMaternity, updateProfile } from "@/store/state";
import {
  MATERNITY_TOGGLES,
  SETTINGS_TEXT,
  draftFromState,
  draftProblem,
  draftToPatches,
  settingsProfileRows,
  showsReturnToWork,
  signOutMessage,
  type ProfileDraft,
} from "./settingsView";

const profile = (patch: Partial<UserProfile> = {}): UserProfile => ({ ...defaultProfile(), ...patch });
const NOW = new Date(2026, 8, 27, 10, 0); // 2026-09-27 로컬

describe("signOutMessage", () => {
  it("게스트와 그 외 계정의 안내가 다르다(MoreView.swift:99-101)", () => {
    expect(signOutMessage("guest")).toBe("기록은 이 기기에 남아 있어요. 다시 게스트로 시작하면 이어서 볼 수 있어요.");
    const other =
      "기록은 이 기기에 남아 있어요. 같은 계정으로 다시 로그인하면 이어서 볼 수 있지만, 다른 계정이나 게스트로 들어오면 새로 시작해요.";
    expect(signOutMessage("kakao")).toBe(other);
    expect(signOutMessage(null)).toBe(other);
  });

  it("계정 삭제 안내는 iOS 기본 문구(Apple 안내 없음)", () => {
    expect(SETTINGS_TEXT.deleteMessage).toBe(
      "계정 정보와 이 기기에 저장된 프로필·증상 기록·글이 모두 삭제됩니다. 이 작업은 되돌릴 수 없어요.",
    );
    expect(SETTINGS_TEXT.deleteMessage).not.toContain("Apple");
  });
});

describe("settingsProfileRows", () => {
  it("settings.png — 63일차 · 제왕절개 · 미설정 · 내 동네", () => {
    const rows = settingsProfileRows(
      profile({ deliveryDate: "2026-07-26", deliveryMethod: "cesarean", neighborhood: "서울 동대문구 회기동" }),
      NOW,
    );
    expect(rows.map((r) => [r.label, r.value])).toEqual([
      ["산후 일수", "63일차"],
      ["분만 방식", "제왕절개"],
      ["목표", "미설정"],
      ["내 동네", "서울 동대문구 회기동"],
    ]);
  });

  it("출산일이 없으면 0일차를 지어내지 않고 미설정, 동네가 비면 행 없음", () => {
    const rows = settingsProfileRows(profile({ goal: "returningToWork", neighborhood: "  " }), NOW);
    expect(rows.map((r) => [r.label, r.value])).toEqual([
      ["산후 일수", "미설정"],
      ["분만 방식", "미설정"],
      ["목표", "복직 예정"],
    ]);
  });
});

describe("프로필 편집 초안", () => {
  it("저장값에서 시작 — 없는 날짜는 빈 칸, 분만 방식·목표는 고르지 않은 채로", () => {
    const d = draftFromState(defaultProfile(), defaultMaternity());
    expect(d.deliveryDate).toBe("");
    expect(d.returnToWorkDate).toBe("");
    expect(d.deliveryMethod).toBeNull();
    expect(d.goal).toBeNull();
    expect(d.isBreastfeeding).toBe(true);
    expect(d.maternity.isPrimiparous).toBe(true);
  });

  it("출산일 검사 — 비었거나 못 읽으면 missing, 오늘보다 뒤면 future, 오늘은 허용", () => {
    const base = draftFromState(profile({ deliveryDate: "2026-07-26" }), defaultMaternity());
    const today = "2026-09-27";
    expect(draftProblem(base, today)).toBeNull();
    expect(draftProblem({ ...base, deliveryDate: "" }, today)).toBe("deliveryDateMissing");
    expect(draftProblem({ ...base, deliveryDate: "2026-02-31" }, today)).toBe("deliveryDateMissing");
    expect(draftProblem({ ...base, deliveryDate: "2026-09-27" }, today)).toBeNull();
    expect(draftProblem({ ...base, deliveryDate: "2026-09-28" }, today)).toBe("deliveryDateFuture");
  });

  it("복직 예정일은 복직 예정일 때만 입력 칸을 보인다", () => {
    expect(showsReturnToWork("returningToWork")).toBe(true);
    expect(showsReturnToWork("homemaker")).toBe(false);
    expect(showsReturnToWork(null)).toBe(false);
  });

  it("저장 값 — 복직일 빈 칸은 null, 동네는 trim, 산모수첩은 7항목 전부", () => {
    const draft: ProfileDraft = {
      ...draftFromState(profile({ deliveryDate: "2026-07-26", returnToWorkDate: "2026-12-01" }), defaultMaternity()),
      returnToWorkDate: "",
      neighborhood: " 서울 노원구 ",
      deliveryMethod: "vaginal",
      maternity: { ...defaultMaternity(), diastasisRecti: true },
    };
    const { profile: p, maternity } = draftToPatches(draft);
    expect(p.returnToWorkDate).toBeNull();
    expect(p.neighborhood).toBe("서울 노원구");
    expect(p.deliveryMethod).toBe("vaginal");
    expect(Object.keys(maternity).sort()).toEqual(MATERNITY_TOGGLES.map((t) => t.key).sort());
  });

  it("스토어에 넣으면 그대로 남는다 — 출산일 변경·복직일 지우기·DRA 켜기", () => {
    let s = updateProfile(initialState(), { deliveryDate: "2026-07-01", goal: "returningToWork", returnToWorkDate: "2026-12-01" });
    const draft: ProfileDraft = {
      ...draftFromState(s.profile, s.maternity),
      deliveryDate: "2026-07-26",
      returnToWorkDate: "",
      heightCm: 160,
      currentWeightKg: 62.5,
      maternity: { ...s.maternity, diastasisRecti: true, isPrimiparous: false },
    };
    const patches = draftToPatches(draft);
    s = updateMaternity(updateProfile(s, patches.profile), patches.maternity);
    expect(s.profile).toMatchObject({
      deliveryDate: "2026-07-26",
      goal: "returningToWork",
      returnToWorkDate: null,
      heightCm: 160,
      currentWeightKg: 62.5,
    });
    expect(s.maternity).toMatchObject({ diastasisRecti: true, isPrimiparous: false });
  });
});

describe("MATERNITY_TOGGLES", () => {
  it("MoreView 순서·라벨 7개", () => {
    expect(MATERNITY_TOGGLES.map((t) => t.label)).toEqual([
      "초산",
      "임신성 당뇨(GDM)",
      "산후 빈혈",
      "분만 시 출혈 많음",
      "임신중독증·고혈압",
      "골반통·치골결합 이개",
      "복직근 이개(DRA)",
    ]);
  });
});
