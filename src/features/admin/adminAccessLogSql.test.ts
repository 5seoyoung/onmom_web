// supabase/migrations/0009_admin_access_log.sql 점검 — 실행하지 않고 글자로 확인한다(DB 없이 돌리는 안전장치, adminToolsSql.test.ts·
// anonCleanupSql.test.ts와 같은 방식). 관리자 읽기 함수가 접근 기록 없이 결과를 돌려주게 바뀌거나, 결과 칸·계산이 0002·0005와 달라지거나,
// 기록에 건강 기록·이메일·사유가 들어가거나, 보존 기간(2년)·예약이 화면 안내·다른 예약과 어긋나면 여기서 멈춘다.

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ADMIN_AUDIT_RETENTION_YEARS, ADMIN_TEXT } from "./adminModel";

const MIGRATIONS = fileURLToPath(new URL("../../../supabase/migrations/", import.meta.url));
const FILE = "0009_admin_access_log.sql";
const RAW = readFileSync(`${MIGRATIONS}${FILE}`, "utf8");
/** 주석(-- …)을 뺀 실행문(소문자) — 설명 글의 낱말이 검사에 걸리지 않게 */
const codeOf = (file: string) => readFileSync(`${MIGRATIONS}${file}`, "utf8").replace(/--[^\n]*/g, "").toLowerCase();
const CODE = codeOf(FILE);

interface SqlFunction {
  name: string;
  args: string;
  header: string;
  body: string;
}

function functionsOf(code: string): SqlFunction[] {
  const re = /create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(([^)]*)\)([\s\S]*?)as\s+\$\$([\s\S]*?)\$\$;/g;
  return [...code.matchAll(re)].map((m) => ({ name: m[1], args: m[2], header: m[3], body: m[4] }));
}

/** "p_limit integer, p_offset integer" → "integer, integer" */
function signature(args: string): string {
  return args
    .split(",")
    .map((a) => a.trim().replace(/\s+default\s+.*$/, "").split(/\s+/).slice(1).join(" "))
    .filter((t) => t.length > 0)
    .join(", ");
}

/** 공백을 한 칸으로 — 줄 바꿈·들여쓰기와 상관없이 비교한다 */
function squash(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

/** returns table (…)의 칸(이름 + 타입) — 없으면 returns 뒤의 타입 하나 */
function returns(header: string): string {
  const table = /returns table \(([\s\S]*?)\)\s*language/.exec(header)?.[1];
  if (table !== undefined) return squash(table);
  return /returns\s+(\w+)/.exec(header)?.[1] ?? "";
}

const FNS = functionsOf(CODE);
const fn = (name: string) => {
  const f = FNS.find((x) => x.name === name);
  if (!f) throw new Error(`0009에 ${name}이 없습니다`);
  return f;
};
/** 0002·0005의 마지막 정의 — 0009가 같은 이름·인자·결과 칸으로 다시 만들어야 한다 */
const before = (file: string, name: string) => {
  const f = functionsOf(codeOf(file)).find((x) => x.name === name);
  if (!f) throw new Error(`${file}에 ${name}이 없습니다`);
  return f;
};

/** 접근 기록을 남기게 다시 만든 읽기 함수 — 이전 정의가 있는 파일, 남기는 행동 */
const READS = [
  { name: "admin_overview", from: "0005_admin_tools.sql", action: "overview" },
  { name: "admin_list_users", from: "0002_admin.sql", action: "list_users" },
  { name: "admin_find_user", from: "0005_admin_tools.sql", action: "find_user" },
  { name: "admin_list_admins", from: "0005_admin_tools.sql", action: "list_admins" },
] as const;
/** 관리자가 부르는 함수 전부(읽기 + CSV 내려받기 기록) */
const ADMIN_FNS = [...READS.map((r) => r.name), "admin_log_users_export"];
const CLEANUP = "public.cleanup_admin_audit()";
/** 기록 한 줄에 넣을 수 있는 칸 — 사유(reason)는 계정 삭제(0005)만, 건강 기록·이메일 칸은 표에 없다 */
const ACCESS_COLUMNS = new Set(["actor", "action", "target", "subject_count", "list_offset"]);

/** 함수 본문의 admin_audit 기록 — 칸 목록과 값 목록 */
function auditInserts(body: string): { columns: string[]; values: string }[] {
  const re = /insert into public\.admin_audit \(([^)]*)\)\s*values \(([\s\S]*?)\);/g;
  return [...squash(body).matchAll(re)].map((m) => ({ columns: m[1].split(",").map((c) => c.trim()), values: m[2] }));
}

