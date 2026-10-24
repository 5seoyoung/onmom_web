/* eslint-disable @typescript-eslint/ban-ts-comment -- Deno 전용 가져오기(npm:·".ts")를 Next tsc가 읽지 못하는 줄에만 @ts-ignore를 쓴다. */
// Supabase Edge Function "chat" — AI 상담(patient_edu)·약물 체크의 표에 없는 항목(substance)을 Anthropic(Claude)에 묻는다.
// 설명·배포·비밀 값: docs/SUPABASE_FUNCTIONS.md
//
// - 키: ANTHROPIC_API_KEY는 Supabase 함수 비밀(secrets)에만 둔다. 웹·저장소에는 없다.
// - 로그인 확인은 함수 안에서 한다(Supabase Auth getUser — 익명 게스트 계정 포함). 게이트웨이 JWT 확인은 끈다
//   (supabase/config.toml [functions.chat] verify_jwt = false).
// - AI 국외 이전 동의: 로그인 확인 뒤 0010_ai_consents.sql의 public.ai_consents에서 그 사용자 id의 행만 서버 키로 읽는다 —
//   판이 지금 판(_shared/aiConsent.ts)이 아니면 한도·LLM 없이 403 ai_consent_required.
// - 한도: 0010_ai_consents.sql의 llm_consume_quota()(다섯 인자 — 0003의 기록 표 llm_usage를 그대로 쓴다)를 서버 키로 부른다.
//   서버 키는 Supabase가 넣어 주는 SUPABASE_SECRET_KEYS의 "default"가
//   먼저, 없으면 예전 SUPABASE_SERVICE_ROLE_KEY(_shared/auth.ts pickServerKey). SUPABASE_URL도 Supabase가 넣어 준다.
// - 모델 claude-opus-5 + 서버 쪽 거절 대체(fallbacks: "default"). stop_reason을 content보다 먼저 확인한다. 어시스턴트 선채움 없음.
// - 서버 쪽 AI 스위치: AI_CHAT_SERVER_ENABLED가 정확히 "true"일 때만 켠다(_shared/chat.ts isAiChatServerEnabled). 없거나 다른 값이면 꺼짐 —
//   Anthropic 클라이언트를 만들지 않고, 모든 요청에 CORS·메서드 확인 뒤 503 ai_disabled로 답한다(ANTHROPIC_API_KEY가 있어도).
//   워크플로(.github/workflows/supabase.yml)는 Variables의 같은 이름 값을 넣는다 — 비우면 넣지 않으므로 한 번도 넣지 않았으면 꺼져 있다.
// 환경 변수(선택): ALLOWED_ORIGINS, AI_CHAT_SERVER_ENABLED(기본 꺼짐), CHAT_HOURLY_LIMIT(기본 30),
//   CHAT_GUEST_HOURLY_LIMIT(익명 게스트, 기본 5 — CHAT_HOURLY_LIMIT까지), CHAT_GLOBAL_HOURLY_LIMIT(전체 1시간, 기본 60),
//   CHAT_GLOBAL_DAILY_LIMIT(전체 하루, 기본 500) — 한도의 형식·기본값은 _shared/chat.ts chatLimitsFromEnv.
//   LLM이 답을 만들지 않은 실패(연결·혼잡·키·모델)면 0010의 llm_refund_quota()로 한 번을 돌려준다.
//
// 이 파일은 연결만 한다 — 로그인 확인·한도·LLM 호출의 동작은 adapters.ts(vitest가 가짜 클라이언트로 확인), 요청 처리는 handler.ts.
// 이 파일은 Deno에서만 돈다. Next 프로젝트의 tsc도 저장소의 모든 .ts를 읽으므로(tsconfig include),
// Deno 전용 가져오기 줄에만 @ts-ignore를 붙이고 Deno 전역은 아래에 필요한 만큼만 선언한다. Deno는 `deno check`로 전부 검사한다.

