// supabase/migrations/0001_user_states.sql 점검 — 실행하지 않고 글자로 확인한다(DB 없이 돌리는 안전장치).
// 본인 행만(RLS)·동의 칸·동의 없는 쓰기 거절·계정 삭제 함수의 권한이 바뀌면 여기서 멈춘다.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { consentColumns } from "./remote";
import { initialState } from "@/store/defaults";
import { CURRENT_CONSENT_VERSION } from "@/domain/consent";

const SQL_PATH = fileURLToPath(new URL("../../supabase/migrations/0001_user_states.sql", import.meta.url));
/** 주석(-- …)을 뺀 실행문 — 설명 글의 낱말이 검사에 걸리지 않게 */
const CODE = readFileSync(SQL_PATH, "utf8").replace(/--[^\n]*/g, "").toLowerCase().replace(/\s+/g, " ");

function policy(name: string): string {
  const start = CODE.indexOf(`create policy "user_states: ${name}"`);
  expect(start).toBeGreaterThanOrEqual(0);
  return CODE.slice(start, CODE.indexOf(";", start));
}

describe("0001_user_states.sql", () => {
  it("동의 칸(consent_version·consent_accepted_at)이 있다 — 표를 먼저 만든 적이 있어도 더한다", () => {
    expect(CODE).toMatch(/create table if not exists public\.user_states \([^;]*consent_version text,[^;]*consent_accepted_at timestamptz/);
    expect(CODE).toContain("alter table public.user_states add column if not exists consent_version text");
    expect(CODE).toContain("alter table public.user_states add column if not exists consent_accepted_at timestamptz");
  });

  it("공개 키(anon)에는 권한이 없고, 로그인한 사용자(카카오·익명 게스트 모두 authenticated)만", () => {
    expect(CODE).toContain("revoke all on table public.user_states from public, anon, authenticated");
    expect(CODE).toContain("grant select, insert, update, delete on table public.user_states to authenticated");
    expect(CODE).toContain("alter table public.user_states enable row level security");
    expect(CODE).not.toMatch(/grant [^;]* to anon/);
  });

  it("읽기·지우기는 본인 행만, 만들기·바꾸기는 본인 행 + 동의의 판이 있을 때만", () => {
    expect(policy("본인 행 읽기")).toContain("using ((select auth.uid()) = user_id)");
    expect(policy("본인 행 지우기")).toContain("using ((select auth.uid()) = user_id)");
    expect(policy("본인 행 만들기")).toContain("with check ((select auth.uid()) = user_id and consent_version is not null)");
    const update = policy("본인 행 바꾸기");
    expect(update).toContain("using ((select auth.uid()) = user_id)");
    expect(update).toContain("with check ((select auth.uid()) = user_id and consent_version is not null)");
    for (const name of ["본인 행 읽기", "본인 행 만들기", "본인 행 바꾸기", "본인 행 지우기"]) {
      expect(policy(name)).toContain("to authenticated");
    }
  });

  it("delete_my_account — 인자 없이 지금 로그인한 본인만, 공개 키로는 부를 수 없다", () => {
    expect(CODE).toContain("create or replace function public.delete_my_account()");
    expect(CODE).toContain("security definer set search_path = ''");
    expect(CODE).toContain("uid uuid := auth.uid()");
    expect(CODE).toContain("delete from public.user_states where user_id = uid");
    expect(CODE).toContain("delete from auth.users where id = uid");
    expect(CODE).toContain("revoke execute on function public.delete_my_account() from public, anon");
    expect(CODE).toContain("grant execute on function public.delete_my_account() to authenticated");
    // 다른 사용자 id를 받아 지우는 함수는 두지 않는다
    expect(CODE).not.toMatch(/function public\.\w+\([^)]*uuid[^)]*\)/);
  });

  it("웹은 상태의 동의 칸을 행의 동의 칸으로 그대로 옮겨 쓴다(src/auth/remote.ts)", () => {
    const s = initialState();
    expect(consentColumns(s)).toEqual({ consent_version: null, consent_accepted_at: null });
    const at = "2026-09-28T01:00:00.000Z";
    expect(consentColumns({ ...s, profile: { ...s.profile, consentVersion: CURRENT_CONSENT_VERSION, consentAcceptedAt: at } })).toEqual({
      consent_version: CURRENT_CONSENT_VERSION,
      consent_accepted_at: at,
    });
  });
});
