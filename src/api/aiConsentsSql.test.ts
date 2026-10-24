// supabase/migrations/0010_ai_consents.sql 점검 — 실행하지 않고 글자로 확인한다(DB 없이 돌리는 안전장치,
// userStatesSql.test.ts·schedulesAndLimitsSql.test.ts와 같은 방식).
// AI 국외 이전 동의 기록(public.ai_consents): 본인 행만(RLS)·anon 없음·지우기 정책 없음(계정 삭제 cascade)·함수는 읽기만.
// 판(AI_CONSENT_VERSION)은 웹과 함수가 같은 값을 쓰고, 처리방침·동의 문구의 "동의한 내용과 일시"가 이 기록을 덮는다.

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { AI_CONSENT_VERSION as WEB_AI_CONSENT_VERSION } from "@/features/chat/aiConsent";
import { REQUIRED_CONSENTS } from "@/features/onboarding/consentText";
import { ACCOUNT_ITEMS, AI_USAGE_RETENTION_DAYS, RETENTION_TEXT, SETTING_ITEMS } from "@/features/privacy/dataItems";
import { webPolicySections } from "@/features/privacy/webPolicyText";
import {
  AI_CONSENT_REQUIRED_CODE,
  AI_CONSENT_VERSION,
  AI_CONSENT_VERSION_MAX_CHARS,
  AI_CONSENTS_TABLE,
} from "../../supabase/functions/_shared/aiConsent";
import { parseQuotaResult } from "../../supabase/functions/_shared/chat";
import { createConsumeQuota, createRefundQuota } from "../../supabase/functions/chat/adapters";

