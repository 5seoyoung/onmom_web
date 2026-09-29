// supabase/migrations/0005_admin_tools.sql 점검 — 실행하지 않고 글자로 확인한다(DB 없이 돌리는 안전장치, adminSql.test.ts와 같은 방식).
// 관리자 도구 함수가 권한 확인 없이 열리거나, 공개 키(anon)로 불리거나, 감사 기록 표가 브라우저에 열리거나,
// 건강 기록·이메일을 돌려주게 바뀌면 여기서 멈춘다. 화면(adminApi deleteFailureOf)이 읽는 오류 코드·메시지도 여기 고정한다.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DELETE_REASON_MAX, deleteReasonProblem } from "./adminModel";

const SQL_PATH = fileURLToPath(new URL("../../../supabase/migrations/0005_admin_tools.sql", import.meta.url));
const RAW = readFileSync(SQL_PATH, "utf8");
/** 주석(-- …)을 뺀 실행문 — 설명 글의 낱말이 검사에 걸리지 않게 */
const CODE = RAW.replace(/--[^\n]*/g, "").toLowerCase();

interface SqlFunction {
  name: string;
  args: string;
  header: string;
  body: string;
}

function functions(): SqlFunction[] {
  const re = /create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(([^)]*)\)([\s\S]*?)as\s+\$\$([\s\S]*?)\$\$;/g;
  const out: SqlFunction[] = [];
  for (const m of CODE.matchAll(re)) out.push({ name: m[1], args: m[2], header: m[3], body: m[4] });
  return out;
}

/** "p_target uuid, p_reason text default null" → "uuid, text" */
function signature(args: string): string {
  return args
    .split(",")
    .map((a) => a.trim().replace(/\s+default\s+.*$/, "").split(/\s+/).slice(1).join(" "))
    .filter((t) => t.length > 0)
    .join(", ");
}

/** 공백을 한 칸으로 — 줄 바꿈·들여쓰기와 상관없이 본문을 비교한다 */
function squash(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

/** returns table (…)의 칸 이름 */
function tableColumns(header: string): string[] {
  const cols = /returns table \(([\s\S]*?)\)\s*language/.exec(header)?.[1] ?? "";
  return cols.split(",").map((c) => c.trim().split(/\s+/)[0]);
}

const FNS = functions();
const byName = (name: string) => FNS.find((f) => f.name === name)!;
const TOOL_FNS = ["admin_delete_user", "admin_list_admins", "admin_find_user", "admin_overview"];
/** admin_list_users(0002)와 같은 칸 — 계정 찾기 결과도 같은 모양이어야 화면이 같은 parseUserRows로 읽는다 */
const USER_COLUMNS = ["id", "created_at", "last_sign_in_at", "is_anonymous", "provider", "has_state", "consent_version", "state_updated_at"];

describe("0005_admin_tools.sql — 앞 단계 확인", () => {
  it("0002(is_admin·admins)가 없으면 표를 만들기 전에 멈춘다", () => {
    const guard = CODE.indexOf("do $$");
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(guard).toBeLessThan(CODE.indexOf("create table if not exists public.admin_audit"));
    expect(CODE.slice(guard, CODE.indexOf("create table"))).toMatch(/is_admin[\s\S]*admins[\s\S]*raise exception/);
  });
});

describe("0005_admin_tools.sql — 감사 기록 표(admin_audit)", () => {
  const table = /create table if not exists public\.admin_audit \(([\s\S]*?)\);/.exec(CODE)?.[1] ?? "";

  it("누가·무엇을·어느 계정에·사유·언제 — 건강 기록·이메일 칸은 없다", () => {
    expect(table).toMatch(/actor uuid not null/);
    expect(table).toMatch(/action text not null/);
    expect(table).toMatch(/target uuid/);
    expect(table).toMatch(/reason text/);
    expect(table).toMatch(/at timestamptz not null default now\(\)/);
    expect(table).toContain(`char_length(reason) <= ${DELETE_REASON_MAX}`);
  });

  it("사유에 이메일 주소 모양이 있으면 표가 거절한다 — 화면(deleteReasonProblem)과 같은 판정, 이미 있던 표에도 건다", () => {
    const check = /constraint admin_audit_reason_no_email check \(reason is null or reason !~\* '([^']+)'\)/.exec(table);
    expect(check).not.toBeNull();
    // 이미 있던 표(제약 없는 0005 초판)에도 같은 제약 — 이름으로 확인해 여러 번 실행해도 한 번만
    expect(CODE).toContain("where conname = 'admin_audit_reason_no_email'");
    expect(CODE).toContain(`add constraint admin_audit_reason_no_email check (reason is null or reason !~* '${check![1]}')`);
    // SQL 패턴(대소문자 무시 ~*)과 화면 패턴이 같은 사유를 막는다
    const sql = new RegExp(check![1], "i");
    for (const reason of ["요청자 someone@example.com 이 메일로 요청", "First.Last+tag@sub.example.co.kr", "이용자 요청(문의 메일 2026-09-28)", "골뱅이@만"]) {
      expect(sql.test(reason)).toBe(deleteReasonProblem(reason) !== null);
    }
  });

  it("auth.users를 참조하지 않는다 — 계정이 지워져도 기록은 남는다", () => {
    expect(table).not.toContain("references");
  });

  it("RLS를 켜고 브라우저 정책은 없다 — 권한도 모두 거둔다", () => {
    expect(CODE).toContain("revoke all on table public.admin_audit from public, anon, authenticated;");
    expect(CODE).toContain("alter table public.admin_audit enable row level security;");
    expect(CODE).not.toMatch(/create\s+policy[\s\S]*?on\s+public\.admin_audit/);
    expect(CODE).not.toMatch(/grant[^;]*on\s+(table\s+)?public\.admin_audit/);
  });
});

