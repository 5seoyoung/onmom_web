#!/usr/bin/env node
// 운영 상태 한눈에 — 내 컴퓨터에서, 읽기만(바꾸는 요청은 하지 않는다).
//   node scripts/ops/status.mjs            (SUPABASE_ACCESS_TOKEN이 이 터미널의 환경 변수에 있어야 한다 — docs/RUNBOOK.md "명령")
//   SUPABASE_PROJECT_REF=<다른 ref> …      (비우면 운영 프로젝트 movrwmoniopgetdmagon)
// 보여 주는 것
//   1) 프로젝트 상태(Management API) — 일시 중지면 대시보드에서 Restore
//   2) 로그인 설정 중 비밀이 아닌 칸만(켜짐/꺼짐·주소·한도) + 설정 안내 B와 다른 칸 표시. 응답에는 키·시크릿·SMTP 비밀번호도 있지만
//      정해 둔 칸만 꺼내 찍는다(카카오 키·시크릿은 "넣음/없음"만).
//   3) 예약 작업(pg_cron)·예약 요청(pg_net) — 매일 점검과 같은 기준, 개수만. 읽기 전용 DB 사용자(supabase_read_only_user)로 조회한다.
//   4) Edge Function 목록 — 이름·버전·상태·verify_jwt·배포 시각(코드는 받지 않는다)
// 종료 코드: 모두 정상이면 0, 확인할 것이 있거나 읽지 못한 것이 있으면 1, 실행하지 못했으면(토큰 없음 등) 2.
// 토큰은 환경 변수로만 읽는다(파일을 읽지 않는다 — docs/private/ 포함). 출력에 싣지 않는다.

import {
  apiFailure,
  createManagementApi,
  cronHealthSql,
  evaluateCronHealth,
  findHealthPayload,
  formatKst,
  managementApiBase,
  OpsError,
  projectStatusVerdict,
  readAccessToken,
  readProjectRef,
  redact,
} from "./lib.mjs";

/** 찍어도 되는 인증 설정 칸 — [칸, 이름, 설정 안내 B의 값(없으면 비교하지 않음)] */
const AUTH_FIELDS = [
  ["disable_signup", "새 가입 막기", false],
  ["external_anonymous_users_enabled", "게스트(익명 로그인)", true],
  ["external_kakao_enabled", "카카오 로그인", true],
  ["external_kakao_email_optional", "카카오 이메일 없이 허용", true],
  ["security_manual_linking_enabled", "수동 연결(게스트 → 카카오)", true],
  ["external_email_enabled", "이메일 로그인", false],
  ["external_phone_enabled", "전화번호 로그인", false],
  ["security_captcha_enabled", "CAPTCHA", undefined],
  ["security_captcha_provider", "CAPTCHA 공급자", undefined],
  ["rate_limit_anonymous_users", "게스트 시작 한도(IP당 시간당)", undefined],
  ["site_url", "Site URL", undefined],
  ["uri_allow_list", "Redirect URLs", undefined],
];
/** 값 대신 "넣음/없음"만 보이는 칸 */
const PRESENCE_FIELDS = [
  ["external_kakao_client_id", "카카오 REST API 키"],
  ["external_kakao_secret", "카카오 클라이언트 시크릿"],
];
/** 저장소가 배포하는 함수(supabase.yml)와 verify_jwt 기준(supabase/config.toml) */
const EXPECTED_FUNCTIONS = { videos: false, chat: false, "send-reminders": false };

function show(v) {
  if (v === true) return "켜짐";
  if (v === false) return "꺼짐";
  if (v === null || v === undefined || v === "") return "(없음)";
  return String(v);
}

function epochToDate(v) {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return new Date(v < 1e12 ? v * 1000 : v);
}

