import { describe, expect, it } from "vitest";
import { parseCallbackUrl, stripCallbackParams } from "./callbackUrl";
import { accountFromUser } from "./kakaoAccount";

// Supabase Auth kakao 공급자가 채우는 모양(provider_id = sub = 카카오 회원번호, name = 닉네임) — 테스트 입력용
function kakaoUser(identityData: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    app_metadata: { provider: "kakao", providers: ["kakao"] },
    user_metadata: { ...identityData },
    identities: [{ provider: "kakao", id: String(identityData.provider_id ?? ""), identity_data: identityData }],
    ...extra,
  };
}

describe("accountFromUser — Supabase 사용자 → 앱 계정", () => {
  it("id는 iOS와 같은 kakao-<회원번호>, 이름은 닉네임", () => {
    expect(accountFromUser(kakaoUser({ provider_id: "4012345678", sub: "4012345678", name: "해님" }))).toEqual({
      id: "kakao-4012345678",
      name: "해님",
      provider: "kakao",
    });
  });

  it("닉네임 동의를 안 했으면 이름은 null(화면은 '카카오 사용자')", () => {
    expect(accountFromUser(kakaoUser({ provider_id: "77", sub: "77", name: "" }))?.name).toBeNull();
    expect(accountFromUser(kakaoUser({ provider_id: "77", sub: "77" }))?.name).toBeNull();
  });

  it("provider_id가 없으면 sub, identity.id 순으로 읽는다", () => {
    expect(accountFromUser(kakaoUser({ sub: "88" }))?.id).toBe("kakao-88");
    const u = kakaoUser({});
    expect(accountFromUser({ ...u, identities: [{ provider: "kakao", id: "99", identity_data: {} }] })?.id).toBe("kakao-99");
  });

  it("identities가 비어 오면 사용자 메타데이터 — 공급자가 카카오일 때만", () => {
    expect(accountFromUser({ app_metadata: { provider: "kakao" }, user_metadata: { provider_id: "123", full_name: "달님" }, identities: [] })).toEqual({
      id: "kakao-123",
      name: "달님",
      provider: "kakao",
    });
    expect(accountFromUser({ app_metadata: { provider: "google" }, user_metadata: { provider_id: "123" }, identities: [] })).toBeNull();
  });

  it("회원번호가 숫자가 아니면(다른 공급자의 id 등) 계정을 만들지 않는다", () => {
    expect(accountFromUser(kakaoUser({ provider_id: "abc", sub: "abc" }))).toBeNull();
    expect(accountFromUser({ identities: [{ provider: "google", id: "1", identity_data: { sub: "1" } }] })).toBeNull();
    expect(accountFromUser(null)).toBeNull();
  });
});

describe("parseCallbackUrl — 콜백 주소 읽기", () => {
  const base = "https://5seoyoung.github.io/onmom_web/auth/callback/";

  it("성공: ?code=", () => {
    expect(parseCallbackUrl(`${base}?code=abc-123`)).toEqual({ kind: "code", code: "abc-123" });
  });

  it("카카오 동의 화면에서 취소: error=access_denied", () => {
    expect(parseCallbackUrl(`${base}?error=access_denied&error_code=access_denied&error_description=User+denied`)).toEqual({ kind: "error", cancelled: true });
  });

  it("그 밖의 오류는 해시에 와도 실패로", () => {
    expect(parseCallbackUrl(`${base}#error=server_error&error_description=x`)).toEqual({ kind: "error", cancelled: false });
    expect(parseCallbackUrl(`${base}?error_code=bad_oauth_state`)).toEqual({ kind: "error", cancelled: false });
  });

  it("아무것도 없으면 none(새로고침 등 — 저장된 세션을 본다)", () => {
    expect(parseCallbackUrl(base)).toEqual({ kind: "none" });
    expect(parseCallbackUrl(`${base}?code=`)).toEqual({ kind: "none" });
    expect(parseCallbackUrl("not a url")).toEqual({ kind: "none" });
  });

  it("쓴 code·오류 매개변수는 주소에서 지운다(방문 기록에 남지 않게)", () => {
    expect(stripCallbackParams(`${base}?code=abc`)).toBe(base);
    expect(stripCallbackParams(`${base}?error=access_denied&error_description=x`)).toBe(base);
    expect(stripCallbackParams(`${base}#error=server_error`)).toBe(base);
    expect(stripCallbackParams(base)).toBeNull();
  });
});
