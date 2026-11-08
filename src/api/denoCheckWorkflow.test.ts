// .github/workflows/supabase.yml의 함수 타입 검사(deno-check 작업) — 함수마다 index.ts를 deno check로 보고, 배포 작업이 그 검사를 기다리는지 글자로 확인한다.
// Next tsc는 index.ts의 Deno 전용 가져오기(npm:·".ts")를 읽지 못하므로(docs/SUPABASE_FUNCTIONS.md §7) 이 검사가 빠지면 index.ts의 타입 오류가 배포까지 간다.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const YML = readFileSync(fileURLToPath(new URL("../../.github/workflows/supabase.yml", import.meta.url)), "utf8");
const FUNCTIONS_DIR = fileURLToPath(new URL("../../supabase/functions/", import.meta.url));

/** 작업 하나(다음 작업 이름 줄 전까지) */
function job(name: string): string {
  const start = YML.indexOf(`\n  ${name}:\n`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const next = YML.slice(start + 1).search(/\n {2}[a-z][a-z-]*:\n/);
  return next === -1 ? YML.slice(start) : YML.slice(start, start + 1 + next);
}

/** supabase/functions 아래 배포하는 함수(_shared 빼고) */
const deployedFunctions = readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
  .map((e) => e.name)
  .sort();

describe("supabase.yml — 함수 Deno 타입 검사", () => {
  const check = job("deno-check");
  const command = /run: (deno check [^\n]+)/.exec(check)?.[1] ?? "";

  it("배포하는 함수 모두의 index.ts를 검사한다 — 배포 단계의 함수 목록과 같다", () => {
    expect(deployedFunctions).toEqual(["chat", "send-reminders", "videos"]);
    const checked = [...command.matchAll(/supabase\/functions\/([a-z-]+)\/index\.ts/g)].map((m) => m[1]).sort();
    expect(checked).toEqual(deployedFunctions);
    const deployed = /supabase functions deploy ([a-z -]+?) --project-ref/.exec(YML)?.[1].split(" ").sort();
    expect(deployed).toEqual(deployedFunctions);
  });

  it("저장소에 파일을 만들지 않는다(lock·node_modules 없음) — 문서 §7의 명령과 같은 옵션", () => {
    expect(command).toMatch(/^deno check --no-lock --node-modules-dir=none /);
  });

  it("Deno 버전과 setup-deno 커밋을 고정한다(태그·2.x 같은 범위가 아니다)", () => {
    expect(check).toMatch(/uses: denoland\/setup-deno@[0-9a-f]{40} # v\d+\.\d+\.\d+\n/);
    expect(check).toMatch(/deno-version: \d+\.\d+\.\d+\n/);
  });

  it("PR에서도 돌고, 배포 작업은 이 검사가 통과해야 시작한다", () => {
    const on = YML.slice(YML.indexOf("\non:\n"), YML.indexOf("\npermissions:"));
    expect(on).toMatch(/\n {2}pull_request:\n {4}paths:\n {6}- "supabase\/\*\*"\n/);
    expect(job("deno-check")).not.toContain("if:"); // 검사는 어느 브랜치·이벤트에서나
    const deploy = job("deploy");
    expect(deploy).toContain("\n    needs: deno-check\n");
    expect(deploy).toContain("\n    if: github.ref == 'refs/heads/main'\n");
    // 검사 작업에는 비밀값이 없다(PR에서 돈다)
    expect(check).not.toContain("secrets.");
  });

  it("PR 실행이 main 배포의 대기열을 밀어내지 않는다 — main은 늘 같은 묶음(supabase-deploy), 취소 없이", () => {
    expect(YML).toContain(
      "  group: ${{ github.event_name == 'pull_request' && format('supabase-pr-{0}', github.ref) || 'supabase-deploy' }}\n" +
        "  cancel-in-progress: ${{ github.event_name == 'pull_request' }}\n",
    );
  });
});
