import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { calendarDaysBetween, formatMonthDayTime, parseLocalDate, postpartumDayCount, toLocalDateString, weekFromDayCount } from "./date";

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

describe("formatMonthDayTime — 기록 탭·기록장·PDF 리포트가 함께 쓰는 시각 표기", () => {
  it("iOS .dateTime.month().day().hour().minute() (ko_KR)와 같은 모양 — journal.png", () => {
    // TZ Asia/Seoul: 12:15Z = 21:15
    expect(formatMonthDayTime("2026-09-16T12:15:00.000Z")).toBe("9월 16일 오후 9:15");
  });

  it("오전·정오·자정 표기", () => {
    expect(formatMonthDayTime("2026-09-16T00:05:00.000Z")).toBe("9월 16일 오전 9:05");
    expect(formatMonthDayTime("2026-09-16T03:05:00.000Z")).toBe("9월 16일 오후 12:05");
    expect(formatMonthDayTime("2026-09-16T15:00:00.000Z")).toBe("9월 17일 오전 12:00");
  });

  it("못 읽는 날짜는 빈 문자열(지어내지 않음)", () => {
    expect(formatMonthDayTime("")).toBe("");
    expect(formatMonthDayTime("not-a-date")).toBe("");
  });
});

describe("formatMonthDayTime — 한 곳에서만 만든다", () => {
  it("기록(9월 23일 오후 3:05 — RecordFlowView.swift:116)과 글(CommunityView.swift)이 같은 모양, 좁은 공백 없이", () => {
    expect(formatMonthDayTime(new Date(2026, 8, 23, 15, 5).toISOString())).toBe("9월 23일 오후 3:05");
    expect(formatMonthDayTime(new Date(2026, 8, 22, 0, 5).toISOString())).toBe("9월 22일 오전 12:05");
    expect(formatMonthDayTime(new Date(2026, 8, 23, 15, 5).toISOString())).not.toMatch(/[\u202F\u00A0]/);
  });

  it("기록 탭·기록장·리포트에 따로 만든 Intl 날짜 형식이 없다", () => {
    const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
    for (const file of ["../features/record/recordView.ts", "../features/journal/journalView.ts", "../features/report/reportModel.ts"]) {
      expect(read(file), file).not.toContain("Intl.DateTimeFormat");
      expect(read(file), file).toContain("formatMonthDayTime");
    }
  });
});
