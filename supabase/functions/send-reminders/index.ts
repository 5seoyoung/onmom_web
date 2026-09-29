/* eslint-disable @typescript-eslint/ban-ts-comment -- Deno 전용 가져오기(npm:·".ts")를 Next tsc가 읽지 못하는 줄에만 @ts-ignore를 쓴다. */
// Supabase Edge Function "send-reminders" — 매일 리마인더(웹 푸시) 발송. 설명·비밀값·예약: docs/PWA_AND_REMINDERS.md
//
// - 부르는 쪽: pg_cron(0004_push_reminders.sql, 매일 11:00 UTC = 20:00 KST) — 헤더 x-reminder-secret(Vault reminder_cron_secret)로 확인한다.
//   서버 키(Authorization: Bearer <secret/service_role 키>)로도 부를 수 있다(사람이 손으로 시험할 때). 그 밖은 401.
//   게이트웨이 JWT 검사는 끈다(supabase/config.toml [functions.send-reminders] verify_jwt = false) — pg_cron 요청에는 사용자 토큰이 없다.
// - 비밀값: VAPID_PRIVATE_KEY(scripts/generate-vapid.mjs), VAPID_SUBJECT(mailto:… 또는 https://…), REMINDER_CRON_SECRET.
//   선택: VAPID_PUBLIC_KEY(있으면 비밀 키에서 만든 공개 키와 같은지 확인 — 웹의 NEXT_PUBLIC_VAPID_PUBLIC_KEY와 어긋남 방지), REMINDER_HOUR(기본 20).
//   서버 키(SUPABASE_SECRET_KEYS "default" 또는 SUPABASE_SERVICE_ROLE_KEY)와 SUPABASE_URL은 Supabase가 넣어 준다.
// - 보내는 것: 고정 문구(_shared/reminders.ts REMINDER_NOTIFICATION)뿐. 구독 표에도 알림에도 건강 데이터는 없다.
// - 암호화·서명은 _shared/reminders.ts(RFC 8291·8292, Web Crypto). 푸시 서비스가 404/410으로 답한 구독 행은 지운다.
// - 보내는 곳은 브라우저 회사의 푸시 서비스(_shared/reminders.ts PUSH_SERVICE_HOSTS — 0004 check 제약과 같은 규칙)뿐이고, 리다이렉트는 따라가지 않는다.
// - 로그: 건수·상태·소요 시간만(끝점·키·사용자 id 없음).
//
// 이 파일은 Deno에서만 돈다(chat/index.ts와 같은 방식). 처리 순서는 handler.ts(vitest가 가짜 의존성으로 확인).

// @ts-ignore: Next tsc는 npm: 지정자를 모른다(Deno 전용)
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { pickServerKey } from "../_shared/auth.ts";
// @ts-ignore: TS5097(Next tsc) — Deno용 확장자(한 줄이어야 @ts-ignore가 지정자 줄에 걸린다)
import { buildPushRequest, callerAuthorized, createVapidAuthorization, encryptWebPushPayload, importVapidKeys, isValidVapidSubject, parseSubscriptionRecord, pushAudience, PUSH_SUBSCRIPTIONS_TABLE, REMINDER_HOUR, reminderPayload, SUBSCRIPTION_PAGE_SIZE, VAPID_TOKEN_TTL_SECONDS } from "../_shared/reminders.ts";
import type { SubscriptionRecord, VapidKeys } from "../_shared/reminders.ts";
// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { createSendRemindersHandler } from "./handler.ts";

/** Deno 전역 중 이 파일이 쓰는 것만 — Next tsc용 선언(Deno에서는 실제 Deno 전역이 그대로 쓰인다) */
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Promise<Response>): unknown;
};

const env = (name: string) => Deno.env.get(name)?.trim() ?? "";

const supabaseUrl = env("SUPABASE_URL");
const serverKey = pickServerKey(env("SUPABASE_SECRET_KEYS"), env("SUPABASE_SERVICE_ROLE_KEY"));
const vapidPrivateKey = env("VAPID_PRIVATE_KEY");
const vapidPublicKeyCheck = env("VAPID_PUBLIC_KEY");
const vapidSubject = env("VAPID_SUBJECT");
const cronSecret = env("REMINDER_CRON_SECRET");
const hourRaw = Number.parseInt(env("REMINDER_HOUR"), 10);
const hour = Number.isInteger(hourRaw) && hourRaw >= 0 && hourRaw <= 23 ? hourRaw : REMINDER_HOUR;

