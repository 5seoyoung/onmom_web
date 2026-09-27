// supabase/migrations/0002_admin.sql 점검 — 실행하지 않고 글자로 확인한다(DB 없이 돌리는 안전장치).
// 관리자 함수가 권한 확인 없이 열리거나, 공개 키(anon)로 불리거나, 건강 기록·이메일을 돌려주게 바뀌면 여기서 멈춘다.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ADMIN_LIST_MAX } from "./adminModel";

const SQL_PATH = fileURLToPath(new URL("../../../supabase/migrations/0002_admin.sql", import.meta.url));
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

/** "p_limit integer, p_offset integer" → "integer, integer" */
function signature(args: string): string {
  return args
    .split(",")
    .map((a) => a.trim().split(/\s+/).slice(1).join(" "))
    .filter((t) => t.length > 0)
    .join(", ");
}

/** 공백을 한 칸으로 — 줄 바꿈·들여쓰기와 상관없이 본문을 비교한다 */
function squash(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

const FNS = functions();
const byName = (name: string) => FNS.find((f) => f.name === name);

describe("0002_admin.sql — 관리자 목록 표", () => {
  it("auth.users를 가리키고 계정이 지워지면 같이 지워진다", () => {
    expect(CODE).toMatch(/create table if not exists public\.admins \(\s*user_id uuid primary key references auth\.users \(id\) on delete cascade/);
    expect(CODE).toMatch(/created_at timestamptz not null default now\(\)/);
  });

  it("RLS를 켜고 브라우저 정책은 없다 — 권한도 모두 거둔다", () => {
    expect(CODE).toContain("alter table public.admins enable row level security;");
    expect(CODE).not.toMatch(/create\s+policy[\s\S]*?on\s+public\.admins/);
    expect(CODE).toContain("revoke all on table public.admins from public, anon, authenticated;");
    expect(CODE).not.toMatch(/grant[^;]*on\s+(table\s+)?public\.admins/);
  });
});

describe("0002_admin.sql — 함수", () => {
  it("is_admin · admin_overview · admin_list_users 세 개", () => {
    expect(FNS.map((f) => f.name).sort()).toEqual(["admin_list_users", "admin_overview", "is_admin"]);
  });

  it.each(["is_admin", "admin_overview", "admin_list_users"])("%s — security definer + 빈 search_path", (name) => {
    const f = byName(name)!;
    expect(f.header).toContain("security definer");
    expect(f.header).toContain("set search_path = ''");
  });

  it.each(["is_admin", "admin_overview", "admin_list_users"])("%s — 공개(public·anon) 실행 권한을 거두고 로그인한 사용자에게만", (name) => {
    const f = byName(name)!;
    const sig = `public.${name}(${signature(f.args)})`;
    expect(CODE).toContain(`revoke execute on function ${sig} from public, anon;`);
    expect(CODE).toContain(`grant execute on function ${sig} to authenticated;`);
    expect(CODE).not.toMatch(new RegExp(`grant[^;]*on function public\\.${name}\\b[^;]*\\banon\\b`));
  });

  it.each(["admin_overview", "admin_list_users"])("%s — 무엇보다 먼저 is_admin()을 확인하고 아니면 오류(42501)", (name) => {
    const body = byName(name)!.body;
    const begin = body.indexOf("begin");
    const check = body.indexOf("if not public.is_admin() then");
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(check).toBeGreaterThan(begin);
    const firstRead = Math.min(...["select", "return query"].map((k) => body.indexOf(k)).filter((i) => i >= 0));
    expect(check).toBeLessThan(firstRead);
    // begin 바로 다음이 확인문이고, 확인문은 이 모양 그대로여야 한다(조건을 약하게 바꾸거나 오류를 빼면 멈춘다).
    expect(squash(body.slice(begin, firstRead))).toBe(
      "begin if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;",
    );
  });

  it("is_admin — 지금 로그인한 사람만, 게스트(익명)는 관리자가 아니다", () => {
    // 모든 관리자 읽기를 막는 문이라 낱말만 보지 않고 본문 전체를 고정한다.
    // (예: "… = false or true"처럼 조건 하나만 바뀌어도 모든 로그인 사용자가 관리자가 된다)
    expect(squash(byName("is_admin")!.body)).toBe(
      "select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and exists ( select 1 from public.admins a join auth.users u on u.id = a.user_id where a.user_id = (select auth.uid()) and coalesce(u.is_anonymous, false) = false and u.deleted_at is null );",
    );
  });

  it("is_admin — 인자 없이 boolean, sql 함수", () => {
    const f = byName("is_admin")!;
    expect(f.args.trim()).toBe("");
    expect(squash(f.header)).toBe("returns boolean language sql stable security definer set search_path = ''");
  });

  it("admin_overview — 한국 날짜 30일, 현재 판 동의는 인자로 받은 판과 수락 시각으로", () => {
    const f = byName("admin_overview")!;
    expect(signature(f.args)).toBe("text");
    expect(f.body).toContain("'asia/seoul'");
    expect(f.body).toContain("generate_series(0, 29)");
    expect(f.body).toMatch(/s\.consent_version = p_consent_version\s+and s\.consent_accepted_at is not null/);
    for (const key of ["users", "anonymous_users", "kakao_users", "users_with_state", "users_with_current_consent", "active_users_7d", "states_updated_7d", "new_users_by_day", "generated_at"]) {
      expect(f.body).toContain(`'${key}'`);
    }
  });

  it("admin_list_users — 정해진 칸만, 한 번에 최대 100명(화면의 ADMIN_LIST_MAX와 같게)", () => {
    const f = byName("admin_list_users")!;
    expect(signature(f.args)).toBe("integer, integer");
    const cols = /returns table \(([\s\S]*?)\)\s*language/.exec(f.header)?.[1] ?? "";
    expect(cols.split(",").map((c) => c.trim().split(/\s+/)[0])).toEqual([
      "id",
      "created_at",
      "last_sign_in_at",
      "is_anonymous",
      "provider",
      "has_state",
      "consent_version",
      "state_updated_at",
    ]);
    expect(f.body).toContain(`least(greatest(coalesce(p_limit, 20), 1), ${ADMIN_LIST_MAX})`);
  });
});

describe("0002_admin.sql — 개인정보 최소화", () => {
  it("건강 기록(state)·이메일·전화·닉네임(raw_user_meta_data)을 읽지 않는다", () => {
    expect(CODE).not.toMatch(/\bstate\b/); // user_states.state(건강 기록) — has_state·user_states는 걸리지 않는다
    expect(CODE).not.toContain("email");
    expect(CODE).not.toContain("phone");
    expect(CODE).not.toContain("raw_user_meta_data");
    expect(CODE).not.toContain("identity_data");
  });

  it("앞 단계(0001의 동의 칸)가 없으면 먼저 멈춘다", () => {
    const guard = CODE.indexOf("do $$");
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(guard).toBeLessThan(CODE.indexOf("create table if not exists public.admins"));
    expect(CODE.slice(guard, CODE.indexOf("create table"))).toMatch(/consent_version[\s\S]*consent_accepted_at[\s\S]*raise exception/);
  });
});