// @ts-ignore: Next tsc는 npm: 지정자를 모른다(Deno 전용)
import Anthropic from "npm:@anthropic-ai/sdk@0.128.0";
// @ts-ignore: Next tsc는 npm: 지정자를 모른다(Deno 전용)
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { AI_CONSENTS_TABLE } from "../_shared/aiConsent.ts";
// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { pickServerKey } from "../_shared/auth.ts";
// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { parseAllowedOrigins } from "../_shared/cors.ts";
// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { CHAT_LIMIT_WINDOW_SECONDS, chatLimitsFromEnv, isAiChatServerEnabled } from "../_shared/chat.ts";
// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { LLM_DEADLINE_MS } from "../_shared/prompts.ts";
// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { createComplete, createConsumeQuota, createReadAiConsentVersion, createRefundQuota, createVerifyUser } from "./adapters.ts";
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

/** 한도 — 비었거나 틀린 값은 기본값, 게스트 한도는 한 사람 한도까지(공개값이라 시작 줄에 남긴다) */
const limits = chatLimitsFromEnv(env);
/** 서버 쪽 AI 스위치 — 정확히 "true"일 때만 켜짐. 꺼져 있으면 Anthropic 클라이언트도 만들지 않는다(아래 anthropic = null). */
const aiEnabled = isAiChatServerEnabled(Deno.env.get("AI_CHAT_SERVER_ENABLED"));

// 빠진 설정은 이름만 한 번 남긴다(값은 남기지 않는다) — 함수 Logs에서 원인을 찾을 수 있게. AI가 꺼져 있으면 Anthropic 키는 없어도 된다.
const missing = [
  ["SUPABASE_URL", supabaseUrl !== ""],
  ["SUPABASE_SECRET_KEYS|SUPABASE_SERVICE_ROLE_KEY", serverKey !== null],
  ["ANTHROPIC_API_KEY", !aiEnabled || anthropicKey !== ""],
]
  .filter(([, present]) => !present)
  .map(([name]) => name);
// 스위치 상태(켬·끔)도 함께 — 값 그대로가 아니라 해석한 결과만
const ai = aiEnabled ? "on" : "off";
if (missing.length > 0) console.error(JSON.stringify({ fn: "chat", startup: "missing_env", names: missing, ai }));
// 어느 서버 키를 쓰는지(종류만) — 예전 키가 없어질 때 확인용. 한도는 공개값이라 그대로 남긴다(넣은 함수 비밀값이 적용됐는지 확인용).
else console.log(JSON.stringify({ fn: "chat", startup: "ok", server_key: serverKey?.source, ai, limits }));

/** 서버 키(service_role 권한) 클라이언트 — 이 함수 안에서만(로그인 확인·동의 확인·한도). 사용자 기록(user_states)은 읽지 않는다. */
const admin =
  supabaseUrl && serverKey
    ? createClient(supabaseUrl, serverKey.key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
    : null;

/** 재시도 1번(429·5xx·연결 오류) — 전체 대기는 LLM_DEADLINE_MS가 끊는다. 서버 쪽 AI 스위치가 꺼져 있으면 만들지 않는다(키가 있어도). */
const anthropic = aiEnabled && anthropicKey
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
  aiEnabled,
  verifyUser: createVerifyUser(admin ? { getUser: (token: string) => admin.auth.getUser(token) } : null),
  // 서버 키는 RLS를 건너뛴다 — 방금 확인한 사용자 id(userId)의 행만 읽는다
  readAiConsentVersion: createReadAiConsentVersion(
    admin ? (userId: string) => admin.from(AI_CONSENTS_TABLE).select("user_id, version").eq("user_id", userId).maybeSingle() : null,
  ),
  consumeQuota: createConsumeQuota(admin ? (fn, args) => admin.rpc(fn, args) : null, {
    ...limits,
    windowSeconds: CHAT_LIMIT_WINDOW_SECONDS,
  }),
  refundQuota: createRefundQuota(admin ? (fn, args) => admin.rpc(fn, args) : null),
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
