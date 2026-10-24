#!/usr/bin/env node
// 매일 운영 점검 — .github/workflows/health-check.yml이 매일 09:15 KST에 돌린다. 내 컴퓨터에서도 같은 점검을 돌릴 수 있다:
//   node scripts/ops/health-check.mjs        → 공개 사이트·Edge Function 응답·npm audit (토큰이 없으면 Supabase 항목은 건너뜀)
//   SUPABASE_ACCESS_TOKEN이 있으면            → 프로젝트 상태·DB 항목까지(DB 항목은 Supabase CLI가 PATH에 있어야 한다)
//
// 점검(모두 읽기만 — 운영 DB·함수·설정을 바꾸지 않는다. 사용자 데이터는 읽지 않는다):
//   사이트    SITE_URL(기본 https://5seoyoung.github.io/onmom_web/)과 login/·robots.txt가 200, 로그인 화면의 CSP 메타가 정확히 1개이고
//             script-src에 'unsafe-inline'·'unsafe-eval'이 없음(HTML 엔티티를 풀어서 본다 — src/csp.ts·scripts/csp-hash.mjs)
//   Supabase  Management API GET /v1/projects/{ref}의 status가 ACTIVE_HEALTHY(일시 중지면 "Free plan paused — restore in dashboard")
//   함수      videos·chat에 사이트 주소(Origin)로 사전 요청(OPTIONS)만 → 2xx + Access-Control-Allow-Origin(로그인·AI 호출 없음)
//   DB        Supabase CLI(supabase.yml과 같은 연결 방식: supabase link → db query --linked)로 SELECT 한 문장(lib.mjs cronHealthSql) —
//             pg_cron 실패 0, 예약 4개가 기대 주기 안에 돌았음, pg_net 응답에 5xx 0. 개수·예약 이름·시각만 받는다.
//   의존성    npm audit --omit=dev — 높음(high)·치명(critical) 0 (package-lock.json만 읽는다, 설치 불필요)
// 결과: 모든 항목을 다 돌린 뒤 표(한국어)를 GITHUB_STEP_SUMMARY에 쓰고(없으면 화면에만), 하나라도 실패면 종료 코드 1 → GitHub이 메일을 보낸다.
//   CI(GITHUB_ACTIONS=true)에서는 토큰·CLI가 없어도 실패로 센다(점검이 조용히 빠지지 않게). 내 컴퓨터에서는 건너뜀으로 둔다.
// 비밀값: 환경 변수 SUPABASE_ACCESS_TOKEN만 읽는다. Management API 헤더와 CLI 환경으로만 넘기고 찍지 않는다(CLI 출력은 가린 뒤
//   마지막 줄만 싣는다). npm에는 넘기지 않는다.

import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  apiFailure,
  createManagementApi,
  cronCheckNames,
  cronHealthSql,
  evaluateCronHealth,
  formatKst,
  healthFromOutput,
  httpRequest,
  lastLines,
  managementApiBase,
  projectStatusVerdict,
  readAccessToken,
  readProjectRef,
  readSiteUrl,
  redact,
} from "./lib.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const USER_AGENT = "onmom-health-check";

// 결과 한 줄 — { group(분류), name(항목), status, detail(내용 — 비밀·사용자 데이터 없음) }
const pass =(group, name, detail) => ({ group, name, status: "pass", detail });
const fail = (group, name, detail) => ({ group, name, status: "fail", detail });
const skip = (group, name, detail) => ({ group, name, status: "skip", detail });

function httpDetail(r) {
  if (r.error === "timeout") return "응답 없음(시간 초과)";
  if (r.error !== null || r.status === null) return "연결 실패(네트워크·DNS)";
  return `HTTP ${r.status}`;
}

// MARK: 사이트

const HTML_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** HTML 엔티티 풀기(한 번 — 브라우저가 속성값을 읽는 것과 같다): &#x27; &#39; &quot; &amp; … */
export function decodeHtmlEntities(s) {
  return String(s).replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, e) => {
    if (e[0] === "#") {
      const cp = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isInteger(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return HTML_ENTITIES[e.toLowerCase()] ?? m;
  });
}

