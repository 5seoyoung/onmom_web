#!/usr/bin/env node
// 로그인 비상 스위치 — 새 게스트 시작(익명 가입·로그인)과 카카오 로그인을 서버(Supabase Auth)에서 끄고 켠다. 내 컴퓨터에서.
//   node scripts/ops/auth-switch.mjs --off --dry-run   → 지금 값과 바뀔 값만 보여 준다(아무것도 바꾸지 않음)
//   node scripts/ops/auth-switch.mjs --off             → 끄기(한 번 더 묻는다 — 묻지 않으려면 --yes)
//   node scripts/ops/auth-switch.mjs --on              → 다시 켜기
//   SUPABASE_ACCESS_TOKEN이 이 터미널의 환경 변수에 있어야 한다(docs/RUNBOOK.md "명령"). SUPABASE_PROJECT_REF가 비면 운영 프로젝트.
// 바꾸는 것: PATCH /v1/projects/{ref}/config/auth 의 external_anonymous_users_enabled · external_kakao_enabled 두 칸만.
// 바꾸지 않는 것: 이미 로그인한 사람의 세션(끊지 않는다 — 만료될 때까지 그대로 동작), 카카오 키·시크릿과 다른 인증 설정, 사이트(Variables).
// 끈 동안: [게스트로 시작]은 서버 계정 없이 이 브라우저 전용 게스트로 시작하고(기록은 서버에 올라가지 않는다), 카카오 로그인은 실패한다.
// 출력: 두 칸의 바꾸기 전·후 값만(응답의 다른 칸 — 키·시크릿 — 은 찍지 않는다). 토큰은 환경 변수로만(파일을 읽지 않는다).

import { realpathSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { apiFailure, createManagementApi, managementApiBase, OpsError, readAccessToken, readProjectRef, redact } from "./lib.mjs";

/** 스위치가 바꾸는 칸 — 이 둘 말고는 보내지도 찍지도 않는다 */
export const SWITCH_FIELDS = [
  ["external_anonymous_users_enabled", "게스트 시작(익명 가입·로그인)"],
  ["external_kakao_enabled", "카카오 로그인"],
];

const USAGE = "쓰는 법: node scripts/ops/auth-switch.mjs --off|--on [--dry-run] [--yes]";

/** 명령 인자 → { enable, dryRun, yes }. 틀리면 OpsError(쓰는 법) */
export function parseArgs(argv) {
  const known = new Set(["--off", "--on", "--dry-run", "--yes"]);
  const unknown = argv.filter((a) => !known.has(a));
  if (unknown.length > 0) throw new OpsError(`모르는 인자: ${unknown.join(" ")}\n${USAGE}`);
  const off = argv.includes("--off");
  const on = argv.includes("--on");
  if (off === on) throw new OpsError(`--off와 --on 중 하나만 붙입니다.\n${USAGE}`);
  return { enable: on, dryRun: argv.includes("--dry-run"), yes: argv.includes("--yes") };
}

/** 인증 설정 응답 → 스위치 두 칸의 값만. 칸이 없거나 참/거짓이 아니면 OpsError */
export function pickSwitchFields(config) {
  const out = {};
  for (const [field] of SWITCH_FIELDS) {
    const v = config?.[field];
    if (typeof v !== "boolean") throw new OpsError(`인증 설정 응답에 ${field}(참/거짓)가 없습니다 — Supabase API가 바뀌었을 수 있습니다. 대시보드에서 바꾸세요.`);
    out[field] = v;
  }
  return out;
}

function table(title, rows) {
  console.log(title);
  for (const [field, label] of SWITCH_FIELDS) console.log(`  ${field.padEnd(34)} ${rows(field).padEnd(26)} ${label}`);
}

const word = (v) => (v ? "true(켜짐)" : "false(꺼짐)");

async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(question)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

async function main(argv) {
  const { enable, dryRun, yes } = parseArgs(argv);
  const token = readAccessToken();
  if (token === null) {
    throw new OpsError(
      "SUPABASE_ACCESS_TOKEN 환경 변수가 없습니다 — Supabase Account → Access Tokens의 토큰을 이 터미널에만 넣고 다시 실행하세요(docs/RUNBOOK.md \"명령\").",
    );
  }
  const ref = readProjectRef();
  const api = createManagementApi({ token, ref, base: managementApiBase() });

  const current = await api.authConfig();
  if (current.status !== 200) throw new OpsError(`지금 설정을 읽지 못했습니다 — ${apiFailure(current)}`);
  const before = pickSwitchFields(current.json);
  const patch = {};
  for (const [field] of SWITCH_FIELDS) if (before[field] !== enable) patch[field] = enable;

  console.log(`프로젝트 ${ref} — 로그인 비상 스위치 ${enable ? "--on(다시 켜기)" : "--off(끄기)"}${dryRun ? " · --dry-run(바꾸지 않음)" : ""}`);
  table("바꾸기 전 → 바꿀 값", (f) => `${word(before[f])} → ${word(enable)}`);

  if (Object.keys(patch).length === 0) {
    console.log("이미 그 상태입니다 — 바꿀 것이 없습니다.");
    return;
  }
  if (dryRun) {
    console.log("--dry-run: 아무것도 바꾸지 않았습니다. 바꾸려면 --dry-run을 빼고 다시 실행합니다.");
    return;
  }
  if (!yes) {
    if (!process.stdin.isTTY) throw new OpsError("확인할 수 없는 환경(입력이 터미널이 아님)입니다 — 그래도 바꾸려면 --yes를 붙입니다.");
    const note = enable ? "새 게스트 시작·카카오 로그인이 다시 됩니다." : "새 게스트 시작·카카오 로그인이 멈춥니다(이미 로그인한 세션은 그대로).";
    if (!(await confirm(`${note} 바꿀까요? (y/N) `))) {
      console.log("그만뒀습니다 — 아무것도 바꾸지 않았습니다.");
      return;
    }
  }

  const res = await api.patchAuthConfig(patch);
  if (res.status !== 200) throw new OpsError(`바꾸지 못했습니다 — ${apiFailure(res)}. 지금 값은 --dry-run으로 다시 확인합니다.`);

  // 응답을 믿지 않고 서버에서 다시 읽어 확인한다(응답의 다른 칸은 쓰지도 찍지도 않는다)
  const again = await api.authConfig();
  if (again.status !== 200) throw new OpsError(`바꾼 뒤 다시 읽지 못했습니다 — ${apiFailure(again)}. --dry-run으로 확인합니다.`);
  const after = pickSwitchFields(again.json);
  table("바꾼 뒤(서버에서 다시 읽음)", (f) => word(after[f]));
  const mismatched = SWITCH_FIELDS.filter(([f]) => after[f] !== enable).map(([f]) => f);
  if (mismatched.length > 0) throw new OpsError(`바꾼 값이 반영되지 않았습니다: ${mismatched.join(", ")} — 대시보드 Authentication → Sign In / Providers에서 확인합니다.`);
  console.log(
    enable
      ? "다시 켰습니다. 사이트에서 [게스트로 시작]·카카오 로그인을 한 번씩 확인합니다."
      : "껐습니다. 이미 로그인한 세션은 그대로입니다. 사이트 화면은 바뀌지 않으므로(버튼은 보임) 필요하면 사이트 Variables로도 끕니다(docs/RUNBOOK.md). 다시 켜기: --on",
  );
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
    await main(process.argv.slice(2));
  } catch (e) {
    console.error(redact(e instanceof OpsError ? e.message : `실행하지 못했습니다: ${e?.message ?? e}`, [readAccessToken()]));
    process.exitCode = 1;
  }
}
