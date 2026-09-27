import { describe, expect, it } from "vitest";
import type { MoodAnswer, MoodCheckRecord } from "@/domain/types";
import { MOOD_VERSION } from "./version";
import {
  MOOD_QUESTIONS,
  isMoodCardSnoozed,
  moodAnswerLabel,
  moodCardSignal,
  moodCardSnoozeUntil,
  moodSignal,
  normalizeMoodAnswer,
  questionForDay,
  todayMoodCheck,
} from "./mood";

// 기대값은 iOS MoodCheckRules.swift를 TZ=Asia/Seoul로 직접 실행해 다시 계산했다(2026-09-23).
// 모든 시각은 한국 시간(+09:00)으로 명시한다.
const kst = (local: string) => new Date(`${local}:00+09:00`);
const NOW = kst("2026-09-23T12:00");

let seq = 0;
function rec(local: string, answer: MoodAnswer): MoodCheckRecord {
  seq += 1;
  return { id: `r${seq}`, date: kst(local).toISOString(), questionID: 1, answer };
}
/** 저장 순서(최신순)로 만든다 */
const newestFirst = (records: MoodCheckRecord[]) => [...records].sort((a, b) => b.date.localeCompare(a.date));
const noAt = (...locals: string[]) => newestFirst(locals.map((l) => rec(l, "no")));

describe("기분 신호 — 02 §7-3 벡터 (14일 · 5회 · 3일 연속)", () => {
  it("0,2,5,9,13일 전 아니요 → 신호(14일 중 5일)", () => {
    const r = noAt("2026-09-23T12:00", "2026-09-21T12:00", "2026-09-18T12:00", "2026-09-14T12:00", "2026-09-10T12:00");
    expect(moodSignal(r, NOW)).toEqual({ reason: "14일 중 5일" });
  });

  it("0,2,5,9일 전 아니요 → 없음", () => {
    const r = noAt("2026-09-23T12:00", "2026-09-21T12:00", "2026-09-18T12:00", "2026-09-14T12:00");
    expect(moodSignal(r, NOW)).toBeNull();
  });

  it("3,2,1일 전 아니요 → 신호(3일 연속)", () => {
    const r = noAt("2026-09-22T12:00", "2026-09-21T12:00", "2026-09-20T12:00");
    expect(moodSignal(r, NOW)).toEqual({ reason: "3일 연속" });
  });

  it("4,3,1일 전 아니요 → 없음(연속 아님)", () => {
    const r = noAt("2026-09-22T12:00", "2026-09-20T12:00", "2026-09-19T12:00");
    expect(moodSignal(r, NOW)).toBeNull();
  });

  it("2일 전 아니요, 1일 전 네, 오늘 아니요 → 없음", () => {
    const r = newestFirst([rec("2026-09-23T12:00", "no"), rec("2026-09-22T12:00", "yes"), rec("2026-09-21T12:00", "no")]);
    expect(moodSignal(r, NOW)).toBeNull();
  });

  it("0,2,5,9,14일 전 아니요 → 없음(14일 전은 창 밖) — 14일 전 23:59도 밖", () => {
    const r = noAt("2026-09-23T12:00", "2026-09-21T12:00", "2026-09-18T12:00", "2026-09-14T12:00", "2026-09-09T12:00");
    expect(moodSignal(r, NOW)).toBeNull();
    const edge = noAt("2026-09-23T12:00", "2026-09-21T12:00", "2026-09-18T12:00", "2026-09-14T12:00", "2026-09-09T23:59");
    expect(moodSignal(edge, NOW)).toBeNull();
  });

  // 02 §7-3의 1행과 7행은 같은 벡터라 7행은 창 경계(13일 전 00:00)로 바꿨다(검수 #42).
  it("13일 전 00:00 기록은 창 안 → 신호(14일 중 5일)", () => {
    const r = noAt("2026-09-23T12:00", "2026-09-21T12:00", "2026-09-18T12:00", "2026-09-14T12:00", "2026-09-10T00:00");
    expect(moodSignal(r, NOW)).toEqual({ reason: "14일 중 5일" });
  });

  it("2일 전 08시 아니요 → 20시 네, 1·0일 전 아니요 → 없음(그날 마지막 답만)", () => {
    const r = newestFirst([
      rec("2026-09-23T12:00", "no"),
      rec("2026-09-22T12:00", "no"),
      rec("2026-09-21T20:00", "yes"),
      rec("2026-09-21T08:00", "no"),
    ]);
    expect(moodSignal(r, NOW)).toBeNull();
  });

  it("2일 전 08시 네 → 20시 아니요, 1·0일 전 아니요 → 신호(3일 연속)", () => {
    const r = newestFirst([
      rec("2026-09-23T12:00", "no"),
      rec("2026-09-22T12:00", "no"),
      rec("2026-09-21T20:00", "no"),
      rec("2026-09-21T08:00", "yes"),
    ]);
    expect(moodSignal(r, NOW)).toEqual({ reason: "3일 연속" });
  });

  it("14일 전부 글쎄요 → 없음", () => {
    const r = Array.from({ length: 14 }, (_, i) => rec(`2026-09-${String(23 - i).padStart(2, "0")}T12:00`, "unsure"));
    expect(moodSignal(r, NOW)).toBeNull();
  });

  it("빈 기록 → 없음", () => {
    expect(moodSignal([], NOW)).toBeNull();
  });

  it("미래 1·2·3일 아니요 + 오늘·어제 아니요 → 없음(미래 무시)", () => {
    const r = noAt("2026-09-26T12:00", "2026-09-25T12:00", "2026-09-24T12:00", "2026-09-23T12:00", "2026-09-22T12:00");
    expect(moodSignal(r, NOW)).toBeNull();
  });
});

