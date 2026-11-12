#!/usr/bin/env node
// AI를 켠 뒤 첫 주 매일 보기(D20) — 내 컴퓨터에서, 읽기만(바꾸는 요청은 하지 않는다). 사용자 수·오류·사용량을 **개수로만** 본다.
//   node scripts/ops/daily.mjs              (SUPABASE_ACCESS_TOKEN이 이 터미널의 환경 변수에 있어야 한다 — docs/dev/RUNBOOK.md "명령")
//   node scripts/ops/daily.mjs --ledger     (docs/private/ACCESS_LEDGER.md가 있으면 이 조회를 한 줄 덧붙인다 — 접근 대장 규칙)
// 보여 주는 것(모두 지난 24시간 기준, 계정 수는 지금 값)
//   1) 계정·동의 — 읽기 전용 DB 사용자(supabase_read_only_user)로 SELECT 한 문장(dailyUsageSql). 개수만 받는다.
//      건강 기록(user_states.state)·이메일·닉네임·계정 id는 묻지 않는다. 관리자 계정도 개수에 들어간다.
//   2) 함수 로그 — Management API 로그 조회(/analytics/endpoints/logs, 한 번에 24시간까지). 함수·상태·코드별 개수, AI 토큰 합계.
//      함수 로그에는 질문·답·사용자 id가 없다(함수가 남기지 않음 — 2026-11-08 D21 운영 로그로 확인).
//   3) API 게이트웨이 — 상태 코드 묶음별 개수와 5xx가 난 경로. 경로는 서버에서 묶어 받고, 혹시 섞인 UUID는 지운다(주소 쿼리는 받지 않는다).
// 종료 코드: 확인할 것이 없으면 0, 있으면 1, 실행하지 못했으면(토큰 없음 등) 2.
// 토큰은 환경 변수로만 읽는다(파일을 읽지 않는다). 출력에 싣지 않는다.

import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  apiFailure,
  createManagementApi,
  formatKst,
  managementApiBase,
  OpsError,
  readAccessToken,
  readProjectRef,
  redact,
} from "./lib.mjs";

const LEDGER = fileURLToPath(new URL("../../docs/private/ACCESS_LEDGER.md", import.meta.url));

/** 함수 로그를 한 번에 받는 최대 줄 수 — 넘으면 "일부만"으로 표시한다 */
export const LOG_ROW_LIMIT = 1000;

/** 함수 로그에서 "확인할 것"으로 셀 코드(AI가 답을 만들지 못한 실패·서버 쪽 문제) — chat/handler.ts·_shared/chat.ts의 코드 */
export const ALERT_CODES = new Set([
  "internal",
  "auth_unavailable",
  "llm_rejected",
  "llm_model_unavailable",
  "llm_unavailable",
  "llm_error",
  "timeout",
  "truncated",
  "upstream_timeout",
  "upstream_unreachable",
  "upstream_error",
  "upstream_bad_response",
]);

/**
 * 계정·동의·AI 사용 개수 — SELECT 한 문장, 결과는 json 한 칸(daily_usage). 사람별 값은 없다(개수와 동의 판별 개수뿐).
 * auth.users는 is_anonymous·created_at·last_sign_in_at만, user_states는 consent_version·updated_at만 본다(state 칸은 읽지 않는다).
 */
export function dailyUsageSql() {
  return `select json_build_object(
  'users_total', (select count(*) from auth.users),
  'users_guest', (select count(*) from auth.users where coalesce(is_anonymous, false)),
  'users_new_24h', (select count(*) from auth.users where created_at > now() - interval '24 hours'),
  'users_signin_24h', (select count(*) from auth.users where last_sign_in_at > now() - interval '24 hours'),
  'states_total', (select count(*) from public.user_states),
  'states_updated_24h', (select count(*) from public.user_states where updated_at > now() - interval '24 hours'),
  'consent_versions', (select coalesce(json_object_agg(v, n), '{}'::json) from (select coalesce(consent_version, '(none)') as v, count(*) as n from public.user_states group by 1) t),
  'ai_consents', (select count(*) from public.ai_consents),
  'ai_calls_24h', (select count(*) from public.llm_usage where created_at > now() - interval '24 hours'),
  'ai_users_24h', (select count(distinct user_id) from public.llm_usage where created_at > now() - interval '24 hours'),
  'admin_views_24h', (select count(*) from public.admin_audit where at > now() - interval '24 hours')
) as daily_usage`;
}

