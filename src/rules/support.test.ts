import { describe, expect, it } from "vitest";
import {
  SUPPORT_DOMAINS,
  SUPPORT_UNIVERSAL,
  canRecommendSupport,
  checkedSupportDomains,
  toggleSupportQuestion,
} from "./support";

const ids = (checked: number[]) => checkedSupportDomains(new Set(checked)).map((d) => d.id);

describe("지원사업 체크리스트 (SupportProgramView.swift)", () => {
  it("6영역 16문항, 문항 id는 1..16 한 번씩", () => {
    expect(SUPPORT_DOMAINS).toHaveLength(6);
    const questionIds = SUPPORT_DOMAINS.flatMap((d) => d.questions.map((q) => q.id));
    expect(questionIds).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
  });

  it("공통 안내는 체크와 무관 — 정부24 행복출산 원스톱", () => {
    expect(SUPPORT_UNIVERSAL).toEqual({
      name: "정부24 행복출산 원스톱 서비스",
      note: "출생신고와 각종 출산 지원을 한 번에 신청",
      url: "https://www.gov.kr/portal/onestopSvc/happyBirth",
    });
  });

  it("체크가 없으면 추천 버튼 비활성, 결과 없음", () => {
    expect(canRecommendSupport(new Set())).toBe(false);
    expect(canRecommendSupport(new Set([7]))).toBe(true);
    expect(ids([])).toEqual([]);
  });

  it("체크한 문항이 속한 영역만, 표 순서대로(체크 순서와 무관)", () => {
    expect(ids([13])).toEqual([5]);
    expect(ids([16, 1])).toEqual([1, 6]);
    expect(ids([4, 5])).toEqual([2]);
    expect(ids([12, 9, 6, 3])).toEqual([1, 3, 4, 5]);
    expect(ids(Array.from({ length: 16 }, (_, i) => i + 1))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("영역의 해결책 전부를 보여준다 — 문항별로 거르지 않는다", () => {
    const [economy] = checkedSupportDomains(new Set([2]));
    expect(economy.solutions.map((s) => s.name)).toEqual([
      "저소득층 기저귀·조제분유 지원 사업",
      "긴급복지지원제도",
      "첫만남이용권·부모급여",
      "디딤씨앗통장(아동발달지원계좌)",
    ]);
  });

  it("링크는 iOS에 공식 URL이 있는 곳에만 — 공통 안내와 우울증상담센터 전화", () => {
    const linked = SUPPORT_DOMAINS.flatMap((d) => d.solutions).filter((s) => s.url !== null);
    expect(linked).toEqual([
      { name: "중앙난임·우울증상담센터 02-2276-2276", note: "산후우울 상담 · 눌러서 전화", url: "tel:0222762276" },
    ]);
  });

  it("체크 토글은 새 Set을 돌려준다", () => {
    const before = new Set([1]);
    const on = toggleSupportQuestion(before, 5);
    expect([...on].sort()).toEqual([1, 5]);
    expect([...toggleSupportQuestion(on, 1)]).toEqual([5]);
    expect([...before]).toEqual([1]);
  });
});
