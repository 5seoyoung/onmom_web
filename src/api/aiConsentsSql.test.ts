// supabase/migrations/0008_ai_consents.sql 점검 — 실행하지 않고 글자로 확인한다(DB 없이 돌리는 안전장치,
// userStatesSql.test.ts·schedulesAndLimitsSql.test.ts와 같은 방식).
// AI 국외 이전 동의 기록(public.ai_consents): 본인 행만(RLS)·anon 없음·지우기 정책 없음(계정 삭제 cascade)·함수는 읽기만.
// 판(AI_CONSENT_VERSION)은 웹과 함수가 같은 값을 쓰고, 처리방침·동의 문구의 "동의한 내용과 일시"가 이 기록을 덮는다.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AI_CONSENT_VERSION as WEB_AI_CONSENT_VERSION } from "@/features/chat/aiConsent";
import { REQUIRED_CONSENTS } from "@/features/onboarding/consentText";
import { ACCOUNT_ITEMS, RETENTION_TEXT, SETTING_ITEMS } from "@/features/privacy/dataItems";
import { webPolicySections } from "@/features/privacy/webPolicyText";
import {
  AI_CONSENT_REQUIRED_CODE,
  AI_CONSENT_VERSION,
  AI_CONSENT_VERSION_MAX_CHARS,
  AI_CONSENTS_TABLE,
} from "../../supabase/functions/_shared/aiConsent";

const MIGRATIONS = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));
const FILE = "0008_ai_consents.sql";
const RAW = readFileSync(`${MIGRATIONS}${FILE}`, "utf8");
/** 주석(-- …)을 뺀 실행문(소문자, 공백 한 칸) — 설명 글의 낱말이 검사에 걸리지 않게 */
const CODE = RAW.replace(/--[^\n]*/g, "").toLowerCase().replace(/\s+/g, " ");
const TABLE = `public.${AI_CONSENTS_TABLE}`;

function policy(name: string): string {
  const start = CODE.indexOf(`create policy "ai_consents: ${name}"`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  return CODE.slice(start, CODE.indexOf(";", start));
}

describe("0008 — 먼저 있어야 하는 것 · 여러 번 실행", () => {
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

describe("0008 — public.ai_consents 표", () => {
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
