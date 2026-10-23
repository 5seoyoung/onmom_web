// 운영 도구 공용 모듈 — health-check.mjs(매일 점검 워크플로 .github/workflows/health-check.yml)·status.mjs·auth-switch.mjs가 쓴다.
// 의존성 없음(Node 22+ 내장 fetch). 읽기 위주 — 운영 프로젝트를 바꾸는 요청은 auth-switch.mjs의 PATCH 하나뿐이다.
//
// 비밀값: SUPABASE_ACCESS_TOKEN은 환경 변수에서만 읽는다(파일은 읽지 않는다 — docs/private/·~/.supabase 포함).
//   요청 헤더로만 보내고 출력·오류 메시지·요약에 싣지 않는다. 사용자 데이터(건강 기록·계정)는 읽지 않는다 — DB는 예약 작업 기록의 개수만.

/** 운영 프로젝트(공개값 — supabase/config.toml project_id, docs/SUPABASE_SETUP.md 0-2). 다른 프로젝트는 SUPABASE_PROJECT_REF로. */
export const DEFAULT_PROJECT_REF = "movrwmoniopgetdmagon";
/** 공개 사이트(basePath까지, 끝 슬래시) — src/config.ts DEFAULT_SITE_URL과 같다. 다른 주소는 SITE_URL로. */
export const DEFAULT_SITE_URL = "https://5seoyoung.github.io/onmom_web/";
const MANAGEMENT_API = "https://api.supabase.com";

export class OpsError extends Error {}

/** SUPABASE_PROJECT_REF(공백 제거) — 비면 운영 프로젝트. 주소 전체를 넣는 실수는 막는다. */
export function readProjectRef(env = process.env) {
  const ref = (env.SUPABASE_PROJECT_REF ?? "").replace(/\s+/g, "") || DEFAULT_PROJECT_REF;
  if (!/^[a-z]{20}$/.test(ref)) {
    throw new OpsError("SUPABASE_PROJECT_REF 형식 — 영문 소문자 20자(https://<이 값>.supabase.co의 가운데 부분)여야 합니다.");
  }
  return ref;
}

/** SUPABASE_ACCESS_TOKEN — 없으면 null. 값은 어디에도 찍지 않는다. */
export function readAccessToken(env = process.env) {
  const t = (env.SUPABASE_ACCESS_TOKEN ?? "").trim();
  return t.length > 0 ? t : null;
}

/** 점검할 공개 사이트 주소(끝 슬래시). 비면 DEFAULT_SITE_URL. https만(내 컴퓨터 시험용 http://localhost·127.0.0.1은 허용). */
export function readSiteUrl(env = process.env) {
  const raw = (env.SITE_URL ?? "").trim();
  if (raw.length === 0) return DEFAULT_SITE_URL;
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new OpsError("SITE_URL이 주소 형식이 아닙니다. 예: https://5seoyoung.github.io/onmom_web/");
  }
  const local = u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
  if (u.protocol !== "https:" && !local) throw new OpsError("SITE_URL은 https 주소여야 합니다.");
  return `${u.origin}${u.pathname.replace(/\/+$/, "")}/`;
}

/**
 * Management API 주소. 시험용으로 ONMOM_OPS_API_URL에 내 컴퓨터의 가짜 서버(http://127.0.0.1:<포트>)만 넣을 수 있다 —
 * 토큰이 다른 곳으로 가지 않게 그 밖의 주소는 거절한다.
 */
