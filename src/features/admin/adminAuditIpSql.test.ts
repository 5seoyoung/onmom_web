// supabase/migrations/0016_admin_audit_ip.sql 글자 검사 — 관리자 접근 기록(admin_audit)에 접속지(IP)를 채우는 트리거.
// 실제 동작(cf-connecting-ip만 읽음·IP 모양이 아니면 null·SQL Editor에서 넣은 값은 덮어씀·두 번 실행해도 트리거 하나)은 PGlite(Postgres 17)로
// 따로 확인했다 — 이 파일은 글자가 달라지는 것을 막는다.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CODE = readFileSync(fileURLToPath(new URL("../../../supabase/migrations/0016_admin_audit_ip.sql", import.meta.url)), "utf8").replace(
  /--[^\n]*/g,
  "",
);
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

describe("0016 — 관리자 접근 기록의 접속지", () => {
  it("칸은 null 허용 텍스트, 45자 제한", () => {
    expect(CODE).toContain("alter table public.admin_audit add column if not exists ip text;");
    expect(squash(CODE)).toContain("check (ip is null or char_length(ip) <= 45)");
  });

  it("Cloudflare가 덮어쓰는 cf-connecting-ip만 읽고, 브라우저가 보낼 수 있는 x-forwarded-for는 읽지 않는다", () => {
    expect(CODE).toContain("headers ->> 'cf-connecting-ip'");
    expect(CODE).not.toContain("x-forwarded-for");
    expect(CODE).not.toContain("x-real-ip");
  });

  it("먼저 null로 두고 IP 모양일 때만 채운다 — 부르는 쪽이 넣은 값은 쓰지 않는다", () => {
    const body = squash(/as \$\$([\s\S]*?)\$\$;/.exec(CODE)![1]);
    expect(body.indexOf("new.ip := null;")).toBeLessThan(body.indexOf("current_setting('request.headers', true)"));
    expect(body).toContain("new.ip := host(raw::inet);");
    expect(body).toContain("exception when others then new.ip := null;");
  });

  it("줄이 들어가기 전(before insert) 트리거 하나, 함수는 아무도 직접 부를 수 없다, search_path 비움", () => {
    expect(CODE).toContain("drop trigger if exists admin_audit_ip on public.admin_audit;");
    expect(squash(CODE)).toContain("create trigger admin_audit_ip before insert on public.admin_audit for each row execute function public.admin_audit_set_ip();");
    expect(CODE).toContain("revoke execute on function public.admin_audit_set_ip() from public, anon, authenticated, service_role;");
    expect(CODE).toContain("set search_path = ''");
    expect(CODE).not.toContain("security definer");
  });
});
