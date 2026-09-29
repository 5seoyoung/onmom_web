// Edge Function send-reminders의 처리 순서(supabase/functions/send-reminders/handler.ts)와 표·예약 SQL(0004_push_reminders.sql)의 글자 점검.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PUSH_SUBSCRIPTIONS_TABLE } from "./reminderModel";
import type { SubscriptionRecord } from "../../../supabase/functions/_shared/reminders";
import { REMINDER_SECRET_HEADER } from "../../../supabase/functions/_shared/reminders";
import { createSendRemindersHandler, type SendRemindersDeps, type SendRemindersLogEntry } from "../../../supabase/functions/send-reminders/handler";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

const SEOUL_20 = new Date("2026-09-28T11:00:00Z");
const P256DH = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
const AUTH = "BTBZMqHH6r4Tts7J_aSIgg";
const sub = (id: string, tz: string, endpoint = `https://fcm.googleapis.com/fcm/send/${id}`): SubscriptionRecord => ({ id, endpoint, p256dh: P256DH, auth: AUTH, tz });

function setup(overrides: Partial<SendRemindersDeps> = {}) {
  const logs: SendRemindersLogEntry[] = [];
  const deleted: string[][] = [];
  const sent: string[] = [];
  const statuses: Record<string, number | Error> = {};
  const deps: SendRemindersDeps = {
    authorize: (headers) => headers.get(REMINDER_SECRET_HEADER) === "secret",
    preflight: async () => null,
    listSubscriptions: async () => [sub("seoul-ok", "Asia/Seoul"), sub("seoul-gone", "Asia/Seoul"), sub("newyork", "America/New_York"), sub("seoul-err", "Asia/Seoul")],
    deleteSubscriptions: async (ids) => {
      deleted.push(ids);
    },
    send: async (s) => {
      sent.push(s.id);
      const r = statuses[s.id] ?? 201;
      if (r instanceof Error) throw r;
      return r;
    },
    now: () => SEOUL_20,
    concurrency: 2,
    log: (e) => logs.push(e),
    ...overrides,
  };
  statuses["seoul-gone"] = 410;
  statuses["seoul-err"] = new Error("network");
  const handler = createSendRemindersHandler(deps);
  const call = (init: RequestInit = {}) => handler(new Request("https://fn.example/send-reminders", { method: "POST", headers: { [REMINDER_SECRET_HEADER]: "secret" }, ...init }));
  return { handler, call, logs, deleted, sent };
}