function attribute(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i"));
  return m ? decodeHtmlEntities(m[1] ?? m[2] ?? m[3] ?? "") : null;
}

/**
 * 로그인 화면 HTML의 CSP — <meta http-equiv="Content-Security-Policy">가 정확히 1개, script-src가 있고
 * 'unsafe-inline'·'unsafe-eval'이 없어야 통과(정적 사이트라 헤더 대신 메타 — docs/SECURITY.md §2). → { ok, detail }
 */
export function analyzeLoginCsp(html) {
  const tags = String(html).match(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi) ?? [];
  const csp = tags.filter((t) => (attribute(t, "http-equiv") ?? "").trim().toLowerCase() === "content-security-policy");
  if (csp.length !== 1) return { ok: false, detail: `CSP 메타 ${csp.length}개(정확히 1개여야 함)` };
  const policy = attribute(csp[0], "content") ?? "";
  const directives = policy
    .split(";")
    .map((d) => d.trim().split(/\s+/).filter(Boolean))
    .filter((d) => d.length > 0);
  const scriptSrc = directives.find((d) => d[0].toLowerCase() === "script-src");
  if (!scriptSrc) return { ok: false, detail: "CSP에 script-src가 없음" };
  const sources = scriptSrc.slice(1).map((s) => s.toLowerCase());
  const bad = ["'unsafe-inline'", "'unsafe-eval'"].filter((s) => sources.includes(s));
  if (bad.length > 0) return { ok: false, detail: `script-src에 ${bad.join("·")}가 있음 — 인라인 스크립트 해시가 빠진 빌드(scripts/csp-hash.mjs)` };
  const hashes = sources.filter((s) => s.startsWith("'sha256-")).length;
  return { ok: true, detail: `CSP 메타 1개 · script-src에 'unsafe-inline' 없음(해시 ${hashes}개)` };
}

