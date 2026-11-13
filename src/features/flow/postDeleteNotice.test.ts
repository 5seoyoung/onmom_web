import { describe, expect, it } from "vitest";
import { KAKAO_UNLINK_FAILED_KEY, rememberKakaoUnlinkFailed, takeKakaoUnlinkFailed, type NoticeStorage } from "./postDeleteNotice";

function memory(): NoticeStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

describe("계정 삭제 뒤 카카오 연결 끊기 실패 안내", () => {
  it("표시를 남기면 로그인 화면이 한 번만 읽는다 — 값은 있다/없다뿐", () => {
    const s = memory();
    expect(takeKakaoUnlinkFailed(s)).toBe(false);
    rememberKakaoUnlinkFailed(s);
    expect([...s.map]).toEqual([[KAKAO_UNLINK_FAILED_KEY, "1"]]);
    expect(takeKakaoUnlinkFailed(s)).toBe(true);
    expect(takeKakaoUnlinkFailed(s)).toBe(false);
  });

  it("저장소가 없거나 막혀도 던지지 않는다", () => {
    const blocked: NoticeStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {},
    };
    expect(() => rememberKakaoUnlinkFailed(blocked)).not.toThrow();
    expect(takeKakaoUnlinkFailed(blocked)).toBe(false);
    expect(takeKakaoUnlinkFailed(null)).toBe(false);
  });
});
