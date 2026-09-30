import { describe, expect, it } from "vitest";
import { EXTERNAL_LINK_PROPS, EXTERNAL_LINK_REL, safeExternalUrl, SUPPORT_LINK_HOSTS } from "./safeUrl";

describe("safeExternalUrl", () => {
  it.each([
    "https://www.youtube.com/watch?v=abc",
    "https://youtube.com/watch?v=abc",
    "https://m.youtube.com/watch?v=abc",
    "https://youtu.be/abc",
    "https://place.map.kakao.com/26338954",
  ])("허용: %s", (url) => {
    expect(safeExternalUrl(url)).toBe(url);
  });

  it("호스트 대소문자는 정규화한다", () => {
    expect(safeExternalUrl("HTTPS://WWW.YOUTUBE.COM/watch?v=abc")).toBe("https://www.youtube.com/watch?v=abc");
  });

  it.each([
    ["http 스킴", "http://www.youtube.com/watch?v=abc"],
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html,<script>alert(1)</script>"],
    ["낯선 호스트", "https://evil.example/watch"],
    ["허용 호스트를 흉내 낸 하위 도메인", "https://www.youtube.com.evil.example/"],
    ["허용 호스트의 다른 하위 도메인", "https://music.youtube.com/watch?v=abc"],
    ["userinfo로 속이기", "https://www.youtube.com@evil.example/"],
    ["자격 증명 포함", "https://user:pass@www.youtube.com/"],
    ["포트 지정", "https://www.youtube.com:8443/"],
    ["끝 점 붙은 호스트", "https://youtube.com./watch"],
    ["상대 경로", "/watch?v=abc"],
    ["빈 문자열", ""],
  ])("거부: %s", (_label, url) => {
    expect(safeExternalUrl(url)).toBeNull();
  });

  it("지원사업 공식 페이지 호스트는 기본 목록에 없다 — 넘긴 호출에서만 허용하고 검사 규칙은 같다", () => {
    expect(safeExternalUrl("https://www.gov.kr/portal")).toBeNull();
    expect(safeExternalUrl("https://www.gov.kr/portal", SUPPORT_LINK_HOSTS)).toBe("https://www.gov.kr/portal");
    expect(safeExternalUrl("https://youtu.be/abc", SUPPORT_LINK_HOSTS)).toBe("https://youtu.be/abc");
    expect(safeExternalUrl("http://www.gov.kr/portal", SUPPORT_LINK_HOSTS)).toBeNull();
    expect(safeExternalUrl("https://user:pw@www.gov.kr/", SUPPORT_LINK_HOSTS)).toBeNull();
    expect(safeExternalUrl("https://www.gov.kr:8443/", SUPPORT_LINK_HOSTS)).toBeNull();
  });

  it("문자열이 아니면 null", () => {
    expect(safeExternalUrl(null)).toBeNull();
    expect(safeExternalUrl(undefined)).toBeNull();
    expect(safeExternalUrl(42)).toBeNull();
  });
});

describe("외부 링크 속성", () => {
  it("noopener noreferrer, 새 탭", () => {
    expect(EXTERNAL_LINK_REL).toBe("noopener noreferrer");
    expect(EXTERNAL_LINK_PROPS).toEqual({ target: "_blank", rel: "noopener noreferrer" });
  });
});