/** 한국 시각(KST = UTC+9) 시 → pg_cron(UTC) 시 */
const utcHourOfKst = (kstHour: number) => (kstHour - 9 + 24) % 24;

describe("0009 — 먼저 있어야 하는 것", () => {
  it("pg_cron·0002(is_admin·admins·admin_list_users)·0005(admin_audit·찾기·관리자 목록)가 없으면 아무것도 바꾸기 전에 멈춘다", () => {
    const guard = CODE.indexOf("do $$");
    const firstChange = Math.min(...["alter table", "create or replace function", "cron.", "revoke ", "notify "].map((k) => CODE.indexOf(k)).filter((i) => i >= 0));
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(guard).toBeLessThan(firstChange);
    const block = squash(CODE.slice(guard, CODE.indexOf("end; $$;", guard)));
    for (const need of [
      "if not exists (select 1 from pg_extension where extname = 'pg_cron') then raise exception",
      "to_regclass('public.admins') is null",
      "to_regprocedure('public.is_admin()') is null",
      "to_regprocedure('public.admin_list_users(integer, integer)') is null",
      "to_regclass('public.admin_audit') is null",
      "to_regprocedure('public.admin_find_user(uuid)') is null",
      "to_regprocedure('public.admin_list_admins()') is null",
    ]) {
      expect(block, need).toContain(need);
    }
    // 확장은 다시 켜지 않는다(Supabase 2BP01 — 0006 머리말)
    expect(CODE).not.toContain("create extension");
  });
});

describe("0009 — 감사 기록 표(admin_audit)에 접근 기록 칸", () => {
  it("계정 수·목록 시작 위치 칸을 더한다 — 비울 수 있고(0005의 삭제 기록 줄), 0 이상만", () => {
    expect(squash(CODE)).toContain(
      "alter table public.admin_audit add column if not exists subject_count integer, add column if not exists list_offset integer;",
    );
    // 한 문장에서 지우고 다시 만든다 — 여러 번 실행해도 같고, 제약이 없는 순간이 없다
    expect(squash(CODE)).toContain(
      "alter table public.admin_audit drop constraint if exists admin_audit_subject_count_nonnegative, add constraint admin_audit_subject_count_nonnegative check (subject_count is null or subject_count >= 0), drop constraint if exists admin_audit_list_offset_nonnegative, add constraint admin_audit_list_offset_nonnegative check (list_offset is null or list_offset >= 0);",
    );
    // 기존 칸·제약(0005)은 그대로 — 지우거나 바꾸지 않는다
    expect(CODE).not.toMatch(/drop column|alter column|rename/);
    expect(CODE).not.toMatch(/drop constraint if exists admin_audit_(action_length|reason_length|reason_no_email)/);
    expect(CODE).not.toContain("references");
  });

  it("브라우저 정책 없음 · 권한은 브라우저와 서버 함수 키(service_role)까지 거둔다 — 기록은 함수 주인만 쓴다", () => {
    expect(CODE).toContain("revoke all on table public.admin_audit from public, anon, authenticated, service_role;");
    expect(CODE).toContain("alter table public.admin_audit enable row level security;");
    expect(CODE).not.toMatch(/create\s+policy/);
    expect(CODE).not.toMatch(/grant[^;]*on\s+(table\s+)?public\.admin_audit/);
  });
});

