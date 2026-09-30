#!/usr/bin/env node
// 인라인 스크립트 해시 CSP — 정적 내보내기(out/**/*.html)의 CSP 메타 script-src 자리표시자를 그 페이지 인라인 스크립트의
// sha256 해시로 바꾼다(로직 src/cspHash.mts, 정책 src/csp.ts). 의존성 없음. 두 가지로 쓴다.
//
// 1) Next 빌드 어댑터(next.config.ts의 adapterPath) — `next build`가 out/을 다 쓴 뒤 onBuildComplete로 부른다.
//    그래서 npm run build·npm run e2e·직접 `npx next build` 모두 따로 할 일이 없다. 실패하면 next build가 실패한다.
// 2) 명령 — 이미 만든 out/을 다시 확인하거나 고칠 때.
//      node scripts/csp-hash.mjs --check    → 쓰지 않고 확인만(npm run build가 마지막에 부른다 — 어댑터가 빠져도 배포가 멈추게)
//      node scripts/csp-hash.mjs            → out/ 다시 쓰기 + 확인(여러 번 해도 결과가 같다)
//      node scripts/csp-hash.mjs <폴더>      → out/ 대신 그 폴더
//
// 한 페이지라도 고칠 수 없거나 확인에 실패하면 아무 파일도 쓰지 않고 실패한다. 자리표시자가 남은 HTML은 인라인 스크립트가 모두
// 막혀 화면이 움직이지 않는다(약한 정책으로 조용히 나가지 않게).
// Node 22.18+/24 필요(.mts를 타입 제거로 그대로 불러온다 — CI는 Node 24). 모듈 맨 위에서는 불러오지 않는다 — next dev도 설정을
// 읽을 때 이 파일을 불러오기 때문이다.

import { readdir, readFile, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

class CspHashRunError extends Error {}

async function loadLib() {
  try {
    return await import("../src/cspHash.mts");
  } catch (e) {
    throw new CspHashRunError(
      `src/cspHash.mts를 불러오지 못했습니다(Node ${process.versions.node}) — Node 22.18 이상이 필요합니다.\n  ${e?.message ?? e}`,
    );
  }
}

/**
 * HTML 파일들을 다시 쓰고(check면 확인만) 요약 한 줄을 돌려준다. 문제가 있으면 아무것도 쓰지 않고 CspHashRunError.
 * @param {string[]} files 절대 경로
 * @param {{ root: string, check?: boolean }} options root는 메시지의 상대 경로 기준
 */
export async function hashHtmlFiles(files, { root, check = false }) {
  const { rewriteCspHtml, cspProblems } = await loadLib();
  if (files.length === 0) throw new CspHashRunError(`${root}에 HTML이 없습니다 — next build를 먼저 실행하세요.`);
  const problems = [];
  const writes = [];
  let withCsp = 0;
  let hashes = 0;
  for (const file of [...files].sort()) {
    const rel = relative(root, file);
    const before = await readFile(file, "utf8");
    let after = before;
    if (!check) {
      try {
        const r = rewriteCspHtml(before);
        after = r.html;
        hashes += r.hashes.length;
      } catch (e) {
        problems.push(`${rel}: ${e?.message ?? e}`);
        continue;
      }
      if (after !== before) writes.push([file, after]);
    }
    if (/http-equiv\s*=\s*["']?\s*content-security-policy/i.test(after)) withCsp++;
    for (const p of cspProblems(after)) problems.push(`${rel}: ${p}`);
  }
  if (problems.length > 0) throw new CspHashRunError(problems.join("\n  "));
  for (const [file, html] of writes) await writeFile(file, html, "utf8");
  return check
    ? `csp-hash: 확인 통과 — HTML ${files.length}개(CSP 메타 ${withCsp}개), script-src에 'unsafe-inline'·자리표시자 없음, 인라인 스크립트 해시 모두 있음`
    : `csp-hash: HTML ${files.length}개(CSP 메타 ${withCsp}개) 중 ${writes.length}개를 고침 — 인라인 스크립트 해시 ${hashes}개, 확인 통과`;
}

// MARK: Next 빌드 어댑터

/** @type {{ name: string, onBuildComplete: (ctx: { outputs: { staticFiles: { filePath: string }[] }, projectDir: string }) => Promise<void> }} */
const adapter = {
  name: "onmom-csp-hash",
  async onBuildComplete({ outputs, projectDir }) {
    // output: "export"면 staticFiles가 곧 out/의 파일 전부다
    const files = outputs.staticFiles.map((f) => f.filePath).filter((p) => p.endsWith(".html"));
    try {
      console.log(await hashHtmlFiles(files, { root: projectDir }));
    } catch (e) {
      // next build가 이 메시지를 "Build error occurred" 아래에 한 번 보여 주고 실패로 끝난다
      throw new CspHashRunError(`csp-hash: 실패 — 빌드를 멈춥니다.\n  ${e?.message ?? e}`);
    }
  },
};
export default adapter;

// MARK: 명령

async function htmlFilesIn(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries.filter((e) => e.isFile() && e.name.endsWith(".html")).map((e) => join(e.parentPath, e.name));
}

function isMain() {
  try {
    return process.argv[1] !== undefined && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isMain()) {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const dirArg = args.find((a) => !a.startsWith("--"));
  const outDir = resolve(dirArg ?? join(fileURLToPath(new URL("..", import.meta.url)), "out"));
  try {
    let files;
    try {
      files = await htmlFilesIn(outDir);
    } catch (e) {
      throw new CspHashRunError(`${outDir}을(를) 읽지 못했습니다 — next build를 먼저 실행하세요.\n  ${e?.message ?? e}`);
    }
    console.log(await hashHtmlFiles(files, { root: outDir, check }));
  } catch (e) {
    console.error(`csp-hash: 실패 — 빌드를 멈춥니다.\n  ${e?.message ?? e}`);
    process.exit(1);
  }
}
