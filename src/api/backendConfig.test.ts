// 빌드 설정(NEXT_PUBLIC_*) → 영상·AI가 어디로 가는지. 설정이 없는 빌드(지금 배포)는 예전과 똑같아야 한다.
import { afterEach, describe, expect, it, vi } from "vitest";

const SUPABASE = {
  NEXT_PUBLIC_SUPABASE_URL: "https://movrwmoniopgetdmagon.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
};

async function loadWith(env: Record<string, string>) {
  vi.resetModules();
  for (const name of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_AI_CHAT_ENABLED",
    "NEXT_PUBLIC_VIDEO_URL",
    "NEXT_PUBLIC_LLM_URL",
  ]) {
    vi.stubEnv(name, env[name] ?? "");
  }
  const config = await import("@/config");
  const http = await import("./http");
  return { ...config, defaultBackendConfig: http.defaultBackendConfig };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Supabase 설정이 없는 빌드 — 지금과 같다", () => {
  it("영상은 NEXT_PUBLIC_VIDEO_URL이 있을 때만, AI는 NEXT_PUBLIC_LLM_URL이 있을 때만, 함수 주소 없음", async () => {
    const off = await loadWith({});
    expect(off.supabaseFunctionsUrl()).toBeNull();
    expect(off.isVideoBackendConfigured()).toBe(false);
    expect(off.isLLMBackendConfigured()).toBe(false);
    expect(off.defaultBackendConfig).toMatchObject({ functionsURL: null, supabaseKey: null, aiChatEnabled: false });

    const legacy = await loadWith({ NEXT_PUBLIC_VIDEO_URL: "https://video.example", NEXT_PUBLIC_LLM_URL: "https://llm.example" });
    expect(legacy.isVideoBackendConfigured()).toBe(true);
    expect(legacy.isLLMBackendConfigured()).toBe(true);
    expect(legacy.defaultBackendConfig.functionsURL).toBeNull();
  });

  it("AI 스위치만 켜도 Supabase가 없으면 AI는 꺼져 있다", async () => {
    const c = await loadWith({ NEXT_PUBLIC_AI_CHAT_ENABLED: "true" });
    expect(c.isLLMBackendConfigured()).toBe(false);
  });
});

describe("Supabase가 설정된 빌드", () => {
  it("영상은 함수 videos로(영상 서버 주소가 없어도), 함수 주소는 /functions/v1", async () => {
    const c = await loadWith(SUPABASE);
    expect(c.supabaseFunctionsUrl()).toBe("https://movrwmoniopgetdmagon.supabase.co/functions/v1");
    expect(c.isVideoBackendConfigured()).toBe(true);
    expect(c.defaultBackendConfig).toMatchObject({
      functionsURL: "https://movrwmoniopgetdmagon.supabase.co/functions/v1",
      supabaseKey: "sb_publishable_test",
    });
  });

  it("AI는 NEXT_PUBLIC_AI_CHAT_ENABLED가 정확히 \"true\"일 때만 — 예전 LLM 주소는 보지 않는다", async () => {
    expect((await loadWith({ ...SUPABASE, NEXT_PUBLIC_LLM_URL: "https://llm.example" })).isLLMBackendConfigured()).toBe(false);
    expect((await loadWith({ ...SUPABASE, NEXT_PUBLIC_AI_CHAT_ENABLED: "false" })).isLLMBackendConfigured()).toBe(false);
    expect((await loadWith({ ...SUPABASE, NEXT_PUBLIC_AI_CHAT_ENABLED: "1" })).isLLMBackendConfigured()).toBe(false);
    const on = await loadWith({ ...SUPABASE, NEXT_PUBLIC_AI_CHAT_ENABLED: " true " });
    expect(on.isLLMBackendConfigured()).toBe(true);
    expect(on.defaultBackendConfig.aiChatEnabled).toBe(true);
  });

  it("주소 끝 슬래시는 떼고 붙인다", async () => {
    const c = await loadWith({ ...SUPABASE, NEXT_PUBLIC_SUPABASE_URL: "https://movrwmoniopgetdmagon.supabase.co/" });
    expect(c.supabaseFunctionsUrl()).toBe("https://movrwmoniopgetdmagon.supabase.co/functions/v1");
  });
});
