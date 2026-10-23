// Edge Function chat의 바깥 연결(supabase/functions/chat/adapters.ts)과 서버 키·로그인 확인 규칙(_shared/auth.ts).
// Deno에서만 도는 index.ts는 이것들에 진짜 클라이언트(Anthropic SDK·supabase-js)를 넣기만 한다 — 여기서는 가짜 클라이언트로 동작을 확인한다.
// SDK 오류 클래스는 SDK와 같은 상속 구조의 가짜로 넣는다(APIConnectionTimeoutError ⊂ APIConnectionError ⊂ APIError).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { AI_CONSENTS_TABLE } from "../../supabase/functions/_shared/aiConsent";
import { isGuestUser, isTokenRejection, pickServerKey, TOKEN_REJECTION_CODES } from "../../supabase/functions/_shared/auth";
import { SUBSTANCE_OUTPUT_SCHEMA, systemPromptBlocks } from "../../supabase/functions/_shared/prompts";
import {
  buildMessageParams,
  createComplete,
  createConsumeQuota,
  createReadAiConsentVersion,
  createRefundQuota,
  createVerifyUser,
  interpretLlmResponse,
  mapLlmError,
  type AuthClientLike,
  type LlmErrorClasses,
  type LlmMessageParams,
  type LlmResponseLike,
} from "../../supabase/functions/chat/adapters";
import type { LlmCallInput } from "../../supabase/functions/chat/handler";

// MARK: 서버 키

describe("서버 키 — SUPABASE_SECRET_KEYS의 default가 먼저, 없으면 예전 service_role 키", () => {
  it("새 secret 키 JSON의 default", () => {
    expect(pickServerKey('{"default":"sb_secret_new","other":"sb_secret_x"}', "legacy.jwt")).toEqual({
      key: "sb_secret_new",
      source: "secret_keys",
    });
  });
  it("secret 키가 없거나·비었거나·JSON이 틀리거나·default가 없으면 예전 키", () => {
    for (const raw of ["", "   ", "not json", "[]", "null", '{"other":"sb_secret_x"}', '{"default":""}', '{"default":3}']) {
      expect(pickServerKey(raw, " legacy.jwt ")).toEqual({ key: "legacy.jwt", source: "service_role" });
    }
    expect(pickServerKey(undefined, "legacy.jwt")).toEqual({ key: "legacy.jwt", source: "service_role" });
  });
  it("둘 다 없으면 null(→ 로그인 확인 불가 503)", () => {
    expect(pickServerKey("", "")).toBeNull();
    expect(pickServerKey(null, undefined)).toBeNull();
    expect(pickServerKey("{}", " ")).toBeNull();
  });
});

describe("로그인 확인 오류 — 토큰 문제만 401, 나머지는 확인 불가(503)", () => {
  it("토큰 문제: Auth 오류 코드·상태 403·로그아웃된 세션(AuthSessionMissingError)", () => {
    for (const code of TOKEN_REJECTION_CODES) expect(isTokenRejection({ status: 401, code })).toBe(true);
    expect(isTokenRejection({ status: 403, code: "bad_jwt" })).toBe(true);
    expect(isTokenRejection({ status: 403 })).toBe(true);
    // supabase-js는 session_not_found를 AuthSessionMissingError(상태 400, 코드 없음)로 바꿔 준다
    expect(isTokenRejection({ name: "AuthSessionMissingError", status: 400 })).toBe(true);
  });
  it("확인 불가: 코드 없는 401(서버 키가 틀리거나 꺼짐 — 게이트웨이 'Invalid API key'), 네트워크, 5xx, 모르는 4xx", () => {
    expect(isTokenRejection({ name: "AuthApiError", status: 401 })).toBe(false);
    expect(isTokenRejection({ name: "AuthRetryableFetchError", status: 0 })).toBe(false);
    expect(isTokenRejection({ status: 503 })).toBe(false);
    expect(isTokenRejection({ status: 429, code: "over_request_rate_limit" })).toBe(false);
    expect(isTokenRejection({ status: 400 })).toBe(false);
    expect(isTokenRejection(null)).toBe(false);
  });
});

