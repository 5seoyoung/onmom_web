/* eslint-disable @typescript-eslint/ban-ts-comment -- Deno는 ".ts" 확장자가 있어야 가져온다. Next tsc(TS5097)만 그 줄을 넘기게 한다. */
// Edge Function "account"의 요청 처리 — 카카오 연결 끊기와 카카오 연결 해제 웹훅. 의존성을 받아 만든다.
// 실제 연결은 index.ts(Deno), 시험은 src/api/accountHandler.test.ts(vitest — 웹 표준 Request/Response만 쓴다).
//
// 꺼진 채로 배포한다: 함수 비밀값 KAKAO_ADMIN_KEY가 없으면(deps.adminKey null)
//   - 화면의 끊기 요청은 로그인 확인 뒤 { kakao: "skipped" } — 카카오를 부르지 않는다(화면은 지금과 똑같이 삭제만 한다).
//   - 웹훅은 401 — 누구도 이 주소로 계정을 지울 수 없다.
//
// 1) POST {"action":"kakao-unlink-self"} (Authorization: Bearer <로그인 토큰>) — 계정 삭제(설정·온보딩 [동의하지 않고 나가기]) 직전에 화면이 부른다.
//    로그인 확인 → 키 없으면 skipped → 카카오 회원번호가 없으면 not_kakao → 카카오 연결 끊기 → unlinked | failed.
//    계정은 지우지 않는다(지우기는 화면이 지금처럼 delete_my_account RPC로). 실패해도 화면은 삭제를 이어 간다.
// 2) POST {"action":"kakao-unlink-admin","target":"<계정 UUID>"} (관리자 토큰 — is_admin()이 참인 aal2 세션) — 관리자 [계정 삭제] 직전.
//    관리자 아님 403 → 키 없으면 skipped → 대상의 카카오 회원번호(서버 키로 찾음) → 끊기.
// 3) GET·POST …/account/kakao-unlinked — 카카오 연결 해제 웹훅(_shared/kakao.ts 머리말의 공식 문서). Authorization: KakaoAK <어드민 키>.
//    키가 없거나 헤더가 다르면 401(카카오가 아님). 맞으면 그 카카오 회원번호의 온맘 계정을 지우고(0017 delete_user_by_kakao_id) 200.
//    카카오는 3초 안 200을 요구하고 정보가 없거나 오류가 나도 200을 기대한다 — 인증된 요청에는 늘 200(결과는 code로만).
//    KAKAO_APP_ID가 있으면 다른 앱의 알림은 지우지 않는다(200 ignored).
// 응답: { ok, kakao? | deleted? | code } — 스택·업스트림 응답·사용자 id·카카오 회원번호는 싣지도 기록하지도 않는다.
// 로그: fn·status·ms·code·action만.

// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { checkOrigin, corsHeaders, failure, jsonResponse, preflightHeaders } from "../_shared/cors.ts";
// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { bearerToken } from "../_shared/chat.ts";
// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { kakaoWebhookAuthorized, parseKakaoUnlinkNotice } from "../_shared/kakao.ts";
import type { KakaoUnlinkOutcome } from "../_shared/kakao.ts";

export type AccountAction = "kakao-unlink-self" | "kakao-unlink-admin" | "kakao-unlinked";

export interface AccountLogEntry {
  fn: "account";
  status: number;
  ms: number;
  action?: AccountAction;
  code?: string;
}

/** 로그인 확인 결과 — kakaoUserId는 그 사용자의 카카오 회원번호(카카오 로그인이 없으면 null) */
export interface AccountUser {
  id: string;
  kakaoUserId: string | null;
}

export interface AccountHandlerDeps {
  allowedOrigins: readonly string[];
  /** KAKAO_ADMIN_KEY — null이면 기능 꺼짐(끊기 skipped, 웹훅 401) */
  adminKey: string | null;
  /** KAKAO_APP_ID(선택) — 있으면 웹훅의 app_id가 같을 때만 지운다 */
  appId: string | null;
  /** 로그인 토큰 확인 — 틀린 토큰이면 null, 확인 자체를 못 하면 throw */
  verifyUser: (token: string) => Promise<AccountUser | null>;
  /** 이 토큰의 세션이 관리자인가(사용자 권한으로 is_admin() — aal2 필요) — 확인하지 못하면 throw */
  isAdmin: (token: string) => Promise<boolean>;
  /** 계정의 카카오 회원번호(서버 키로 찾음) — 계정이 없거나 카카오가 아니면 null, 찾지 못하면 throw */
  kakaoUserIdOf: (userId: string) => Promise<string | null>;
  /** 카카오 연결 끊기 — 끊었으면 true. 키는 index.ts가 묶어 넘긴다. throw하지 않는다(실패는 false). */
  unlink: (kakaoUserId: string) => Promise<boolean>;
  /** 웹훅 — 그 카카오 회원번호의 온맘 계정 삭제(0017), 지운 수. 실패하면 throw */
  deleteByKakaoUserId: (kakaoUserId: string) => Promise<number>;
  log: (entry: AccountLogEntry) => void;
  now?: () => number;
}