describe("기분 신호 — 추가 경계", () => {
  it("5일 연속이면 횟수 기준이 먼저(14일 중 5일), 4일 연속은 3일 연속", () => {
    const five = noAt("2026-09-23T12:00", "2026-09-22T12:00", "2026-09-21T12:00", "2026-09-20T12:00", "2026-09-19T12:00");
    expect(moodSignal(five, NOW)).toEqual({ reason: "14일 중 5일" });
    expect(moodSignal(five.slice(0, 4), NOW)).toEqual({ reason: "3일 연속" });
  });

  it("날짜는 한국 달력으로 묶는다 — UTC로 묶으면 오늘 07시와 어제 12시가 같은 날이 된다", () => {
    const now = kst("2026-09-23T08:00");
    const r = noAt("2026-09-23T07:00", "2026-09-22T12:00", "2026-09-21T12:00");
    expect(moodSignal(r, now)).toEqual({ reason: "3일 연속" });
  });

  it("기록 순서와 무관하다", () => {
    const r = [rec("2026-09-21T08:00", "yes"), rec("2026-09-23T12:00", "no"), rec("2026-09-21T20:00", "no"), rec("2026-09-22T12:00", "no")];
    expect(moodSignal(r, NOW)).toEqual({ reason: "3일 연속" });
  });

  it("모르는 답 값은 글쎄요로 본다 — 신호로 세지 않는다", () => {
    const r = ["2026-09-23T12:00", "2026-09-22T12:00", "2026-09-21T12:00"].map((l) => ({
      ...rec(l, "no"),
      answer: "maybe" as MoodAnswer,
    }));
    expect(moodSignal(r, NOW)).toBeNull();
    expect(normalizeMoodAnswer("maybe")).toBe("unsure");
    expect(normalizeMoodAnswer("no")).toBe("no");
  });

  it("날짜 형식이 틀린 기록은 건너뛴다", () => {
    const r = [...noAt("2026-09-23T12:00", "2026-09-22T12:00"), { ...rec("2026-09-21T12:00", "no"), date: "not-a-date" }];
    expect(moodSignal(r, NOW)).toBeNull();
  });
});