// MARK: 로그인 확인·한도

describe("createVerifyUser", () => {
  const auth = (result: Awaited<ReturnType<AuthClientLike["getUser"]>>) => ({
    getUser: vi.fn(async () => result),
  });

  it("유효한 토큰 → 사용자 id(익명 게스트 포함)와 게스트 여부", async () => {
    const a = auth({ data: { user: { id: "u-1" } }, error: null });
    await expect(createVerifyUser(a)("tok")).resolves.toEqual({ id: "u-1", guest: false });
    expect(a.getUser).toHaveBeenCalledWith("tok");
  });
  it("게스트 = Auth가 돌려준 사용자가 익명이고 익명 말고 다른 로그인 수단이 없을 때(카카오를 연결했으면 게스트가 아니다)", async () => {
    const verify = (user: Parameters<typeof isGuestUser>[0]) =>
      createVerifyUser(auth({ data: { user: { id: "u-1", ...user } }, error: null }))("tok");
    await expect(verify({ is_anonymous: true, identities: [] })).resolves.toEqual({ id: "u-1", guest: true });
    await expect(verify({ is_anonymous: true, identities: [{ provider: "anonymous" }] })).resolves.toEqual({ id: "u-1", guest: true });
    await expect(verify({ is_anonymous: true })).resolves.toEqual({ id: "u-1", guest: true });
    // 카카오 이메일이 확인되지 않아 is_anonymous가 남은 연결 계정(src/auth/kakaoAccount.ts) — 카카오 계정 한도
    await expect(verify({ is_anonymous: true, identities: [{ provider: "anonymous" }, { provider: "kakao" }] })).resolves.toEqual({
      id: "u-1",
      guest: false,
    });
    await expect(verify({ is_anonymous: false, identities: [{ provider: "kakao" }] })).resolves.toEqual({ id: "u-1", guest: false });
    expect(isGuestUser({ is_anonymous: true, identities: null })).toBe(true);
    expect(isGuestUser({})).toBe(false);
  });
  it("403 bad_jwt·계정 없음·로그아웃 → null(401)", async () => {
    for (const error of [
      { name: "AuthApiError", status: 403, code: "bad_jwt" },
      { name: "AuthApiError", status: 403, code: "user_not_found" },
      { name: "AuthSessionMissingError", status: 400 },
    ]) {
      await expect(createVerifyUser(auth({ data: { user: null }, error }))("tok")).resolves.toBeNull();
    }
  });
  it("코드 없는 401(서버 키 문제)·5xx·네트워크 → throw(503 auth_unavailable)", async () => {
    for (const error of [
      { name: "AuthApiError", status: 401 },
      { name: "AuthRetryableFetchError", status: 502 },
      { name: "AuthRetryableFetchError", status: 0 },
    ]) {
      await expect(createVerifyUser(auth({ data: { user: null }, error }))("tok")).rejects.toThrow();
    }
  });
  it("서버 키가 없으면(클라이언트 없음) throw", async () => {
    await expect(createVerifyUser(null)("tok")).rejects.toThrow();
  });
});