async function main() {
  const token = readAccessToken();
  if (token === null) {
    throw new OpsError(
      "SUPABASE_ACCESS_TOKEN 환경 변수가 없습니다 — Supabase Account → Access Tokens의 토큰을 이 터미널에만 넣고 다시 실행하세요(docs/RUNBOOK.md \"명령\").",
    );
  }
  const ref = readProjectRef();
  const api = createManagementApi({ token, ref, base: managementApiBase() });
  const issues = [];
  const say = (line = "") => console.log(redact(line, [token]));

  const [project, auth, cron, functions] = await Promise.all([
    api.project(),
    api.authConfig(),
    api.readOnlyQuery(cronHealthSql()),
    api.functions(),
  ]);

  say(`온맘 운영 상태 — 프로젝트 ${ref} (${formatKst(new Date())})`);

  say("");
  say("[1] 프로젝트");
  if (project.status === 200 && project.json) {
    const p = project.json;
    const v = projectStatusVerdict(p.status);
    say(`  이름 ${show(p.name)} · 지역 ${show(p.region)} · Postgres ${show(p.database?.version)}`);
    say(`  상태 ${v.ok ? "정상" : "확인"} — ${v.detail}`);
    if (!v.ok) issues.push("프로젝트 상태");
  } else {
    say(`  읽지 못함 — ${apiFailure(project)}`);
    issues.push("프로젝트 정보");
  }

  say("");
  say("[2] 로그인 설정(비밀이 아닌 칸만 · '←'는 설정 안내 B와 다른 값)");
  if (auth.status === 200 && auth.json && typeof auth.json === "object") {
    const a = auth.json;
    for (const [field, label, expected] of AUTH_FIELDS) {
      const differs = expected !== undefined && a[field] !== expected;
      say(`  ${label}: ${show(a[field])}${differs ? `  ← 기준 ${show(expected)}` : ""}`);
      if (differs) issues.push(`로그인 설정 ${field}`);
    }
    for (const [field, label] of PRESENCE_FIELDS) {
      const present = typeof a[field] === "string" && a[field].length > 0;
      say(`  ${label}: ${present ? "넣음" : "없음"}${present ? "" : "  ← 카카오 로그인에 필요"}`);
      if (!present) issues.push(`로그인 설정 ${field}`);
    }
  } else {
    say(`  읽지 못함 — ${apiFailure(auth)}`);
    issues.push("로그인 설정");
  }

  say("");
  say("[3] 예약 작업(pg_cron)·예약 요청(pg_net) — 개수만");
  const queried = cron.status !== null && cron.status >= 200 && cron.status < 300;
  const health = queried ? findHealthPayload(cron.json) : null;
  if (health === null) {
    // SQL 오류 문구(권한·없는 표 등)는 진단에 필요해 짧게 붙인다 — 사용자 데이터는 담기지 않는다(개수만 묻는 SELECT)
    const message = typeof cron.json?.message === "string" ? `: ${cron.json.message.slice(0, 200)}` : "";
    say(`  읽지 못함 — ${queried ? "결과 모양을 알아볼 수 없음" : `${apiFailure(cron)}${message}`}`);
    issues.push("예약 작업");
  } else {
    try {
      for (const c of evaluateCronHealth(health)) {
        say(`  ${c.ok ? "정상" : "확인"} · ${c.name} — ${c.detail}`);
        if (!c.ok) issues.push(c.name);
      }
    } catch (e) {
      say(`  읽지 못함 — ${e?.message ?? "결과 모양을 알아볼 수 없음"}`);
      issues.push("예약 작업");
    }
  }

  say("");
  say("[4] Edge Functions");
  if (functions.status === 200 && Array.isArray(functions.json)) {
    const bySlug = new Map(functions.json.map((f) => [f?.slug, f]));
    for (const f of functions.json) {
      const updated = epochToDate(f?.updated_at);
      const expectedJwt = EXPECTED_FUNCTIONS[f?.slug];
      const jwtNote = expectedJwt !== undefined && f?.verify_jwt !== expectedJwt ? `  ← 기준 verify_jwt=${expectedJwt}(supabase/config.toml)` : "";
      say(`  ${show(f?.slug)} · v${show(f?.version)} · ${show(f?.status)} · verify_jwt=${show(f?.verify_jwt)} · 배포 ${updated ? formatKst(updated) : "알 수 없음"}${jwtNote}`);
      if (jwtNote) issues.push(`함수 ${f?.slug} verify_jwt`);
      if (expectedJwt !== undefined && f?.status !== "ACTIVE") issues.push(`함수 ${f?.slug} 상태`);
    }
    for (const slug of Object.keys(EXPECTED_FUNCTIONS)) {
      if (!bySlug.has(slug)) {
        say(`  ${slug} · 없음  ← Supabase 워크플로(D-1)가 배포하는 함수`);
        issues.push(`함수 ${slug} 없음`);
      }
    }
  } else {
    say(`  읽지 못함 — ${apiFailure(functions)}`);
    issues.push("함수 목록");
  }

  say("");
  if (issues.length === 0) say("이상 없음. 공개 사이트·함수 응답까지 보려면: node scripts/ops/health-check.mjs");
  else say(`확인할 것 ${issues.length}개: ${issues.join(", ")} — docs/RUNBOOK.md`);
  process.exitCode = issues.length === 0 ? 0 : 1;
}

try {
  await main();
} catch (e) {
  console.error(redact(e instanceof OpsError ? e.message : `실행하지 못했습니다: ${e?.message ?? e}`, [readAccessToken()]));
  process.exitCode = 2;
}
