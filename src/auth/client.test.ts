import { afterEach, describe, expect, it, vi } from "vitest";
import { isSecretSupabaseKey } from "@/config";
import { AUTH_STORAGE_KEY, SUPABASE_CLIENT_OPTIONS, authCallbackUrl, createSupabaseClientIfConfigured } from "./client";
import { STORAGE_PREFIX } from "@/store/persistence";

// 테스트용 모양만 맞춘 JWT(서명 없음) — 실제 키가 아니다
function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.signature`;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("설정이 없으면 Supabase 클라이언트를 만들지 않는다", () => {
  it("주소나 키 중 하나라도 없으면 createClient를 부르지 않는다", () => {
    const create = vi.fn();
    expect(createSupabaseClientIfConfigured({ url: null, anonKey: null }, create)).toBeNull();
    expect(createSupabaseClientIfConfigured({ url: "https://x.supabase.co", anonKey: null }, create)).toBeNull();
    expect(createSupabaseClientIfConfigured({ url: null, anonKey: "sb_publishable_x" }, create)).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it("둘 다 있으면 PKCE·우리 저장 키·URL 자동 감지 끔으로 만든다", () => {
    const create = vi.fn(() => ({}) as never);
    createSupabaseClientIfConfigured({ url: "https://x.supabase.co", anonKey: "sb_publishable_x" }, create);
    expect(create).toHaveBeenCalledWith("https://x.supabase.co", "sb_publishable_x", SUPABASE_CLIENT_OPTIONS);
    expect(SUPABASE_CLIENT_OPTIONS.auth).toMatchObject({ flowType: "pkce", storageKey: AUTH_STORAGE_KEY, detectSessionInUrl: false, persistSession: true });
  });

  it("환경 변수가 비어 있으면 꺼짐 — getSupabaseClient는 null이고 supabase-js를 불러오지 않는다", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubGlobal("window", {}); // 브라우저처럼 — 서버 렌더링이라서 null인 것이 아님을 확인
    const createClient = vi.fn();
    vi.doMock("@supabase/supabase-js", () => ({ createClient }));
    const { isSupabaseConfigured } = await import("@/config");
    const { getSupabaseClient } = await import("./client");
    expect(isSupabaseConfigured()).toBe(false);
    expect(await getSupabaseClient()).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
    vi.doUnmock("@supabase/supabase-js");
  });

  it("주소와 키가 있으면 켜짐(끝 슬래시는 지운다) — 브라우저에서 한 번만 만든다", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co/");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_abc");
    vi.stubGlobal("window", {});
    const createClient = vi.fn(() => ({ fake: true }));
    vi.doMock("@supabase/supabase-js", () => ({ createClient }));
    const { config, isSupabaseConfigured } = await import("@/config");
    const { getSupabaseClient } = await import("./client");
    expect(isSupabaseConfigured()).toBe(true);
    expect(config.supabaseUrl).toBe("https://abc.supabase.co");
    const a = await getSupabaseClient();
    const b = await getSupabaseClient();
    expect(a).toBe(b);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith("https://abc.supabase.co", "sb_publishable_abc", SUPABASE_CLIENT_OPTIONS);
    vi.doUnmock("@supabase/supabase-js");
  });
});

describe("비밀 키는 받지 않는다", () => {
  it("sb_secret_·service_role JWT는 비밀 키, publishable·anon JWT는 공개 키", () => {
    expect(isSecretSupabaseKey("sb_secret_abc")).toBe(true);
    expect(isSecretSupabaseKey(fakeJwt({ iss: "supabase", role: "service_role" }))).toBe(true);
    expect(isSecretSupabaseKey(fakeJwt({ iss: "supabase", role: "anon" }))).toBe(false);
    expect(isSecretSupabaseKey("sb_publishable_abc")).toBe(false);
    expect(isSecretSupabaseKey("a.b.c")).toBe(false);
  });

  it("비밀 키가 들어오면 설정을 읽을 때(빌드) 멈춘다", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", fakeJwt({ role: "service_role" }));
    await expect(import("@/config")).rejects.toThrow(/비밀 키/);
  });
});

describe("저장 키·콜백 주소", () => {
  it("세션 저장 키는 onmom.web. 접두 — 계정 삭제가 로그인 세션도 지운다", () => {
    expect(AUTH_STORAGE_KEY.startsWith(STORAGE_PREFIX)).toBe(true);
  });

  it("콜백 주소 = origin + basePath + /auth/callback/ (Supabase Redirect URLs에 같은 값)", () => {
    expect(authCallbackUrl("https://5seoyoung.github.io", "/onmom_web")).toBe("https://5seoyoung.github.io/onmom_web/auth/callback/");
    expect(authCallbackUrl("http://localhost:3000/", "")).toBe("http://localhost:3000/auth/callback/");
  });

  it("예전 변수 이름(NEXT_PUBLIC_SUPABASE_ANON_KEY)도 받는다", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_legacy");
    const { config } = await import("@/config");
    expect(config.supabaseAnonKey).toBe("sb_publishable_legacy");
  });
});
