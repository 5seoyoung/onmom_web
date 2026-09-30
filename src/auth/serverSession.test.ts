// 이 계정의 서버 세션 판단 — 설정 > 알림이 토글을 보일지(서버 세션 없는 게스트에게는 켤 수 없는 까닭을 보인다).
import { describe, expect, it } from "vitest";
import { accountFromSessionUser } from "./kakaoAccount";
import { serverSessionStatus, type ServerSessionInput } from "./serverSession";

const GUEST = "guest-11111111-1111-4111-8111-111111111111";
const base: ServerSessionInput = { configured: true, accountId: GUEST, storedSession: true, session: { accountId: GUEST } };

describe("serverSessionStatus", () => {
  it("설정 없는 빌드·로그아웃은 none(요청할 것도 없다)", () => {
    expect(serverSessionStatus({ ...base, configured: false })).toBe("none");
    expect(serverSessionStatus({ ...base, accountId: null })).toBe("none");
  });

  it("익명 가입이 안 된 게스트(저장된 세션 없음 — 이 브라우저 전용)는 none", () => {
    expect(serverSessionStatus({ ...base, storedSession: false, session: undefined })).toBe("none");
  });

  it("저장된 세션이 있으면 읽을 때까지(또는 읽지 못하면) checking — 확인되기 전에는 토글을 잠근다", () => {
    expect(serverSessionStatus({ ...base, session: undefined })).toBe("checking");
    expect(serverSessionStatus({ ...base, session: "error" })).toBe("checking");
  });

  it("세션 사용자가 이 계정이면 server, 세션이 없거나 다른 계정이면 none", () => {
    expect(serverSessionStatus(base)).toBe("server");
    expect(serverSessionStatus({ ...base, session: null })).toBe("none");
    expect(serverSessionStatus({ ...base, session: { accountId: "kakao-42" } })).toBe("none");
    expect(serverSessionStatus({ ...base, session: { accountId: null } })).toBe("none");
  });

  it("세션 사용자 → 앱 계정은 동기화와 같은 규칙(익명 = guest-<id>, 카카오 identity = kakao-<회원번호>)", () => {
    const anon = accountFromSessionUser({ id: "11111111-1111-4111-8111-111111111111", is_anonymous: true, identities: [] });
    expect(serverSessionStatus({ ...base, session: { accountId: anon?.id ?? null } })).toBe("server");
    const kakao = accountFromSessionUser({
      id: "22222222-2222-4222-8222-222222222222",
      is_anonymous: true, // 카카오 이메일이 확인되지 않으면 연결 뒤에도 익명으로 남을 수 있다 — 그래도 카카오 계정
      identities: [{ provider: "kakao", identity_data: { provider_id: "42" } }],
    });
    expect(serverSessionStatus({ ...base, accountId: "kakao-42", session: { accountId: kakao?.id ?? null } })).toBe("server");
  });
});