const METHODS = "POST, OPTIONS";
/** 화면 요청 본문 상한 — action과 UUID 하나면 충분하다 */
const MAX_BODY_BYTES = 1_024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const KAKAO_WEBHOOK_PATH = "/kakao-unlinked";

async function readSmallText(req: Request, limit: number): Promise<string | null> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > limit) return null;
  const buf = new Uint8Array(await req.arrayBuffer());
  return buf.byteLength > limit ? null : new TextDecoder().decode(buf);
}

export function createAccountHandler(deps: AccountHandlerDeps): (req: Request) => Promise<Response> {
  const now = deps.now ?? Date.now;

  return async (req) => {
    const started = now();
    let action: AccountAction | undefined;
    const log = (res: Response, code?: string): Response => {
      deps.log({ fn: "account", status: res.status, ms: now() - started, ...(action ? { action } : {}), ...(code ? { code } : {}) });
      return res;
    };

    // 3) 카카오 웹훅 — 서버 대 서버(Origin 없음). 주소 끝으로 가른다(…/functions/v1/account/kakao-unlinked).
    if (new URL(req.url).pathname.endsWith(KAKAO_WEBHOOK_PATH)) {
      action = "kakao-unlinked";
      try {
        if (!kakaoWebhookAuthorized(req.headers.get("authorization"), deps.adminKey)) {
          return log(failure(401, "unauthorized"), "unauthorized");
        }
        let params: URLSearchParams;
        if (req.method === "GET") params = new URL(req.url).searchParams;
        else if (req.method === "POST") {
          const text = await readSmallText(req, 4_096);
          params = new URLSearchParams(text ?? "");
        } else return log(failure(405, "method_not_allowed", { Allow: "GET, POST" }), "method_not_allowed");
        const notice = parseKakaoUnlinkNotice(params);
        // 아래부터는 카카오가 보낸 요청이다 — 카카오 요구대로 늘 200(결과는 code로)
        if (notice === null) return log(jsonResponse(200, { ok: true, code: "ignored" }), "bad_params");
        if (deps.appId !== null && notice.appId !== deps.appId) return log(jsonResponse(200, { ok: true, code: "ignored" }), "other_app");
        try {
          const deleted = await deps.deleteByKakaoUserId(notice.userId);
          return log(jsonResponse(200, { ok: true, deleted }), deleted > 0 ? "deleted" : "no_account");
        } catch {
          return log(jsonResponse(200, { ok: false, code: "delete_failed" }), "delete_failed");
        }
      } catch {
        return log(failure(500, "internal"), "internal");
      }
    }

    // 1)·2) 화면 요청 — 브라우저 CORS
    const origin = checkOrigin(req.headers.get("origin"), deps.allowedOrigins);
    const cors = corsHeaders(origin);
    const fail = (status: number, code: string) => log(failure(status, code, cors), code);
    const ok = (kakao: KakaoUnlinkOutcome) => log(jsonResponse(200, { ok: true, kakao }, cors), kakao);

    try {
      if (origin.kind === "denied") return fail(403, "origin_not_allowed");
      if (req.method === "OPTIONS") return log(new Response(null, { status: 204, headers: preflightHeaders(origin, METHODS) }));
      if (req.method !== "POST") return log(failure(405, "method_not_allowed", { ...cors, Allow: METHODS }), "method_not_allowed");

      const text = await readSmallText(req, MAX_BODY_BYTES);
      if (text === null) return fail(413, "too_large");
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        return fail(400, "bad_request");
      }
      const b = (typeof body === "object" && body !== null ? body : {}) as { action?: unknown; target?: unknown };
      if (b.action !== "kakao-unlink-self" && b.action !== "kakao-unlink-admin") return fail(400, "bad_request");
      action = b.action;
      const target = typeof b.target === "string" ? b.target.trim().toLowerCase() : null;
      if (action === "kakao-unlink-admin" && (target === null || !UUID.test(target))) return fail(400, "bad_request");

      const token = bearerToken(req.headers.get("authorization"));
      if (!token) return fail(401, "unauthorized");

      let kakaoUserId: string | null;
      if (action === "kakao-unlink-self") {
        let user: AccountUser | null;
        try {
          user = await deps.verifyUser(token);
        } catch {
          return fail(503, "auth_unavailable");
        }
        if (!user) return fail(401, "unauthorized");
        if (deps.adminKey === null) return ok("skipped");
        kakaoUserId = user.kakaoUserId;
      } else {
        let admin: boolean;
        try {
          admin = await deps.isAdmin(token);
        } catch {
          return fail(503, "auth_unavailable");
        }
        if (!admin) return fail(403, "forbidden");
        if (deps.adminKey === null) return ok("skipped");
        try {
          kakaoUserId = await deps.kakaoUserIdOf(target as string);
        } catch {
          return fail(503, "lookup_unavailable");
        }
      }

      if (kakaoUserId === null) return ok("not_kakao");
      return ok((await deps.unlink(kakaoUserId)) ? "unlinked" : "failed");
    } catch {
      return fail(500, "internal");
    }
  };
}