describe("0009 — 관리자 읽기 함수는 같은 모양으로 다시 만들고, 부를 때마다 접근 기록 한 줄", () => {
  it("다시 만드는 함수: 읽기 넷 + CSV 내려받기 기록 + 정리 — 그 밖의 함수는 건드리지 않는다(삭제·is_admin은 0005·0002 그대로)", () => {
    expect(FNS.map((f) => f.name).sort()).toEqual([...ADMIN_FNS, "cleanup_admin_audit"].sort());
  });

  it.each(READS)("$name — 이름·인자·결과 칸이 이전 정의($from)와 같다(화면·옛 화면이 그대로 읽는다)", ({ name, from }) => {
    const now = fn(name);
    const old = before(from, name);
    expect(signature(now.args)).toBe(signature(old.args));
    expect(now.args.trim()).toBe(old.args.trim()); // 인자 이름도 같다(create or replace는 이름을 바꿀 수 없다)
    expect(returns(now.header)).toBe(returns(old.header));
  });

  it.each(READS)("$name — 결과를 만드는 문장은 이전 정의($from)와 글자까지 같다", ({ name, from }) => {
    // 결과 = return query … ; 또는 select json_build_object(…) into result;
    const resultOf = (body: string) => {
      const b = squash(body);
      const start = b.includes("return query") ? b.indexOf("return query") : b.indexOf("select json_build_object(");
      const end = b.includes("return query") ? b.indexOf(";", start) : b.indexOf("into result;", start) + "into result;".length;
      return b.slice(start, end + 1);
    };
    const now = resultOf(fn(name).body);
    expect(now.length).toBeGreaterThan(50);
    expect(now).toBe(resultOf(before(from, name).body));
  });

  it.each(ADMIN_FNS)("%s — security definer + 빈 search_path, 기록을 쓰므로 stable·immutable이 아니다", (name) => {
    const h = squash(fn(name).header);
    expect(h).toContain("security definer");
    expect(h).toContain("set search_path = ''");
    expect(h).not.toMatch(/\b(stable|immutable)\b/);
  });

  it.each(READS)("$name — 이전에는 stable이었고, 이제 volatile이라고 적는다", ({ name, from }) => {
    expect(squash(before(from, name).header)).toMatch(/\bstable\b/);
    expect(squash(fn(name).header)).toContain("language plpgsql volatile security definer set search_path = ''");
  });

  it.each(ADMIN_FNS)("%s — begin 바로 다음에 is_admin()을 확인하고 아니면 오류(42501)", (name) => {
    const body = fn(name).body;
    expect(squash(body.slice(body.indexOf("begin"))).startsWith("begin if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;")).toBe(true);
  });

  it.each(ADMIN_FNS)("%s — 공개(public·anon) 실행 권한을 거두고 로그인한 사용자에게만(0002·0005와 같다)", (name) => {
    const sig = `public.${name}(${signature(fn(name).args)})`;
    expect(CODE).toContain(`revoke execute on function ${sig} from public, anon;`);
    expect(CODE).toContain(`grant execute on function ${sig} to authenticated;`);
    expect(CODE).not.toMatch(new RegExp(`grant[^;]*on function public\\.${name}\\b[^;]*\\banon\\b`));
  });

  it.each(READS)("$name — 기록은 한 줄, 행동 '$action', 부른 관리자(auth.uid()), 정해진 칸만(사유·건강 기록·이메일 없음)", ({ name, action }) => {
    const inserts = auditInserts(fn(name).body);
    expect(inserts).toHaveLength(1);
    const [row] = inserts;
    expect(row.columns.slice(0, 2)).toEqual(["actor", "action"]);
    expect(row.values.startsWith(`(select auth.uid()), '${action}'`)).toBe(true);
    for (const c of row.columns) expect(ACCESS_COLUMNS.has(c), c).toBe(true);
    // 다른 사람의 행을 바꾸거나 지우는 문은 없다
    expect(squash(fn(name).body)).not.toMatch(/\b(update|delete from|truncate)\b/);
  });

  it("목록 함수는 결과를 넣은 뒤 행 수를 세어(get diagnostics) 남긴다 — 결과와 같은 트랜잭션", () => {
    for (const name of ["admin_list_users", "admin_find_user", "admin_list_admins"]) {
      const b = squash(fn(name).body);
      const query = b.indexOf("return query");
      const count = b.indexOf("get diagnostics shown = row_count;");
      const insert = b.indexOf("insert into public.admin_audit");
      expect(query, name).toBeGreaterThan(0);
      expect(count, name).toBeGreaterThan(query);
      expect(insert, name).toBeGreaterThan(count);
      expect(b, name).toContain("declare shown integer;");
    }
    // 한눈에 보기는 결과를 만든 뒤, 돌려주기 전에
    const overview = squash(fn("admin_overview").body);
    expect(overview.indexOf("insert into public.admin_audit")).toBeGreaterThan(overview.indexOf("into result;"));
    expect(overview.indexOf("return result;")).toBeGreaterThan(overview.indexOf("insert into public.admin_audit"));
  });

  it("남기는 값 — 목록: 돌려준 행 수 + 실제 시작 위치(쿼리와 같은 계산), 찾기: 찾은 ID(없어도) + 0/1, 관리자 목록: 수, 한눈에 보기: 칸 없음", () => {
    const only = (name: string) => auditInserts(fn(name).body)[0];
    expect(only("admin_overview")).toEqual({ columns: ["actor", "action"], values: "(select auth.uid()), 'overview'" });
    expect(only("admin_list_users")).toEqual({
      columns: ["actor", "action", "subject_count", "list_offset"],
      values: "(select auth.uid()), 'list_users', shown, greatest(coalesce(p_offset, 0), 0)",
    });
    expect(squash(fn("admin_list_users").body)).toContain("offset greatest(coalesce(p_offset, 0), 0);");
    expect(only("admin_find_user")).toEqual({ columns: ["actor", "action", "target", "subject_count"], values: "(select auth.uid()), 'find_user', p_id, shown" });
    expect(only("admin_list_admins")).toEqual({ columns: ["actor", "action", "subject_count"], values: "(select auth.uid()), 'list_admins', shown" });
  });
});