describe("오늘의 문항", () => {
  it("7일 연속이면 7개 문항이 한 번씩", () => {
    const ids = Array.from({ length: 7 }, (_, i) => questionForDay(kst(`2026-09-${17 + i}T12:00`)).id);
    expect(new Set(ids).size).toBe(7);
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("같은 날 01시·23시는 같은 문항", () => {
    expect(questionForDay(kst("2026-09-23T01:00"))).toEqual(questionForDay(kst("2026-09-23T23:00")));
  });

  it("2026-09-19(한국) → 3번, UTC 날짜가 바뀌는 09시 전후도 같다(검수 #42)", () => {
    expect(questionForDay(kst("2026-09-19T12:00")).id).toBe(3);
    expect(questionForDay(kst("2026-09-19T08:59")).id).toBe(3);
    expect(questionForDay(kst("2026-09-19T09:01")).id).toBe(3);
    expect(questionForDay(kst("2026-09-19T12:00")).text).toBe("아기가 잘 때 나도 잠들 수 있었나요?");
  });

  it("기준일(1970-01-01 한국) = 1번, 그 전날 = 7번", () => {
    expect(questionForDay(kst("1970-01-01T00:00")).id).toBe(1);
    expect(questionForDay(kst("1969-12-31T23:00")).id).toBe(7);
  });

  it("문항은 content.json 그대로, 버전은 MOOD_VERSION과 같다", () => {
    expect(MOOD_QUESTIONS).toHaveLength(7);
    expect(MOOD_QUESTIONS[0].text).toBe("아이가 요즘 예뻐 보이나요?");
    expect(MOOD_VERSION).toBe("mood-draft-0.1");
    expect(moodAnswerLabel("yes")).toBe("네");
    expect(moodAnswerLabel("unsure")).toBe("글쎄요");
    expect(moodAnswerLabel("no")).toBe("아니요");
  });
});

describe("오늘 답한 기록", () => {
  it("오늘(한국 달력) 답이 있으면 최신순 첫 기록", () => {
    const latest = rec("2026-09-23T00:30", "yes");
    const checks = [latest, rec("2026-09-23T00:10", "no"), rec("2026-09-22T23:59", "no")];
    expect(todayMoodCheck(checks, NOW)).toBe(latest);
  });

  it("어제 23:59 답만 있으면 없음", () => {
    expect(todayMoodCheck([rec("2026-09-22T23:59", "no")], NOW)).toBeNull();
  });
});

describe("연계 카드 접기", () => {
  const signalRecords = noAt("2026-09-23T12:00", "2026-09-22T12:00", "2026-09-21T12:00");

  it("7일 뒤 같은 시각까지", () => {
    expect(moodCardSnoozeUntil(NOW)).toBe(kst("2026-09-30T12:00").toISOString());
  });

  it("기한이 남았으면 접힘, 지났거나 같으면 다시 보임", () => {
    const until = kst("2026-09-30T12:00").toISOString();
    expect(isMoodCardSnoozed(until, NOW)).toBe(true);
    expect(isMoodCardSnoozed(until, kst("2026-09-30T12:00"))).toBe(false);
    expect(isMoodCardSnoozed(null, NOW)).toBe(false);
    expect(isMoodCardSnoozed("garbage", NOW)).toBe(false);
  });

  it("접어둔 동안에는 신호가 있어도 null, 기한이 지나면 다시 판정", () => {
    expect(moodCardSignal(signalRecords, moodCardSnoozeUntil(NOW), NOW)).toBeNull();
    expect(moodCardSignal(signalRecords, kst("2026-09-23T11:00").toISOString(), NOW)).toEqual({ reason: "3일 연속" });
    expect(moodCardSignal(signalRecords, null, NOW)).toEqual({ reason: "3일 연속" });
  });
});
