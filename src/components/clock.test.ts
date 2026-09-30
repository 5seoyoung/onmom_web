import { afterEach, describe, expect, it, vi } from "vitest";
import { isSameLocalDay } from "@/domain/date";
import { getLocalDaySnapshot, nextLocalDay } from "./clock";

const kst = (local: string) => new Date(`${local}:00+09:00`);

describe("브라우저의 오늘 — 날짜가 바뀔 때만 새 값", () => {
  it("처음에는 지금", () => {
    const now = kst("2026-09-23T12:00");
    expect(nextLocalDay(null, now)).toBe(now);
  });

  it("같은 날(한국 시간)이면 이전 값을 그대로 — 다시 그리지 않는다", () => {
    const first = kst("2026-09-23T00:00");
    expect(nextLocalDay(first, kst("2026-09-23T23:59"))).toBe(first);
    // UTC로는 날이 바뀌는 09:00도 같은 날
    expect(nextLocalDay(first, kst("2026-09-23T09:00"))).toBe(first);
  });

  it("자정이 지나면 새 값", () => {
    const first = kst("2026-09-23T23:59");
    const next = kst("2026-09-24T00:00");
    expect(nextLocalDay(first, next)).toBe(next);
  });
});

describe("스냅샷 — 구독 없이도 렌더 시점의 오늘", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("같은 날에는 같은 참조, 구독이 없던 사이 자정이 지나면 첫 렌더부터 오늘 값", () => {
    vi.useFakeTimers();
    vi.setSystemTime(kst("2026-09-23T22:00"));
    const first = getLocalDaySnapshot();
    expect(isSameLocalDay(first, kst("2026-09-23T12:00"))).toBe(true);

    vi.setSystemTime(kst("2026-09-23T23:59"));
    expect(getLocalDaySnapshot()).toBe(first);

    // 다른 탭에 있는 동안(구독 없음) 날짜가 바뀜 — subscribe 전 첫 렌더의 스냅샷이 이미 오늘이어야 한다
    vi.setSystemTime(kst("2026-09-24T00:05"));
    const next = getLocalDaySnapshot();
    expect(next).not.toBe(first);
    expect(isSameLocalDay(next, kst("2026-09-24T12:00"))).toBe(true);
    // 그날 안에서는 다시 안정
    vi.setSystemTime(kst("2026-09-24T08:00"));
    expect(getLocalDaySnapshot()).toBe(next);
  });
});