describe("0009 — CSV 내려받기 기록(admin_log_users_export)", () => {
  const f = () => fn("admin_log_users_export");

  it("인자는 행 수 하나(integer) — 계정 ID 목록·파일 내용은 받지 않는다, 돌려주는 것 없음", () => {
    expect(f().args.trim()).toBe("p_rows integer");
    expect(returns(f().header)).toBe("void");
  });

  it("0 이상의 정수가 아니면 22023, 맞으면 기록 한 줄(export_users_csv · 파일의 행 수)", () => {
    const b = squash(f().body);
    expect(b).toContain("if p_rows is null or p_rows < 0 then raise exception 'invalid arguments' using errcode = '22023'; end if;");
    expect(b.indexOf("p_rows < 0")).toBeLessThan(b.indexOf("insert into"));
    expect(auditInserts(f().body)).toEqual([{ columns: ["actor", "action", "subject_count"], values: "(select auth.uid()), 'export_users_csv', p_rows" }]);
  });
});

describe("0009 — 기록 정리(2년) · 매일 예약", () => {
  const start = CODE.indexOf(`create or replace function ${CLEANUP}`);
  const open = CODE.indexOf("as $$", start);
  const header = squash(CODE.slice(start, open));
  const body = squash(CODE.slice(open, CODE.indexOf("$$;", open + 5)));

  it(`보존 기간 = 화면 안내(ADMIN_AUDIT_RETENTION_YEARS = ${ADMIN_AUDIT_RETENTION_YEARS}년) — at이 그보다 오래된 줄만 지운다`, () => {
    expect(ADMIN_AUDIT_RETENTION_YEARS).toBe(2);
    expect(body).toContain(`delete from public.admin_audit where at < now() - interval '${ADMIN_AUDIT_RETENTION_YEARS} years';`);
    expect(body.match(/delete from/g)).toHaveLength(1);
    expect(body).not.toMatch(/\b(update|insert into|truncate)\b/);
    expect(ADMIN_TEXT.accessLogNote).toContain(`${ADMIN_AUDIT_RETENTION_YEARS}년`);
    // 왜 2년인지 머리 주석에 적는다(안전성 확보조치 기준 — 민감정보 처리 시스템, 법률 확인 전)
    expect(RAW).toContain("안전성 확보조치 기준");
    expect(RAW).toMatch(/민감정보[^\n]*2년 이상/);
  });

  it("SECURITY DEFINER + 빈 search_path, 인자 없음, 지운 수만 돌려준다 — 사용자 id를 알림·로그로 내지 않는다", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(header).toContain("returns integer");
    expect(header).toContain("security definer");
    expect(header).toContain("set search_path = ''");
    expect(body).toContain("get diagnostics removed = row_count;");
    expect(body).toContain("return removed;");
    expect(CODE).not.toMatch(/raise (notice|log|info)/);
  });

  it("브라우저(anon·authenticated)도 서버 함수(service_role)도 부를 수 없다 — 예약(함수 주인 postgres)만", () => {
    expect(CODE).toContain(`revoke execute on function ${CLEANUP} from public, anon, authenticated, service_role;`);
    expect(CODE).not.toMatch(/grant execute on function public\.cleanup_admin_audit/);
  });

  it("pg_cron 매일 04:00 KST(= 19:00 UTC) — 게스트 정리(03:00)·AI 기록 정리(03:30) 뒤, 같은 이름이 있으면 지우고 다시 만든다", () => {
    expect(utcHourOfKst(4)).toBe(19);
    const code = squash(CODE);
    expect(code).toContain(`select cron.schedule( 'onmom-admin-audit-cleanup', '0 ${utcHourOfKst(4)} * * *', $job$ select ${CLEANUP}; $job$ );`);
    const guard = code.indexOf("if exists (select 1 from cron.job where jobname = 'onmom-admin-audit-cleanup')");
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(code.indexOf("perform cron.unschedule('onmom-admin-audit-cleanup')")).toBeGreaterThan(guard);
    expect(guard).toBeLessThan(code.indexOf("select cron.schedule("));
    expect(code.match(/select cron\.schedule\(/g)).toHaveLength(1);
    // 다른 예약은 건드리지 않는다
    for (const other of ["onmom-anon-cleanup", "onmom-llm-usage-cleanup", "onmom-send-reminders"]) expect(code).not.toContain(other);
  });
});

