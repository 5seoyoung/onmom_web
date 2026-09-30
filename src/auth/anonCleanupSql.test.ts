// supabase/migrations/0006_anon_cleanup.sql 점검 — 실행하지 않고 글자로 확인한다(DB 없이 돌리는 안전장치, userStatesSql.test.ts와 같은 방식).
// 서버에 기록을 저장한 게스트·카카오 계정·30일이 안 된 게스트를 지우게 바뀌거나, 브라우저·서버 함수가 부를 수 있게 열리거나,
// 예약이 겹쳐 생기게 바뀌면 여기서 멈춘다. 30일은 처리방침 초안 5절의 숫자와 같아야 한다(dataItems ANON_CLEANUP_DAYS).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ANON_CLEANUP_DAYS } from "@/features/privacy/dataItems";

const SQL_PATH = fileURLToPath(new URL("../../supabase/migrations/0006_anon_cleanup.sql", import.meta.url));
/** 주석(-- …)을 뺀 실행문(소문자, 공백 한 칸) — 설명 글의 낱말이 검사에 걸리지 않게 */
const CODE = readFileSync(SQL_PATH, "utf8").replace(/--[^\n]*/g, "").toLowerCase().replace(/\s+/g, " ");

const FN = "public.cleanup_stale_anonymous_users()";
const FN_START = CODE.indexOf(`create or replace function ${FN}`);
const FN_OPEN = CODE.indexOf("as $$", FN_START);
const body = { header: CODE.slice(FN_START, FN_OPEN), body: CODE.slice(FN_OPEN, CODE.indexOf("$$;", FN_OPEN + 5)) };

/** 한국 시각(KST = UTC+9) 시 → pg_cron(UTC) 시 */
const utcHourOfKst = (kstHour: number) => (kstHour - 9 + 24) % 24;

describe("0006_anon_cleanup.sql — 정리 함수", () => {
  it("SECURITY DEFINER + 빈 search_path, 인자 없음, 지운 수(integer)만 돌려준다", () => {
    expect(FN_START).toBeGreaterThanOrEqual(0);
    expect(FN_OPEN).toBeGreaterThan(FN_START);
    expect(body.header).toContain("returns integer");
    expect(body.header).toContain("security definer");
    expect(body.header).toContain("set search_path = ''");
    expect(body.body).toContain("get diagnostics removed = row_count");
    expect(body.body).toContain("return removed");
    // 사용자 id·이메일을 알림·로그로 내지 않는다
    expect(CODE).not.toMatch(/raise (notice|log|info|warning)/);
  });

  it(`지우는 조건 — 익명 · 만든 지 ${ANON_CLEANUP_DAYS}일 지남 · 서버 기록(user_states) 없음 · 익명 말고 다른 로그인 수단 없음`, () => {
    expect(body.body).toContain("u.is_anonymous is true");
    expect(body.body).toContain(`u.created_at < now() - interval '${ANON_CLEANUP_DAYS} days'`);
    expect(body.body).toContain("not exists (select 1 from public.user_states s where s.user_id = u.id)");
    // 카카오 이메일이 확인되지 않으면 연결 뒤에도 is_anonymous가 true로 남을 수 있다 — identity로 따로 지킨다
    expect(body.body).toContain("not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider <> 'anonymous')");
  });

  it("auth.users만 지운다(우리 표는 on delete cascade) — 한 번에 1000명까지, 오래된 순", () => {
    expect(body.body).toContain("delete from auth.users d using stale where d.id = stale.id");
    expect(body.body.match(/delete from/g)).toHaveLength(1);
    expect(body.body).toMatch(/order by u\.created_at limit 1000/);
    expect(body.body).not.toMatch(/\b(update|insert into|truncate)\b/);
  });

  it("브라우저(anon·authenticated)도 서버 함수(service_role)도 부를 수 없다 — 예약(함수 주인)만", () => {
    expect(CODE).toContain(`revoke execute on function ${FN} from public, anon, authenticated, service_role`);
    expect(CODE).not.toMatch(/grant execute on function public\.cleanup_stale_anonymous_users/);
  });
});

describe("0006_anon_cleanup.sql — 매일 예약", () => {
  it("pg_cron, 매일 03:00 KST(= 18:00 UTC)에 함수 하나만 부른다", () => {
    expect(utcHourOfKst(3)).toBe(18);
    // 확장은 0004가 켠다 — 다시 create extension 하면 Supabase에서 2BP01로 실패하므로 있는지만 확인한다
    expect(CODE).not.toContain("create extension");
    expect(CODE).toContain("if not exists (select 1 from pg_extension where extname = 'pg_cron')");
    expect(CODE).toContain(`select cron.schedule( 'onmom-anon-cleanup', '0 ${utcHourOfKst(3)} * * *', $job$ select ${FN}; $job$ )`);
  });

  it("여러 번 실행해도 예약은 하나 — 같은 이름이 있으면 지우고 다시 만든다(매일 리마인더 예약 이름과 겹치지 않음)", () => {
    const guard = CODE.indexOf("if exists (select 1 from cron.job where jobname = 'onmom-anon-cleanup')");
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(CODE.indexOf("perform cron.unschedule('onmom-anon-cleanup')")).toBeGreaterThan(guard);
    expect(guard).toBeLessThan(CODE.indexOf("select cron.schedule("));
    expect(CODE).toContain(`create or replace function ${FN}`);
    expect(CODE).not.toContain("onmom-send-reminders");
  });
});
