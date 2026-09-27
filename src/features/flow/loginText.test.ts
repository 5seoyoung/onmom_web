import { describe, expect, it } from "vitest";
import { LOGIN_TEXT, loginConsentText } from "./loginText";

describe("로그인 화면 — 방침 링크 위 한 줄", () => {
  it("설정 없는 빌드(기록은 이 브라우저에만)는 iOS 원문 그대로(LoginView.swift:77)", () => {
    expect(loginConsentText(false)).toBe("로그인 시 개인정보·민감정보 처리 방침에 동의하게 됩니다.");
  });

  it("서버 저장 빌드는 '로그인하면 동의하게 된다'고 하지 않는다 — 민감정보 동의는 온보딩에서 따로 받는다는 알림만(법 §23①1)", () => {
    const text = loginConsentText(true);
    expect(text).toBe(LOGIN_TEXT.consentNotice);
    expect(text).not.toContain("동의하게 됩니다");
    expect(text).toContain("따로 동의");
  });
});