describe("send-reminders handler", () => {
  it("POST + 공유 비밀만 — 그 밖은 405/401이고 구독을 읽지 않는다", async () => {
    let listed = 0;
    const { call, logs } = setup({
      listSubscriptions: async () => {
        listed += 1;
        return [];
      },
    });
    expect((await call({ method: "GET" })).status).toBe(405);
    const unauthorized = await call({ headers: { [REMINDER_SECRET_HEADER]: "nope" } });
    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.json()).toEqual({ ok: false, code: "unauthorized" });
    expect(listed).toBe(0);
    expect(logs.map((l) => l.code)).toEqual(["method_not_allowed", "unauthorized"]);
  });

  it("발송 준비가 안 됐으면(VAPID 키 없음) 503 — 구독을 읽지 않는다", async () => {
    let listed = 0;
    const { call } = setup({
      preflight: async () => "vapid_unavailable",
      listSubscriptions: async () => {
        listed += 1;
        return [];
      },
    });
    const res = await call();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, code: "vapid_unavailable" });
    expect(listed).toBe(0);
  });

  it("구독을 못 읽으면 503 db_unavailable", async () => {
    const { call } = setup({
      listSubscriptions: async () => {
        throw new Error("PGRST");
      },
    });
    const res = await call();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, code: "db_unavailable" });
  });

  it("행의 시간대에서 20시인 구독에만 보내고, 410은 행을 지우고, 실패는 세기만 한다 — 응답·로그는 숫자뿐", async () => {
    const { call, logs, deleted, sent } = setup();
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, total: 4, due: 3, sent: 1, gone: 1, retry: 0, rejected: 0, errors: 1, pruned: 1 });
    expect(sent.sort()).toEqual(["seoul-err", "seoul-gone", "seoul-ok"]); // 뉴욕(07시)은 보내지 않는다
    expect(deleted).toEqual([["seoul-gone"]]);
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe(200);
    expect(logs[0].summary?.pruned).toBe(1);
    expect(JSON.stringify(logs)).not.toContain("fcm.googleapis.com"); // 끝점을 기록하지 않는다
    expect(JSON.stringify(logs)).not.toContain(P256DH);
  });

  it("발송 시각을 바꿀 수 있다(REMINDER_HOUR) — 7시로 두면 뉴욕만", async () => {
    const { call, sent } = setup({ hour: 7 });
    expect(await (await call()).json()).toMatchObject({ due: 1, sent: 1 });
    expect(sent).toEqual(["newyork"]);
  });

  it("확인된 호출자는 본문 {hour}로 그 한 번의 발송 시를 바꿀 수 있다(손으로 시험) — pg_cron 본문·틀린 값은 기본값", async () => {
    const json = (body: unknown) => ({ body: JSON.stringify(body), headers: { [REMINDER_SECRET_HEADER]: "secret", "Content-Type": "application/json" } });
    const a = setup();
    expect(await (await a.call(json({ hour: 7 }))).json()).toMatchObject({ due: 1, sent: 1 });
    expect(a.sent).toEqual(["newyork"]);
    const b = setup();
    expect(await (await b.call(json({ scheduled_at: "2026-09-28T11:00:00Z" }))).json()).toMatchObject({ due: 3 });
    const c = setup();
    expect(await (await c.call(json({ hour: 24 }))).json()).toMatchObject({ due: 3 });
    const d = setup();
    expect(await (await d.call({ body: "not json", headers: { [REMINDER_SECRET_HEADER]: "secret" } })).json()).toMatchObject({ due: 3 });
    // 확인되지 않은 호출자는 본문과 무관하게 401
    const e = setup();
    expect((await e.call({ body: JSON.stringify({ hour: 7 }), headers: { [REMINDER_SECRET_HEADER]: "nope" } })).status).toBe(401);
    expect(e.sent).toEqual([]);
  });

  it("행 삭제가 실패해도 발송 결과는 200으로 돌려주고 경고만 남긴다", async () => {
    const { call, logs } = setup({
      deleteSubscriptions: async () => {
        throw new Error("PGRST");
      },
    });
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, gone: 1, pruned: 0, warning: "prune_failed" });
    expect(logs[0].code).toBe("prune_failed");
  });

  it("받는 푸시 서비스 밖의 끝점(0004 제약을 우회한 행)은 요청하지 않고 rejected로만 센다", async () => {
    const { call, sent, deleted } = setup({
      listSubscriptions: async () => [sub("ok", "Asia/Seoul"), sub("relay", "Asia/Seoul", "https://attacker.example/hook"), sub("meta", "Asia/Seoul", "https://169.254.169.254/x")],
    });
    expect(await (await call()).json()).toEqual({ ok: true, total: 3, due: 3, sent: 1, gone: 0, retry: 0, rejected: 2, errors: 0, pruned: 0 });
    expect(sent).toEqual(["ok"]);
    expect(deleted).toEqual([]);
  });

  it("구독이 없으면 아무것도 보내지 않는다", async () => {
    const { call, sent, deleted } = setup({ listSubscriptions: async () => [] });
    expect(await (await call()).json()).toEqual({ ok: true, total: 0, due: 0, sent: 0, gone: 0, retry: 0, rejected: 0, errors: 0, pruned: 0 });
    expect(sent).toEqual([]);
    expect(deleted).toEqual([]);
  });
});

