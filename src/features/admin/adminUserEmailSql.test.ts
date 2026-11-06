// supabase/migrations/0013_admin_user_email.sql 글자 검사 — 사용자 목록·계정 찾기에 로그인 이메일 칸을 더한 파일.
// 이메일을 돌려주게 되면서 권한 확인·접근 기록이 빠지거나, 공개 키로 불리거나, 닉네임·건강 기록까지 나가게 바뀌면 여기서 멈춘다.
// 실제 동작(관리자 아닌 사람 거절, 게스트는 null, 기록 한 줄)은 로컬 Postgres에서 따로 확인했다 — 이 파일은 글자가 달라지는 것을 막는다.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const MIGRATIONS = fileURLToPath(new URL("../../../supabase/migrations/", import.meta.url));
const code = (file: string) => readFileSync(`${MIGRATIONS}${file}`, "utf8").replace(/--[^\n]*/g, "");
const CODE = code("0013_admin_user_email.sql");
const OLD = code("0009_admin_access_log.sql");

function bodyOf(sql: string, name: string): string {
  const m = new RegExp(`function public\\.${name}\\([^)]*\\)[\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`).exec(sql);
  if (m === null) throw new Error(`${name} 함수가 없습니다`);
  return m[1];
}
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

describe.each([
  { name: "admin_list_users", args: "integer, integer", audit: "'list_users'" },
  { name: "admin_find_user", args: "uuid", audit: "'find_user'" },
])("0013 — $name", ({ name, args, audit }) => {
  const body = bodyOf(CODE, name);

  it("함수 주인 권한 + search_path 비움, 맨 앞에서 관리자 확인", () => {
    const head = new RegExp(`create function public\\.${name}\\([^)]*\\)[\\s\\S]*?as \\$\\$`).exec(CODE)![0];
    expect(head).toContain("security definer");
    expect(head).toContain("set search_path = ''");
    expect(squash(body).indexOf("if not public.is_admin() then raise exception 'forbidden' using errcode = '42501';")).toBeGreaterThan(-1);
    expect(squash(body).indexOf("is_admin")).toBeLessThan(squash(body).indexOf("return query"));
  });

  it("지운 뒤 권한을 다시 준다 — 공개 키(anon)로는 부를 수 없다", () => {
    expect(CODE).toContain(`drop function if exists public.${name}(${args});`);
    expect(CODE).toContain(`revoke execute on function public.${name}(${args}) from public, anon;`);
    expect(CODE).toContain(`grant execute on function public.${name}(${args}) to authenticated;`);
  });

  it("접근 기록은 그대로 한 줄 — 이메일은 기록에 남기지 않는다", () => {
    const insert = /insert into public\.admin_audit[\s\S]*?;/.exec(body)![0];
    expect(insert).toContain(audit);
    expect(insert).not.toContain("email");
    expect(body.match(/insert into public\.admin_audit/g)).toHaveLength(1);
  });

  it("0009의 본문에 이메일 칸 하나만 더했다 — 다른 칸·조건은 그대로", () => {
    expect(squash(body).replace(", nullif(u.email, '')::text", "")).toBe(squash(bodyOf(OLD, name)));
  });

  it("건강 기록(state)·닉네임(raw_user_meta_data)·identity 내용·전화를 읽지 않는다", () => {
    expect(body).not.toMatch(/s\.state\b|raw_user_meta_data|identity_data|\.phone\b/);
  });
});

describe("0013 — 파일 전체", () => {
  it("이메일로 찾는 함수·표 변경·예약을 만들지 않는다 — 함수 두 개만", () => {
    expect(CODE.match(/create function public\.\w+/g)).toEqual(["create function public.admin_list_users", "create function public.admin_find_user"]);
    expect(CODE).not.toMatch(/alter table|create table|cron\.schedule/);
  });

  it("PostgREST에 스키마를 다시 읽으라고 알린다", () => {
    expect(CODE).toContain("notify pgrst, 'reload schema';");
  });
});