// 빠진 설정은 이름만 한 번 남긴다(값은 남기지 않는다)
const missing = [
  ["SUPABASE_URL", supabaseUrl !== ""],
  ["SUPABASE_SECRET_KEYS|SUPABASE_SERVICE_ROLE_KEY", serverKey !== null],
  ["VAPID_PRIVATE_KEY", vapidPrivateKey !== ""],
  ["VAPID_SUBJECT", vapidSubject !== ""],
  ["REMINDER_CRON_SECRET", cronSecret !== ""],
]
  .filter(([, present]) => !present)
  .map(([name]) => name);
if (missing.length > 0) console.error(JSON.stringify({ fn: "send-reminders", startup: "missing_env", names: missing }));
else console.log(JSON.stringify({ fn: "send-reminders", startup: "ok", server_key: serverKey?.source, hour }));

/** 서버 키 클라이언트 — 구독 표만 읽고 지운다(RLS 우회). 사용자 기록(user_states)은 건드리지 않는다. */
const admin =
  supabaseUrl && serverKey
    ? createClient(supabaseUrl, serverKey.key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
    : null;

/** VAPID 키 — 한 번만 만든다. 비밀 키가 틀리면 null(발송 503 vapid_unavailable). */
const vapidKeys: Promise<VapidKeys | null> = vapidPrivateKey
  ? importVapidKeys(vapidPrivateKey)
      .then((keys: VapidKeys) => {
        if (vapidPublicKeyCheck && vapidPublicKeyCheck !== keys.publicKeyB64) {
          console.error(JSON.stringify({ fn: "send-reminders", startup: "vapid_public_key_mismatch" }));
          return null;
        }
        return keys;
      })
      .catch(() => {
        console.error(JSON.stringify({ fn: "send-reminders", startup: "vapid_private_key_invalid" }));
        return null;
      })
  : Promise.resolve(null);

/** 푸시 서비스 origin마다 서명 한 번(만료 전까지 재사용) */
const authorizations = new Map<string, { value: string; expiresAt: number }>();
async function authorizationFor(keys: VapidKeys, endpoint: string): Promise<string> {
  const audience = pushAudience(endpoint);
  const now = Date.now();
  const cached = authorizations.get(audience);
  if (cached && cached.expiresAt > now + 60_000) return cached.value;
  const value = await createVapidAuthorization(keys, audience, vapidSubject, now);
  authorizations.set(audience, { value, expiresAt: now + VAPID_TOKEN_TTL_SECONDS * 1000 });
  return value;
}

const handler = createSendRemindersHandler({
  authorize: (headers: Headers) => callerAuthorized(headers, cronSecret || null, serverKey?.key ?? null),

  preflight: async () => {
    if (!admin) return "auth_unavailable";
    if (!(await vapidKeys)) return "vapid_unavailable";
    if (!isValidVapidSubject(vapidSubject)) return "vapid_subject_invalid";
    return null;
  },

  listSubscriptions: async () => {
    if (!admin) throw new Error("no client");
    const out: SubscriptionRecord[] = [];
    for (let from = 0; ; from += SUBSCRIPTION_PAGE_SIZE) {
      const { data, error } = await admin
        .from(PUSH_SUBSCRIPTIONS_TABLE)
        .select("id, endpoint, p256dh, auth, tz")
        .order("created_at", { ascending: true })
        .range(from, from + SUBSCRIPTION_PAGE_SIZE - 1);
      if (error) throw new Error(error.code ?? "select");
      const rows: unknown[] = data ?? [];
      for (const row of rows) {
        const parsed = parseSubscriptionRecord(row);
        if (parsed) out.push(parsed);
      }
      if (rows.length < SUBSCRIPTION_PAGE_SIZE) break;
    }
    return out;
  },

  deleteSubscriptions: async (ids: string[]) => {
    if (!admin) throw new Error("no client");
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await admin.from(PUSH_SUBSCRIPTIONS_TABLE).delete().in("id", ids.slice(i, i + 200));
      if (error) throw new Error(error.code ?? "delete");
    }
  },

  send: async (subscription: SubscriptionRecord) => {
    const keys = await vapidKeys;
    if (!keys) throw new Error("vapid_unavailable");
    const body = await encryptWebPushPayload(reminderPayload(), subscription.p256dh, subscription.auth);
    const request = buildPushRequest(subscription, body, await authorizationFor(keys, subscription.endpoint));
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: request.redirect,
      signal: AbortSignal.timeout(10_000),
    });
    await response.body?.cancel();
    return response.status;
  },

  now: () => new Date(),
  hour,
  log: (entry) => console.log(JSON.stringify(entry)),
});

Deno.serve(handler);
