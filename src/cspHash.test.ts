import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCsp, SCRIPT_HASHES_PLACEHOLDER as CSP_PLACEHOLDER, type CspInput } from "./csp";
import {
  cspProblems,
  CspHashError,
  decodeAttribute,
  encodeAttribute,
  findInlineScripts,
  rewriteCspHtml,
  SCRIPT_HASHES_PLACEHOLDER,
  scriptHash,
  withScriptHashes,
} from "./cspHash.mjs";

const sha = (text: string) => `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;

const NONE: CspInput = { supabaseUrl: null, kakaoJsKey: null, turnstileSiteKey: null, legacyBackends: [] };
const KAKAO: CspInput = { ...NONE, supabaseUrl: "https://proj.supabase.test", kakaoJsKey: "k", turnstileSiteKey: "t" };

/** React가 그리는 CSP 메타(속성 값 인코딩 &#x27; 등)와 비슷한 모양의 페이지 */
function page(body: string, { policy = buildCsp(NONE), head = "" } = {}): string {
  return (
    `<!DOCTYPE html><html lang="ko"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>` +
    `<link rel="stylesheet" href="/onmom_web/_next/static/chunks/a.css" data-precedence="next"/>` +
    `<script src="/onmom_web/_next/static/chunks/b.js" async=""></script>` +
    `<meta http-equiv="Content-Security-Policy" content="${encodeAttribute(policy)}"/>${head}<title>온맘</title></head>` +
    `<body><div hidden=""><!--$--><!--/$--></div>${body}</body></html>`
  );
}

const NEXT_SCRIPTS = [
  "(self.__next_f=self.__next_f||[]).push([0])",
  'self.__next_f.push([1,"0:{\\"c\\":\\"산후 회복 \\u003c/script>\\"}\\n"])',
];
const nextBody = NEXT_SCRIPTS.map((s) => `<script>${s}</script>`).join("");

/** 다시 쓴 페이지 CSP 메타의 script-src 소스 목록 */
function scriptSrc(html: string): string[] {
  const m = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html);
  const policy = decodeAttribute(m?.[1] ?? "");
  return policy.split(";").map((d) => d.trim().split(/\s+/)).find((d) => d[0] === "script-src")?.slice(1) ?? [];
}

describe("자리표시자 — src/csp.ts와 같은 값", () => {
  it("csp.ts가 script-src에 넣는 값을 cspHash가 알아본다('unsafe-inline'은 없다)", () => {
    expect(SCRIPT_HASHES_PLACEHOLDER).toBe(CSP_PLACEHOLDER);
    const policy = buildCsp(KAKAO);
    expect(policy).toContain(`script-src 'self' ${SCRIPT_HASHES_PLACEHOLDER} `);
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });
});

describe("findInlineScripts — 브라우저가 실행하는 인라인 스크립트", () => {
  it("스크립트 안의 문자 참조는 풀지 않는다(raw text) — 해시도 글자 그대로", () => {
    const text = 'var a = "&amp; &lt;b&gt; &#x27;";';
    const [s] = findInlineScripts(page(`<script>${text}</script>`));
    expect(s.text).toBe(text);
    expect(scriptHash(s.text)).toBe(sha(text));
    expect(scriptHash(s.text)).not.toBe(sha(`var a = "& <b> '";`));
  });

  it("여러 개 — 문서 순서, src가 있는 스크립트는 뺀다", () => {
    const scripts = findInlineScripts(page(nextBody + `<script src="/x.js"></script><script>c()</script>`));
    expect(scripts.map((s) => s.text)).toEqual([...NEXT_SCRIPTS, "c()"]);
    expect(scripts.every((s) => s.executable)).toBe(true);
  });

  it("데이터 블록(application/json·ld+json·템플릿)은 실행되지 않는다 — 해시 대상 아님", () => {
    const html = page(
      `<script type="application/json">{"a":1}</script>` +
        `<script type="application/ld+json">{"@context":"https://schema.org"}</script>` +
        `<script type="text/x-template"><div></div></script>` +
        `<script type="module">m()</script><script type="text/javascript">j()</script><script type="">e()</script>` +
        `<script type=" TEXT/JavaScript ">u()</script><script language="javascript">l()</script><script type="importmap">{}</script>`,
    );
    const run = findInlineScripts(html).filter((s) => s.executable).map((s) => s.text);
    expect(run).toEqual(["m()", "j()", "e()", "u()", "l()", "{}"]);
  });

  it("주석·raw text 요소(style·textarea·title·noscript) 안의 <script> 글자는 스크립트가 아니다", () => {
    const html = page(
      `<!-- <script>no1()</script> --><style>a::after{content:"<script>no2()</script>"}</style>` +
        `<textarea><script>no3()</script></textarea><noscript><script>no4()</script></noscript><script>yes()</script>`,
      { head: `<title>&lt;script&gt; <script>no5()</script></title>` },
    );
    expect(findInlineScripts(html).map((s) => s.text)).toEqual(["yes()"]);
  });

  it("태그 이름 대소문자·끝 태그 공백·따옴표 속성 안의 '>'·따옴표 없는 속성", () => {
    const html = page(`<SCRIPT data-x="a>b" data-y='c>d' id=z>A()</SCRIPT ><script>"</scr"+"ipt>"</script >`);
    expect(findInlineScripts(html).map((s) => s.text)).toEqual(["A()", '"</scr"+"ipt>"']);
  });

  it("해시는 브라우저가 보는 글자로 — CRLF·CR은 LF로", () => {
    const [s] = findInlineScripts(page("<script>a()\r\nb()\rc()</script>"));
    expect(scriptHash(s.text)).toBe(sha("a()\nb()\nc()"));
    // NUL은 토크나이저가 U+FFFD로 바꾼다
    expect(scriptHash(`a${String.fromCharCode(0)}b`)).toBe(sha(`a${String.fromCharCode(0xfffd)}b`));
  });

  it("확신할 수 없는 모양은 추측하지 않고 멈춘다", () => {
    expect(() => findInlineScripts(page("<script>a('<!--')</script>"))).toThrow(CspHashError);
    expect(() => findInlineScripts(page("<svg><script>a()</script></svg>"))).toThrow(CspHashError);
    expect(() => findInlineScripts(page("<script>a()"))).toThrow(CspHashError);
    expect(() => findInlineScripts('<meta content="x')).toThrow(CspHashError);
    // 스크립트 없는 SVG·스스로 닫는 SVG는 괜찮다
    expect(findInlineScripts(page('<svg viewBox="0 0 1 1"><path d="M0"></path></svg><svg/><script>ok()</script>')).map((s) => s.text)).toEqual(["ok()"]);
  });
});

describe("문자 참조", () => {
  it("React가 쓰는 참조와 숫자 참조를 풀고, 인코딩은 되돌린다", () => {
    expect(decodeAttribute("&#x27;self&#x27; &amp; &quot;a&quot; &lt;&gt; &#39; &apos;")).toBe(`'self' & "a" <> ' '`);
    expect(decodeAttribute(encodeAttribute(`script-src 'self' "x" & <y>`))).toBe(`script-src 'self' "x" & <y>`);
    expect(encodeAttribute("'self'")).toBe("&#x27;self&#x27;");
  });

  it("모르는 이름 참조·잘못된 숫자 참조는 멈춘다", () => {
    expect(() => decodeAttribute("&nbsp;")).toThrow(CspHashError);
    expect(() => decodeAttribute("&amp")).toThrow(CspHashError);
    expect(() => decodeAttribute("&#0;")).toThrow(CspHashError);
  });
});

describe("withScriptHashes — script-src만 고친다", () => {
  const policy = buildCsp(KAKAO);

  it("자리표시자 자리에 해시, 출처·다른 지시어(style-src 'unsafe-inline')는 그대로", () => {
    const out = withScriptHashes(policy, [sha("a"), sha("b"), sha("a")]);
    expect(out).toContain(`script-src 'self' ${sha("a")} ${sha("b")} dapi.kakao.com t1.daumcdn.net https://challenges.cloudflare.com;`);
    expect(out).toContain("style-src 'self' 'unsafe-inline'");
    expect(out.replace(/script-src[^;]*/, "")).toBe(policy.replace(/script-src[^;]*/, ""));
  });

  it("인라인 스크립트가 없으면 자리표시자만 빠진다", () => {
    expect(withScriptHashes(policy, [])).toContain("script-src 'self' dapi.kakao.com");
  });

  it("다시 불러도 같다, 빠진 해시만 이미 있는 해시 뒤에 더한다", () => {
    const once = withScriptHashes(policy, [sha("a")]);
    expect(withScriptHashes(once, [sha("a")])).toBe(once);
    expect(withScriptHashes(once, [sha("a"), sha("b")])).toContain(`'self' ${sha("a")} ${sha("b")} dapi.kakao.com`);
  });

  it("'unsafe-inline'·script-src 없음·여럿·script-src-elem은 멈춘다", () => {
    expect(() => withScriptHashes("script-src 'self' 'unsafe-inline'", [])).toThrow(/unsafe-inline/);
    expect(() => withScriptHashes("script-src 'self' 'UNSAFE-INLINE'", [])).toThrow(CspHashError);
    expect(() => withScriptHashes("default-src 'self'", [])).toThrow(/script-src/);
    expect(() => withScriptHashes("script-src 'self'; script-src 'none'", [])).toThrow(CspHashError);
    expect(() => withScriptHashes(`script-src 'self' ${SCRIPT_HASHES_PLACEHOLDER}; script-src-elem 'self'`, [])).toThrow(/script-src-elem/);
  });
});

