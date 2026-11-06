// supabase/migrations/0011_admin_usage_stats.sql 점검 — 실행하지 않고 글자로 확인한다(DB 없이 돌리는 안전장치, adminAccessLogSql.test.ts와 같은 방식).
// 이용 통계가 권한 확인이나 접근 기록 없이 결과를 돌려주게 바뀌거나, 5명 미만 숨김이 빠지거나, 사람별 값·자유 글이 결과에 들어가거나,
// 병원 안내를 오늘의 코드 목록으로 세거나, 칸 이름·기간·k가 화면(adminModel)과 어긋나면 여기서 멈춘다.

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { weekFromDayCount } from "@/domain/date";
import { MOOD_ANSWERS } from "@/rules/mood";
import { RED_FLAG_CODES } from "@/rules/redflag";
import { USAGE_CONSENT_FROM, USAGE_DAYS_MAX, USAGE_DAYS_MIN, USAGE_DEFAULT_DAYS, USAGE_DISTRIBUTIONS, USAGE_K, USAGE_PERIODS } from "./adminModel";

const MIGRATIONS = fileURLToPath(new URL("../../../supabase/migrations/", import.meta.url));
const FILE = "0011_admin_usage_stats.sql";
const RAW = readFileSync(`${MIGRATIONS}${FILE}`, "utf8");
/** 주석(-- …)을 뺀 실행문 — 글자 그대로(정규식 모양을 꺼낼 때) */
const STRIPPED = RAW.replace(/--[^\n]*/g, "");
/** 주석을 뺀 실행문(소문자) — 설명 글의 낱말이 검사에 걸리지 않게 */
const CODE = STRIPPED.toLowerCase();

/** 공백을 한 칸으로 — 줄 바꿈·들여쓰기와 상관없이 비교한다 */
function squash(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

const FN_RE = /create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(([^)]*)\)([\s\S]*?)as\s+\$\$([\s\S]*?)\$\$;/g;
const FNS = [...CODE.matchAll(FN_RE)].map((m) => ({ name: m[1], args: m[2], header: m[3], body: m[4] }));
const FN = FNS[0];
const BODY = squash(FN?.body ?? "");

/** 함수 본문의 admin_audit 기록 — 칸 목록과 값 목록 */
function auditInserts(body: string): { columns: string[]; values: string }[] {
  const re = /insert into public\.admin_audit \(([^)]*)\)\s*values \(([\s\S]*?)\);/g;
  return [...squash(body).matchAll(re)].map((m) => ({ columns: m[1].split(",").map((c) => c.trim()), values: m[2] }));
}

/** 본문의 모든 jsonb_build_object(…) 호출 — 괄호·따옴표를 따라 맨 바깥 인자로 나눈다 */
function buildObjectCalls(sql: string): string[][] {
  const marker = "jsonb_build_object(";
  const calls: string[][] = [];
  for (let at = sql.indexOf(marker); at >= 0; at = sql.indexOf(marker, at + marker.length)) {
    const args: string[] = [];
    let depth = 0;
    let quoted = false;
    let current = "";
    for (let i = at + marker.length; i < sql.length; i++) {
      const c = sql[i];
      if (c === "'") quoted = !quoted;
      if (!quoted) {
        if (c === ")" && depth === 0) break;
        if (c === "(") depth += 1;
        if (c === ")") depth -= 1;
        if (c === "," && depth === 0) {
          args.push(current.trim());
          current = "";
          continue;
        }
      }
      current += c;
    }
    args.push(current.trim());
    calls.push(args);
  }
  return calls;
}