async function siteChecks(siteUrl) {
  const get = (url) => httpRequest(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*" } });
  const [root, login, robots] = await Promise.all([get(siteUrl), get(`${siteUrl}login/`), get(`${siteUrl}robots.txt`)]);
  const path = new URL(siteUrl).pathname;
  const ok200 = (name, r) => (r.status === 200 ? pass("사이트", name, "HTTP 200") : fail("사이트", name, `${httpDetail(r)}(200이어야 함)`));
  let csp;
  if (login.status !== 200) csp = fail("사이트", "로그인 화면 CSP", "로그인 화면을 받지 못해 확인 못 함");
  else {
    const v = analyzeLoginCsp(login.text);
    csp = v.ok ? pass("사이트", "로그인 화면 CSP", v.detail) : fail("사이트", "로그인 화면 CSP", v.detail);
  }
  return [ok200(`시작 주소 ${path}`, root), ok200(`로그인 화면 ${path}login/`, login), csp, ok200(`${path}robots.txt`, robots)];
}

// MARK: Supabase 프로젝트 상태

async function projectCheck({ token, ref, ci, env }) {
  const name = `프로젝트 상태(${ref})`;
  if (token === null) return missingToken("Supabase", name, ci);
  const api = createManagementApi({ token, ref, base: managementApiBase(env) });
  const r = await api.project();
  if (r.status !== 200 || r.json === undefined) return fail("Supabase", name, apiFailure(r));
  const v = projectStatusVerdict(r.json?.status);
  return v.ok ? pass("Supabase", name, v.detail) : fail("Supabase", name, v.detail);
}

function missingToken(group, name, ci) {
  return ci
    ? fail(group, name, "Secrets → SUPABASE_ACCESS_TOKEN이 비어 있음(Supabase 워크플로와 같은 Secret)")
    : skip(group, name, "SUPABASE_ACCESS_TOKEN 없음(내 컴퓨터) — 건너뜀");
}

// MARK: Edge Function 사전 요청(OPTIONS)

/** 웹이 실제로 보내는 메서드·헤더(src/api/video.ts·llm.ts)로 사전 요청만 — 함수 본문(영상 서버·AI)은 부르지 않는다 */
const FUNCTION_PREFLIGHTS = [
  { fn: "videos", method: "GET", headers: "apikey" },
  { fn: "chat", method: "POST", headers: "authorization, apikey, content-type" },
];

async function functionChecks({ ref, origin }) {
  return Promise.all(
    FUNCTION_PREFLIGHTS.map(async ({ fn, method, headers }) => {
      const name = `${fn} 사전 요청(OPTIONS)`;
      const r = await httpRequest(`https://${ref}.supabase.co/functions/v1/${fn}`, {
        method: "OPTIONS",
        headers: { Origin: origin, "Access-Control-Request-Method": method, "Access-Control-Request-Headers": headers, "User-Agent": USER_AGENT },
      });
      if (r.status !== null && r.status >= 200 && r.status < 300) {
        const allowed = r.headers?.get("access-control-allow-origin");
        return allowed === origin
          ? pass("함수", name, `HTTP ${r.status} · 허용 출처 ${origin}`)
          : fail("함수", name, `HTTP ${r.status}인데 Access-Control-Allow-Origin이 ${allowed ?? "없음"} — 브라우저 요청이 막힘`);
      }
      const why =
        r.status === 403
          ? " — 사이트 주소가 함수의 허용 목록(ALLOWED_ORIGINS)에 없음"
          : r.status === 404
            ? " — 함수가 배포되지 않음(Supabase 워크플로 D-1)"
            : r.status !== null && r.status >= 500
              ? " — 함수가 시작하지 못함(대시보드 Edge Functions → 함수 → Logs)"
              : "";
      return fail("함수", name, `${httpDetail(r)}${why}`);
    }),
  );
}

// MARK: DB(예약 작업·예약 요청) — Supabase CLI

/** 명령 하나 실행 — 출력은 모아서 돌려준다(화면에 찍지 않는다). 없는 명령이면 { missing: true } */
function run(cmd, args, { env, timeoutMs }) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer = null;
    const done = (r) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };
    let child;
    try {
      child = spawn(cmd, args, { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
    } catch {
      done({ code: null, stdout, stderr, missing: true, timedOut: false });
      return;
    }
    timer = setTimeout(() => {
      child.kill("SIGKILL");
      done({ code: null, stdout, stderr, missing: false, timedOut: true });
    }, timeoutMs);
    child.stdout.on("data", (b) => (stdout += b));
    child.stderr.on("data", (b) => (stderr += b));
    child.on("error", (e) => done({ code: null, stdout, stderr, missing: e?.code === "ENOENT", timedOut: false }));
    child.on("close", (code) => done({ code, stdout, stderr, missing: false, timedOut: false }));
  });
}

/** CLI가 실패했을 때 한 줄 — 비밀 모양은 가리고 마지막 줄만 */
function cliFailure(step, r, token) {
  if (r.missing) return `Supabase CLI가 없음 — 워크플로의 'supabase/setup-cli' 단계 확인`;
  if (r.timedOut) return `${step}이(가) 끝나지 않음(시간 초과)`;
  const tail = lastLines(redact(`${r.stderr}\n${r.stdout}`, [token]));
  return `${step} 실패(종료 코드 ${r.code})${tail ? `: ${tail}` : ""}`;
}