export function managementApiBase(env = process.env) {
  const raw = (env.ONMOM_OPS_API_URL ?? "").trim();
  if (raw.length === 0) return MANAGEMENT_API;
  let u;
  try {
    u = new URL(raw);
  } catch {
    u = null;
  }
  if (u && u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost")) return u.origin;
  throw new OpsError("ONMOM_OPS_API_URL은 시험용 — http://127.0.0.1:<포트> 같은 내 컴퓨터 주소만 받습니다.");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * HTTP 요청 한 번(+ 다시 시도). 연결 실패·시간 초과·5xx·429만 다시 시도한다(attempts번까지).
 * 돌려주는 값: { status, headers, text, error } — status는 응답이 없으면 null, error는 "timeout" | "network" | null.
 */
export async function httpRequest(url, { method = "GET", headers = {}, body, timeoutMs = 20_000, attempts = 3, retryDelaysMs = [2_000, 8_000] } = {}) {
  let last = { status: null, headers: null, text: "", error: "network" };
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(retryDelaysMs[Math.min(i - 1, retryDelaysMs.length - 1)]);
    try {
      const res = await fetch(url, { method, headers, body, redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
      last = { status: res.status, headers: res.headers, text: await res.text(), error: null };
      if (res.status < 500 && res.status !== 429) return last;
    } catch (e) {
      last = { status: null, headers: null, text: "", error: e?.name === "TimeoutError" ? "timeout" : "network" };
    }
  }
  return last;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Supabase Management API(https://api.supabase.com/v1/projects/{ref}…) — 토큰은 Authorization 헤더로만.
 * 각 함수는 { status, json, error }를 돌려준다(예외를 던지지 않는다). 실패 문구는 apiFailure.
 */
export function createManagementApi({ token, ref, base = MANAGEMENT_API }) {
  async function call(method, path, body, attempts) {
    const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const r = await httpRequest(`${base}/v1/projects/${ref}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      attempts,
      timeoutMs: 30_000,
    });
    return { status: r.status, json: r.error === null ? parseJson(r.text) : undefined, error: r.error };
  }
  return {
    /** 프로젝트 정보(이름·지역·상태·DB 버전) */
    project: () => call("GET", "", undefined, 3),
    /** 인증 설정 — 응답에는 비밀값(카카오 시크릿·SMTP 비밀번호 등)도 있다. 부르는 쪽은 정해 둔 칸만 꺼내 쓴다. */
    authConfig: () => call("GET", "/config/auth", undefined, 3),
    /** 인증 설정 바꾸기 — 한 번만 보낸다(다시 시도하지 않는다) */
    patchAuthConfig: (patch) => call("PATCH", "/config/auth", patch, 1),
    /** Edge Function 목록(이름·버전·상태 — 코드는 받지 않는다) */
    functions: () => call("GET", "/functions", undefined, 3),
    /** 읽기 전용 SQL — DB 사용자 supabase_read_only_user로 돈다(서버가 쓰기를 막는다) */
    readOnlyQuery: (sql) => call("POST", "/database/query/read-only", { query: sql }, 2),
  };
}

/** Management API 실패를 사람이 읽는 한 줄로 — 응답 본문은 싣지 않는다(상태 코드만). */
export function apiFailure(r) {
  if (r.error === "timeout") return "Supabase Management API가 응답하지 않음(시간 초과)";
  if (r.error !== null || r.status === null) return "Supabase Management API에 연결하지 못함(네트워크)";
  switch (r.status) {
    case 401:
      return "SUPABASE_ACCESS_TOKEN이 틀렸거나 만료·폐기됨(HTTP 401) — Supabase Account → Access Tokens에서 새로 만들어 바꿉니다(설정 안내 C-1)";
    case 403:
      return "이 토큰으로 이 프로젝트를 다룰 권한이 없음(HTTP 403) — 프로젝트가 있는 조직의 계정 토큰인지 확인";
    case 404:
      return "프로젝트를 찾을 수 없음(HTTP 404) — SUPABASE_PROJECT_REF 확인";
    case 429:
      return "요청이 너무 많음(HTTP 429) — 몇 분 뒤 다시";
    default:
      return r.status >= 500 ? `Supabase Management API 오류(HTTP ${r.status}) — status.supabase.com 확인` : `예상하지 못한 응답(HTTP ${r.status})`;
  }
}

/** 일시 중지(무료 요금제 7일 비활성)로 보는 상태 */
const PAUSED = new Set(["INACTIVE", "PAUSING"]);
/** 켜지거나 바뀌는 중 — 보통 수십 분 안에 ACTIVE_HEALTHY로 돌아온다 */
const TRANSITIONAL = new Set(["COMING_UP", "RESTORING", "RESTARTING", "UPGRADING", "RESIZING", "GOING_DOWN"]);

/** GET /v1/projects/{ref}의 status → { ok, detail } */
export function projectStatusVerdict(status) {
  if (status === "ACTIVE_HEALTHY") return { ok: true, detail: "ACTIVE_HEALTHY(정상)" };
  if (typeof status !== "string" || status.length === 0) return { ok: false, detail: "응답에 상태(status)가 없음" };
  if (PAUSED.has(status)) {
    return { ok: false, detail: `Free plan paused — restore in dashboard (상태 ${status}: 무료 요금제 일시 중지 — Supabase 대시보드에서 Restore)` };
  }
  if (status === "ACTIVE_UNHEALTHY") return { ok: false, detail: "ACTIVE_UNHEALTHY — 일부 서비스가 비정상(대시보드 첫 화면·status.supabase.com)" };
  if (TRANSITIONAL.has(status)) return { ok: false, detail: `상태 ${status} — 켜지거나 바뀌는 중(30분 뒤 다시 확인, 계속되면 대시보드)` };
  return { ok: false, detail: `상태 ${status} — 대시보드에서 확인(풀리지 않으면 Supabase 지원 요청)` };
}

// MARK: 예약 작업(pg_cron)·예약 요청(pg_net) 점검

/**
 * 점검하는 예약 작업 — supabase/migrations 0006(onmom-anon-cleanup)·0007(onmom-send-reminders·onmom-llm-usage-cleanup)과 같아야 한다.
 * windowHours = 이 시간 안에 한 번 이상 돌았어야 정상(매일 점검은 09:15 KST, GitHub이 늦게 시작해도 맞도록 여유를 둔다).
 * 예약 시각(schedule)이 바뀌면 점검이 실패한다 — 마이그레이션을 바꿨다면 여기도 같이 고친다.
 */
export const EXPECTED_JOBS = [
  { name: "onmom-send-reminders", schedule: "0 * * * *", windowHours: 2, label: "매시 정각" },
  { name: "onmom-anon-cleanup", schedule: "0 18 * * *", windowHours: 26, label: "매일 03:00 KST" },
  { name: "onmom-llm-usage-cleanup", schedule: "30 18 * * *", windowHours: 26, label: "매일 03:30 KST" },
];

/** 실패·5xx를 세는 기간(시간) */
export const LOOKBACK_HOURS = 26;

function sqlString(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

/**
 * 예약 작업 점검 SQL — SELECT 한 문장, 한 행 한 칸(health, json). 개수·예약 이름·시각·상태만 돌려준다.
 * 작업 명령(command)·오류 문구(return_message)·응답 본문(content)·사용자 표(user_states 등)는 읽지 않는다.
 * cron.job_run_details: 실패 수(전체)·작업별 기간 안 실행 수·마지막 실행. net._http_response: 상태별 개수
 * (pg_net은 응답을 기본 6시간만 보관한다 — 26시간을 물어도 그 안의 것만 남아 있다).
 */
export function cronHealthSql(jobs = EXPECTED_JOBS, lookbackHours = LOOKBACK_HOURS) {
  const hours = Number(lookbackHours);
  const since = `now() - make_interval(hours => ${hours})`;
  const values = jobs.map((j, i) => `(${sqlString(j.name)}, ${Number(j.windowHours)}, ${i})`).join(", ");
  return `select json_build_object(
  'lookback_hours', ${hours},
  'failed_runs', (select count(*) from cron.job_run_details d where d.status = 'failed' and d.start_time > ${since}),
  'jobs', (
    select json_agg(json_build_object(
      'jobname', e.jobname,
      'present', j.jobid is not null,
      'active', coalesce(j.active, false),
      'schedule', j.schedule,
      'runs_in_window', (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.start_time > now() - make_interval(hours => e.window_hours)),
      'failed_runs', (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.status = 'failed' and d.start_time > ${since}),
      'last_run_at', (select max(d.start_time) from cron.job_run_details d where d.jobid = j.jobid),
      'last_status', (select d.status from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc nulls last limit 1)
    ) order by e.ord)
    from (values ${values}) as e(jobname, window_hours, ord)
    left join cron.job j on j.jobname = e.jobname
  ),
  'http_total', (select count(*) from net._http_response r where r.created > ${since}),
  'http_5xx', (select count(*) from net._http_response r where r.created > ${since} and r.status_code >= 500),
  'http_4xx', (select count(*) from net._http_response r where r.created > ${since} and r.status_code between 400 and 499),
  'http_no_response', (select count(*) from net._http_response r where r.created > ${since} and r.status_code is null)
) as health`;
}

/** 쿼리 결과(행 배열·{ rows }·JSON 글자 등 어떤 모양이든)에서 cronHealthSql의 health 값을 찾는다. 없으면 null. */
export function findHealthPayload(value, depth = 0) {
  if (depth > 8 || value === null || value === undefined) return null;
  if (typeof value === "string") {
    const s = value.trim();
    if (!s.startsWith("{") && !s.startsWith("[")) return null;
    const parsed = parseJson(s);
    return parsed === undefined ? null : findHealthPayload(parsed, depth + 1);
  }
  if (Array.isArray(value)) {
    for (const v of value) {
      const found = findHealthPayload(v, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    if (Array.isArray(value.jobs) && "failed_runs" in value && "http_5xx" in value) return value;
    for (const v of Object.values(value)) {
      const found = findHealthPayload(v, depth + 1);
      if (found !== null) return found;
    }
  }
  return null;
}

/** 명령 출력(JSON 앞뒤에 다른 줄이 붙어 있어도)에서 health 값을 찾는다 */
export function healthFromOutput(text) {
  const s = String(text ?? "").trim();
  const whole = parseJson(s);
  if (whole !== undefined) return findHealthPayload(whole);
  const start = s.search(/[[{]/);
  const end = Math.max(s.lastIndexOf("]"), s.lastIndexOf("}"));
  if (start < 0 || end <= start) return null;
  const inner = parseJson(s.slice(start, end + 1));
  return inner === undefined ? null : findHealthPayload(inner);
}

/** 0 이상의 정수(문자열 "3"도) → 숫자, 아니면 null */
function count(v) {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : null;
}

const RUN_STATUS = { succeeded: "성공", failed: "실패", running: "실행 중", starting: "시작 중", sending: "보내는 중", connecting: "연결 중" };

/** 예약 작업 점검 항목 이름(결과 순서와 같다) — 쿼리를 하지 못했을 때도 같은 줄을 실패로 보여 주려고 따로 둔다 */
export function cronCheckNames(jobs = EXPECTED_JOBS, lookbackHours = LOOKBACK_HOURS) {
  return [
    { id: "cron-failures", name: `예약 작업 실패 없음(최근 ${lookbackHours}시간)` },
    ...jobs.map((j) => ({ id: `cron-${j.name}`, name: `${j.name} 실행(${j.label})` })),
    { id: "net-5xx", name: `예약 요청 5xx 없음(pg_net, 최근 ${lookbackHours}시간)` },
  ];
}

/**
 * health 값 → 점검 결과 [{ id, name, ok, detail }] (cronCheckNames 순서). 모양이 다르면 OpsError.
 * - 실패: 기간 안 status='failed'가 0
 * - 작업마다: 예약이 있고 켜져 있고 예약 시각이 기준과 같고, windowHours 안에 한 번 이상 실행
 * - pg_net: 기간 안 5xx가 0(4xx·응답 없음은 개수만 보여 준다)
 */
export function evaluateCronHealth(health, jobs = EXPECTED_JOBS) {
  const failed = count(health?.failed_runs);
  const http = { total: count(health?.http_total), e5: count(health?.http_5xx), e4: count(health?.http_4xx), none: count(health?.http_no_response) };
  if (failed === null || !Array.isArray(health?.jobs) || Object.values(http).some((v) => v === null)) {
    throw new OpsError("예약 작업 점검 결과의 모양을 알아볼 수 없음");
  }
  const lookback = count(health.lookback_hours) ?? LOOKBACK_HOURS;
  const names = cronCheckNames(jobs, lookback);
  const out = [];
  out.push({
    ...names[0],
    ok: failed === 0,
    detail:
      failed === 0
        ? "실패 0건"
        : `실패 ${failed}건 — SQL Editor에서 cron.job_run_details의 status = 'failed' 줄(작업 이름·시각·오류 문구)을 확인`,
  });
  jobs.forEach((job, i) => {
    const row = health.jobs.find((r) => r?.jobname === job.name);
    const base = names[i + 1];
    if (!row || row.present !== true) {
      out.push({ ...base, ok: false, detail: "예약이 없음 — Supabase 워크플로(마이그레이션 0006·0007)가 적용됐는지 확인" });
      return;
    }
    if (row.active !== true) {
      out.push({ ...base, ok: false, detail: "예약이 꺼져 있음(cron.job active = false)" });
      return;
    }
    if (row.schedule !== job.schedule) {
      out.push({
        ...base,
        ok: false,
        detail: `예약 시각이 점검 기준과 다름(지금 '${row.schedule}', 기준 '${job.schedule}') — 바꾼 것이 맞으면 scripts/ops/lib.mjs EXPECTED_JOBS도 고칩니다`,
      });
      return;
    }
    const runs = count(row.runs_in_window) ?? 0;
    const jobFailed = count(row.failed_runs) ?? 0;
    const last =
      typeof row.last_run_at === "string" && row.last_run_at.length > 0
        ? `마지막 ${formatKst(row.last_run_at)} ${RUN_STATUS[row.last_status] ?? row.last_status ?? ""}`.trim()
        : "지금까지 실행 기록 없음";
    out.push({
      ...base,
      ok: runs >= 1,
      detail:
        runs >= 1
          ? `최근 ${job.windowHours}시간 ${runs}번 · ${last}${jobFailed > 0 ? ` · 실패 ${jobFailed}건` : ""}`
          : `최근 ${job.windowHours}시간 동안 실행 기록 없음 · ${last}`,
    });
  });
  out.push({
    ...names[names.length - 1],
    ok: http.e5 === 0,
    detail: `응답 ${http.total}건 · 5xx ${http.e5} · 4xx ${http.e4} · 응답 없음 ${http.none} (pg_net은 응답을 기본 6시간만 보관)`,
  });
  return out;
}

// MARK: 출력 도우미

/** "2026-10-23 09:15 KST" — 날짜가 아니면 "알 수 없음" */
export function formatKst(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "알 수 없음";
  const s = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
  return `${s} KST`;
}

/** 출력에 섞일 수 있는 비밀 모양을 가린다 — 넘긴 값(토큰 등)과 Supabase 토큰·비밀 키·JWT·DB 접속 주소 */
export function redact(text, secrets = []) {
  let out = String(text ?? "");
  for (const s of secrets) {
    if (typeof s === "string" && s.length >= 8) out = out.split(s).join("***");
  }
  return out
    .replace(/sbp_[A-Za-z0-9_-]{16,}/g, "sbp_***")
    .replace(/sb_secret_[A-Za-z0-9_-]+/g, "sb_secret_***")
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g, "***(JWT)")
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "postgresql://***");
}

/** 여러 줄 글의 마지막 비지 않은 줄 몇 개를 한 줄로(최대 max자) */
export function lastLines(text, n = 2, max = 300) {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const s = lines.slice(-n).join(" / ");
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
