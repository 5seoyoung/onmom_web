// supabase/migrations/0007_schedules_and_limits.sql 점검 — 실행하지 않고 글자로 확인한다(DB 없이 돌리는 안전장치,
// anonCleanupSql.test.ts·sendReminders.test.ts와 같은 방식). 매일 리마인더 예약(매시·주소 없음)은 src/features/pwa/sendReminders.test.ts가 본다.
// 여기서는 ① 먼저 있어야 하는 것 확인 ② AI 상담 이용 기록(llm_usage) 매일 정리 ③ user_states 크기 상한(5MB → 1MB).
// AI 이용 기록의 보유 기간은 처리방침·동의 문구의 숫자(dataItems AI_USAGE_RETENTION_DAYS)·0003의 정리 기준과 같아야 한다.

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MOOD_CHECKS_LIMIT, SYMPTOM_HISTORY_LIMIT, type PersistedState } from "@/domain/types";
import { AI_USAGE_RETENTION_DAYS } from "@/features/privacy/dataItems";
import { initialState } from "@/store/defaults";

const MIGRATIONS = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));
const FILE = "0007_schedules_and_limits.sql";
/** 주석(-- …)을 뺀 실행문(소문자, 공백 한 칸) — 설명 글의 낱말이 검사에 걸리지 않게 */
const sqlCode = (file: string) =>
  readFileSync(`${MIGRATIONS}${file}`, "utf8")
    .replace(/--[^\n]*/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
const CODE = sqlCode(FILE);
const ALL = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .sort();

/** 한국 시각(KST = UTC+9) 시 → pg_cron(UTC) 시 */
const utcHourOfKst = (kstHour: number) => (kstHour - 9 + 24) % 24;

describe("0007 — 먼저 있어야 하는 것 · 예약 이름", () => {
  it("확장은 다시 켜지 않는다(Supabase 2BP01) — pg_cron·pg_net·표가 있는지만 보고, 없으면 아무것도 바꾸기 전에 멈춘다", () => {
    expect(CODE).not.toContain("create extension");
    const guards = [
      "if not exists (select 1 from pg_extension where extname = 'pg_cron') then raise exception",
      "if not exists (select 1 from pg_extension where extname = 'pg_net') then raise exception",
      "if to_regclass('public.llm_usage') is null then raise exception",
      "if to_regclass('public.user_states') is null then raise exception",
    ];
    const firstChange = Math.min(CODE.indexOf("cron.unschedule("), CODE.indexOf("cron.schedule("), CODE.indexOf("alter table"), CODE.indexOf("create or replace function"));
    for (const g of guards) {
      expect(CODE, g).toContain(g);
      expect(CODE.indexOf(g), g).toBeLessThan(firstChange);
    }
  });

  it("예약은 리마인더·AI 기록 정리 각각 하나 — 게스트 정리(0006)는 건드리지 않고, 마지막 정의의 이름이 서로 겹치지 않는다", () => {
    expect(CODE.match(/select cron\.schedule\( 'onmom-send-reminders',/g)).toHaveLength(1);
    expect(CODE.match(/select cron\.schedule\( 'onmom-llm-usage-cleanup',/g)).toHaveLength(1);
    expect(CODE.match(/select cron\.schedule\(/g)).toHaveLength(2);
    expect(CODE).not.toContain("onmom-anon-cleanup");
    const jobs = new Set(ALL.flatMap((f) => [...sqlCode(f).matchAll(/select cron\.schedule\( '([a-z-]+)',/g)].map((m) => m[1])));
    expect([...jobs].sort()).toEqual(["onmom-anon-cleanup", "onmom-llm-usage-cleanup", "onmom-send-reminders"]);
  });
});

describe("0007 — AI 상담 이용 기록(llm_usage) 매일 정리", () => {
  const FN = "public.cleanup_llm_usage()";
  const start = CODE.indexOf(`create or replace function ${FN}`);
  const open = CODE.indexOf("as $$", start);
  const header = CODE.slice(start, open);
  const body = CODE.slice(open, CODE.indexOf("$$;", open + 5));

  it("SECURITY DEFINER + 빈 search_path, 인자 없음, 지운 수(integer)만 돌려준다", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(header).toContain("returns integer");
    expect(header).toContain("language plpgsql");
    expect(header).toContain("security definer");
    expect(header).toContain("set search_path = ''");
    expect(body).toContain("get diagnostics removed = row_count");
    expect(body).toContain("return removed");
    expect(CODE).not.toMatch(/raise (notice|log|info)/);
  });

  it(`지우는 기준 = 처리방침의 보유 기간(${AI_USAGE_RETENTION_DAYS}일) = 0003 llm_consume_quota가 부를 때 지우는 기준`, () => {
    const rule = (sql: string) => /delete from public\.llm_usage where created_at < now\(\) - interval '(\d+) days'/.exec(sql)?.[1];
    expect(rule(body)).toBe(String(AI_USAGE_RETENTION_DAYS));
    expect(rule(sqlCode("0003_llm_usage.sql"))).toBe(String(AI_USAGE_RETENTION_DAYS));
    // 그 표만, 지우기만
    expect(body.match(/delete from/g)).toHaveLength(1);
    expect(body).not.toMatch(/\b(update|insert into|truncate)\b/);
  });

  it("브라우저(anon·authenticated)도 서버 함수(service_role)도 부를 수 없다 — 예약(함수 주인 postgres)만", () => {
    expect(CODE).toContain(`revoke execute on function ${FN} from public, anon, authenticated, service_role`);
    expect(CODE).not.toMatch(/grant execute on function public\.cleanup_llm_usage/);
  });

  it("pg_cron 매일 03:30 KST(= 18:30 UTC)에 함수 하나만 부른다 — 같은 이름이 있으면 지우고 다시 만든다", () => {
    expect(utcHourOfKst(3)).toBe(18);
    expect(CODE).toContain(`select cron.schedule( 'onmom-llm-usage-cleanup', '30 ${utcHourOfKst(3)} * * *', $job$ select ${FN}; $job$ )`);
    const guard = CODE.indexOf("if exists (select 1 from cron.job where jobname = 'onmom-llm-usage-cleanup')");
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(CODE.indexOf("perform cron.unschedule('onmom-llm-usage-cleanup')")).toBeGreaterThan(guard);
    expect(guard).toBeLessThan(CODE.indexOf("select cron.schedule( 'onmom-llm-usage-cleanup'"));
  });
});

describe("0007 — user_states 크기 상한 5MB → 1MB", () => {
  const STATEMENT =
    "alter table public.user_states drop constraint if exists user_states_state_size, add constraint user_states_state_size check (pg_column_size(state) <= 1024 * 1024);";

  it("0001이 만든 제약(같은 이름)을 한 문장에서 지우고 다시 만든다 — 제약이 없는 순간이 없다", () => {
    const original = /constraint (\w+) check \(pg_column_size\(state\) <= 5 \* 1024 \* 1024\)/.exec(sqlCode("0001_user_states.sql"));
    expect(original?.[1]).toBe("user_states_state_size");
    expect(CODE).toContain(STATEMENT);
    expect(CODE.match(/user_states_state_size/g)).toHaveLength(2);
  });

  it("NOT VALID 없이 — 기존 행도 모두 검사한다(1MB를 넘는 행이 있으면 이 파일 전체가 적용되지 않는다)", () => {
    expect(CODE).not.toContain("not valid");
    expect(CODE).not.toContain("validate constraint");
  });

  it("지금 판이 정한 크기는 0007의 1MB — 이 제약을 더 뒤에 다시 만든 파일이 없다", () => {
    const definers = ALL.filter((f) => /constraint user_states_state_size check/.test(sqlCode(f)));
    expect(definers.at(-1)).toBe(FILE);
  });

  it("1MB는 웹이 스스로 자르는 기록(증상 50건·기분 답 60건)을 다 채운 상태보다 훨씬 크다 — 기록장 글에 넉넉한 여유", () => {
    const full: PersistedState = {
      ...initialState(),
      hasOnboarded: true,
      ownerAccountID: "kakao-1234567890",
      profile: { ...initialState().profile, deliveryDate: "2026-09-01", deliveryMethod: "cesarean", goal: "returningToWork", returnToWorkDate: "2027-09-01", consentAccepted: true, consentVersion: "web-2026-09-28", consentAcceptedAt: "2026-09-28T11:00:00.000Z", heightCm: 160, currentWeightKg: 62.5, prePregnancyWeightKg: 55, neighborhood: "서울특별시 강동구 상일동" },
      symptomHistory: Array.from({ length: SYMPTOM_HISTORY_LIMIT }, (_, i) => ({
        id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        date: "2026-10-14T11:00:00.000Z",
        lochiaIncreased: true,
        lochiaRed: true,
        feverEvent: true,
        painNrs: 10,
        redFlagCode: "cardioresp_flag",
        postpartumDays: 365,
      })),
      moodChecks: Array.from({ length: MOOD_CHECKS_LIMIT }, (_, i) => ({
        id: `00000000-0000-4000-9000-${String(i).padStart(12, "0")}`,
        date: "2026-10-14T11:00:00.000Z",
        questionID: 7,
        answer: "unsure" as const,
      })),
      moodCardSnoozedUntil: "2026-10-21T11:00:00.000Z",
    };
    const bytes = new TextEncoder().encode(JSON.stringify(full)).byteLength;
    expect(bytes).toBeLessThan(1024 * 1024 / 20);
  });
});
