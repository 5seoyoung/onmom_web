import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { OFFLINE_TEXT } from "@/features/home/useOnline";
import { AUTH_CALLBACK_TEXT, callbackErrorMessage, callbackSyncFailedBody } from "./callbackText";
import { LOGIN_TEXT } from "./loginText";

// iOS 원본(web/)은 공개 저장소에 없다 — 로컬에 있을 때만 Swift 원문과 대조하고, CI에서는 건너뛴다.
const SWIFT_PATH = fileURLToPath(new URL("../../../web/reference/swift/KakaoLoginService.swift", import.meta.url));

describe("로그인 콜백 — 실패 이유별 안내(정직하게, 원문 우선)", () => {
  it("취소 → 원문 '로그인이 취소되었어요.', 실패 → 원문 '카카오 응답을 처리하지 못했어요…'", () => {
    expect(callbackErrorMessage("cancelled")).toBe("로그인이 취소되었어요.");
    expect(callbackErrorMessage("failed")).toBe("카카오 응답을 처리하지 못했어요. 잠시 후 다시 시도해주세요.");
  });

  it("설정 없는 빌드 → '준비 중'(다시 시도해도 되지 않으므로 '잠시 후 다시 시도'라고 하지 않는다)", () => {
    expect(callbackErrorMessage("notConfigured")).toBe("카카오 로그인은 준비 중이에요.");
    expect(callbackErrorMessage("notConfigured")).not.toContain("다시 시도");
    expect(callbackErrorMessage("notConfigured")).toContain(LOGIN_TEXT.kakaoPending);
  });

  it("확실히 오프라인이면 실패·기록 못 읽음만 오프라인 안내(다른 서버 기능과 같은 문구) — 취소·설정 없음은 연결과 무관하니 그대로", () => {
    expect(callbackErrorMessage("failed", false)).toBe(OFFLINE_TEXT);
    expect(callbackErrorMessage("failed", true)).toBe(AUTH_CALLBACK_TEXT.failed);
    expect(callbackErrorMessage("failed")).toBe(AUTH_CALLBACK_TEXT.failed);
    expect(callbackErrorMessage("cancelled", false)).toBe(AUTH_CALLBACK_TEXT.cancelled);
    expect(callbackErrorMessage("notConfigured", false)).toBe(AUTH_CALLBACK_TEXT.notConfigured);
    expect(callbackSyncFailedBody(false)).toBe(OFFLINE_TEXT);
    expect(callbackSyncFailedBody(true)).toBe(AUTH_CALLBACK_TEXT.syncFailedBody);
    expect(callbackSyncFailedBody()).toBe(AUTH_CALLBACK_TEXT.syncFailedBody);
  });

  it.skipIf(!existsSync(SWIFT_PATH))("취소·실패·창 열기 실패 문구는 KakaoLoginService.swift 원문", () => {
    const source = readFileSync(SWIFT_PATH, "utf8");
    expect(source).toContain(`"${AUTH_CALLBACK_TEXT.cancelled}"`);
    expect(source).toContain(`"${AUTH_CALLBACK_TEXT.failed}"`);
    expect(source).toContain(`"${LOGIN_TEXT.kakaoFailed}"`);
  });
});
