// supabase/migrations/0014_admin_hardening.sql 글자 검사 — 관리자 2단계 인증(aal2)·관리자 권한 이력(3년)·CSV 내려받기 사유.
// 2단계 인증 조건이 빠지거나, 권한 이력 표가 브라우저에 열리거나, 사유 없이 내려받는 길이 남거나, 보존 기간·예약이 화면 안내·점검 목록과
// 어긋나면 여기서 멈춘다. 실제 동작(aal1 거절·aal2 허용·게스트·관리자 아님·anon 실행 불가·트리거·백필·사유 검사·세 번 실행)은
// PGlite(Postgres 17)에 auth·cron을 흉내 내어 따로 확인했다 — 이 파일은 글자가 달라지는 것을 막는다.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EXPECTED_JOBS } from "../../../scripts/ops/lib.mjs";
import { ADMIN_ROLE_HISTORY_RETENTION_YEARS, CSV_REASON_MAX } from "./adminModel";

const MIGRATIONS = fileURLToPath(new URL("../../../supabase/migrations/", import.meta.url));
const RAW = readFileSync(`${MIGRATIONS}0014_admin_hardening.sql`, "utf8");
/** 주석을 뺀 실행문(소문자, 공백 한 칸) */
const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const codeOf = (file: string) => squash(readFileSync(`${MIGRATIONS}${file}`, "utf8").replace(/--[^\n]*/g, "").toLowerCase());
const CODE = codeOf("0014_admin_hardening.sql");

function bodyOf(code: string, name: string): string {
  const m = new RegExp(`function public\\.${name}\\([^)]*\\)[\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`).exec(code);
  if (m === null) throw new Error(`${name} 함수가 없습니다`);
  return squash(m[1]);
}
function headerOf(code: string, name: string): string {
  const m = new RegExp(`create (?:or replace )?function public\\.${name}\\([^)]*\\)([\\s\\S]*?)as \\$\\$`).exec(code);
  if (m === null) throw new Error(`${name} 함수 머리가 없습니다`);
  return m[1];
}

describe("0014 — 먼저 있어야 하는 것", () => {
  it("확장은 켜지 않고 확인만, 0002·0005·0009가 없으면 아무것도 바꾸기 전에 멈춘다", () => {
    expect(CODE).not.toContain("create extension");
    const firstChange = CODE.indexOf("create table");
    for (const g of [
      "if not exists (select 1 from pg_extension where extname = 'pg_cron') then raise exception",
      "if to_regclass('public.admins') is null or to_regprocedure('public.is_admin()') is null then raise exception",
      "if to_regclass('public.admin_audit') is null then raise exception",
      "column_name = 'subject_count' ) then raise exception",
    ]) {
      expect(CODE, g).toContain(g);
      expect(CODE.indexOf(g), g).toBeLessThan(firstChange);
    }
  });

  it("끝에서 PostgREST가 스키마를 다시 읽는다(새 함수·바뀐 인자)", () => {
    expect(CODE.trimEnd().endsWith("notify pgrst, 'reload schema';")).toBe(true);
  });
});

describe("0014 — 관리자 2단계 인증(aal2)", () => {
  const isAdmin = bodyOf(CODE, "is_admin");
  const membership = bodyOf(CODE, "admin_membership");
  const OLD = bodyOf(codeOf("0002_admin.sql"), "is_admin");

  it("is_admin은 0002의 조건 그대로 + aal2 세션일 때만", () => {
    expect(isAdmin).toContain("coalesce(auth.jwt() ->> 'aal', '') = 'aal2'");
    expect(isAdmin.replace(" and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'", "")).toBe(OLD);
  });

  it("admin_membership은 0002의 is_admin과 같은 조건(aal 무관) — 참·거짓 하나만, 자기 자신만", () => {
    expect(membership).toBe(OLD);
    expect(membership).not.toContain("aal");
    expect(headerOf(CODE, "admin_membership")).toContain("returns boolean");
  });

  it.each(["is_admin", "admin_membership"])("%s — 함수 주인 권한·search_path 비움·stable, 공개 키(anon)로는 못 부른다", (name) => {
    const header = headerOf(CODE, name);
    expect(header).toContain("security definer");
    expect(header).toContain("set search_path = ''");
    expect(header).toContain("stable");
    expect(CODE).toContain(`revoke execute on function public.${name}() from public, anon;`);
    expect(CODE).toContain(`grant execute on function public.${name}() to authenticated;`);
  });
});

