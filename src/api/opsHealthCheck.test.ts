// 매일 운영 점검(scripts/ops/health-check.mjs) 중 AI 상담 함수 항목 — AI가 켜져 있어도 통과하고, AI 토큰을 쓰지 않는다.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { CHAT_PROBE, chatProbeVerdict, FUNCTION_PREFLIGHTS, missingAllowedHeaders } from "../../scripts/ops/health-check.mjs";
import { CHAT_AI_DISABLED_CODE, validateChatRequest } from "../../supabase/functions/_shared/chat";
import { ALLOWED_REQUEST_HEADERS } from "../../supabase/functions/_shared/cors";
import { hasSelfHarmUserMessage } from "../../supabase/functions/_shared/safety";
import { createChatHandler } from "../../supabase/functions/chat/handler";

const reply = (status: number, code?: string) => ({ status, text: code === undefined ? "<html>" : JSON.stringify({ ok: false, code }), error: null });

describe("chat 점검 요청 — 틀린 토큰으로 한 번, AI를 부르지 않는다", () => {
  it("본문은 함수 검증을 지나고 위기 표현이 아니다 — 토큰 확인까지 닿는다", () => {
    expect(validateChatRequest(CHAT_PROBE.body)).toMatchObject({ ok: true });
    expect(hasSelfHarmUserMessage(CHAT_PROBE.body.messages as { role: "user" | "assistant"; content: string }[])).toBe(false);
  });

  it("함수는 토큰 확인에서 401로 끝낸다 — 동의·한도·LLM을 부르지 않는다", async () => {
    const readAiConsent = vi.fn();
    const consumeQuota = vi.fn();
    const complete = vi.fn();
    const handler = createChatHandler({
      allowedOrigins: [],
      aiEnabled: true,
      verifyUser: async () => null,
      readAiConsent,
      consumeQuota,
      refundQuota: vi.fn(),
      complete,
      log: () => {},
    });
    const res = await handler(
      new Request("https://proj.supabase.co/functions/v1/chat", {
        method: "POST",
        headers: { Authorization: `Bearer ${CHAT_PROBE.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(CHAT_PROBE.body),
      }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, code: "unauthorized" });
    for (const dep of [readAiConsent, consumeQuota, complete]) expect(dep).not.toHaveBeenCalled();
  });

  it("점검 스크립트에는 Anthropic 주소·키가 없다", () => {
    const src = readFileSync(fileURLToPath(new URL("../../scripts/ops/health-check.mjs", import.meta.url)), "utf8");
    expect(src).not.toContain("api.anthropic.com");
    expect(src).not.toContain("ANTHROPIC_API_KEY");
  });
});

describe("chatProbeVerdict — AI가 켜져 있으면 통과", () => {
  it("401 unauthorized → 통과(서버 쪽 스위치 켜짐·로그인 확인 동작)", () => {
    expect(chatProbeVerdict(reply(401, "unauthorized"))).toMatchObject({ status: "pass" });
  });
  it("503 ai_disabled → 실패로 세지 않는다(일부러 껐을 수 있다), 표에는 남긴다", () => {
    expect(chatProbeVerdict(reply(503, CHAT_AI_DISABLED_CODE))).toMatchObject({ status: "skip" });
  });
  it("503 auth_unavailable·게이트웨이 401·그 밖은 실패", () => {
    expect(chatProbeVerdict(reply(503, "auth_unavailable"))).toMatchObject({ status: "fail" });
    expect(chatProbeVerdict(reply(401))).toMatchObject({ status: "fail" });
    expect(chatProbeVerdict(reply(500, "internal"))).toMatchObject({ status: "fail" });
    expect(chatProbeVerdict(reply(404))).toMatchObject({ status: "fail" });
    expect(chatProbeVerdict({ status: null, text: "", error: "network" })).toMatchObject({ status: "fail" });
  });
});

describe("사전 요청 — 웹이 실제로 보내는 헤더", () => {
  const chat = FUNCTION_PREFLIGHTS.find((p: { fn: string }) => p.fn === "chat")!;
  const videos = FUNCTION_PREFLIGHTS.find((p: { fn: string }) => p.fn === "videos")!;

  it("videos는 POST + apikey·content-type(분만 경로를 JSON 본문으로 — src/api/video.ts)이고, 함수의 허용 목록에 모두 있다", () => {
    expect(videos).toEqual({ fn: "videos", method: "POST", headers: "apikey, content-type" });
    expect(missingAllowedHeaders(videos.headers, ALLOWED_REQUEST_HEADERS)).toEqual([]);
  });

  it("chat은 서울 고정 헤더 x-region까지 묻고, 함수의 허용 목록에 모두 있다", () => {
    expect(chat.headers).toContain("x-region");
    expect(missingAllowedHeaders(chat.headers, ALLOWED_REQUEST_HEADERS)).toEqual([]);
  });
  it("허용 목록에 없는 헤더를 찾아낸다(대소문자·공백 무시) — 옛 함수가 남아 있으면 브라우저가 AI 요청을 막는다", () => {
    expect(missingAllowedHeaders(chat.headers, "authorization, apikey, content-type, x-client-info")).toEqual(["x-region"]);
    expect(missingAllowedHeaders("Authorization", " AUTHORIZATION ")).toEqual([]);
    expect(missingAllowedHeaders("apikey", null)).toEqual(["apikey"]);
  });
});