describe("0011 — 먼저 있어야 하는 것 · 적용", () => {
  it("0001(동의 칸)·0002(is_admin·admins)·0005(admin_audit)·0009(subject_count)가 없으면 아무것도 바꾸기 전에 멈춘다", () => {
    const guard = CODE.indexOf("do $$");
    const firstChange = Math.min(...["create or replace function", "revoke ", "grant ", "comment on", "notify "].map((k) => CODE.indexOf(k)).filter((i) => i >= 0));
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(guard).toBeLessThan(firstChange);
    const flat = squash(CODE);
    const block = flat.slice(flat.indexOf("do $$"), flat.indexOf("end; $$;"));
    for (const need of [
      "to_regclass('public.user_states') is null",
      "column_name = 'consent_version'",
      "to_regclass('public.admins') is null",
      "to_regprocedure('public.is_admin()') is null",
      "to_regclass('public.admin_audit') is null",
      "column_name = 'subject_count'",
    ]) {
      expect(block, need).toContain(need);
    }
    expect(block.match(/raise exception/g)).toHaveLength(4);
  });

  it("번호 — 0010 뒤, 다른 파일과 겹치지 않고, 이 함수를 만드는 파일은 이것 하나", () => {
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
    const numbers = files.map((f) => Number(/^(\d{4})_/.exec(f)?.[1]));
    expect(new Set(numbers).size).toBe(files.length);
    expect(files.at(-1)).toBe(FILE);
    const others = files.filter((f) => f !== FILE && readFileSync(`${MIGRATIONS}${f}`, "utf8").includes("admin_usage_stats"));
    expect(others).toEqual([]);
  });

  it("여러 번 실행해도 같다 — 함수만 새로 만들고 표·칸·예약·확장·권한 표는 건드리지 않는다", () => {
    expect(FNS.map((f) => f.name)).toEqual(["admin_usage_stats"]);
    expect(CODE).toContain("create or replace function public.admin_usage_stats(p_days integer)");
    expect(CODE).not.toMatch(/\b(create table|alter table|drop table|drop function|create extension|create policy)\b/);
    expect(CODE).not.toContain("cron.");
  });

  it("맨 끝에서 PostgREST에 스키마를 다시 읽으라고 알린다 — 새 함수를 바로 부를 수 있게(0009와 같다)", () => {
    const notify = CODE.lastIndexOf("notify pgrst, 'reload schema';");
    expect(notify).toBeGreaterThan(CODE.lastIndexOf("grant execute"));
    expect(CODE.slice(notify + "notify pgrst, 'reload schema';".length).trim()).toBe("");
  });
});

describe("0011 — 권한", () => {
  it("인자는 기간 하나(사람을 고르는 인자 없음), jsonb를 돌려주고, 기록을 쓰므로 volatile + security definer + 빈 search_path", () => {
    expect(FN.args.trim()).toBe("p_days integer");
    expect(squash(FN.header)).toBe("returns jsonb language plpgsql volatile security definer set search_path = ''");
  });

  it("begin 바로 다음에 is_admin()을 확인하고 아니면 오류(42501) — 그 앞(declare)에서는 표를 읽지 않는다", () => {
    const begin = BODY.indexOf("begin");
    expect(BODY.slice(begin).startsWith("begin if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;")).toBe(true);
    const declare = BODY.slice(0, begin);
    expect(declare.startsWith("declare")).toBe(true);
    expect(declare).not.toMatch(/\b(select|from|public\.|auth\.)/);
    // 어떤 읽기보다 앞이다
    const check = BODY.indexOf("if not public.is_admin() then");
    for (const read of ["from public.user_states", "from public.admins", "select"]) expect(check, read).toBeLessThan(BODY.indexOf(read));
  });

  it("공개(public·anon) 실행 권한을 거두고 로그인한 사용자에게만(0009와 같다)", () => {
    expect(CODE).toContain("revoke execute on function public.admin_usage_stats(integer) from public, anon;");
    expect(CODE).toContain("grant execute on function public.admin_usage_stats(integer) to authenticated;");
    expect(CODE).not.toMatch(/grant[^;]*on function public\.admin_usage_stats\b[^;]*\banon\b/);
  });
});