describe("createReadAiConsentVersion — 서버 키로 읽으므로 확인된 사용자 id의 행만", () => {
  it("물은 사용자 id로 한 번 읽고, 그 행의 판을 돌려준다", async () => {
    const query = vi.fn(async (userId: string) => ({ data: { user_id: userId, version: "web-2026-09-28.2" }, error: null }));
    await expect(createReadAiConsentVersion(query)("u-1")).resolves.toBe("web-2026-09-28.2");
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith("u-1");
  });
  it("행 없음·판이 글자가 아님·다른 사용자의 행 → null(동의 없음 → 403)", async () => {
    await expect(createReadAiConsentVersion(async () => ({ data: null, error: null }))("u-1")).resolves.toBeNull();
    await expect(createReadAiConsentVersion(async () => ({ data: { user_id: "u-1", version: 2 }, error: null }))("u-1")).resolves.toBeNull();
    await expect(
      createReadAiConsentVersion(async () => ({ data: { user_id: "someone-else", version: "web-2026-09-28.2" }, error: null }))("u-1"),
    ).resolves.toBeNull();
  });
  it("읽기 오류·서버 키 없음 → throw(503 — LLM을 부르지 않는다)", async () => {
    await expect(createReadAiConsentVersion(async () => ({ data: null, error: { message: "x" } }))("u-1")).rejects.toThrow();
    await expect(createReadAiConsentVersion(null)("u-1")).rejects.toThrow();
  });
  it("index.ts(Deno)의 연결 — ai_consents에서 user_id = 확인된 사용자 id인 행 하나만(maybeSingle) 읽는다", () => {
    const src = readFileSync(fileURLToPath(new URL("../../supabase/functions/chat/index.ts", import.meta.url)), "utf8");
    expect(AI_CONSENTS_TABLE).toBe("ai_consents");
    expect(src).toContain(
      '(userId: string) => admin.from(AI_CONSENTS_TABLE).select("user_id, version").eq("user_id", userId).maybeSingle()',
    );
    expect(src.match(/AI_CONSENTS_TABLE/g)).toHaveLength(2); // 가져오기 한 번 + 읽기 한 번(쓰기 없음)
  });
});

describe("createConsumeQuota", () => {
  const limits = { hourlyLimit: 30, guestHourlyLimit: 5, globalHourlyLimit: 60, globalDailyLimit: 500, windowSeconds: 3600 };
  const kakao = { id: "u-1", guest: false };
  const guest = { id: "g-1", guest: true };

  it("llm_consume_quota(다섯 인자)를 사용자 id·한도로 부르고 결과를 읽는다 — 전체 1시간 상한도 함께", async () => {
    const rpc = vi.fn(async () => ({ data: "user_limit", error: null }));
    await expect(createConsumeQuota(rpc, limits)(kakao)).resolves.toBe("user_limit");
    expect(rpc).toHaveBeenCalledWith("llm_consume_quota", {
      p_user_id: "u-1",
      p_user_limit: 30,
      p_window_seconds: 3600,
      p_global_daily_limit: 500,
      p_global_hourly_limit: 60,
    });
  });
  it("익명 게스트는 게스트 1시간 한도(기본 5)로 센다 — 전체 상한은 같다", async () => {
    const rpc = vi.fn(async () => ({ data: "ok", error: null }));
    await expect(createConsumeQuota(rpc, limits)(guest)).resolves.toBe("ok");
    expect(rpc).toHaveBeenCalledWith("llm_consume_quota", {
      p_user_id: "g-1",
      p_user_limit: 5,
      p_window_seconds: 3600,
      p_global_daily_limit: 500,
      p_global_hourly_limit: 60,
    });
  });
  it("전체 상한(1시간·하루) → global_limit을 그대로 읽는다", async () => {
    await expect(createConsumeQuota(async () => ({ data: "global_limit", error: null }), limits)(guest)).resolves.toBe("global_limit");
  });
  it("오류·모르는 값·클라이언트 없음 → null(LLM을 부르지 않는다)", async () => {
    await expect(createConsumeQuota(async () => ({ data: "ok", error: { message: "x" } }), limits)(kakao)).resolves.toBeNull();
    await expect(createConsumeQuota(async () => ({ data: "maybe", error: null }), limits)(kakao)).resolves.toBeNull();
    await expect(createConsumeQuota(null, limits)(kakao)).resolves.toBeNull();
  });
});

