/* eslint-disable @typescript-eslint/ban-ts-comment -- Deno 전용 가져오기(npm:·".ts")를 Next tsc가 읽지 못하는 줄에만 @ts-ignore를 쓴다. */
// Supabase Edge Function "account" — 계정 삭제 때 카카오 연결 끊기, 카카오 연결 해제 웹훅. 요청 처리는 handler.ts, 바깥 연결은 adapters.ts.
// 설명: handler.ts 머리말, 카카오 공식 문서는 _shared/kakao.ts 머리말.
//
// - 비밀값 KAKAO_ADMIN_KEY(카카오 앱 어드민 키)가 없으면 꺼진 채로 돈다: 화면 요청은 skipped, 웹훅은 401. 대표 결정(Q5) 뒤에 넣는다.
// - KAKAO_APP_ID(선택): 있으면 웹훅의 app_id가 같을 때만 지운다.
// - 로그인 확인·카카오 회원번호 찾기·웹훅 삭제는 서버 키(SUPABASE_SECRET_KEYS "default", 없으면 예전 SUPABASE_SERVICE_ROLE_KEY — _shared/auth.ts).
// - 관리자 확인은 부른 사람의 토큰으로 public.is_admin()(0014 — aal2)을 부른다 — 공개 키(SUPABASE_PUBLISHABLE_KEYS "default", 없으면 SUPABASE_ANON_KEY)
//   + Authorization: Bearer <그 토큰>. 서버 키로 부르면 auth.jwt()가 비어 늘 거짓이다.
// - 게이트웨이 JWT 확인은 끈다(supabase/config.toml [functions.account] — 웹훅에는 Supabase 토큰이 없다). 화면 요청은 함수가 토큰을 직접 확인한다.
// 이 파일은 Deno에서만 돈다(chat/index.ts 머리말과 같은 방식 — Deno 전용 가져오기 줄에만 @ts-ignore).

// @ts-ignore: Next tsc는 npm: 지정자를 모른다(Deno 전용)
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { pickPublishableKey, pickServerKey } from "../_shared/auth.ts";
// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { parseAllowedOrigins } from "../_shared/cors.ts";
// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { kakaoAdminKeyFrom } from "../_shared/kakao.ts";
// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { createDeleteByKakaoUserId, createIsAdmin, createKakaoUnlink, createKakaoUserIdLookup, createVerifyAccountUser } from "./adapters.ts";
// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { createAccountHandler } from "./handler.ts";

/** Deno 전역 중 이 파일이 쓰는 것만 — Next tsc용 선언 */
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Promise<Response>): unknown;
};

const env = (name: string) => Deno.env.get(name)?.trim() ?? "";

const supabaseUrl = env("SUPABASE_URL");
const serverKey = pickServerKey(env("SUPABASE_SECRET_KEYS"), env("SUPABASE_SERVICE_ROLE_KEY"));
const publishableKey = pickPublishableKey(env("SUPABASE_PUBLISHABLE_KEYS"), env("SUPABASE_ANON_KEY"));
const adminKey = kakaoAdminKeyFrom(env("KAKAO_ADMIN_KEY"));
const appId = env("KAKAO_APP_ID") || null;

// 시작 줄 — 빠진 설정의 이름과 기능 켬·끔만(값은 남기지 않는다)
const missing = [
  ["SUPABASE_URL", supabaseUrl !== ""],
  ["SUPABASE_SECRET_KEYS|SUPABASE_SERVICE_ROLE_KEY", serverKey !== null],
  ["SUPABASE_PUBLISHABLE_KEYS|SUPABASE_ANON_KEY", publishableKey !== null],
]
  .filter(([, present]) => !present)
  .map(([name]) => name);
const kakao = adminKey !== null ? "on" : "off";
if (missing.length > 0) console.error(JSON.stringify({ fn: "account", startup: "missing_env", names: missing, kakao }));
else console.log(JSON.stringify({ fn: "account", startup: "ok", server_key: serverKey?.source, kakao, app_id_check: appId !== null }));

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

/** 서버 키 클라이언트 — 로그인 확인·대상 계정의 카카오 회원번호·웹훅 삭제(0017)만. 건강 기록(user_states)은 읽지 않는다. */
const admin = supabaseUrl && serverKey ? createClient(supabaseUrl, serverKey.key, clientOptions) : null;

const handler = createAccountHandler({
  allowedOrigins: parseAllowedOrigins(Deno.env.get("ALLOWED_ORIGINS")),
  adminKey,
  appId,
  verifyUser: createVerifyAccountUser(admin ? { getUser: (token: string) => admin.auth.getUser(token) } : null),
  isAdmin: createIsAdmin(
    supabaseUrl && publishableKey
      ? (token: string, fn: string) =>
          createClient(supabaseUrl, publishableKey, {
            ...clientOptions,
            global: { headers: { Authorization: `Bearer ${token}` } },
          }).rpc(fn)
      : null,
  ),
  kakaoUserIdOf: createKakaoUserIdLookup(admin ? { getUserById: (id: string) => admin.auth.admin.getUserById(id) } : null),
  unlink: createKakaoUnlink((url, init) => fetch(url, init), adminKey),
  deleteByKakaoUserId: createDeleteByKakaoUserId(admin ? (fn: string, args: Record<string, unknown>) => admin.rpc(fn, args) : null),
  // 상태·코드·행동·소요 시간만 — 사용자 id·카카오 회원번호·키는 기록하지 않는다
  log: (entry) => console.log(JSON.stringify(entry)),
});

Deno.serve(handler);