async function dbChecks({ token, ref, ci }) {
  const names = cronCheckNames();
  const allRows = (make) => names.map(({ name }) => make("DB", name));
  if (token === null) return allRows((g, n) => missingToken(g, n, ci));
  const env = { ...process.env, SUPABASE_ACCESS_TOKEN: token };
  delete env.SUPABASE_DB_PASSWORD; // 이 점검에는 필요 없다(db query --linked는 Management API로 돈다)

  const version = await run("supabase", ["--version"], { env, timeoutMs: 30_000 });
  if (version.missing) {
    const why = "Supabase CLI가 없음 — 워크플로의 'supabase/setup-cli' 단계(내 컴퓨터는 brew install supabase/tap/supabase)";
    return allRows((g, n) => (ci ? fail(g, n, why) : skip(g, n, why)));
  }

  // supabase.yml과 같은 연결 — link는 Management API로 프로젝트·키를 읽고 supabase/.temp/에 연결 정보를 쓴다(DB에 쓰지 않는다)
  let link = await run("supabase", ["link", "--project-ref", ref], { env, timeoutMs: 120_000 });
  if (link.code !== 0 && !link.missing) link = await run("supabase", ["link", "--project-ref", ref], { env, timeoutMs: 120_000 });
  if (link.code !== 0) return allRows((g, n) => fail(g, n, cliFailure("프로젝트 연결(supabase link)", link, token)));

  const dir = await mkdtemp(join(tmpdir(), "onmom-health-"));
  try {
    const sqlFile = join(dir, "cron-health.sql");
    await writeFile(sqlFile, `${cronHealthSql()};\n`, "utf8");
    const args = ["db", "query", "--linked", "--file", sqlFile, "--output", "json", "--agent", "no"];
    let q = await run("supabase", args, { env, timeoutMs: 120_000 });
    if (q.code !== 0) q = await run("supabase", args, { env, timeoutMs: 120_000 });
    if (q.code !== 0) return allRows((g, n) => fail(g, n, cliFailure("예약 작업 조회(supabase db query)", q, token)));
    const health = healthFromOutput(q.stdout);
    if (health === null) return allRows((g, n) => fail(g, n, "조회 결과를 알아볼 수 없음(CLI 출력 형식이 바뀌었을 수 있음)"));
    try {
      return evaluateCronHealth(health).map((c) => (c.ok ? pass("DB", c.name, c.detail) : fail("DB", c.name, c.detail)));
    } catch (e) {
      return allRows((g, n) => fail(g, n, e?.message ?? "조회 결과를 알아볼 수 없음"));
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// MARK: 의존성 보안(npm audit)

/** npm audit --json 결과 → { ok, detail } (높음·치명이 하나라도 있으면 실패) */
export function auditVerdict(json) {
  if (json?.error) return { ok: false, detail: `npm audit 실패(${json.error.code ?? "오류"}) — 레지스트리 연결·package-lock.json 확인`, retry: true };
  const v = json?.metadata?.vulnerabilities;
  const n = (k) => (Number.isInteger(v?.[k]) ? v[k] : null);
  if (!v || [n("critical"), n("high"), n("moderate"), n("low")].some((x) => x === null)) {
    return { ok: false, detail: "npm audit 결과를 알아볼 수 없음", retry: true };
  }
  const detail = `치명 ${n("critical")} · 높음 ${n("high")} · 보통 ${n("moderate")} · 낮음 ${n("low")} (운영 의존성만)`;
  return n("critical") + n("high") === 0 ? { ok: true, detail } : { ok: false, detail: `${detail} — npm audit --omit=dev로 목록 확인 후 올림` };
}

async function auditCheck() {
  const name = "npm audit --omit=dev(높음·치명 0)";
  const env = { ...process.env, npm_config_update_notifier: "false", npm_config_fund: "false" };
  delete env.SUPABASE_ACCESS_TOKEN;
  delete env.SUPABASE_DB_PASSWORD;
  let verdict = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await run("npm", ["audit", "--omit=dev", "--json"], { env, timeoutMs: 180_000 });
    if (r.missing) return fail("의존성", name, "npm이 없음");
    let json;
    try {
      json = JSON.parse(r.stdout);
    } catch {
      json = undefined;
    }
    verdict = json === undefined ? { ok: false, detail: `npm audit 출력을 읽지 못함(종료 코드 ${r.code})`, retry: true } : auditVerdict(json);
    if (verdict.ok || !verdict.retry) break;
  }
  return verdict.ok ? pass("의존성", name, verdict.detail) : fail("의존성", name, verdict.detail);
}

// MARK: 결과

const LABEL = { pass: "통과", fail: "**실패**", skip: "건너뜀" };
const PLAIN = { pass: "통과", fail: "실패", skip: "건너뜀" };

function cell(s) {
  return String(s).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

/** 실행 화면 Summary에 쓰는 표(한국어 Markdown) */
export function renderSummary(results, { startedAt, siteUrl, ref }) {
  const failed = results.filter((r) => r.status === "fail");
  const passed = results.filter((r) => r.status === "pass");
  const lines = [`## 온맘 매일 점검 — ${formatKst(startedAt)}`, ""];
  lines.push(
    failed.length === 0
      ? `**모두 통과** — ${passed.length}개 통과${results.length > passed.length ? `, ${results.length - passed.length}개 건너뜀` : ""}`
      : `**실패 ${failed.length}개** (전체 ${results.length}개 중 통과 ${passed.length}개) — 아래 '실패' 줄을 보고 운영 안내서(docs/RUNBOOK.md)의 해당 장애를 따릅니다.`,
  );
  lines.push("", "| 결과 | 분류 | 항목 | 내용 |", "|---|---|---|---|");
  for (const r of results) lines.push(`| ${LABEL[r.status]} | ${cell(r.group)} | ${cell(r.name)} | ${cell(r.detail)} |`);
  lines.push(
    "",
    `- 사이트 ${siteUrl} · Supabase 프로젝트 ${ref}`,
    "- 모두 읽기만 합니다(사용자 데이터·설정을 바꾸지 않음). DB 항목은 개수만 봅니다.",
    "- 되돌리기·끄기: docs/SUPABASE_SETUP.md G, 문제 해결: 같은 문서 I",
    "",
  );
  return lines.join("\n");
}

function escapeData(s) {
  return String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}
function escapeProperty(s) {
  return escapeData(s).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

async function main() {
  const env = process.env;
  const ci = env.GITHUB_ACTIONS === "true";
  const startedAt = new Date();
  const siteUrl = readSiteUrl(env);
  const ref = readProjectRef(env);
  const token = readAccessToken(env);
  const origin = new URL(siteUrl).origin;

  const [site, project, functions, db, audit] = await Promise.all([
    siteChecks(siteUrl),
    projectCheck({ token, ref, ci, env }),
    functionChecks({ ref, origin }),
    dbChecks({ token, ref, ci }),
    auditCheck(),
  ]);
  const results = [...site, project, ...functions, ...db, audit].map((r) => ({ ...r, detail: redact(r.detail, [token]) }));

  for (const r of results) console.log(`[${PLAIN[r.status]}] ${r.group} · ${r.name} — ${r.detail}`);
  const failed = results.filter((r) => r.status === "fail");
  console.log(failed.length === 0 ? "모두 통과" : `실패 ${failed.length}개`);

  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, renderSummary(results, { startedAt, siteUrl, ref }), "utf8");
  if (ci) {
    for (const r of failed) console.log(`::error title=${escapeProperty(`점검 실패 — ${r.group} · ${r.name}`)}::${escapeData(r.detail)}`);
  }
  process.exitCode = failed.length > 0 ? 1 : 0;
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
    // 점검 스크립트 자체의 문제(설정 형식 등) — 그래도 요약과 메일이 남게 실패로 끝낸다. 메시지에는 비밀이 없다(redact로 한 번 더).
    const message = redact(e?.message ?? String(e), [readAccessToken()]);
    console.error(`점검을 끝내지 못했습니다: ${message}`);
    if (process.env.GITHUB_STEP_SUMMARY) {
      await appendFile(process.env.GITHUB_STEP_SUMMARY, `## 온맘 매일 점검\n\n**실패** — 점검을 끝내지 못했습니다: ${cell(message)}\n`, "utf8").catch(() => {});
    }
    if (process.env.GITHUB_ACTIONS === "true") console.log(`::error title=${escapeProperty("점검 스크립트 오류")}::${escapeData(message)}`);
    process.exitCode = 1;
  }
}