describe("createRefundQuota — 한도 한 번 돌려주기(llm_refund_quota)", () => {
  it("사용자 id로 한 번 부르고, 지웠으면(true) true", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    await expect(createRefundQuota(rpc)("u-1")).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("llm_refund_quota", { p_user_id: "u-1" });
  });
  it("지울 줄이 없음·오류·던짐·클라이언트 없음 → false(던지지 않는다)", async () => {
    await expect(createRefundQuota(async () => ({ data: false, error: null }))("u")).resolves.toBe(false);
    await expect(createRefundQuota(async () => ({ data: true, error: { message: "x" } }))("u")).resolves.toBe(false);
    await expect(createRefundQuota(async () => ({ data: "true", error: null }))("u")).resolves.toBe(false);
    await expect(
      createRefundQuota(async () => {
        throw new Error("network");
      })("u"),
    ).resolves.toBe(false);
    await expect(createRefundQuota(null)("u")).resolves.toBe(false);
  });
  it("index.ts(Deno)가 한도·돌려주기를 서버 키 rpc로 연결하고, 한도는 chatLimitsFromEnv로 읽는다", () => {
    const src = readFileSync(fileURLToPath(new URL("../../supabase/functions/chat/index.ts", import.meta.url)), "utf8");
    expect(src).toContain("const limits = chatLimitsFromEnv(env);");
    expect(src).toContain("refundQuota: createRefundQuota(admin ? (fn, args) => admin.rpc(fn, args) : null),");
    expect(src).toMatch(/consumeQuota: createConsumeQuota\(admin \? \(fn, args\) => admin\.rpc\(fn, args\) : null, \{\s*\.\.\.limits,\s*windowSeconds: CHAT_LIMIT_WINDOW_SECONDS,\s*\}\)/);
    // 예전 한도 두 값을 따로 읽던 줄은 없다(게스트·전체 1시간이 빠지지 않게)
    expect(src).not.toContain("parsePositiveInt(");
  });
});

// MARK: LLM 호출

class APIError extends Error {}
class APIUserAbortError extends APIError {}
class APIConnectionError extends APIError {}
class APIConnectionTimeoutError extends APIConnectionError {}
class BadRequestError extends APIError {}
class AuthenticationError extends APIError {}
class PermissionDeniedError extends APIError {}
class NotFoundError extends APIError {}
class RateLimitError extends APIError {}
class InternalServerError extends APIError {}

const errors: LlmErrorClasses = {
  APIUserAbortError,
  APIConnectionTimeoutError,
  APIConnectionError,
  RateLimitError,
  AuthenticationError,
  PermissionDeniedError,
  NotFoundError,
  BadRequestError,
  InternalServerError,
};

const eduInput: LlmCallInput = {
  preset: "patient_edu",
  system: systemPromptBlocks("patient_edu", { week: 3 }),
  messages: [{ role: "user", content: "오로가 언제까지 나오나요?" }],
  jsonSchema: null,
};

function response(over: Partial<Omit<LlmResponseLike, "usage">> & { usage?: Partial<LlmResponseLike["usage"]> } = {}): LlmResponseLike {
  return {
    stop_reason: "end_turn",
    content: [{ type: "text", text: "보통 4~6주 정도예요." } as { type: string }],
    ...over,
    usage: { input_tokens: 120, output_tokens: 40, iterations: null, ...over.usage },
  };
}

describe("buildMessageParams — 모델·거절 대체·답 형식은 서버가 정한다", () => {
  it("상담: claude-opus-5, fallbacks default + 베타 헤더, 시스템 블록, 선채움 없음, 답 형식 없음", () => {
    const p = buildMessageParams(eduInput);
    expect(p).toEqual<LlmMessageParams>({
      model: "claude-opus-5",
      max_tokens: 16_000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: eduInput.system.map((text) => ({ type: "text", text })),
      messages: [{ role: "user", content: "오로가 언제까지 나오나요?" }],
      output_config: { effort: "medium" },
    });
    expect(p.messages.at(-1)?.role).toBe("user");
  });
  it("약물: structured outputs(json_schema)", () => {
    const p = buildMessageParams({ ...eduInput, preset: "substance", jsonSchema: SUBSTANCE_OUTPUT_SCHEMA });
    expect(p.output_config).toEqual({ effort: "medium", format: { type: "json_schema", schema: SUBSTANCE_OUTPUT_SCHEMA } });
  });
});