describe("0005_admin_tools.sql — 함수", () => {
  it("계정 삭제 · 관리자 목록 · 계정 찾기 · 한눈에 보기(0002와 같은 이름·인자로 바꿈) 네 개", () => {
    expect(FNS.map((f) => f.name).sort()).toEqual([...TOOL_FNS].sort());
  });

  it.each(TOOL_FNS)("%s — security definer + 빈 search_path", (name) => {
    const f = byName(name);
    expect(f.header).toContain("security definer");
    expect(f.header).toContain("set search_path = ''");
  });

  it.each(TOOL_FNS)("%s — 공개(public·anon) 실행 권한을 거두고 로그인한 사용자에게만", (name) => {
    const f = byName(name);
    const sig = `public.${name}(${signature(f.args)})`;
    expect(CODE).toContain(`revoke execute on function ${sig} from public, anon;`);
    expect(CODE).toContain(`grant execute on function ${sig} to authenticated;`);
    expect(CODE).not.toMatch(new RegExp(`grant[^;]*on function public\\.${name}\\b[^;]*\\banon\\b`));
  });

  it.each(TOOL_FNS)("%s — begin 바로 다음에 is_admin()을 확인하고 아니면 오류(42501)", (name) => {
    const body = byName(name).body;
    const begin = body.indexOf("begin");
    expect(begin).toBeGreaterThanOrEqual(0);
    // 이 모양 그대로여야 한다(조건을 약하게 바꾸거나 오류를 빼면 멈춘다)
    expect(squash(body.slice(begin)).startsWith("begin if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;")).toBe(true);
  });

  it("admin_delete_user — 내 계정·다른 관리자·없는 계정은 거절(화면이 읽는 코드·메시지)", () => {
    const f = byName("admin_delete_user");
    expect(signature(f.args)).toBe("uuid, text");
    expect(squash(f.header)).toContain("returns void language plpgsql security definer");
    const body = squash(f.body);
    expect(body).toContain("actor_id uuid := (select auth.uid());");
    expect(body).toContain("if p_target is null then raise exception 'invalid arguments' using errcode = '22023'; end if;");
    expect(body).toContain("if p_target = actor_id then raise exception 'onmom: cannot delete own account' using errcode = 'p0001'; end if;");
    expect(body).toContain("if exists (select 1 from public.admins a where a.user_id = p_target) then raise exception 'onmom: target is admin' using errcode = 'p0001'; end if;");
    expect(body).toContain("if not exists (select 1 from auth.users u where u.id = p_target and u.deleted_at is null) then raise exception 'onmom: user not found' using errcode = 'p0002'; end if;");
  });

  it("admin_delete_user — 감사 기록을 먼저 남기고(같은 트랜잭션) user_states → auth.users 순으로 지운다", () => {
    const body = squash(byName("admin_delete_user").body);
    const audit = body.indexOf("insert into public.admin_audit (actor, action, target, reason) values (actor_id, 'delete_user', p_target,");
    const states = body.indexOf("delete from public.user_states where user_id = p_target;");
    const users = body.indexOf("delete from auth.users where id = p_target;");
    expect(audit).toBeGreaterThan(0);
    expect(states).toBeGreaterThan(audit);
    expect(users).toBeGreaterThan(states);
    // 사유는 다듬어 500자까지, 비면 null — 화면(normalizeDeleteReason)과 같은 규칙
    expect(body).toContain(`nullif(left(trim(coalesce(p_reason, '')), ${DELETE_REASON_MAX}), '')`);
    // 다른 사람의 행을 지우는 문은 이 둘뿐이다
    expect(body.match(/delete from/g)).toHaveLength(2);
  });

  it("admin_list_admins — 관리자 표 + 접속 시각만(메타데이터), 나인지 표시", () => {
    const f = byName("admin_list_admins");
    expect(f.args.trim()).toBe("");
    expect(tableColumns(f.header)).toEqual(["user_id", "added_at", "last_sign_in_at", "is_me"]);
    expect(squash(f.body)).toContain("from public.admins a left join auth.users u on u.id = a.user_id");
    expect(squash(f.body)).toContain("(a.user_id = (select auth.uid()))");
  });

  it("admin_find_user — admin_list_users(0002)와 같은 칸, 지워진 계정은 빼고 그 ID만", () => {
    const f = byName("admin_find_user");
    expect(signature(f.args)).toBe("uuid");
    expect(tableColumns(f.header)).toEqual(USER_COLUMNS);
    expect(squash(f.body)).toContain("where u.id = p_id and u.deleted_at is null");
  });

  it("admin_overview — 0002의 칸을 모두 지키고 동의 판 분포·날마다 게스트/카카오 수를 더한다", () => {
    const f = byName("admin_overview");
    expect(signature(f.args)).toBe("text");
    expect(squash(f.header)).toContain("returns json language plpgsql stable security definer");
    expect(f.body).toContain("'asia/seoul'");
    expect(f.body).toContain("generate_series(0, 29)");
    expect(f.body).toMatch(/s\.consent_version = p_consent_version\s+and s\.consent_accepted_at is not null/);
    for (const key of [
      "users",
      "anonymous_users",
      "kakao_users",
      "users_with_state",
      "users_with_current_consent",
      "active_users_7d",
      "states_updated_7d",
      "new_users_by_day",
      "generated_at",
      "consent_versions",
    ]) {
      expect(f.body).toContain(`'${key}'`);
    }
    // 동의 판 분포는 user_states의 판별 사람 수(판이 없는 행 포함 — 화면이 "없음"으로 보인다)
    expect(squash(f.body)).toContain("select s.consent_version, count(*) as n from public.user_states s group by s.consent_version");
    // 날마다 게스트·카카오 수(화면 adminModel parseOverview의 anonymous_users·kakao_users)
    expect(squash(f.body)).toContain("'anonymous_users', coalesce(c.n_anon, 0), 'kakao_users', coalesce(c.n_kakao, 0)");
  });
});

describe("0005_admin_tools.sql — 개인정보 최소화", () => {
  it("건강 기록(state)·이메일·전화·닉네임(raw_user_meta_data)을 읽지 않는다", () => {
    expect(CODE).not.toMatch(/\bstate\b/); // user_states.state(건강 기록) — has_state·user_states는 걸리지 않는다
    // 이메일 칸을 읽지 않는다 — 제약 이름 admin_audit_reason_no_email(이메일을 "막는" 쪽)만 빼고 본다
    expect(CODE.replaceAll("admin_audit_reason_no_email", "")).not.toContain("email");
    expect(CODE).not.toContain("phone");
    expect(CODE).not.toContain("raw_user_meta_data");
    expect(CODE).not.toContain("identity_data");
  });

  it("관리자를 넣거나 빼는 문은 없다 — 관리자 지정은 SQL Editor에서만(0002 머리 주석)", () => {
    expect(CODE).not.toMatch(/insert into public\.admins/);
    expect(CODE).not.toMatch(/delete from public\.admins/);
  });
});