describe("0004_push_reminders.sql — 실행하지 않고 글자로 확인한다", () => {
  const CODE = readFileSync(`${ROOT}supabase/migrations/0004_push_reminders.sql`, "utf8")
    .replace(/--[^\n]*/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
  const policy = (name: string) => {
    const start = CODE.indexOf(`create policy "push_subscriptions: ${name}"`);
    expect(start).toBeGreaterThanOrEqual(0);
    return CODE.slice(start, CODE.indexOf(";", start));
  };

  it("표 — 한 끝점 = 한 행, user_id는 auth.uid() 기본값 + 계정 삭제 시 함께 삭제, 건강 데이터 칸 없음", () => {
    expect(CODE).toContain(`create table if not exists public.${PUSH_SUBSCRIPTIONS_TABLE} (`);
    expect(CODE).toContain("user_id uuid not null default auth.uid() references auth.users (id) on delete cascade");
    expect(CODE).toContain("endpoint text not null unique");
    expect(CODE).toContain("tz text not null default 'asia/seoul'");
    expect(CODE).toMatch(/create table if not exists public\.push_subscriptions \([^;]*\bp256dh text not null,[^;]*\bauth text not null,/);
    expect(CODE).toContain("create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id)");
    expect(CODE).not.toMatch(/state|symptom|record|profile/);
  });

  it("권한 — anon 없음, authenticated는 본인 행만(RLS 4개)", () => {
    expect(CODE).toContain("revoke all on table public.push_subscriptions from public, anon, authenticated");
    expect(CODE).toContain("grant select, insert, update, delete on table public.push_subscriptions to authenticated");
    expect(CODE).toContain("alter table public.push_subscriptions enable row level security");
    expect(CODE).not.toMatch(/grant [^;]* to anon/);
    expect(policy("본인 행 읽기")).toContain("using ((select auth.uid()) = user_id)");
    expect(policy("본인 행 만들기")).toContain("with check ((select auth.uid()) = user_id)");
    expect(policy("본인 행 바꾸기")).toContain("with check ((select auth.uid()) = user_id)");
    expect(policy("본인 행 지우기")).toContain("using ((select auth.uid()) = user_id)");
    for (const name of ["본인 행 읽기", "본인 행 만들기", "본인 행 바꾸기", "본인 행 지우기"]) expect(policy(name)).toContain("to authenticated");
  });

  it("남용 방지 — 끝점은 받는 푸시 서비스만(check), 사용자당 10개(같은 끝점 다시 저장은 세지 않음, 동시 저장은 잠금)", () => {
    expect(CODE).toContain("constraint push_subscriptions_endpoint_check check ( endpoint ~* '^https:");
    expect(CODE).toContain("create or replace function public.push_subscriptions_limit()");
    expect(CODE).toContain("perform pg_advisory_xact_lock(hashtext('push_subscriptions:' || new.user_id::text))");
    expect(CODE).toContain("where s.user_id = new.user_id and s.endpoint <> new.endpoint ) >= 10");
    expect(CODE).toContain("raise exception 'too many push subscriptions' using errcode = '23514'");
    expect(CODE).toContain("drop trigger if exists push_subscriptions_limit on public.push_subscriptions");
    expect(CODE).toContain("before insert on public.push_subscriptions for each row execute function public.push_subscriptions_limit()");
  });

  it("예약 — pg_cron·pg_net, 매일 11:00 UTC(= 20:00 KST), 주소·비밀은 Vault에서 실행 시점에 읽고 파일에는 없다", () => {
    expect(CODE).toContain("create extension if not exists pg_cron with schema pg_catalog");
    expect(CODE).toContain("create extension if not exists pg_net with schema extensions");
    expect(CODE).toContain("cron.unschedule('onmom-send-reminders')");
    expect(CODE).toContain("cron.schedule( 'onmom-send-reminders', '0 11 * * *'");
    expect(CODE).toContain("'/functions/v1/send-reminders'");
    expect(CODE).toContain("from vault.decrypted_secrets where name = 'project_url'");
    expect(CODE).toContain(`'${REMINDER_SECRET_HEADER}', cron_secret.decrypted_secret`);
    expect(CODE).toContain("timeout_milliseconds := 60000");
    // Vault에 reminder_cron_secret이 없으면(아직 켜지 않음) 요청 자체를 보내지 않는다 — 함수 배포 전에 적용돼도 404·401을 두드리지 않는다
    expect(CODE).toContain("from vault.decrypted_secrets as cron_secret where cron_secret.name = 'reminder_cron_secret' and cron_secret.decrypted_secret <> ''");
    // 빈 헤더를 보내지 않는다 — apikey는 값이 있을 때만(jsonb_strip_nulls), 비밀 헤더는 값이 있을 때만 요청이 생긴다
    expect(CODE).toContain("headers := jsonb_strip_nulls(jsonb_build_object(");
    expect(CODE).not.toMatch(/coalesce\(\(select decrypted_secret from vault\.decrypted_secrets where name = '(publishable_key|reminder_cron_secret)'\), ''\)/);
    // 비밀값 리터럴이 없다
    expect(CODE).not.toMatch(/sb_secret_|service_role_key|eyj[a-z0-9_-]{20,}/);
    expect(CODE).not.toMatch(/vault\.create_secret\(/); // 사람이 손으로 넣는다(주석에만 있음)
  });
});