describe("rewriteCspHtml — 페이지 한 장", () => {
  it("실행되는 인라인 스크립트의 해시가 script-src에 들어가고 'unsafe-inline'·자리표시자가 없다", () => {
    const html = page(nextBody + `<script type="application/json">{"skip":true}</script>`, { policy: buildCsp(KAKAO) });
    const r = rewriteCspHtml(html);
    expect(r.hasCsp).toBe(true);
    expect(r.hashes).toEqual(NEXT_SCRIPTS.map(sha));
    expect(scriptSrc(r.html)).toEqual(["'self'", ...NEXT_SCRIPTS.map(sha), "dapi.kakao.com", "t1.daumcdn.net", "https://challenges.cloudflare.com"]);
    expect(cspProblems(r.html)).toEqual([]);
    // 메타 밖(스크립트 본문 등)은 한 글자도 바뀌지 않는다
    expect(r.html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, "")).toBe(html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, ""));
  });

  it("메타를 <meta charset> 바로 뒤로 옮긴다(메타 정책은 그 앞 요소에 적용되지 않는다)", () => {
    const r = rewriteCspHtml(page(nextBody));
    expect(r.html.startsWith('<!DOCTYPE html><html lang="ko"><head><meta charSet="utf-8"/><meta http-equiv="Content-Security-Policy" content="')).toBe(true);
    expect(r.html.match(/Content-Security-Policy/g)).toHaveLength(1);
  });

  it("여러 번 해도 결과가 같다", () => {
    const html = page(nextBody, { policy: buildCsp(KAKAO) });
    const once = rewriteCspHtml(html).html;
    expect(rewriteCspHtml(once).html).toBe(once);
    expect(rewriteCspHtml(rewriteCspHtml(once).html).html).toBe(once);
  });

  it("인라인 스크립트가 없는 페이지 — 해시 없이 자리표시자만 빠진다", () => {
    const r = rewriteCspHtml(page(""));
    expect(r.hashes).toEqual([]);
    expect(scriptSrc(r.html)).toEqual(["'self'"]);
    expect(cspProblems(r.html)).toEqual([]);
  });

  it("CSP 메타가 없는 페이지(개발 빌드)는 그대로", () => {
    const html = `<!DOCTYPE html><html><head><meta charSet="utf-8"/></head><body>${nextBody}</body></html>`;
    expect(rewriteCspHtml(html)).toEqual({ html, hasCsp: false, hashes: [] });
    expect(cspProblems(html)).toEqual([]);
  });

  it("고칠 수 없는 CSP 메타는 멈춘다 — 둘 이상·content 없음·'unsafe-inline'", () => {
    const two = page(nextBody, { head: `<meta http-equiv="content-security-policy" content="script-src &#x27;self&#x27;"/>` });
    expect(() => rewriteCspHtml(two)).toThrow(/2개/);
    expect(() => rewriteCspHtml(page("").replace(/(http-equiv="Content-Security-Policy") content="[^"]*"/, "$1"))).toThrow(/content/);
    expect(() => rewriteCspHtml(page(nextBody, { policy: "default-src 'self'; script-src 'self' 'unsafe-inline'" }))).toThrow(/unsafe-inline/);
  });
});

