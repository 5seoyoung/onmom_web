// Edge Function send-reminders의 처리 순서(supabase/functions/send-reminders/handler.ts)와 표·예약 SQL(0004_push_reminders.sql ·
// 예약을 매시로 바꾼 0007_schedules_and_limits.sql)의 글자 점검.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PUSH_SUBSCRIPTIONS_TABLE } from "./reminderModel";
import type { SubscriptionRecord } from "../../../supabase/functions/_shared/reminders";
import { isDueNow, localHour, REMINDER_HOUR, REMINDER_MINUTE, REMINDER_SECRET_HEADER } from "../../../supabase/functions/_shared/reminders";
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

  it("예상 못 한 예외(발송 준비가 throw)는 500 internal — 로그에는 코드만", async () => {
    const { call, logs } = setup({
      preflight: async () => {
        throw new Error("vapid import exploded: secret-looking detail");
      },
    });
    const res = await call();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, code: "internal" });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ fn: "send-reminders", status: 500, code: "internal" });
    expect(JSON.stringify(logs)).not.toContain("secret-looking");
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

/** 주석(-- …)을 뺀 실행문(소문자, 공백 한 칸) — 설명 글의 낱말이 검사에 걸리지 않게 */
const sqlCode = (file: string) =>
  readFileSync(`${ROOT}supabase/migrations/${file}`, "utf8")
    .replace(/--[^\n]*/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");

/** 운영 프로젝트 주소·ref(supabase/config.toml project_id) — 예약 SQL에 글자로 남지 않아야 한다 */
const PROJECT_REF = /^project_id\s*=\s*"([a-z]{20})"/m.exec(readFileSync(`${ROOT}supabase/config.toml`, "utf8"))?.[1] ?? "";

describe("0004_push_reminders.sql — 실행하지 않고 글자로 확인한다", () => {
  const CODE = sqlCode("0004_push_reminders.sql");
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

  // 0004는 이미 운영에 적용된 파일이라 고치지 않는다 — 예약은 0007이 매시·주소 없는 판으로 바꿨다(아래 "0007" 묶음).
  it("예약(첫 판) — pg_cron·pg_net, 매일 11:00 UTC(= 20:00 KST), 비밀은 Vault에서 실행 시점에 읽는다. 주소는 Vault에 없을 때의 기본값이 파일에 있었다", () => {
    expect(CODE).toContain("create extension if not exists pg_cron with schema pg_catalog");
    expect(CODE).toContain("create extension if not exists pg_net with schema extensions");
    expect(CODE).toContain("cron.unschedule('onmom-send-reminders')");
    expect(CODE).toContain("cron.schedule( 'onmom-send-reminders', '0 11 * * *'");
    expect(CODE).toContain("'/functions/v1/send-reminders'");
    expect(CODE).toContain("from vault.decrypted_secrets where name = 'project_url'");
    // 운영 프로젝트 주소가 기본값으로 박혀 있다 — 0007이 이 기본값을 없앤다
    expect(PROJECT_REF).toMatch(/^[a-z]{20}$/);
    expect(CODE).toContain(`'https://${PROJECT_REF}.supabase.co'`);
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

describe("0007_schedules_and_limits.sql — 매일 리마인더 예약(매시 정각, 주소는 Vault에서만)", () => {
  const FILE = "0007_schedules_and_limits.sql";
  const RAW = readFileSync(`${ROOT}supabase/migrations/${FILE}`, "utf8");
  const CODE = sqlCode(FILE);
  /** 예약이 실행하는 SQL($job$ … $job$) */
  const job = (code: string, name: string) => {
    const start = code.indexOf(`select cron.schedule( '${name}',`);
    expect(start, name).toBeGreaterThanOrEqual(0);
    const open = code.indexOf("$job$", start) + "$job$".length;
    return code.slice(open, code.indexOf("$job$", open));
  };
  const JOB = job(CODE, "onmom-send-reminders");

  it("매시 정각('0 * * * *') — 같은 이름의 예약이 있으면 지우고 다시 만든다(하나만 남는다)", () => {
    const guard = CODE.indexOf("if exists (select 1 from cron.job where jobname = 'onmom-send-reminders')");
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(CODE.indexOf("perform cron.unschedule('onmom-send-reminders')")).toBeGreaterThan(guard);
    expect(CODE.indexOf("select cron.schedule( 'onmom-send-reminders', '0 * * * *', $job$")).toBeGreaterThan(guard);
    expect(CODE.match(/cron\.schedule\( 'onmom-send-reminders'/g)).toHaveLength(1);
  });

  it("운영 프로젝트 주소가 파일 어디에도 없다(설명 글 포함) — 주소는 Vault project_url에서만 읽고 기본값이 없다", () => {
    expect(PROJECT_REF).toMatch(/^[a-z]{20}$/);
    expect(RAW).not.toContain(PROJECT_REF);
    expect(CODE).not.toMatch(/https?:\/\/[a-z0-9-]+\.supabase\.(co|in)/);
    expect(JOB).not.toContain("coalesce");
    expect(JOB).toContain("url := rtrim(project_url.decrypted_secret, '/') || '/functions/v1/send-reminders'");
    expect(JOB).toContain("join vault.decrypted_secrets as project_url on project_url.name = 'project_url'");
    // https로 시작하는 값만 — 비밀 헤더를 평문 http로 보내지 않는다
    expect(JOB).toContain("and project_url.decrypted_secret like 'https://%'");
  });

  it("Vault에 reminder_cron_secret이나 project_url이 없으면 요청 자체를 만들지 않는다(걸러진 행이 없으면 net.http_post도 없다)", () => {
    expect(JOB).toMatch(/^ select net\.http_post\(/);
    expect(JOB).toContain(
      "from vault.decrypted_secrets as cron_secret join vault.decrypted_secrets as project_url on project_url.name = 'project_url' " +
        "where cron_secret.name = 'reminder_cron_secret' and cron_secret.decrypted_secret <> '' and project_url.decrypted_secret like 'https://%';",
    );
    expect(JOB.match(/net\.http_post\(/g)).toHaveLength(1);
  });

  it("비밀 헤더·apikey·본문·시간 제한은 0004와 한 글자도 다르지 않다", () => {
    const OLD = job(sqlCode("0004_push_reminders.sql"), "onmom-send-reminders");
    const between = (s: string, from: string, to: string) => s.slice(s.indexOf(from), s.indexOf(to, s.indexOf(from)));
    const headers = between(JOB, "headers := ", ") as request_id");
    expect(headers).toContain(`'${REMINDER_SECRET_HEADER}', cron_secret.decrypted_secret`);
    expect(headers).toContain("'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key')");
    expect(headers).toContain("jsonb_strip_nulls(jsonb_build_object(");
    expect(headers).toContain("body := jsonb_build_object('scheduled_at', now())");
    expect(headers).toContain("timeout_milliseconds := 60000");
    expect(headers).toBe(between(OLD, "headers := ", ") as request_id"));
    // 비밀값 리터럴이 없다 — 사람이 Vault에 손으로 넣는다(주석에만 있음)
    expect(CODE).not.toMatch(/sb_secret_|sb_publishable_|service_role_key|eyj[a-z0-9_-]{20,}/);
    expect(CODE).not.toMatch(/vault\.create_secret\(/);
  });

  it("이미 켠 프로젝트에 project_url이 없으면 적용할 때 경고만 — 값은 읽지 않고(이름만), 확인하지 못해도 적용은 계속한다", () => {
    const start = CODE.indexOf("if to_regclass('vault.secrets') is not null then");
    expect(start).toBeGreaterThanOrEqual(0);
    const block = CODE.slice(start, CODE.indexOf("end; $$;", start));
    expect(block).toContain(
      "if exists (select 1 from vault.secrets where name = 'reminder_cron_secret') and not exists (select 1 from vault.secrets where name = 'project_url') then raise warning",
    );
    expect(block).toContain("exception when others then raise warning");
    expect(block).not.toContain("decrypted");
    expect(block).not.toMatch(/raise exception/);
  });
});

describe("예약 시각 × 함수 규칙 — 매시 예약이므로 REMINDER_HOUR는 기기 시간대의 시다", () => {
  /** supabase/migrations 중 onmom-send-reminders 예약을 마지막으로 만든 파일과 그 cron 식(번호 순 = 적용 순) */
  const effective = (() => {
    const files = readdirSync(`${ROOT}supabase/migrations`).filter((f) => f.endsWith(".sql")).sort();
    let found: { file: string; cron: string } | null = null;
    for (const file of files) {
      const m = /cron\.schedule\( 'onmom-send-reminders', '([^']+)'/.exec(sqlCode(file));
      if (m) found = { file, cron: m[1] };
    }
    return found;
  })();

  /** "분 시 * * *"의 분·시(숫자 하나 또는 *)만 다룬다 — 그 밖의 식이면 이 시험을 고친다 */
  function runsOf(cron: string): { minute: number; hours: number[] } {
    const [minute, hour, ...rest] = cron.split(" ");
    expect(rest).toEqual(["*", "*", "*"]);
    expect(minute).toMatch(/^\d+$/);
    expect(hour).toMatch(/^(\*|\d+)$/);
    return { minute: Number(minute), hours: hour === "*" ? Array.from({ length: 24 }, (_, h) => h) : [Number(hour)] };
  }

  const localDate = (d: Date, tz: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const localMinute = (d: Date, tz: string) => Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, minute: "numeric" }).format(d));

  /** from(UTC 자정)부터 days일 동안 예약이 도는 시각마다 isDueNow → 기기의 로컬 날짜별 발송 시각 */
  function sendsByLocalDay(cron: string, tz: string, from: string, days: number, hour = REMINDER_HOUR): Map<string, Date[]> {
    const { minute, hours } = runsOf(cron);
    const out = new Map<string, Date[]>();
    for (let day = 0; day < days; day += 1) {
      for (const h of hours) {
        const at = new Date(Date.parse(`${from}T00:00:00Z`) + ((day * 24 + h) * 60 + minute) * 60_000);
        if (!isDueNow(at, tz, hour)) continue;
        const key = localDate(at, tz);
        out.set(key, [...(out.get(key) ?? []), at]);
      }
    }
    return out;
  }

  // 서울·도쿄(UTC+9, 서머타임 없음)부터 30·45분 단위, 서머타임이 바뀌는 시간대, 날짜 변경선 양끝까지
  const OFF_HOUR_ZONES = ["America/St_Johns", "Asia/Kolkata", "Asia/Kathmandu", "Australia/Adelaide"];
  const ZONES = [
    "Asia/Seoul",
    "Asia/Tokyo",
    "America/New_York",
    "America/Los_Angeles",
    "Europe/London",
    "Europe/Berlin",
    "Pacific/Auckland",
    "Pacific/Kiritimati",
    "Pacific/Pago_Pago",
    ...OFF_HOUR_ZONES,
  ];
  // 서머타임 시작·끝(미국 3/8·11/1, 유럽 3/29·10/25, 호주 남부·뉴질랜드 4/5, 뉴질랜드 9/27, 호주 남부 10/4)을 가운데에 끼운 2026년의 닷새
  const WINDOWS = ["2026-03-06", "2026-03-27", "2026-04-03", "2026-09-25", "2026-10-02", "2026-10-23", "2026-10-30"];

  it("예약을 마지막으로 만든 파일은 0007이고 매시 정각이다 — 예약의 분 = REMINDER_MINUTE(0)", () => {
    expect(effective).toEqual({ file: "0007_schedules_and_limits.sql", cron: "0 * * * *" });
    expect(runsOf(effective!.cron).minute).toBe(REMINDER_MINUTE);
  });

  it.each(ZONES)("%s — 로컬 날짜마다 정확히 한 번, 그곳의 REMINDER_HOUR시에 보낸다(서머타임이 바뀌는 날 포함)", (tz) => {
    for (const from of WINDOWS) {
      const sends = sendsByLocalDay(effective!.cron, tz, from, 5);
      // 창의 앞뒤 날짜는 일부만 들어온다 — 가운데 사흘(로컬 날짜)을 본다
      const start = Date.parse(`${from}T00:00:00Z`);
      for (const d of [1, 2, 3]) {
        const day = localDate(new Date(start + (d * 24 + 12) * 3_600_000), tz);
        const at = sends.get(day) ?? [];
        expect(at, `${tz} ${day}`).toHaveLength(1);
        expect(localHour(at[0], tz)).toBe(REMINDER_HOUR);
        // 정시 시간대는 그 시의 정각(REMINDER_MINUTE). 30·45분 단위 시간대는 그 시 안의 예약 시각(20:30·20:45)
        if (!OFF_HOUR_ZONES.includes(tz)) expect(localMinute(at[0], tz)).toBe(REMINDER_MINUTE);
      }
    }
  });

  it("REMINDER_HOUR(함수 비밀값으로 0–23 중에서 바꿀 수 있다)를 바꿔도 예약은 그대로 — 매시라 어느 시든 시간대마다 하루 한 번", () => {
    for (let hour = 0; hour < 24; hour += 1) {
      for (const tz of ["Asia/Seoul", "America/New_York", "Asia/Kolkata"]) {
        const sends = sendsByLocalDay(effective!.cron, tz, "2026-10-14", 4, hour);
        const day = localDate(new Date(Date.parse("2026-10-16T12:00:00Z")), tz);
        expect(sends.get(day), `${tz} ${hour}시`).toHaveLength(1);
        expect(localHour(sends.get(day)![0], tz)).toBe(hour);
      }
    }
  });

  it("비교: 0004의 하루 한 번(11:00 UTC)이면 UTC+9 밖의 시간대는 한 번도 받지 못한다 — 0007이 바꾼 까닭", () => {
    const daily = "0 11 * * *";
    expect(sendsByLocalDay(daily, "Asia/Seoul", "2026-10-14", 4).size).toBe(4);
    for (const tz of ["America/New_York", "Europe/London", "Asia/Kolkata"]) expect(sendsByLocalDay(daily, tz, "2026-10-14", 4).size, tz).toBe(0);
  });

  it("함수 파일의 설명도 매시 예약(0007)을 가리킨다 — '매일 11:00 UTC에 부른다'로 남아 있지 않다", () => {
    for (const file of ["supabase/functions/send-reminders/index.ts", "supabase/functions/send-reminders/handler.ts"]) {
      const src = readFileSync(`${ROOT}${file}`, "utf8");
      expect(src, file).toContain("0007_schedules_and_limits.sql");
      expect(src, file).not.toMatch(/매일 11:00 UTC/);
    }
  });
});