describe("0009 — 개인정보 최소화 · 적용 순서", () => {
  it("건강 기록(state)·이메일·전화·닉네임·identity 내용·IP(요청 헤더)를 읽지도 남기지도 않는다", () => {
    expect(CODE).not.toMatch(/\bstate\b/); // user_states.state(건강 기록) — has_state·user_states·state_updated_at은 걸리지 않는다
    expect(CODE).not.toContain("email");
    expect(CODE).not.toContain("phone");
    expect(CODE).not.toContain("raw_user_meta_data");
    expect(CODE).not.toContain("identity_data");
    expect(CODE).not.toMatch(/request\.headers|inet_client_addr|x-forwarded-for|cf-connecting-ip/);
    // 사유 칸은 계정 삭제(0005)만 쓴다
    for (const f of FNS) for (const row of auditInserts(f.body)) expect(row.columns, f.name).not.toContain("reason");
  });

  it("관리자를 넣거나 빼는 문은 없다 — 관리자 지정은 SQL Editor에서만(0002 머리 주석)", () => {
    expect(CODE).not.toMatch(/insert into public\.admins/);
    expect(CODE).not.toMatch(/delete from public\.admins/);
  });

  it("모든 마이그레이션의 기록 행동 — 계정 삭제(0005) + 접근 기록(0009), 표의 길이 제약(64자) 안", () => {
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
    const actions = new Set(files.flatMap((f) => functionsOf(codeOf(f)).flatMap((x) => auditInserts(x.body).map((r) => /'(\w+)'/.exec(r.values)?.[1]))));
    expect([...actions].sort()).toEqual(["delete_user", "export_users_csv", "find_user", "list_admins", "list_users", "overview"]);
    for (const a of actions) expect(a!.length).toBeLessThanOrEqual(64);
  });

  it("맨 끝에서 PostgREST에 스키마를 다시 읽으라고 알린다 — stable이던 정보로 읽기 전용 트랜잭션을 열지 않게", () => {
    const notify = CODE.lastIndexOf("notify pgrst, 'reload schema';");
    expect(notify).toBeGreaterThan(CODE.lastIndexOf("create or replace function"));
    expect(notify).toBeGreaterThan(CODE.lastIndexOf("cron.schedule("));
    expect(CODE.slice(notify + "notify pgrst, 'reload schema';".length).trim()).toBe("");
  });
});
