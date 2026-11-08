import { describe, expect, it } from "vitest";
import { DELIVERY_METHODS, RECOVERY_GOALS } from "./types";

// 분만 방식·목표의 값과 순서는 한 곳(domain/types.ts) — 선택지(온보딩·분석·프로필 편집)와 저장 읽기(store/decode)가 같이 쓴다.
describe("분만 방식·목표 목록", () => {
  it("Swift allCases 순서 그대로(Models.swift DeliveryMethod·RecoveryGoal)", () => {
    expect(DELIVERY_METHODS).toEqual(["vaginal", "cesarean"]);
    expect(RECOVERY_GOALS).toEqual(["homemaker", "returningToWork"]);
  });
});
