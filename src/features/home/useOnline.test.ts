import { describe, expect, it } from "vitest";
import { OFFLINE_TEXT, readOnline } from "./useOnline";

describe("readOnline — navigator.onLine", () => {
  it("false일 때만 오프라인, true·모름(없는 브라우저·서버)은 온라인으로 본다", () => {
    expect(readOnline({ onLine: false })).toBe(false);
    expect(readOnline({ onLine: true })).toBe(true);
    expect(readOnline({})).toBe(true);
    expect(readOnline(undefined)).toBe(true);
  });
});

describe("오프라인 문구", () => {
  it("웹 신규 문구(CPO 확인) — 서버가 필요한 기능의 실패 자리에만 쓴다", () => {
    expect(OFFLINE_TEXT).toBe("오프라인이에요 — 인터넷에 연결되면 다시 시도해 주세요");
  });
});
