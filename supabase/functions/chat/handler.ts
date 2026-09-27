/* eslint-disable @typescript-eslint/ban-ts-comment -- Deno는 ".ts" 확장자가 있어야 가져온다. Next tsc(TS5097)만 그 줄을 넘기게 한다. */
// Edge Function "chat"의 요청 처리 — 의존성(사용자 확인·한도·LLM·로그)을 받아 만든다.
// 실제 연결은 index.ts(Deno), 테스트는 src/api/edgeHandlers.test.ts(vitest — 웹 표준 Request/Response만 쓰므로 Node에서도 돈다).
//
// POST { preset, messages, context? } (Authorization: Bearer <Supabase 로그인 토큰> — 익명 게스트 계정도 된다)
// 순서
//   1) CORS·메서드·본문 크기 → 2) 형식 검증(컨텍스트는 week·delivery·breastfeeding만 — 그 밖이면 거절)
//   3) 안전 선필터: 마지막 사용자 메시지에 자해·자살 표현 → LLM을 부르지 않고 고정 위기 안내(로그인·한도와 무관하게 늘 답한다)
//   4) 로그인 확인 → 5) 사용자별 한도(1시간 30회)·서비스 전체 하루 상한 → 6) LLM(claude-opus-5, 거절 시 서버 쪽 대체 모델)
// 응답: 성공 { ok: true, text } | { ok: true, json } (약물), 실패 { ok: false, code } + 4xx/5xx. 스택·내부 메시지는 내보내지 않는다.
// 로그: 상태·코드·preset·소요 시간·토큰 수·대체 모델 사용 여부만. 질문·답·컨텍스트·사용자 id는 기록하지 않는다(민감정보).

// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { checkOrigin, corsHeaders, failure, jsonResponse, preflightHeaders } from "../_shared/cors.ts";
// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { bearerToken, CHAT_MAX_BODY_BYTES, latestUserMessage, validateChatRequest } from "../_shared/chat.ts";
import type { ChatMessageInput, ChatPreset, QuotaResult } from "../_shared/chat.ts";
// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { parseSubstanceOutput, SUBSTANCE_OUTPUT_SCHEMA, systemPromptBlocks } from "../_shared/prompts.ts";
// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { CRISIS_REPLY, isSelfHarmMessage } from "../_shared/safety.ts";

export interface LlmCallInput {
  preset: ChatPreset;
  /** 시스템 프롬프트 블록 — 서버 고정 지시문 + 컨텍스트 한 줄 */
  system: string[];
  messages: ChatMessageInput[];
  /** 약물 답 형식(structured outputs). 상담은 null(자유 글). */
  jsonSchema: Record<string, unknown> | null;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  /** 거절로 서버 쪽 대체 모델이 답했는가 */
  fallback: boolean;
}

export type LlmCallResult =
  | { kind: "text"; text: string; usage: LlmUsage }
  /** 안전 분류기·모델이 거절했고 대체 모델도 답하지 않았다 */
  | { kind: "refusal"; usage: LlmUsage }
  /** 토큰 상한(또는 문맥 창)에서 잘렸다 — 잘린 답은 쓰지 않는다 */
  | { kind: "truncated"; usage: LlmUsage }
  | { kind: "error"; status: 502 | 503 | 504; code: string };

export interface ChatLogEntry {
  fn: "chat";
  status: number;
  ms: number;
  code?: string;
  preset?: ChatPreset;
  input_tokens?: number;
  output_tokens?: number;
  fallback?: boolean;
}

export interface ChatHandlerDeps {
  allowedOrigins: readonly string[];
  /** Supabase 로그인 토큰 확인 — 유효하지 않으면 null, 확인 자체를 못 하면 throw */
  verifyUser: (token: string) => Promise<{ id: string } | null>;
  /** 한도 확인 + 한 번 기록(llm_consume_quota). 확인하지 못하면 null 또는 throw — 그때는 LLM을 부르지 않는다. */
  consumeQuota: (userId: string) => Promise<QuotaResult | null>;
  complete: (input: LlmCallInput) => Promise<LlmCallResult>;
  log: (entry: ChatLogEntry) => void;
  now?: () => number;
}