describe("0011 — 접근 기록(같은 트랜잭션)", () => {
  it("한 줄 — 부른 관리자, 행동 usage_stats, 집계에 든 사람 수(사유·대상 계정 없음)", () => {
    expect(auditInserts(FN.body)).toEqual([{ columns: ["actor", "action", "subject_count"], values: "(select auth.uid()), 'usage_stats', consented" }]);
  });

  it("같은 함수 안에서 결과를 만든 뒤·돌려주기 전에 남긴다 — return은 맨 끝 하나뿐이라 기록을 건너뛰고 나갈 길이 없다", () => {
    const insert = BODY.indexOf("insert into public.admin_audit");
    expect(insert).toBeGreaterThan(BODY.indexOf("into stats;"));
    expect(insert).toBeGreaterThan(BODY.indexOf("result := result || stats;"));
    expect(BODY.match(/\breturn\b/g)).toHaveLength(1);
    expect(BODY.endsWith("return result; end;")).toBe(true);
    expect(BODY.indexOf("return result;")).toBeGreaterThan(insert);
    // 기록 실패를 삼키는 예외 처리가 없다 — 기록을 남기지 못하면 결과도 나가지 않는다
    expect(BODY).not.toContain("exception when");
  });

  it("기록 말고는 아무것도 바꾸지 않고, 알림·로그로 값을 내지 않는다", () => {
    expect(BODY).not.toMatch(/\b(update|delete|truncate|drop|alter|create)\b/);
    expect(BODY.match(/\binsert into\b/g)).toHaveLength(1);
    expect(BODY).not.toMatch(/raise (notice|log|info|warning|debug)/);
  });
});

