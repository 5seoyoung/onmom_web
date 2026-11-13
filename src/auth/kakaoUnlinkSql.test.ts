// supabase/migrations/0017_kakao_unlink.sql 글자 검사 — 카카오 연결 해제 웹훅이 부르는 계정 삭제 함수.
// 다른 사람의 계정을 지우는 함수라, 브라우저(anon·authenticated)가 부를 수 있게 바뀌거나 카카오 identity 말고 다른 기준으로 지우게 바뀌면 여기서 멈춘다.
// 실제 동작(카카오만·게스트 안 건드림·지운 수·권한)은 PGlite(Postgres 17)로 따로 확인했다.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const MIGRATIONS = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));
const CODE = readFileSync(`${MIGRATIONS}0017_kakao_unlink.sql`, "utf8").replace(/--[^\n]*/g, "");
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

const body = /function public\.delete_user_by_kakao_id\(p_kakao_id text\)[\s\S]*?as \$\$([\s\S]*?)\$\$;/.exec(CODE)?.[1] ?? "";

describe("0017 — delete_user_by_kakao_id", () => {
  it("함수 주인 권한 + search_path 비움", () => {
    const head = /create or replace function public\.delete_user_by_kakao_id\(p_kakao_id text\)[\s\S]*?as \$\$/.exec(CODE)![0];
    expect(head).toContain("returns integer");
    expect(head).toContain("security definer");
    expect(head).toContain("set search_path = ''");
  });

  it("서버 키(service_role)만 부를 수 있다 — 브라우저는 못 부른다", () => {
    expect(CODE).toContain("revoke execute on function public.delete_user_by_kakao_id(text) from public, anon, authenticated;");
    expect(CODE).toContain("grant execute on function public.delete_user_by_kakao_id(text) to service_role;");
    expect(CODE).not.toMatch(/grant execute on function public\.delete_user_by_kakao_id\(text\) to (anon|authenticated)/);
  });

  it("숫자 회원번호만 받고, 카카오 identity의 provider_id가 같은 계정만 지운다", () => {
    const b = squash(body);
    expect(b).toContain("if p_kakao_id is null or p_kakao_id !~ '^[0-9]{1,20}$' then raise exception 'invalid arguments' using errcode = '22023';");
    expect(b).toContain("from auth.identities i where i.provider = 'kakao' and i.provider_id = p_kakao_id;");
    expect(b).toContain("delete from public.user_states where user_id = any (targets);");
    expect(b).toContain("delete from auth.users where id = any (targets);");
    expect(body.match(/delete from/g)).toHaveLength(2);
  });

  it("지운 수만 돌려준다 — 사용자 id·회원번호를 남기는 insert·raise notice가 없다", () => {
    expect(squash(body)).toContain("get diagnostics removed = row_count; return removed;");
    expect(body).not.toMatch(/insert into|raise notice|raise log/);
  });
});
