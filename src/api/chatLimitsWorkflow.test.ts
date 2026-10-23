// .github/workflows/supabase.yml의 AI 상담 한도 — 함수가 읽는 환경 변수(supabase/functions/_shared/chat.ts CHAT_LIMIT_ENV)를 모두
// ① 형식 검사 ② 함수 비밀값 넣기 ③ 결과 요약(공개값 — 기본값과 함께)에 싣는지 글자로 확인한다. 한쪽에만 이름을 더하면 여기서 멈춘다.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CHAT_LIMIT_DEFAULTS, CHAT_LIMIT_ENV } from "../../supabase/functions/_shared/chat";

const YML = readFileSync(fileURLToPath(new URL("../../.github/workflows/supabase.yml", import.meta.url)), "utf8");
const NAMES = Object.values(CHAT_LIMIT_ENV);

/** 이름이 붙은 단계 하나(다음 "- name:" 전까지) */
function step(name: string): string {
  const start = YML.indexOf(`- name: ${name}`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const next = YML.indexOf("\n      - ", start + 1);
  return YML.slice(start, next === -1 ? undefined : next);
}

describe("supabase.yml — AI 상담 한도 환경 변수", () => {
  it("머리말의 Variables 목록에 넷 다 있다", () => {
    const header = YML.slice(0, YML.indexOf("name: Supabase"));
    for (const name of NAMES) expect(header, name).toContain(name);
  });

  it("① 설정 확인 — 넷 다 Variables에서 받아 같은 형식(1 이상의 정수)으로 검사한다", () => {
    const check = step("설정 확인");
    for (const name of NAMES) expect(check, name).toContain(`${name}: \${{ vars.${name} }}`);
    expect(check).toContain(`for name in ${NAMES.join(" ")}; do`);
    expect(check).toContain('if [ -n "${v}" ] && ! [[ "${v}" =~ ^[1-9][0-9]{0,6}$ ]]; then');
  });

  it("② 비밀값 넣기 — 넷 다 함수 비밀값으로 옮긴다(비면 건너뛰어 서버 값을 남긴다)", () => {
    const secrets = step("Edge Function 비밀값 넣기");
    for (const name of NAMES) expect(secrets, name).toContain(`${name}: \${{ vars.${name} }}`);
    const loop = /for name in ([A-Z_ ]+); do/.exec(secrets)?.[1].split(" ") ?? [];
    for (const name of NAMES) expect(loop, name).toContain(name);
  });

  it("③ 결과 요약 — 공개값(Variables)만 받아 값과 함수 기본값을 적는다(비밀값은 이 단계에 없다)", () => {
    const summary = step("결과 요약");
    for (const name of NAMES) expect(summary, name).toContain(`${name}: \${{ vars.${name} }}`);
    expect(summary).not.toMatch(/secrets\./);
    const pairs = Object.entries(CHAT_LIMIT_ENV).map(([key, name]) => `${name}:${CHAT_LIMIT_DEFAULTS[key as keyof typeof CHAT_LIMIT_DEFAULTS]}`);
    expect(summary).toContain(`for pair in ${pairs.join(" ")}; do`);
    // 숫자만 적는다
    expect(summary).toContain('v="${v//[^0-9]/}"');
  });
});