describe("0011 — 누구를 세나 · 기간", () => {
  it(`통계 목적에 동의한 사람만(동의 판 ${USAGE_CONSENT_FROM} 이상) — 판의 시작은 화면(USAGE_CONSENT_FROM)과 같다`, () => {
    expect(USAGE_CONSENT_FROM).toBe("web-2026-11-06");
    expect(BODY).toContain(`stats_consent_from constant text := '${USAGE_CONSENT_FROM}';`);
    // 판 이름이 박힌 곳은 그 한 줄뿐이다 — 조건마다 따로 적으면 한쪽만 바뀔 수 있다
    expect(BODY.match(/'web-\d{4}-\d{2}-\d{2}/g)).toHaveLength(1);
  });

  it("계정 수(totals)와 건강 기록 집계가 같은 조건이다 — 같은 판 기준, 관리자 계정은 빼고, 이 표를 읽는 곳은 이 둘뿐이다", () => {
    const who = `where s.consent_version collate "c" >= stats_consent_from and not exists (select 1 from public.admins a where a.user_id = s.user_id)`;
    expect(BODY.split(who)).toHaveLength(3);
    expect(BODY.match(/from public\.user_states s/g)).toHaveLength(2);
    expect(BODY.match(/public\.user_states/g)).toHaveLength(2);
    // 첫째는 계정 수(k를 재는 수)이고 건강 기록을 여는 문보다 앞이다, 둘째는 그 문 안이다
    const gate = BODY.indexOf("if consented >= k_min then");
    expect(BODY.indexOf(who)).toBeLessThan(gate);
    expect(BODY.indexOf("into consented, active from public.user_states s where s.consent_version")).toBeGreaterThan(0);
    expect(BODY.lastIndexOf(who)).toBeGreaterThan(gate);
    expect(BODY.lastIndexOf(who)).toBeLessThan(BODY.indexOf("raw_events as ("));
  });

  it("판이 있기만 한 사람(옛 판)을 세는 옛 조건이 남아 있지 않다 — 판이 없는 행은 비교가 null이라 빠진다", () => {
    expect(BODY).not.toContain("consent_version is not null");
    expect(BODY.match(/consent_version/g)).toHaveLength(2);
  });

  it("글자 비교로 판의 순서가 맞다 — 옛 판은 앞, 그 판과 이후 판은 뒤(collate \"C\"와 같은 코드 포인트 순서로 확인)", () => {
    const counted = (version: string) => version >= USAGE_CONSENT_FROM;
    for (const old of ["web-2026-09-28", "web-2026-09-28.2", "web-2026-11-05", "web-2025-12-31"]) expect(counted(old), old).toBe(false);
    for (const now of [USAGE_CONSENT_FROM, "web-2026-11-06.2", "web-2026-11-07", "web-2026-12-01", "web-2027-01-01"]) expect(counted(now), now).toBe(true);
  });

  it("접근 기록의 사람 수도 같은 사람들이다 — 이 조건으로 센 수", () => {
    expect(auditInserts(FN.body)[0].values).toContain("consented");
    expect(BODY).toContain("'totals', jsonb_build_object('consented_users', consented, 'active_users', active)");
    expect(BODY).toContain("'suppressed', consented < k_min");
  });

  it(`기간은 화면과 같은 규칙으로 ${USAGE_DAYS_MIN}~${USAGE_DAYS_MAX}일(없으면 ${USAGE_DEFAULT_DAYS}일), 단추의 기간이 모두 그 안이다`, () => {
    expect(BODY).toContain(`window_days integer := least(greatest(coalesce(p_days, ${USAGE_DEFAULT_DAYS}), ${USAGE_DAYS_MIN}), ${USAGE_DAYS_MAX});`);
    for (const days of USAGE_PERIODS) {
      expect(days).toBeGreaterThanOrEqual(USAGE_DAYS_MIN);
      expect(days).toBeLessThanOrEqual(USAGE_DAYS_MAX);
    }
  });

  it("한국 날짜 — 오늘 포함 기간, 날마다 한 줄(기록이 없는 날 포함)", () => {
    expect(BODY).toContain("seoul_today date := (now() at time zone 'asia/seoul')::date;");
    expect(BODY).toContain("first_day := seoul_today - (window_days - 1);");
    expect(BODY).toContain("from (select first_day + g.i as day from generate_series(0, window_days - 1) as g(i)) d left join period_events pe on pe.day = d.day");
    expect(BODY).toContain("where p.day between first_day and seoul_today");
  });

  it("기간 중 활성은 서버 수정 시각(updated_at)으로 센다 — 건강 기록을 열지 않는다", () => {
    expect(BODY).toContain("count(*) filter (where s.updated_at >= (first_day::timestamp at time zone 'asia/seoul'))");
  });
});

describe(`0011 — 숨김(k = ${USAGE_K})`, () => {
  it(`k는 화면(USAGE_K = ${USAGE_K})과 같고, 결과에도 싣는다`, () => {
    expect(USAGE_K).toBe(5);
    expect(BODY).toContain(`k_min constant integer := ${USAGE_K};`);
    expect(BODY).toContain("'k', k_min");
    // 사람 수를 k_min 대신 숫자와 견주는 곳이 없다(기준이 한 곳에만 있다)
    expect(BODY).not.toMatch(/(?:_u|_users|\.u|\.users|consented) (?:<|<=|>|>=) \d/);
  });

  it("규칙 C — 동의한 사람이 5명 미만이면 표시를 켜고 모든 칸을 null로, 건강 기록(state)은 열지도 않는다", () => {
    expect(BODY).toContain("'suppressed', consented < k_min");
    expect(BODY).toContain("'daily', null, 'adoption', null, 'return_rate', null, 'distributions', null");
    const gate = BODY.indexOf("if consented >= k_min then");
    expect(gate).toBeGreaterThan(0);
    // state를 읽는 곳은 한 곳뿐이고 그 문 안이다
    const reads = [...BODY.matchAll(/\.state\b/g)].map((m) => m.index);
    expect(reads).toHaveLength(1);
    expect(reads[0]).toBeGreaterThan(gate);
    expect(reads[0]).toBeLessThan(BODY.indexOf("result := result || stats;"));
    // 계정 수는 그 문 밖에서 — 동의 칸·수정 시각만 본다
    expect(BODY.slice(0, gate)).not.toMatch(/\bstate\b/);
  });

  it.each([
    ["symptom_records", "d.symptom_u", "d.symptom_n"],
    ["mood_answers", "d.mood_u", "d.mood_n"],
    ["journal_posts", "d.journal_u", "d.journal_n"],
  ])("규칙 A — 날짜별 %s: 기여한 사람 0명이면 0, 5명 미만이면 null", (key, users, records) => {
    expect(BODY).toContain(`'${key}', case when ${users} = 0 then 0 when ${users} < k_min then null else ${records} end`);
  });

  it.each([
    ["symptom_records", "a.symptom_users"],
    ["mood_answers", "a.mood_users"],
    ["journal_posts", "a.journal_users"],
    ["recording_users", "a.recording_users"],
    ["returning_users", "a.returning_users"],
  ])("규칙 A — 기능별 이용·재방문 %s: 0명이면 0, 5명 미만이면 null", (key, users) => {
    expect(BODY).toContain(`'${key}', case when ${users} = 0 then 0 when ${users} < k_min then null else ${users} end`);
  });

  it("규칙 A의 수는 서로 다른 사람으로 센다 — 재방문은 서로 다른 날 2일 이상", () => {
    for (const kind of ["symptom", "mood", "journal"]) expect(BODY).toContain(`count(distinct pe.user_id) filter (where pe.kind = '${kind}') as ${kind}_u`);
    expect(BODY).toContain("count(distinct pe.day) as active_days");
    expect(BODY).toContain("count(*) filter (where pu.active_days >= 2) as returning_users");
    expect(BODY).toContain("from period_events pe group by pe.user_id");
  });

  it("규칙 B ① — 칸에 든 서로 다른 사람이 5명 미만이면(0명 포함) 숨긴다", () => {
    expect(BODY).toContain("count(i.user_id) as n, count(distinct i.user_id) as u");
    expect(BODY).toContain("left join dist_items i on i.dist = k.dist and i.bucket = k.bucket"); // 빈 칸도 한 줄 — 0명도 숨긴다
    expect(BODY).toContain("bit_or(case when b.u < k_min then 1 << (b.bucket - 1) else 0 end) as mask");
  });

  it("규칙 B ② — 뺄셈으로 되살리지 못하게, 지킬 칸이 숨겨졌고 숨긴 칸이 하나뿐이거나 합쳐 5명 미만이면 가장 작은 칸을 하나 더 숨긴다", () => {
    expect(BODY).toContain("where f.real_hidden_n > 0 and (f.hidden_n = 1 or h.users < k_min) and (f.mask & (1 << (b.bucket - 1))) = 0");
    // 답이 비어 있다는 칸(unknown)만 숨겨졌을 때는 더 숨기지 않는다 — 다른 칸은 늘 지킨다
    expect(BODY).toContain("count(*) filter (where b.u < k_min and b.key <> 'unknown') as real_hidden_n");
    expect(RAW).toMatch(/예외: 답이 비어 있다는 칸\(unknown/);
    expect(BODY).toContain("order by b.dist, b.n, b.bucket desc");
    // 숨긴 칸들의 사람 수는 칸마다 더하지 않고 서로 다른 사람으로 센다(기록 분포는 한 사람이 여러 칸에 든다)
    expect(BODY).toContain("left join user_masks m on m.dist = f.dist and (m.mask & f.mask) <> 0");
    expect(BODY).toContain("f.mask | coalesce(x.mask, 0) as mask");
  });

  it("규칙 B — 결과의 칸 값은 숨김을 거친 것뿐이고, 모든 칸이 숨겨지면 분포 전체가 null", () => {
    expect(BODY).toContain("jsonb_object_agg(b.key, case when (fh.mask & (1 << (b.bucket - 1))) <> 0 then null else b.n end)");
    expect(BODY).toContain("case when fh.mask = fh.all_mask then null else jsonb_build_object(");
    expect(BODY).toContain("(1 << (count(*)::integer)) - 1 as all_mask");
  });
});

describe("0011 — 사람별 값·자유 글 없음", () => {
  const calls = buildObjectCalls(BODY);

  it("결과의 칸 이름은 정해진 것뿐이다", () => {
    const keys = new Set(calls.flatMap((args) => args.filter((_, i) => i % 2 === 0)));
    expect([...keys].sort()).toEqual(
      [
        "'active_users'",
        "'adoption'",
        "'consented_users'",
        "'counts'",
        "'daily'",
        "'day'",
        "'days'",
        "'distributions'",
        "'from'",
        "'generated_at'",
        "'journal_posts'",
        "'k'",
        "'mood_answers'",
        "'period'",
        "'recording_users'",
        "'return_rate'",
        "'returning_users'",
        "'suppressed'",
        "'symptom_records'",
        "'to'",
        "'total'",
        "'totals'",
      ].sort(),
    );
  });

  it("결과를 만드는 문장에 사람을 가리키는 칸이 없다 — 계정 ID를 내보내거나 사람별로 묶어 내보내는 함수도 없다", () => {
    for (const args of calls) for (const a of args) expect(a).not.toMatch(/user_id|\bb\.user|auth\.uid|delivered|delivery_date/);
    const output = BODY.slice(BODY.lastIndexOf("select jsonb_build_object("), BODY.indexOf("into stats;"));
    expect(output.length).toBeGreaterThan(200);
    expect(output).not.toContain("user_id");
    // 사람별 CTE를 결과가 바로 읽지 않는다 — 집계된 daily·activity·dist_json만
    for (const source of output.matchAll(/\bfrom (\w+) \w+/g)) expect(["daily", "activity", "dist_json"], source[1]).toContain(source[1]);
    expect(BODY).not.toMatch(/\b(array_agg|to_jsonb|row_to_json|json_agg|string_agg)\b/);
    expect(BODY.match(/\bjsonb_agg\(/g)).toHaveLength(1);
    expect(BODY.match(/\bjsonb_object_agg\(/g)).toHaveLength(2);
  });

  it("상태 JSON에서 읽는 칸은 정해진 것뿐이다 — 기록장 제목·본문·댓글·이름·내 동네·체중·산모수첩은 읽지 않는다", () => {
    const fields = new Set([...CODE.matchAll(/->>?\s*'(\w+)'/g)].map((m) => m[1]));
    expect([...fields].sort()).toEqual(
      ["answer", "communityposts", "date", "deliverydate", "deliverymethod", "goal", "moodchecks", "profile", "redflagcode", "symptomhistory"].sort(),
    );
    for (const secret of ["title", "body", "comments", "authorname", "neighborhood", "weight", "maternity", "painnrs", "ownerAccountID"]) {
      expect(CODE, secret).not.toContain(`'${secret.toLowerCase()}'`);
    }
  });

  it("계정 표·이메일·전화·닉네임·요청 헤더를 읽지 않는다", () => {
    for (const word of ["auth.users", "auth.identities", "email", "phone", "raw_user_meta_data", "identity_data", "request.headers"]) expect(CODE, word).not.toContain(word);
  });
});

describe("0011 — 병원 안내는 코드 목록이 아니라 남은 결과로 센다", () => {
  it("기록의 결과(redFlagCode)가 비어 있지 않은 글자이면 센다", () => {
    expect(BODY).toContain("coalesce(jsonb_typeof(e.item -> 'redflagcode') = 'string' and (e.item ->> 'redflagcode') <> '', false) as red_flag");
    expect(BODY).toContain("select 'red_flag'::text, pe.user_id, case when pe.red_flag then 1 else 2 end from period_events pe where pe.kind = 'symptom'");
  });

  it("오늘의 코드 이름을 파일 어디에도 적지 않는다 — 규칙이 새 경고 신호를 더해도 고치지 않아도 된다", () => {
    expect(RED_FLAG_CODES.length).toBeGreaterThan(0);
    for (const code of RED_FLAG_CODES) expect(RAW, code).not.toContain(code);
    expect(CODE).not.toContain("rulesversion");
  });
});

describe("0011 — 손상된 JSON 한 사람 때문에 실패하지 않는다", () => {
  it("배열이 아니면 빈 배열, 객체가 아닌 원소는 건너뛴다", () => {
    for (const field of ["symptomhistory", "moodchecks", "communityposts"]) expect(BODY, field).toContain(`jsonb_typeof(x.doc -> '${field}') = 'array'`);
    expect(BODY).toContain("jsonb_array_elements(b.symptoms) as e(item) where jsonb_typeof(e.item) = 'object'");
    expect(BODY).toContain("jsonb_array_elements(b.moods) as e(item) where jsonb_typeof(e.item) = 'object'");
    expect(BODY).toContain("jsonb_array_elements(x.doc -> 'communityposts') as p(item) where jsonb_typeof(p.item) = 'object'");
    // 기록장 글에서는 시각만 꺼낸다
    expect(BODY).toContain("select p.item ->> 'date' from jsonb_array_elements");
  });

  it("시각은 앞 10자가 실제 날짜 목록에 있을 때만, timestamptz로 바꾸는 곳은 시각 모양을 본 뒤 한 곳뿐이다", () => {
    expect(BODY).toContain("to_char(first_day + g.i, 'yyyy-mm-dd') as ymd from generate_series(-1, window_days) as g(i)");
    expect(BODY).toContain("w on w.ymd = left(r.at_text, 10)");
    expect(BODY.match(/::timestamptz/g)).toHaveLength(1);
    expect(BODY.indexOf("substr(r.at_text, 11) ~ '")).toBeLessThan(BODY.indexOf("r.at_text::timestamptz"));
    // 날짜로 바꾸는 계산은 기록마다 한 번 — 바깥 where가 안으로 밀려 들어가 두 번 돌지 않게(5천 명에서 8초를 넘겼다)
    expect(BODY).toContain("end as day offset 0 ) p");
    expect(BODY).toContain("cross join lateral (select s.state || '{}'::jsonb as doc offset 0) x");
  });

  it("시각 모양 — 고른 것만 timestamptz로 넘어간다(시·분·초·시간대 범위 밖은 넘기지 않는다)", () => {
    const pattern = /substr\(r\.at_text, 11\) ~ '([^']+)'/.exec(STRIPPED)?.[1];
    expect(pattern).toBeDefined();
    const shape = new RegExp(pattern!);
    for (const ok of ["T05:05:00.000Z", "T05:05:00Z", "T05:05Z", "T23:59:59.123456+09:00", "T00:00:00-05:00"]) expect(shape.test(ok), ok).toBe(true);
    for (const bad of ["T24:00:00Z", "T05:60:00Z", "T05:05:60Z", "T05:05:00", "T05:05:00+15:00", "05:05:00Z", "T05:05:00.0000000Z", "T05:05:00Z; drop"]) {
      expect(shape.test(bad), bad).toBe(false);
    }
  });

  it("웹이 쓰는 모양의 빠른 길 — UTC 15시부터 한국 날짜가 하루 뒤다(한국 시각과 비교)", () => {
    expect(BODY).toContain("when length(r.at_text) = 24 and substr(r.at_text, 11, 1) = 't' and right(r.at_text, 1) = 'z'");
    expect(BODY).toContain("then w.d + case when substr(r.at_text, 12, 2) >= '15' then 1 else 0 end");
    const seoulDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });
    for (const utcDay of ["2026-11-03", "2026-12-31", "2028-02-28", "2028-02-29"]) {
      for (let hour = 0; hour < 24; hour++) {
        const iso = `${utcDay}T${String(hour).padStart(2, "0")}:30:00.000Z`;
        const d = new Date(iso);
        const fast = new Date(`${utcDay}T00:00:00Z`);
        fast.setUTCDate(fast.getUTCDate() + (hour >= 15 ? 1 : 0));
        expect(iso.length).toBe(24);
        expect(fast.toISOString().slice(0, 10), iso).toBe(seoulDay.format(d));
      }
    }
  });

  it("출산일 — 모양과 그 달의 날 수를 본 뒤에만 날짜로 바꾼다(2026-02-31은 실패하지 않고 출산일 없음)", () => {
    const pattern = /b\.delivery_date !~ '([^']+)'/.exec(STRIPPED)?.[1];
    expect(pattern).toBeDefined();
    const shape = new RegExp(pattern!);
    for (const ok of ["2026-11-04", "2026-02-31"]) expect(shape.test(ok), ok).toBe(true);
    for (const bad of ["2026-13-01", "2026-00-10", "2026-11-32", "26-11-04", "2026-11-04T00:00:00Z", ""]) expect(shape.test(bad), bad).toBe(false);
    const parse = BODY.slice(BODY.indexOf("when b.delivery_date is null"), BODY.indexOf("end as delivered"));
    expect(parse.indexOf("!~")).toBeLessThan(parse.indexOf("make_date("));
    expect(parse.indexOf("make_date(")).toBeLessThan(parse.indexOf("b.delivery_date::date"));
    expect(parse).toContain("interval '1 month - 1 day'");
  });
});