describe("0014 — 관리자 권한 이력(3년)", () => {
  it("표는 계정을 참조하지 않고(계정이 지워져도 남음), 부여·말소 두 값만", () => {
    const table = /create table if not exists public\.admin_role_history \(([\s\S]*?)\);/.exec(CODE)![1];
    expect(table).toContain("user_id uuid not null");
    expect(table).not.toContain("references");
    expect(table).toContain("check (action in ('grant', 'revoke'))");
    expect(table).toContain("db_role text not null default current_user");
    expect(table).toContain("by_user uuid");
    expect(table).not.toMatch(/email|state|reason/);
  });

  it("브라우저도 서버 키도 읽거나 쓰지 못한다 — 권한 회수 + RLS 켜고 정책 없음", () => {
    expect(CODE).toContain("revoke all on table public.admin_role_history from public, anon, authenticated, service_role;");
    expect(CODE).toContain("alter table public.admin_role_history enable row level security;");
    expect(CODE).not.toContain("create policy");
  });

  it("관리자 줄을 넣고·빼고·바꿀 때마다 트리거가 남긴다(여러 번 실행해도 트리거 하나)", () => {
    const header = headerOf(CODE, "log_admin_role_change");
    expect(header).toContain("returns trigger");
    expect(header).toContain("security definer");
    expect(header).toContain("set search_path = ''");
    const body = bodyOf(CODE, "log_admin_role_change");
    expect(body).toContain("values (old.user_id, 'revoke', (select auth.uid()))");
    expect(body).toContain("values (new.user_id, 'grant', (select auth.uid()))");
    expect(CODE).toContain("drop trigger if exists admins_role_history on public.admins; create trigger admins_role_history after insert or delete or update of user_id on public.admins for each row execute function public.log_admin_role_change();");
    expect(CODE).toContain("revoke execute on function public.log_admin_role_change() from public, anon, authenticated, service_role;");
  });

  it("지금 관리자는 등록 시각으로 한 번만 채운다(이력이 없을 때만)", () => {
    expect(CODE).toContain(
      "insert into public.admin_role_history (user_id, action, at, db_role, by_user) select a.user_id, 'grant', a.created_at, 'backfill-0014', null from public.admins a where not exists (select 1 from public.admin_role_history h where h.user_id = a.user_id);",
    );
  });

  it(`${ADMIN_ROLE_HISTORY_RETENTION_YEARS}년 지난 줄만 지우고, 예약만 부른다 — 화면 안내와 같은 기간`, () => {
    expect(bodyOf(CODE, "cleanup_admin_role_history")).toContain(
      `delete from public.admin_role_history where at < now() - interval '${ADMIN_ROLE_HISTORY_RETENTION_YEARS} years';`,
    );
    expect(CODE).toContain("revoke execute on function public.cleanup_admin_role_history() from public, anon, authenticated, service_role;");
  });

  it("예약은 하나(같은 이름은 지우고 다시) — 매일 점검(scripts/ops EXPECTED_JOBS)의 시각과 같다", () => {
    const job = EXPECTED_JOBS.find((j: { name: string }) => j.name === "onmom-admin-role-history-cleanup");
    expect(job).toBeDefined();
    expect(CODE).toContain(
      `select cron.schedule( 'onmom-admin-role-history-cleanup', '${job!.schedule}', $job$ select public.cleanup_admin_role_history(); $job$ );`,
    );
    const guard = CODE.indexOf("if exists (select 1 from cron.job where jobname = 'onmom-admin-role-history-cleanup')");
    expect(guard).toBeGreaterThan(-1);
    expect(CODE.indexOf("perform cron.unschedule('onmom-admin-role-history-cleanup')")).toBeGreaterThan(guard);
    expect(CODE.match(/select cron\.schedule\(/g)).toHaveLength(1);
  });
});

describe("0014 — CSV 내려받기 사유", () => {
  const body = bodyOf(CODE, "admin_log_users_export");

  it("인자 하나인 옛 함수는 지운다 — 사유 없이 내려받는 길이 남지 않게", () => {
    expect(CODE).toContain("drop function if exists public.admin_log_users_export(integer);");
    expect(CODE).toContain("create or replace function public.admin_log_users_export(p_rows integer, p_reason text)");
    expect(CODE).toContain("revoke execute on function public.admin_log_users_export(integer, text) from public, anon;");
    expect(CODE).toContain("grant execute on function public.admin_log_users_export(integer, text) to authenticated;");
  });

  it(`맨 앞에서 관리자 확인, 사유는 공백을 지운 뒤 1~${CSV_REASON_MAX}자 — 화면 상한과 같다`, () => {
    expect(body.indexOf("if not public.is_admin() then raise exception 'forbidden' using errcode = '42501';")).toBe(body.indexOf("if"));
    expect(CODE).toContain("why text := trim(coalesce(p_reason, ''));");
    expect(body).toContain(`char_length(why) not between 1 and ${CSV_REASON_MAX} then raise exception 'invalid arguments' using errcode = '22023';`);
  });

  it("기록 한 줄에 행 수와 사유 — 이메일 모양은 0005의 표 제약이 거절한다", () => {
    expect(body).toContain("insert into public.admin_audit (actor, action, subject_count, reason) values ((select auth.uid()), 'export_users_csv', p_rows, why);");
    expect(body.match(/insert into/g)).toHaveLength(1);
    expect(codeOf("0005_admin_tools.sql")).toContain("constraint admin_audit_reason_no_email check");
  });
});

describe("0014 — 설명", () => {
  it("머리말이 근거 조항과 운영 안내를 가리킨다", () => {
    expect(RAW).toContain("제5조③");
    expect(RAW).toContain("제6조②");
    expect(RAW).toContain("제8조②");
    expect(RAW).toContain("docs/dev/RUNBOOK.md");
  });
});