const METHODS = "POST, OPTIONS";

export function createChatHandler(deps: ChatHandlerDeps): (req: Request) => Promise<Response> {
  const now = deps.now ?? Date.now;

  return async (req) => {
    const started = now();
    const origin = checkOrigin(req.headers.get("origin"), deps.allowedOrigins);
    const cors = corsHeaders(origin);
    let preset: ChatPreset | undefined;
    const done = (res: Response, extra: Partial<ChatLogEntry> = {}): Response => {
      deps.log({ fn: "chat", status: res.status, ms: now() - started, ...(preset ? { preset } : {}), ...extra });
      return res;
    };
    const fail = (status: number, code: string, extra: Partial<ChatLogEntry> = {}) =>
      done(failure(status, code, cors), { code, ...extra });

    try {
      if (origin.kind === "denied") return fail(403, "origin_not_allowed");
      if (req.method === "OPTIONS") {
        return done(new Response(null, { status: 204, headers: preflightHeaders(origin, METHODS) }));
      }
      if (req.method !== "POST") {
        return done(failure(405, "method_not_allowed", { ...cors, Allow: METHODS }), { code: "method_not_allowed" });
      }

      // 본문 — 크기 상한 → JSON → 형식
      const declared = Number(req.headers.get("content-length") ?? "0");
      if (Number.isFinite(declared) && declared > CHAT_MAX_BODY_BYTES) return fail(413, "too_large");
      const raw = await req.arrayBuffer();
      if (raw.byteLength > CHAT_MAX_BODY_BYTES) return fail(413, "too_large");
      let body: unknown;
      try {
        body = JSON.parse(new TextDecoder().decode(raw));
      } catch {
        return fail(400, "bad_request");
      }
      const valid = validateChatRequest(body);
      if (!valid.ok) return fail(400, "bad_request");
      const request = valid.request;
      preset = request.preset;

      // 안전 선필터 — LLM을 부르지 않는다. 로그인·한도보다 먼저: 위기 안내는 늘 나가야 한다.
      if (isSelfHarmMessage(latestUserMessage(request.messages))) {
        // 약물 체크 화면에는 위기 안내를 보일 자리가 없다 — 표의 결과("정보 부족")를 그대로 두게 거절만 한다
        if (request.preset === "substance") return fail(422, "flagged");
        return done(jsonResponse(200, { ok: true, text: CRISIS_REPLY, flagged: true }, cors), { code: "flagged" });
      }

      const token = bearerToken(req.headers.get("authorization"));
      if (!token) return fail(401, "unauthorized");
      let user: { id: string } | null;
      try {
        user = await deps.verifyUser(token);
      } catch {
        return fail(503, "auth_unavailable");
      }
      if (!user) return fail(401, "unauthorized");

      let quota: QuotaResult | null;
      try {
        quota = await deps.consumeQuota(user.id);
      } catch {
        quota = null;
      }
      if (quota === null) return fail(503, "unavailable");
      if (quota === "user_limit") return fail(429, "rate_limited");
      if (quota === "global_limit") return fail(503, "busy");

      const result = await deps.complete({
        preset: request.preset,
        system: systemPromptBlocks(request.preset, request.context),
        messages: request.messages,
        jsonSchema: request.preset === "substance" ? SUBSTANCE_OUTPUT_SCHEMA : null,
      });
      if (result.kind === "error") return fail(result.status, result.code);
      const usage = {
        input_tokens: result.usage.inputTokens,
        output_tokens: result.usage.outputTokens,
        fallback: result.usage.fallback,
      };
      if (result.kind === "refusal") return fail(422, "refused", usage);
      if (result.kind === "truncated") return fail(502, "truncated", usage);

      if (request.preset === "substance") {
        const json = parseSubstanceOutput(result.text);
        if (!json) return fail(502, "bad_output", usage);
        return done(jsonResponse(200, { ok: true, json }, cors), usage);
      }
      const text = result.text.trim();
      if (text === "") return fail(502, "empty", usage);
      return done(jsonResponse(200, { ok: true, text }, cors), usage);
    } catch {
      // 예상 밖 오류 — 내용은 내보내지도 기록하지도 않는다
      return fail(500, "internal");
    }
  };
}