describe("cspProblems — 남은 'unsafe-inline'·자리표시자·빠진 해시", () => {
  it("다시 쓰지 않은 페이지는 자리표시자가 남았다고 알린다", () => {
    expect(cspProblems(page(nextBody))).toEqual([
      `script-src에 자리표시자 ${SCRIPT_HASHES_PLACEHOLDER}가 남아 있습니다`,
      "인라인 스크립트 2개의 해시가 script-src에 없습니다",
    ]);
  });

  it("script-src(또는 script-src-elem)의 'unsafe-inline'을 잡는다 — style-src의 것은 괜찮다", () => {
    const withUnsafe = page("", { policy: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'" });
    expect(cspProblems(withUnsafe)).toContain("script-src에 'unsafe-inline'이 남아 있습니다");
    const elem = page("", { policy: "script-src 'self'; script-src-elem 'unsafe-inline'" });
    expect(cspProblems(elem)).toContain("script-src-elem에 'unsafe-inline'이 남아 있습니다");
    expect(cspProblems(page("", { policy: "script-src 'self'; style-src 'unsafe-inline'" }))).toEqual([]);
  });

  it("해시가 하나라도 빠지면 알린다", () => {
    const done = rewriteCspHtml(page(nextBody)).html;
    const missing = done.replace(`${encodeAttribute(sha(NEXT_SCRIPTS[1]))} `, "").replace(` ${encodeAttribute(sha(NEXT_SCRIPTS[1]))}`, "");
    expect(cspProblems(missing)).toEqual(["인라인 스크립트 1개의 해시가 script-src에 없습니다"]);
  });
});

describe("scripts/csp-hash.mjs — Node가 그대로 실행(빌드 뒤 단계·확인)", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
    vi.restoreAllMocks();
  });
  const script = join(__dirname, "..", "scripts", "csp-hash.mjs");
  const run = (...args: string[]) => execFileSync(process.execPath, [script, ...args], { encoding: "utf8", stdio: "pipe" });

  function fixture(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), "csp-hash-"));
    dirs.push(dir);
    for (const [rel, html] of Object.entries(files)) {
      mkdirSync(join(dir, rel, ".."), { recursive: true });
      writeFileSync(join(dir, rel), html);
    }
    return dir;
  }

  it("out/을 다시 쓰고, --check가 통과하고, 다시 해도 바뀌지 않는다", () => {
    const out = fixture({ "index.html": page(nextBody), "login/index.html": page("<script>x()</script>"), "dev.html": "<p>no csp</p>" });
    expect(() => run(out, "--check")).toThrow(); // 다시 쓰기 전 — 자리표시자가 남았다
    expect(run(out)).toContain("CSP 메타 2개) 중 2개를 고침");
    const first = readFileSync(join(out, "index.html"), "utf8");
    expect(scriptSrc(first)).toEqual(["'self'", ...NEXT_SCRIPTS.map(sha)]);
    expect(run(out, "--check")).toContain("확인 통과");
    expect(run(out)).toContain("중 0개를 고침");
    expect(readFileSync(join(out, "index.html"), "utf8")).toBe(first);
    expect(readFileSync(join(out, "dev.html"), "utf8")).toBe("<p>no csp</p>");
  });

  it("한 페이지라도 고칠 수 없으면 1로 끝나고 아무 파일도 쓰지 않는다", () => {
    const good = page(nextBody);
    const out = fixture({ "a.html": good, "b.html": page("", { policy: "script-src 'self' 'unsafe-inline'" }) });
    expect(() => run(out)).toThrow(/unsafe-inline/);
    expect(readFileSync(join(out, "a.html"), "utf8")).toBe(good);
  });

  it("HTML이 없거나 폴더가 없으면 실패한다(next build 전)", () => {
    const out = fixture({ "a.txt": "x" });
    expect(() => run(out)).toThrow(/HTML이 없습니다/);
    expect(() => run(join(out, "missing"))).toThrow(/읽지 못했습니다/);
  });

  it("Next 빌드 어댑터 — onBuildComplete가 staticFiles의 HTML을 다시 쓴다", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const out = fixture({ "index.html": page(nextBody), "_next/static/chunks/a.js": "x" });
    const adapter = (await import("../scripts/csp-hash.mjs")).default;
    expect(adapter.name).toBe("onmom-csp-hash");
    const staticFiles = ["index.html", "_next/static/chunks/a.js"].map((f) => ({ filePath: join(out, f) }));
    await adapter.onBuildComplete({ outputs: { staticFiles }, projectDir: out });
    expect(cspProblems(readFileSync(join(out, "index.html"), "utf8"))).toEqual([]);
    const bad = fixture({ "index.html": page("", { policy: "script-src 'unsafe-inline'" }) });
    await expect(adapter.onBuildComplete({ outputs: { staticFiles: [{ filePath: join(bad, "index.html") }] }, projectDir: bad })).rejects.toThrow(/unsafe-inline/);
  });
});