describe("0011 — 화면(adminModel)과 같은 칸", () => {
  /** dist_keys의 값 — 분포 → 칸 이름(번호 순) */
  const distKeys = new Map<string, string[]>();
  for (const m of BODY.matchAll(/\('(\w+)', (\d+), '(\w+)'\)/g)) {
    const buckets = distKeys.get(m[1]) ?? [];
    expect(Number(m[2]), m[0]).toBe(buckets.length + 1);
    distKeys.set(m[1], [...buckets, m[3]]);
  }

  it("분포 이름·칸·칸 순서가 USAGE_DISTRIBUTIONS와 같다", () => {
    expect(Object.fromEntries(distKeys)).toEqual(
      Object.fromEntries(Object.values(USAGE_DISTRIBUTIONS).map((spec) => [spec.field, [...spec.buckets]])),
    );
  });

  it("칸 번호 — 분만 방식·목표·기분 답·병원 안내가 칸 이름과 같은 순서로 나뉜다", () => {
    expect(BODY).toContain("case b.delivery_method when 'vaginal' then 1 when 'cesarean' then 2 else 3 end");
    expect(BODY).toContain("case b.goal when 'homemaker' then 1 when 'returningtowork' then 2 else 3 end");
    expect(BODY).toContain("case pe.answer when 'yes' then 1 when 'unsure' then 2 else 3 end");
  });

  it("기분 답 — 앱과 같은 세 값, 모르는 값은 앱처럼 글쎄요(unsure)로 센다", () => {
    expect([...MOOD_ANSWERS]).toEqual(["yes", "unsure", "no"]);
    expect(BODY).toContain("case when (e.item ->> 'answer') in ('yes', 'unsure', 'no') then e.item ->> 'answer' else 'unsure' end");
  });

  it("산후 주차 — 앱의 주차 계산(일수 ÷ 7)과 같은 경계, 출산일이 없거나 미래면 칸 5(unknown)", () => {
    expect(BODY).toContain("when dd.delivered is null or dd.delivered > seoul_today + 1 then 5");
    expect(BODY).toContain("when greatest(seoul_today - dd.delivered, 0) / 7 <= 1 then 1");
    expect(BODY).toContain("when (seoul_today - dd.delivered) / 7 <= 5 then 2");
    expect(BODY).toContain("when (seoul_today - dd.delivered) / 7 <= 11 then 3 else 4 end");
    expect([13, 14, 41, 42, 83, 84].map(weekFromDayCount)).toEqual([1, 2, 5, 6, 11, 12]);
  });

  it("머리말이 규칙을 적어 둔다 — 5명 미만·관리자 제외·남는 위험", () => {
    for (const phrase of ["5명 미만", "관리자 계정(public.admins)은 뺀다", "남는 위험", "k-익명성", "통계 목적에 동의한 사람"]) expect(RAW, phrase).toContain(phrase);
  });
});