describe("interpretLlmResponse — stop_reason을 content보다 먼저 본다", () => {
  it("정상 — 글 블록만 이어 붙인다(다른 블록은 건너뛴다)", () => {
    const r = interpretLlmResponse(
      response({ content: [{ type: "fallback" }, { type: "text", text: "가" }, { type: "text", text: "나" }] as { type: string }[] }),
    );
    expect(r).toEqual({ kind: "text", text: "가나", usage: { inputTokens: 120, outputTokens: 40, fallback: false } });
  });
  it("refusal이면 content에 글이 있어도 쓰지 않는다", () => {
    const r = interpretLlmResponse(response({ stop_reason: "refusal" }));
    expect(r.kind).toBe("refusal");
    expect(r).not.toHaveProperty("text");
  });
  it("max_tokens·문맥 창 초과는 잘린 답 — 쓰지 않는다", () => {
    expect(interpretLlmResponse(response({ stop_reason: "max_tokens" })).kind).toBe("truncated");
    expect(interpretLlmResponse(response({ stop_reason: "model_context_window_exceeded" })).kind).toBe("truncated");
  });
  it("usage.iterations의 fallback_message → 대체 모델이 답했다", () => {
    const r = interpretLlmResponse(response({ usage: { iterations: [{ type: "message" }, { type: "fallback_message" }] } }));
    expect(r.kind === "text" && r.usage.fallback).toBe(true);
    const plain = interpretLlmResponse(response({ usage: { iterations: [{ type: "message" }] } }));
    expect(plain.kind === "text" && plain.usage.fallback).toBe(false);
  });
});

describe("mapLlmError — SDK 오류 종류 → 상태·코드(메시지는 쓰지 않는다)", () => {
  it.each([
    [new APIUserAbortError("x"), 504, "timeout"],
    [new APIConnectionTimeoutError("x"), 504, "timeout"],
    [new APIConnectionError("x"), 502, "llm_unreachable"],
    [new RateLimitError("x"), 503, "llm_busy"],
    [new AuthenticationError("x"), 503, "not_configured"],
    [new PermissionDeniedError("x"), 503, "not_configured"],
    [new NotFoundError("x"), 503, "llm_model_unavailable"],
    [new BadRequestError("x"), 502, "llm_rejected"],
    [new InternalServerError("x"), 503, "llm_busy"],
    [new APIError("x"), 502, "llm_error"],
    [new TypeError("secret detail"), 502, "llm_error"],
  ])("%s → %i %s", (error, status, code) => {
    expect(mapLlmError(error, errors)).toEqual({ kind: "error", status, code });
  });
});

describe("createComplete", () => {
  it("키가 없으면 부르지 않고 503 not_configured", async () => {
    await expect(createComplete({ send: null, errors })(eduInput)).resolves.toEqual({
      kind: "error",
      status: 503,
      code: "not_configured",
    });
  });
  it("만든 본문과 시간 제한 signal로 한 번 부르고, 응답을 해석한다", async () => {
    const send = vi.fn(async (params: LlmMessageParams, signal: AbortSignal) => {
      expect(params).toEqual(buildMessageParams(eduInput));
      expect(signal.aborted).toBe(false);
      return response();
    });
    const r = await createComplete({ send, errors, deadlineMs: 5_000 })(eduInput);
    expect(r).toEqual({ kind: "text", text: "보통 4~6주 정도예요.", usage: { inputTokens: 120, outputTokens: 40, fallback: false } });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("SDK가 던지면 종류로 나눈다 — 거절 응답(refusal)은 오류가 아니라 결과", async () => {
    await expect(
      createComplete({
        send: async () => {
          throw new RateLimitError("429");
        },
        errors,
      })(eduInput),
    ).resolves.toEqual({ kind: "error", status: 503, code: "llm_busy" });
    await expect(createComplete({ send: async () => response({ stop_reason: "refusal" }), errors })(eduInput)).resolves.toMatchObject({
      kind: "refusal",
    });
  });
});