/** 함수 로그 — 함수가 남긴 JSON 한 줄(event_message)만 받는다 */
export function functionLogsSql(limit = LOG_ROW_LIMIT) {
  return `select event_message from logs where source = 'function_logs' order by timestamp desc limit ${limit}`;
}

/** API 게이트웨이 — 상태 코드·경로별 개수를 서버에서 묶어 받는다(주소 쿼리·IP·토큰 정보는 받지 않는다) */
export function gatewaySql() {
  return `select toInt32OrZero(log_attributes['response.status_code']) as status, log_attributes['request.path'] as path, count(*) as n from logs where source = 'edge_logs' group by status, path order by n desc limit ${LOG_ROW_LIMIT}`;
}

/** 읽기 전용 SQL 결과에서 daily_usage 객체를 찾는다(행 배열·문자열 JSON 모두). 못 찾으면 null. */
export function findDailyUsage(value, depth = 0) {
  if (depth > 4 || value === null || value === undefined) return null;
  if (typeof value === "string") {
    try {
      return findDailyUsage(JSON.parse(value), depth + 1);
    } catch {
      return null;
    }
  }
  if (Array.isArray(value)) {
    for (const v of value) {
      const found = findDailyUsage(v, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    if (typeof value.users_total === "number" || typeof value.users_total === "string") return value;
    if ("daily_usage" in value) return findDailyUsage(value.daily_usage, depth + 1);
  }
  return null;
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * 함수 로그 줄(event_message 글자들)을 묶는다.
 * 반환: { counts: Map<"fn status code", n>, requests, inputTokens, outputTokens, fallback, refunded, startupErrors, skipped, alerts: string[] }
 * JSON이 아닌 줄(booted·shutdown 같은 플랫폼 줄)은 skipped로만 센다 — 내용을 싣지 않는다.
 */
export function summarizeFunctionLogs(messages) {
  const counts = new Map();
  let requests = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let fallback = 0;
  let refunded = 0;
  let startupErrors = 0;
  let skipped = 0;
  const alerts = [];
  for (const raw of messages) {
    let entry;
    try {
      entry = JSON.parse(String(raw ?? "").trim());
    } catch {
      skipped += 1;
      continue;
    }
    if (entry === null || typeof entry !== "object" || typeof entry.fn !== "string") {
      skipped += 1;
      continue;
    }
    const fn = entry.fn.slice(0, 40);
    if (typeof entry.startup === "string") {
      if (entry.startup !== "ok") {
        startupErrors += 1;
        alerts.push(`${fn} 시작 오류 ${String(entry.startup).slice(0, 40)}`);
      }
      continue;
    }
    if (typeof entry.status !== "number") {
      skipped += 1;
      continue;
    }
    requests += 1;
    const code = typeof entry.code === "string" ? entry.code.slice(0, 40) : "";
    const key = `${fn} ${entry.status}${code ? ` ${code}` : ""}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (Number.isFinite(entry.input_tokens)) inputTokens += entry.input_tokens;
    if (Number.isFinite(entry.output_tokens)) outputTokens += entry.output_tokens;
    if (entry.fallback === true) fallback += 1;
    if (entry.refunded === true) refunded += 1;
    if (entry.status >= 500 || ALERT_CODES.has(code)) alerts.push(key);
  }
  return { counts, requests, inputTokens, outputTokens, fallback, refunded, startupErrors, skipped, alerts: [...new Set(alerts)] };
}

/**
 * 게이트웨이 묶음 행({status, path, n})을 상태 코드 묶음(2xx·3xx·4xx·5xx)별 개수와 5xx 경로로 줄인다.
 * 경로에 UUID가 섞여 있으면 <id>로 바꾼다(계정 id가 경로에 들어가는 요청은 없지만 혹시를 대비).
 */
export function summarizeGateway(rows) {
  const classes = { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0, other: 0 };
  const errors = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    const status = Number(r?.status);
    const n = Number(r?.n) || 0;
    const cls = status >= 200 && status < 600 ? `${Math.floor(status / 100)}xx` : "other";
    classes[cls in classes ? cls : "other"] += n;
    if (status >= 500) {
      const path = String(r?.path ?? "").replace(UUID_RE, "<id>").split("?")[0].slice(0, 80) || "(경로 없음)";
      const key = `${status} ${path}`;
      errors.set(key, (errors.get(key) ?? 0) + n);
    }
  }
  return { classes, errors };
}

/** 접근 대장 한 줄 — 기록 표의 마지막 줄 뒤(다음 "## " 제목 앞)에 넣는다. 표를 못 찾으면 끝에 붙인다. */
export function insertLedgerRow(text, row) {
  const lines = text.split("\n");
  const head = lines.findIndex((l) => l.startsWith("| 일시"));
  if (head === -1) return `${text.replace(/\n*$/, "\n")}${row}\n`;
  let last = head + 1;
  for (let i = head + 2; i < lines.length && lines[i].startsWith("|"); i += 1) last = i;
  lines.splice(last + 1, 0, row);
  return lines.join("\n");
}

export function ledgerRow(now = new Date()) {
  const when = formatKst(now).replace(" KST", "");
  return `| ${when} | 개발(Claude Code, 대표 요청 — D20 첫 주 매일 보기) | Management API(액세스 토큰) — 읽기 전용 SQL·로그 조회(\`scripts/ops/daily.mjs\`) | AI를 켠 뒤 사용자 수·오류·사용량 확인 | 계정·서버 저장 행·동의 판·AI 동의·AI 호출의 개수, 함수 로그의 상태·코드별 개수, API 게이트웨이의 상태별 개수. 이메일·닉네임·계정 id·건강 기록은 받지 않음 | 없음 | 없음 |`;
}

async function main() {
  const token = readAccessToken();
  if (token === null) {
    throw new OpsError(
      "SUPABASE_ACCESS_TOKEN 환경 변수가 없습니다 — Supabase Account → Access Tokens의 토큰을 이 터미널에만 넣고 다시 실행하세요(docs/dev/RUNBOOK.md \"명령\").",
    );
  }
  const writeLedger = process.argv.includes("--ledger");
  const ref = readProjectRef();
  const api = createManagementApi({ token, ref, base: managementApiBase() });
  const say = (line = "") => console.log(redact(line, [token]));
  const issues = [];
  const end = new Date();
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);

  const [usage, fnLogs, gateway] = await Promise.all([
    api.readOnlyQuery(dailyUsageSql()),
    api.logs(functionLogsSql(), start, end),
    api.logs(gatewaySql(), start, end),
  ]);

  say(`온맘 매일 보기 — ${formatKst(start)} ~ ${formatKst(end)}`);

  say("");
  say("[1] 계정·동의·AI 사용(개수만, 관리자 포함)");
  const u = usage.status !== null && usage.status >= 200 && usage.status < 300 ? findDailyUsage(usage.json) : null;
  if (u === null) {
    const message = typeof usage.json?.message === "string" ? `: ${usage.json.message.slice(0, 200)}` : "";
    say(`  읽지 못함 — ${apiFailure(usage)}${message}`);
    issues.push("계정 개수");
  } else {
    const n = (v) => Number(v ?? 0);
    say(`  계정 ${n(u.users_total)}명(카카오 ${n(u.users_total) - n(u.users_guest)} · 게스트 ${n(u.users_guest)}) · 새 계정 ${n(u.users_new_24h)} · 로그인 ${n(u.users_signin_24h)}`);
    const versions = u.consent_versions && typeof u.consent_versions === "object" ? u.consent_versions : {};
    const versionText = Object.entries(versions)
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([v, c]) => `${v} ${c}`)
      .join(" · ");
    say(`  서버 저장 ${n(u.states_total)}행 · 바뀐 행 ${n(u.states_updated_24h)} · 동의 판: ${versionText || "없음"}`);
    say(`  AI 동의 ${n(u.ai_consents)}명 · AI 호출 ${n(u.ai_calls_24h)}번(${n(u.ai_users_24h)}명) · 관리자 화면 조회 기록 ${n(u.admin_views_24h)}건`);
  }

  say("");
  say("[2] 함수 로그(상태·코드별 개수)");
  const fnRows = Array.isArray(fnLogs.json?.result) ? fnLogs.json.result : null;
  if (fnLogs.status !== 200 || fnRows === null) {
    const message = typeof fnLogs.json?.error === "string" ? `: ${fnLogs.json.error.slice(0, 200)}` : "";
    say(`  읽지 못함 — ${apiFailure(fnLogs)}${message}`);
    issues.push("함수 로그");
  } else {
    const s = summarizeFunctionLogs(fnRows.map((r) => r?.event_message));
    if (s.counts.size === 0) say("  요청 없음");
    for (const [key, count] of [...s.counts.entries()].sort((a, b) => b[1] - a[1])) say(`  ${key} — ${count}`);
    say(`  AI 토큰 입력 ${s.inputTokens.toLocaleString("en-US")} · 출력 ${s.outputTokens.toLocaleString("en-US")} · 대체 모델 ${s.fallback}번 · 한도 돌려줌 ${s.refunded}번`);
    if (fnRows.length >= LOG_ROW_LIMIT) say(`  (로그가 ${LOG_ROW_LIMIT}줄을 넘어 최근 것만 셌습니다)`);
    for (const a of s.alerts) issues.push(`함수 ${a}`);
  }

  say("");
  say("[3] API 게이트웨이(상태 코드 묶음별 개수)");
  const gwRows = Array.isArray(gateway.json?.result) ? gateway.json.result : null;
  if (gateway.status !== 200 || gwRows === null) {
    const message = typeof gateway.json?.error === "string" ? `: ${gateway.json.error.slice(0, 200)}` : "";
    say(`  읽지 못함 — ${apiFailure(gateway)}${message}`);
    issues.push("게이트웨이 로그");
  } else {
    const g = summarizeGateway(gwRows);
    say(`  2xx ${g.classes["2xx"]} · 3xx ${g.classes["3xx"]} · 4xx ${g.classes["4xx"]} · 5xx ${g.classes["5xx"]}`);
    for (const [key, count] of g.errors) {
      say(`  5xx ${key} — ${count}`);
      issues.push(`게이트웨이 ${key}`);
    }
  }

  if (writeLedger) {
    if (existsSync(LEDGER)) {
      writeFileSync(LEDGER, insertLedgerRow(readFileSync(LEDGER, "utf8"), ledgerRow(end)), "utf8");
      say("");
      say("접근 대장에 한 줄 적었습니다(docs/private/ACCESS_LEDGER.md).");
    } else {
      say("");
      say("접근 대장 파일이 없어 적지 못했습니다 — 손으로 적어 주세요.");
    }
  }

  say("");
  if (issues.length === 0) say("확인할 것 없음.");
  else say(`확인할 것 ${issues.length}개: ${issues.join(", ")} — docs/dev/RUNBOOK.md`);
  process.exitCode = issues.length === 0 ? 0 : 1;
}

function isMain() {
  try {
    return process.argv[1] !== undefined && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isMain()) {
  try {
    await main();
  } catch (e) {
    console.error(redact(e instanceof OpsError ? e.message : `실행하지 못했습니다: ${e?.message ?? e}`, [readAccessToken()]));
    process.exitCode = 2;
  }
}