const MIGRATIONS = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));
const FILE = "0010_ai_consents.sql";
/** 주석(-- …)을 뺀 실행문(소문자, 공백 한 칸) — 설명 글의 낱말이 검사에 걸리지 않게 */
const sqlOf = (file: string) =>
  readFileSync(`${MIGRATIONS}${file}`, "utf8")
    .replace(/--[^\n]*/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
const CODE = sqlOf(FILE);
const TABLE = `public.${AI_CONSENTS_TABLE}`;

function policy(name: string): string {
  const start = CODE.indexOf(`create policy "ai_consents: ${name}"`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  return CODE.slice(start, CODE.indexOf(";", start));
}

describe("0010 — 먼저 있어야 하는 것 · 여러 번 실행", () => {
  it("llm_usage(0003)가 없으면 아무것도 바꾸기 전에 멈춘다 — 확장은 다시 켜지 않는다(Supabase 2BP01)", () => {
    expect(CODE).not.toContain("create extension");
    const guard = "if to_regclass('public.llm_usage') is null then raise exception";
    expect(CODE).toContain(guard);
    const firstChange = Math.min(
      ...["create table", "alter table", "revoke ", "grant ", "create policy", "create or replace function"]
        .map((s) => CODE.indexOf(s))
        .filter((i) => i >= 0),
    );
    expect(CODE.indexOf(guard)).toBeLessThan(firstChange);
  });

  it("번호 — 운영에 이미 적용된 0009보다 뒤, 다른 파일과 번호가 겹치지 않고, 이 표·함수를 만드는 파일은 이것 하나", () => {
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
    const numbers = files.map((f) => Number(/^(\d{4})_/.exec(f)?.[1]));
    expect(new Set(numbers).size).toBe(files.length);
    expect(files).toContain("0009_admin_access_log.sql");
    expect(Number(FILE.slice(0, 4))).toBeGreaterThan(9);
    expect(files).not.toContain("0008_ai_consents.sql");
    for (const name of ["create table if not exists public.ai_consents", "function public.llm_refund_quota("]) {
      expect(files.filter((f) => sqlOf(f).includes(name)), name).toEqual([FILE]);
    }
  });

  it("맨 끝에서 PostgREST에 스키마를 다시 읽으라고 알린다 — 새 표·새 함수를 바로 부를 수 있게(0009와 같다)", () => {
    const notify = CODE.lastIndexOf("notify pgrst, 'reload schema';");
    expect(notify).toBeGreaterThan(CODE.lastIndexOf("create or replace function"));
    expect(notify).toBeGreaterThan(CODE.lastIndexOf("create policy"));
    expect(CODE.slice(notify + "notify pgrst, 'reload schema';".length).trim()).toBe("");
  });

  it("표는 있으면 건너뛰고, 제약·정책은 같은 이름을 지우고 다시 만든다", () => {
    expect(CODE).toContain(`create table if not exists ${TABLE} (`);
    expect(CODE).toContain(`alter table ${TABLE} drop constraint if exists ai_consents_version_length;`);
    for (const name of ["본인 행 읽기", "본인 행 만들기", "본인 행 바꾸기"]) {
      const drop = CODE.indexOf(`drop policy if exists "ai_consents: ${name}" on ${TABLE};`);
      expect(drop, name).toBeGreaterThanOrEqual(0);
      expect(drop, name).toBeLessThan(CODE.indexOf(`create policy "ai_consents: ${name}"`));
    }
  });
});

describe("0010 — public.ai_consents 표", () => {
  const table = /create table if not exists public\.ai_consents \((.*?)\);/.exec(CODE)?.[1] ?? "";

  it("사용자당 한 행 — 사용자 id(계정을 지우면 함께 지워짐)·동의한 판·동의 시각뿐(질문·답·건강 정보 없음)", () => {
    const columns = table.split(",").map((c) => c.trim());
    expect(columns).toEqual([
      "user_id uuid primary key references auth.users (id) on delete cascade",
      "version text not null",
      "accepted_at timestamptz not null default now()",
    ]);
  });

  it(`판 글자 수 1~${AI_CONSENT_VERSION_MAX_CHARS} — 지금 판이 들어간다`, () => {
    expect(CODE).toContain(
      `alter table ${TABLE} add constraint ai_consents_version_length check (char_length(version) between 1 and ${AI_CONSENT_VERSION_MAX_CHARS});`,
    );
    expect(AI_CONSENT_VERSION.length).toBeGreaterThanOrEqual(1);
    expect(AI_CONSENT_VERSION.length).toBeLessThanOrEqual(AI_CONSENT_VERSION_MAX_CHARS);
  });

  it("권한 — 로그인한 사용자(카카오·익명 게스트)는 읽기·만들기·바꾸기만, 공개 키(anon)는 없음, 함수(service_role)는 읽기만", () => {
    expect(CODE).toContain(`revoke all on table ${TABLE} from public, anon, authenticated, service_role;`);
    expect(CODE).toContain(`grant select, insert, update on table ${TABLE} to authenticated;`);
    expect(CODE).toContain(`grant select on table ${TABLE} to service_role;`);
    expect(CODE.match(/grant [^;]* on table public\.ai_consents to [a-z_]+;/g)).toHaveLength(2);
    expect(CODE).not.toMatch(/grant [^;]* to anon/);
    expect(CODE).not.toMatch(/grant [^;]*delete[^;]* on table public\.ai_consents/);
  });

  it("행 수준 보안 — 읽기·만들기·바꾸기 모두 본인 행만(authenticated), 지우기 정책 없음(계정 삭제 cascade)", () => {
    expect(CODE).toContain(`alter table ${TABLE} enable row level security;`);
    expect(policy("본인 행 읽기")).toContain("for select to authenticated using ((select auth.uid()) = user_id)");
    expect(policy("본인 행 만들기")).toContain("for insert to authenticated with check ((select auth.uid()) = user_id)");
    expect(policy("본인 행 바꾸기")).toContain(
      "for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)",
    );
    expect(CODE.match(/create policy "ai_consents: /g)).toHaveLength(3);
    expect(CODE).not.toMatch(/for (delete|all) /);
    expect(CODE).not.toMatch(/ to anon/);
  });
});

/** 함수 하나의 머리(이름~as $$)와 몸통($$ … $$) */
function fn(signature: string) {
  const start = CODE.indexOf(`create or replace function ${signature}`);
  expect(start, signature).toBeGreaterThanOrEqual(0);
  const open = CODE.indexOf("as $$", start);
  return { start, header: CODE.slice(start, open), body: CODE.slice(open, CODE.indexOf("$$;", open + 5)) };
}

const USER_LOCK = "perform pg_advisory_xact_lock(hashtextextended('onmom.llm_usage:' || p_user_id::text, 0));";
const GLOBAL_LOCK = "perform pg_advisory_xact_lock(hashtextextended('onmom.llm_usage:global', 0));";

describe("0010 — llm_consume_quota 다섯 인자판(게스트 한도는 p_user_limit로, 전체 1시간 상한 추가)", () => {
  const consume = fn("public.llm_consume_quota( p_user_id uuid, p_user_limit integer, p_window_seconds integer, p_global_daily_limit integer, p_global_hourly_limit integer )");

  it("SECURITY DEFINER + 빈 search_path, 글자(text)를 돌려준다 — 돌려주는 값은 함수가 읽는 셋뿐(parseQuotaResult)", () => {
    expect(consume.header).toContain("returns text");
    expect(consume.header).toContain("language plpgsql");
    expect(consume.header).toContain("security definer");
    expect(consume.header).toContain("set search_path = ''");
    const returned = [...consume.body.matchAll(/return '([a-z_]+)'/g)].map((m) => m[1]);
    expect(returned).toEqual(["user_limit", "global_limit", "global_limit", "ok"]);
    for (const v of returned) expect(parseQuotaResult(v)).not.toBeNull();
  });

  it("인자 검사 — 다섯 값 모두 1 이상(창은 1초~하루)", () => {
    expect(consume.body).toContain("or p_global_hourly_limit is null or p_global_hourly_limit < 1 then raise exception 'invalid arguments'");
    expect(consume.body).toContain("or p_global_daily_limit is null or p_global_daily_limit < 1");
    expect(consume.body).toContain("p_window_seconds > 86400");
  });

  it("잠금은 사용자(0003·돌려주기와 같은 키) → 전체 순서 — 전체 상한도 동시 요청이 함께 넘지 않는다", () => {
    expect(sqlOf("0003_llm_usage.sql")).toContain(USER_LOCK);
    const user = consume.body.indexOf(USER_LOCK);
    const global = consume.body.indexOf(GLOBAL_LOCK);
    expect(user).toBeGreaterThan(0);
    expect(global).toBeGreaterThan(user);
    expect(global).toBeLessThan(consume.body.indexOf("select count(*)"));
  });

  it(`확인 순서: 오래된 기록 정리(${AI_USAGE_RETENTION_DAYS}일 — 처리방침·0003과 같다) → 사용자 창 → 전체 1시간 → 전체 하루 → 한 줄 기록`, () => {
    const order = [
      `delete from public.llm_usage where created_at < now() - interval '${AI_USAGE_RETENTION_DAYS} days';`,
      "where user_id = p_user_id and created_at > now() - make_interval(secs => p_window_seconds); if used >= p_user_limit then return 'user_limit';",
      "where created_at > now() - interval '1 hour'; if total >= p_global_hourly_limit then return 'global_limit';",
      "where created_at > now() - interval '1 day'; if total >= p_global_daily_limit then return 'global_limit';",
      "insert into public.llm_usage (user_id) values (p_user_id); return 'ok';",
    ].map((s) => {
      const at = consume.body.indexOf(s);
      expect(at, s).toBeGreaterThan(0);
      return at;
    });
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // 정리 기준은 0003이 부를 때 지우는 기준과 같다
    expect(sqlOf("0003_llm_usage.sql")).toContain(`delete from public.llm_usage where created_at < now() - interval '${AI_USAGE_RETENTION_DAYS} days';`);
  });

  it("함수 chat이 넘기는 인자 이름 = 이 함수의 인자 이름(adapters.ts createConsumeQuota)", async () => {
    const rpc = vi.fn(async () => ({ data: "ok", error: null }));
    await createConsumeQuota(rpc, { hourlyLimit: 30, guestHourlyLimit: 5, globalHourlyLimit: 60, globalDailyLimit: 500, windowSeconds: 3600 })({
      id: "u",
      guest: false,
    });
    const [name, args] = rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(name).toBe("llm_consume_quota");
    const params = CODE.slice(consume.start, CODE.indexOf(")", consume.start)).match(/p_[a-z_]+/g);
    expect(Object.keys(args)).toEqual(params);
  });

  it("service_role만 부른다 — 브라우저(anon·authenticated)는 못 부른다. 0003의 넷 인자판은 지우지 않는다(배포 사이 예전 함수 코드용)", () => {
    const sig = "public.llm_consume_quota(uuid, integer, integer, integer, integer)";
    expect(CODE).toContain(`revoke execute on function ${sig} from public, anon, authenticated;`);
    expect(CODE).toContain(`grant execute on function ${sig} to service_role;`);
    expect(CODE).not.toMatch(/drop function/);
    expect(CODE).not.toMatch(/grant execute on function [^;]* to (anon|authenticated|public)/);
  });
});

describe("0010 — llm_refund_quota(LLM이 답을 만들지 않은 실패에서 한 번 돌려주기)", () => {
  const refund = fn("public.llm_refund_quota(p_user_id uuid)");

  it("SECURITY DEFINER + 빈 search_path, 참·거짓을 돌려준다", () => {
    expect(refund.header).toContain("returns boolean");
    expect(refund.header).toContain("security definer");
    expect(refund.header).toContain("set search_path = ''");
    expect(refund.body).toContain("if p_user_id is null then raise exception 'invalid arguments'");
  });

  it("그 사용자의 10분 안 가장 최근 한 줄만 지운다 — 같은 사용자 잠금으로 한도 확인과 줄 세운다", () => {
    expect(refund.body).toContain(USER_LOCK);
    expect(refund.body).not.toContain(GLOBAL_LOCK); // 사용자 잠금만 — 잠금 순서가 엇갈리지 않는다
    expect(refund.body).toContain(
      "select u.id into refund_id from public.llm_usage u where u.user_id = p_user_id and u.created_at > now() - interval '10 minutes' order by u.created_at desc, u.id desc limit 1;",
    );
    expect(refund.body).toContain("delete from public.llm_usage where id = refund_id; return true;");
    expect(refund.body.match(/delete from/g)).toHaveLength(1);
    expect(refund.body).not.toMatch(/\b(update|insert into|truncate)\b/);
  });

  it("service_role만 부른다 — 이용자가 직접 돌려받을 수 없다", () => {
    expect(CODE).toContain("revoke execute on function public.llm_refund_quota(uuid) from public, anon, authenticated;");
    expect(CODE).toContain("grant execute on function public.llm_refund_quota(uuid) to service_role;");
  });

  it("함수 chat이 넘기는 인자 이름 = 이 함수의 인자 이름(adapters.ts createRefundQuota)", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    await expect(createRefundQuota(rpc)("u-1")).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("llm_refund_quota", { p_user_id: "u-1" });
  });

  it("알림·로그로 사용자 id를 내지 않는다", () => {
    expect(CODE).not.toMatch(/raise (notice|log|info|warning)/);
  });
});

describe("판 · 실패 코드 — 웹과 함수가 같은 값", () => {
  it("웹(features/chat/aiConsent.ts)이 내보내는 판 = 함수가 비교하는 판(_shared/aiConsent.ts)", () => {
    expect(WEB_AI_CONSENT_VERSION).toBe(AI_CONSENT_VERSION);
    expect(AI_CONSENT_REQUIRED_CODE).toBe("ai_consent_required");
  });
});

describe("처리방침·동의 문구 — '동의한 내용과 일시'가 이 기록을 덮는다(문구는 바꾸지 않았다)", () => {
  it("수집 항목: 이용자 식별자(user_id) + 서비스 설정 정보의 '동의한 내용과 일시'(version·accepted_at)", () => {
    expect(ACCOUNT_ITEMS).toContain("이용자 식별자");
    expect(SETTING_ITEMS).toContain("동의한 내용과 일시");
    // 온보딩 개인정보 수집·이용 동의(a)의 수집 항목과 웹 처리방침 2절에 같은 글자가 들어 있다
    const personal = REQUIRED_CONSENTS.find((c) => c.id === "personal")!;
    expect(personal.details.find((d) => d.term === "수집 항목")!.text).toContain(SETTING_ITEMS);
    const items = webPolicySections().find((s) => s.title.startsWith("2."))!.body;
    expect(items).toContain(`• 서비스 설정 정보: ${SETTING_ITEMS}`);
  });

  it("보유 기간: 계정을 삭제할 때까지 — 표는 auth.users on delete cascade(지우기 정책 없이 계정 삭제가 지운다)", () => {
    expect(RETENTION_TEXT).toContain("계정을 삭제할 때까지");
    expect(CODE).toContain("references auth.users (id) on delete cascade");
  });
});
