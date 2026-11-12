import { describe, expect, it } from "vitest";
import { fetchServerAccountInfo, type ServerAccountPorts } from "./serverAccount";

const USER = { id: "3f0f9b2e-0000-4000-8000-000000000001", email: "mom@example.com", identities: [] };

function ports(over: Partial<ServerAccountPorts> = {}): ServerAccountPorts & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    getUser: async () => ({ user: USER, failed: false }),
    aiConsentRow: async (id) => {
      asked.push(id);
      return { row: { version: "v1", sensitive_agreed: true, transfer_agreed: true }, failed: false };
    },
    ...over,
  };
}

describe("fetchServerAccountInfo", () => {
  it("내 사용자 정보와 내 AI 동의 행을 합친다 — 동의 행은 내 계정 ID로만 묻는다", async () => {
    const p = ports();
    const info = await fetchServerAccountInfo(p);
    expect(info?.id).toBe(USER.id);
    expect(info?.aiConsent?.version).toBe("v1");
    expect(p.asked).toEqual([USER.id]);
  });

  it("어느 쪽이든 못 읽으면 null — 지어내지 않는다", async () => {
    expect(await fetchServerAccountInfo(ports({ getUser: async () => ({ user: null, failed: true }) }))).toBeNull();
    expect(await fetchServerAccountInfo(ports({ aiConsentRow: async () => ({ row: null, failed: true }) }))).toBeNull();
    expect(
      await fetchServerAccountInfo(
        ports({
          getUser: async () => {
            throw new Error("offline");
          },
        }),
      ),
    ).toBeNull();
  });

  it("동의 행이 없으면(철회·미동의) aiConsent만 null", async () => {
    const info = await fetchServerAccountInfo(ports({ aiConsentRow: async () => ({ row: null, failed: false }) }));
    expect(info?.aiConsent).toBeNull();
  });
});
