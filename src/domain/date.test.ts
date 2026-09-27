import { describe, expect, it } from "vitest";
import { calendarDaysBetween, parseLocalDate, postpartumDayCount, toLocalDateString, weekFromDayCount } from "./date";

// vitest.config.ts가 TZ=Asia/Seoul로 고정한다.
describe("로컬 달력 날짜", () => {
  it("YYYY-MM-DD를 로컬 자정으로 읽고 되돌린다", () => {
    const d = parseLocalDate("2026-07-22")!;
    expect(d.getHours()).toBe(0);
    expect(toLocalDateString(d)).toBe("2026-07-22");
  });

  it("잘못된 날짜는 null", () => {
    expect(parseLocalDate("2026-02-31")).toBeNull();
    expect(parseLocalDate("2026/07/22")).toBeNull();
    expect(parseLocalDate(null)).toBeNull();
  });

  it("UTC 자정(한국 09:00) 전후로 날짜가 바뀌지 않는다", () => {
    const early = new Date("2026-09-23T00:30:00+09:00");
    const late = new Date("2026-09-23T23:59:00+09:00");
    expect(calendarDaysBetween(early, late)).toBe(0);
  });
});

describe("산후 경과일·주차 (02 §0)", () => {
  const at = (iso: string) => new Date(iso);
  it("출산 당일은 0일차", () => {
    expect(postpartumDayCount("2026-09-13", at("2026-09-13T23:59:00+09:00"))).toBe(0);
  });
  it("D+9 23:59 = 9, D+10 00:01 = 10 (오로 게이팅 경계)", () => {
    expect(postpartumDayCount("2026-09-13", at("2026-09-22T23:59:00+09:00"))).toBe(9);
    expect(postpartumDayCount("2026-09-13", at("2026-09-23T00:01:00+09:00"))).toBe(10);
  });
  it("미래 출산일·미입력은 0", () => {
    expect(postpartumDayCount("2026-10-01", at("2026-09-23T12:00:00+09:00"))).toBe(0);
    expect(postpartumDayCount(null, at("2026-09-23T12:00:00+09:00"))).toBe(0);
  });
  it("주차: 0~6일 = 0, 7~13일 = 1, 14일 = 2", () => {
    expect([0, 6, 7, 13, 14].map(weekFromDayCount)).toEqual([0, 0, 1, 1, 2]);
  });
});
