import { describe, expect, it } from "vitest";
import { IDENTITY_ALREADY_EXISTS, parseCallbackUrl, stripCallbackParams } from "./callbackUrl";
import { accountFromSessionUser, accountFromUser, guestAccountFromUser, guestUserId, isAnonymousUser } from "./kakaoAccount";

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
    expect(parseCallbackUrl(`${base}?error=access_denied&error_code=access_denied&error_description=User+denied`)).toEqual({
      kind: "error",
      cancelled: true,
      errorCode: "access_denied",
    });
    expect(parseCallbackUrl(`${base}?error=access_denied&error_description=User+denied`)).toEqual({ kind: "error", cancelled: true, errorCode: null });
  });

  it("Supabase의 가입 막힘(access_denied + 다른 error_code)은 취소가 아니다", () => {
    expect(parseCallbackUrl(`${base}?error=access_denied&error_code=signup_disabled`)).toEqual({ kind: "error", cancelled: false, errorCode: "signup_disabled" });
  });

  it("그 밖의 오류는 해시에 와도 실패로", () => {
    expect(parseCallbackUrl(`${base}#error=server_error&error_description=x`)).toEqual({ kind: "error", cancelled: false, errorCode: null });
    expect(parseCallbackUrl(`${base}?error_code=bad_oauth_state`)).toEqual({ kind: "error", cancelled: false, errorCode: "bad_oauth_state" });
  });

  it("게스트에 카카오를 연결하려는데 그 카카오 계정이 이미 다른 온맘 계정 — identity_already_exists(쿼리·해시 어느 쪽이든)", () => {
    const q = `${base}?error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked+to+another+user`;
    expect(parseCallbackUrl(q)).toEqual({ kind: "error", cancelled: false, errorCode: IDENTITY_ALREADY_EXISTS });
    expect(parseCallbackUrl(`${base}#error=server_error&error_code=identity_already_exists`)).toMatchObject({ errorCode: IDENTITY_ALREADY_EXISTS });
    expect(stripCallbackParams(`${base}#error_code=identity_already_exists`)).toBe(base);
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

describe("게스트 = Supabase 익명 사용자", () => {
  const anon = { id: "5b8e2c1a-0000-4000-8000-00000000abcd", is_anonymous: true, app_metadata: { provider: "anonymous" }, identities: [] };

  it("익명 사용자 → guest-<Supabase 사용자 id>, 이름 없음", () => {
    expect(isAnonymousUser(anon)).toBe(true);
    expect(guestAccountFromUser(anon)).toEqual({ id: `guest-${anon.id}`, name: null, provider: "guest" });
    expect(accountFromSessionUser(anon)).toEqual({ id: `guest-${anon.id}`, name: null, provider: "guest" });
    expect(accountFromUser(anon)).toBeNull(); // 카카오 계정이 아니다
  });

  it("카카오를 연결하면(is_anonymous=false, 카카오 identity) 같은 사용자라도 kakao-<회원번호>", () => {
    const linked = { ...kakaoUser({ provider_id: "4012345678", sub: "4012345678", name: "해님" }), id: anon.id, is_anonymous: false };
    expect(isAnonymousUser(linked)).toBe(false);
    expect(guestAccountFromUser(linked)).toBeNull();
    expect(accountFromSessionUser(linked)).toEqual({ id: "kakao-4012345678", name: "해님", provider: "kakao" });
  });

  it("카카오 identity가 붙었는데 is_anonymous가 남아 있어도(카카오 이메일이 확인되지 않은 연결) 카카오 계정", () => {
    const linkedButAnonymous = { ...kakaoUser({ provider_id: "55", sub: "55" }), id: anon.id, is_anonymous: true };
    expect(guestAccountFromUser(linkedButAnonymous)).toBeNull();
    expect(accountFromSessionUser(linkedButAnonymous)?.id).toBe("kakao-55");
  });

  it("게스트 id → Supabase 사용자 id(예전 브라우저 전용 게스트도 같은 모양 — 세션과 비교해서만 쓴다)", () => {
    expect(guestUserId(`guest-${anon.id}`)).toBe(anon.id);
    expect(guestUserId("kakao-1")).toBeNull();
    expect(guestAccountFromUser({ is_anonymous: true })).toBeNull(); // id가 없으면 만들지 않는다
    expect(guestAccountFromUser(null)).toBeNull();
  });
});
