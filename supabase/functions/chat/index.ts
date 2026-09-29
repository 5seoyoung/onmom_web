/* eslint-disable @typescript-eslint/ban-ts-comment -- Deno 전용 가져오기(npm:·".ts")를 Next tsc가 읽지 못하는 줄에만 @ts-ignore를 쓴다. */
// Supabase Edge Function "chat" — AI 상담(patient_edu)·약물 체크의 표에 없는 항목(substance)을 Anthropic(Claude)에 묻는다.
// 설명·배포·비밀 값: docs/SUPABASE_FUNCTIONS.md
//
// - 키: ANTHROPIC_API_KEY는 Supabase 함수 비밀(secrets)에만 둔다. 웹·저장소에는 없다.
// - 로그인 확인은 함수 안에서 한다(Supabase Auth getUser — 익명 게스트 계정 포함). 게이트웨이 JWT 확인은 끈다
//   (supabase/config.toml [functions.chat] verify_jwt = false).
// - 한도: 0003_llm_usage.sql의 llm_consume_quota()를 서버 키로 부른다. 서버 키는 Supabase가 넣어 주는 SUPABASE_SECRET_KEYS의 "default"가
//   먼저, 없으면 예전 SUPABASE_SERVICE_ROLE_KEY(_shared/auth.ts pickServerKey). SUPABASE_URL도 Supabase가 넣어 준다.
// - 모델 claude-opus-5 + 서버 쪽 거절 대체(fallbacks: "default"). stop_reason을 content보다 먼저 확인한다. 어시스턴트 선채움 없음.
// 환경 변수(선택): ALLOWED_ORIGINS, CHAT_HOURLY_LIMIT(기본 30), CHAT_GLOBAL_DAILY_LIMIT(기본 500).
//
// 이 파일은 연결만 한다 — 로그인 확인·한도·LLM 호출의 동작은 adapters.ts(vitest가 가짜 클라이언트로 확인), 요청 처리는 handler.ts.
// 이 파일은 Deno에서만 돈다. Next 프로젝트의 tsc도 저장소의 모든 .ts를 읽으므로(tsconfig include),
// Deno 전용 가져오기 줄에만 @ts-ignore를 붙이고 Deno 전역은 아래에 필요한 만큼만 선언한다. Deno는 `deno check`로 전부 검사한다.

// @ts-ignore: Next tsc는 npm: 지정자를 모른다(Deno 전용)
import Anthropic from "npm:@anthropic-ai/sdk@0.128.0";
// @ts-ignore: Next tsc는 npm: 지정자를 모른다(Deno 전용)
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { pickServerKey } from "../_shared/auth.ts";
// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { parseAllowedOrigins } from "../_shared/cors.ts";
// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { CHAT_GLOBAL_DAILY_LIMIT_DEFAULT, CHAT_HOURLY_LIMIT_DEFAULT, CHAT_LIMIT_WINDOW_SECONDS, parsePositiveInt } from "../_shared/chat.ts";
// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { LLM_DEADLINE_MS } from "../_shared/prompts.ts";
// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { createComplete, createConsumeQuota, createVerifyUser } from "./adapters.ts";
import type { LlmMessageParams } from "./adapters.ts";
// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { createChatHandler } from "./handler.ts";

/** Deno 전역 중 이 파일이 쓰는 것만 — Next tsc용 선언(Deno에서는 실제 Deno 전역이 그대로 쓰인다) */
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Promise<Response>): unknown;
};

const env = (name: string) => Deno.env.get(name)?.trim() ?? "";

const supabaseUrl = env("SUPABASE_URL");
/** 새 secret 키("default") 먼저, 없으면 예전 service_role 키 — 값은 기록하지 않는다 */
const serverKey = pickServerKey(env("SUPABASE_SECRET_KEYS"), env("SUPABASE_SERVICE_ROLE_KEY"));
const anthropicKey = env("ANTHROPIC_API_KEY");
/** 조직 전체용 키는 요청마다 워크스페이스를 지정해야 한다(anthropic-workspace-id). 워크스페이스에 묶인 키면 비워 둔다. */
const anthropicWorkspaceId = env("ANTHROPIC_WORKSPACE_ID");

const hourlyLimit = parsePositiveInt(env("CHAT_HOURLY_LIMIT"), CHAT_HOURLY_LIMIT_DEFAULT, 1000);
const globalDailyLimit = parsePositiveInt(env("CHAT_GLOBAL_DAILY_LIMIT"), CHAT_GLOBAL_DAILY_LIMIT_DEFAULT);

// 빠진 설정은 이름만 한 번 남긴다(값은 남기지 않는다) — 함수 Logs에서 원인을 찾을 수 있게
const missing = [
  ["SUPABASE_URL", supabaseUrl !== ""],
  ["SUPABASE_SECRET_KEYS|SUPABASE_SERVICE_ROLE_KEY", serverKey !== null],
  ["ANTHROPIC_API_KEY", anthropicKey !== ""],
]
  .filter(([, present]) => !present)
  .map(([name]) => name);
if (missing.length > 0) console.error(JSON.stringify({ fn: "chat", startup: "missing_env", names: missing }));
// 어느 서버 키를 쓰는지(종류만) — 예전 키가 없어질 때 확인용
else console.log(JSON.stringify({ fn: "chat", startup: "ok", server_key: serverKey?.source }));

/** 서버 키(service_role 권한) 클라이언트 — 이 함수 안에서만(로그인 확인·한도). 사용자 기록(user_states)은 읽지 않는다. */
const admin =
  supabaseUrl && serverKey
    ? createClient(supabaseUrl, serverKey.key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
    : null;

/** 재시도 1번(429·5xx·연결 오류) — 전체 대기는 LLM_DEADLINE_MS가 끊는다 */
const anthropic = anthropicKey
  ? new Anthropic({
      apiKey: anthropicKey,
      maxRetries: 1,
      defaultHeaders: anthropicWorkspaceId ? { "anthropic-workspace-id": anthropicWorkspaceId } : undefined,
    })
  : null;

/** 비스트리밍 요청 — 본문(LlmMessageParams)이 SDK 타입과 맞는지는 deno check가 본다(형 변환 없음) */
function send(client: Anthropic, params: LlmMessageParams, signal: AbortSignal) {
  return client.beta.messages.create(params, { signal });
}

const handler = createChatHandler({
  allowedOrigins: parseAllowedOrigins(Deno.env.get("ALLOWED_ORIGINS")),
  verifyUser: createVerifyUser(admin ? { getUser: (token: string) => admin.auth.getUser(token) } : null),
  consumeQuota: createConsumeQuota(admin ? (fn, args) => admin.rpc(fn, args) : null, {
    hourlyLimit,
    windowSeconds: CHAT_LIMIT_WINDOW_SECONDS,
    globalDailyLimit,
  }),
  complete: createComplete({
    send: anthropic ? (params, signal) => send(anthropic, params, signal) : null,
    // SDK 오류 클래스(Anthropic.RateLimitError 등)를 그대로 — 종류로만 나눈다
    errors: Anthropic,
    deadlineMs: LLM_DEADLINE_MS,
  }),
  // 상태·코드·preset·소요 시간·토큰 수만. 질문·답·컨텍스트·사용자 id는 기록하지 않는다.
  log: (entry) => console.log(JSON.stringify(entry)),
});

Deno.serve(handler);
