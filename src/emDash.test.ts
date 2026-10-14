// 2026-10-14 CPO 결정: 화면의 em dash(—)는 하이픈(-)으로.
// 화면·스크린리더·PDF 리포트·문서/공유 메타데이터에 닿는 글자(소스의 문자열·JSX 글자, content.json, 매니페스트)에 em dash가 없는지
// 소스에서 확인한다. 주석·테스트 파일은 보지 않는다(이용자에게 닿지 않는다).
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import content from "@/content";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SRC = join(ROOT, "src");
const EM_DASH = "—";

/** 이용자에게 닿지 않는 개발용 문구 — 빌드·모듈 로드 때만 멈추는 검사의 오류 메시지 */
const DEV_ONLY: ReadonlySet<string> = new Set([
  "src/cspHash.mts", // next build 뒤 scripts/csp-hash.mjs가 쓰는 검사(브라우저 번들에 들어가지 않는다)
  "src/rules/weight.ts", // content.json 형식이 바뀌면 모듈 로드(정적 빌드) 때 던지는 오류 — 화면에 그리지 않는다
]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx|mts)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && !/testUtils\.ts$/.test(e.name)) out.push(full);
  }
  return out;
}

const LITERALS = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.JsxText,
]);

/** 파일의 문자열·JSX 글자 중 em dash가 든 것 — "경로:줄: 글자" */
function emDashLiterals(file: string): string[] {
  const text = readFileSync(file, "utf8");
  if (!text.includes(EM_DASH)) return [];
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const hits: string[] = [];
  const visit = (node: ts.Node) => {
    if (LITERALS.has(node.kind) && node.getText(sf).includes(EM_DASH)) {
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      hits.push(`${relative(ROOT, file).split(sep).join("/")}:${line}: ${node.getText(sf).trim()}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

function jsonStrings(value: unknown, path: string, out: string[] = []): string[] {
  if (typeof value === "string") {
    if (value.includes(EM_DASH)) out.push(`${path}: ${value}`);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => jsonStrings(v, `${path}[${i}]`, out));
  } else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) jsonStrings(v, `${path}.${k}`, out);
  }
  return out;
}

describe("화면의 em dash(—)는 하이픈(-)으로(2026-10-14 CPO 결정)", () => {
  it("src의 문자열·JSX 글자에 em dash가 없다(개발용 검사 문구 제외)", () => {
    const files = sourceFiles(SRC).filter((f) => !DEV_ONLY.has(relative(ROOT, f).split(sep).join("/")));
    expect(files.length).toBeGreaterThan(100);
    expect(files.flatMap(emDashLiterals)).toEqual([]);
  });

  it("content.json 값에 em dash가 없다", () => {
    expect(jsonStrings(content, "content")).toEqual([]);
  });

  it("웹 앱 매니페스트(이름·설명)에 em dash가 없다", () => {
    const manifest: unknown = JSON.parse(readFileSync(join(ROOT, "public/manifest.webmanifest"), "utf8"));
    expect(jsonStrings(manifest, "manifest")).toEqual([]);
  });
});
