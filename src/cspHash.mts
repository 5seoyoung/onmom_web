// 인라인 스크립트 해시 CSP — `next build` 뒤 out/**/*.html을 다시 쓰는 순수 로직(읽기·쓰기는 scripts/csp-hash.mjs).
//
// 왜: Next 정적 내보내기는 페이지마다 RSC 페이로드를 인라인 <script>(self.__next_f.push(…))로 넣는다. nonce는 요청마다 만드는 서버가
// 없어 못 쓰므로, 빌드 뒤 페이지마다 실행되는 인라인 스크립트의 sha256을 계산해 그 페이지 CSP 메타의 script-src에 넣는다.
// src/csp.ts는 script-src에 자리표시자(SCRIPT_HASHES_PLACEHOLDER)를 넣고, 여기서 그 자리를 해시로 바꾼다. 'unsafe-inline'은 받지 않는다.
//
// Node가 그대로 불러온다(22.18+/24의 TypeScript 타입 제거 — CI는 Node 24). 그래서
// - 지울 수 있는 타입 문법만 쓴다(enum·namespace·매개변수 속성 없음), 다른 src 모듈을 불러오지 않는다(확장자 없는 import는 Node가 못 찾는다).
// - 확장자가 .mts다 — package.json에 "type"이 없어 .ts면 Node가 매번 모듈 형식 경고를 낸다.
//
// HTML은 브라우저 토크나이저 규칙대로 읽는다(주석·raw text 요소·따옴표 속성). 확신할 수 없는 모양(스크립트 안의 "<!--", SVG 안 스크립트,
// 모르는 문자 참조, 닫히지 않은 태그)은 추측하지 않고 CspHashError로 빌드를 멈춘다 — 틀린 해시는 운영에서 화면을 멈추기 때문이다.
import { createHash } from "node:crypto";

/** src/csp.ts의 SCRIPT_HASHES_PLACEHOLDER와 같은 값(Node가 csp.ts를 불러올 수 없어 따로 적는다 — 테스트가 같은지 확인). */
export const SCRIPT_HASHES_PLACEHOLDER = "'onmom-script-hashes'";

export class CspHashError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CspHashError";
  }
}

// MARK: HTML 읽기

interface AttrSpan {
  /** 따옴표 안의 원문(문자 참조를 풀기 전) */
  raw: string;
  /** 값 전체(따옴표 포함)의 위치 — [start, end) */
  start: number;
  end: number;
}

interface StartTag {
  name: string;
  start: number;
  end: number;
  selfClosing: boolean;
  /** 이름은 소문자. 같은 이름이 두 번이면 처음 것(브라우저와 같다) */
  attrs: Map<string, AttrSpan | null>;
}

export interface InlineScript {
  /** 브라우저가 보는 스크립트 글자(<script>와 </script> 사이 그대로 — 문자 참조는 풀리지 않는다) */
  text: string;
  /** CSP가 검사하는 스크립트인지(고전·module·importmap·speculationrules). 아니면 데이터 블록(application/json 등) */
  executable: boolean;
}

interface Scan {
  /** HTML 이름공간의 <meta> 시작 태그(문서 순서) */
  metas: StartTag[];
  scripts: InlineScript[];
  /** </head> 또는 <body>가 처음 나온 위치 — 그 앞의 메타만 <head> 안으로 본다 */
  headEnd: number;
}

// 내용을 태그로 읽지 않는 요소(raw text·RCDATA). noscript는 스크립트가 켜진 브라우저 기준
const RAW_TEXT = new Set(["script", "style", "xmp", "iframe", "noembed", "noframes", "noscript", "textarea", "title"]);
const FOREIGN = new Set(["svg", "math"]);

function isSpace(c: string | undefined): boolean {
  return c === " " || c === "\t" || c === "\n" || c === "\f" || c === "\r";
}

function isAlpha(c: string | undefined): boolean {
  return c !== undefined && /^[A-Za-z]$/.test(c);
}

function unterminated(what: string, at: number): CspHashError {
  return new CspHashError(`HTML을 읽을 수 없습니다 — ${at}번째 글자에서 시작한 ${what}이(가) 닫히지 않았습니다`);
}

/** html[lt] === "<" 인 시작·끝 태그 하나를 읽는다(브라우저 토크나이저의 태그·속성 상태). */
function readTag(html: string, lt: number): StartTag {
  const n = html.length;
  let i = lt + 1;
  if (html[i] === "/") i++; // 끝 태그
  const nameStart = i;
  while (i < n && !isSpace(html[i]) && html[i] !== "/" && html[i] !== ">") i++;
  const name = html.slice(nameStart, i).toLowerCase();
  const attrs = new Map<string, AttrSpan | null>();
  let selfClosing = false;
  for (;;) {
    while (i < n && isSpace(html[i])) i++;
    if (i >= n) throw unterminated(`<${name}> 태그`, lt);
    if (html[i] === ">") return { name, start: lt, end: i + 1, selfClosing, attrs };
    if (html[i] === "/") {
      if (html[i + 1] === ">") {
        selfClosing = true;
        return { name, start: lt, end: i + 2, selfClosing, attrs };
      }
      i++;
      continue;
    }
    // 속성 이름 — 첫 글자는 "="여도 이름에 들어간다
    const attrStart = i++;
    while (i < n && !isSpace(html[i]) && html[i] !== "/" && html[i] !== ">" && html[i] !== "=") i++;
    const attrName = html.slice(attrStart, i).toLowerCase();
    while (i < n && isSpace(html[i])) i++;
    let value: AttrSpan | null = null;
    if (html[i] === "=") {
      i++;
      while (i < n && isSpace(html[i])) i++;
      const q = html[i];
      if (q === '"' || q === "'") {
        const close = html.indexOf(q, i + 1);
        if (close < 0) throw unterminated(`<${name}> 속성 값`, lt);
        value = { raw: html.slice(i + 1, close), start: i, end: close + 1 };
        i = close + 1;
      } else {
        const vs = i;
        while (i < n && !isSpace(html[i]) && html[i] !== ">") i++;
        value = { raw: html.slice(vs, i), start: vs, end: i };
      }
    }
    if (!attrs.has(attrName)) attrs.set(attrName, value);
  }
}

/** from부터 "</name" + (공백 · / · >)가 처음 나오는 위치(대소문자 무시) */
function findEndTag(html: string, from: number, name: string): number {
  const re = new RegExp(`</${name}[\\t\\n\\f\\r />]`, "gi");
  re.lastIndex = from;
  const m = re.exec(html);
  return m ? m.index : -1;
}

/** <!-- 주석의 끝 다음 위치(<!-->·<!--->도 주석이다) */
function commentEnd(html: string, lt: number): number {
  const body = lt + 4;
  if (html.startsWith(">", body)) return body + 1;
  if (html.startsWith("->", body)) return body + 2;
  const re = /--!?>/g;
  re.lastIndex = body;
  const m = re.exec(html);
  if (!m) throw unterminated("주석", lt);
  return m.index + m[0].length;
}

function afterGt(html: string, from: number, what: string, lt: number): number {
  const gt = html.indexOf(">", from);
  if (gt < 0) throw unterminated(what, lt);
  return gt + 1;
}

/** HTML 명세의 JavaScript MIME type(대소문자 무시, 매개변수 없이) + module·importmap·speculationrules — 모두 script-src가 검사한다 */
const EXECUTABLE_TYPES = new Set([
  "",
  "application/ecmascript",
  "application/javascript",
  "application/x-ecmascript",
  "application/x-javascript",
  "text/ecmascript",
  "text/javascript",
  "text/javascript1.0",
  "text/javascript1.1",
  "text/javascript1.2",
  "text/javascript1.3",
  "text/javascript1.4",
  "text/javascript1.5",
  "text/jscript",
  "text/livescript",
  "text/x-ecmascript",
  "text/x-javascript",
  "module",
  "importmap",
  "speculationrules",
]);

function isExecutable(tag: StartTag): boolean {
  const type = tag.attrs.get("type");
  const language = tag.attrs.get("language");
  let t: string;
  if (tag.attrs.has("type")) t = decodeAttribute(type?.raw ?? "");
  else if (tag.attrs.has("language") && (language?.raw ?? "") !== "") t = `text/${decodeAttribute(language?.raw ?? "")}`;
  else t = "";
  // 명세는 type=" "(공백만)을 데이터 블록으로 보지만, 해시를 하나 더 넣는 쪽이 안전해 실행되는 것으로 센다
  return EXECUTABLE_TYPES.has(t.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "").toLowerCase());
}

function scan(html: string): Scan {
  const metas: StartTag[] = [];
  const scripts: InlineScript[] = [];
  let headEnd = html.length;
  let foreignDepth = 0;
  let i = 0;
  for (;;) {
    const lt = html.indexOf("<", i);
    if (lt < 0) break;
    const next = html[lt + 1];
    if (html.startsWith("<!--", lt)) {
      i = commentEnd(html, lt);
    } else if (foreignDepth > 0 && html.startsWith("<![CDATA[", lt)) {
      const close = html.indexOf("]]>", lt + 9);
      if (close < 0) throw unterminated("CDATA", lt);
      i = close + 3;
    } else if (next === "!" || next === "?") {
      i = afterGt(html, lt + 2, "선언", lt); // <!DOCTYPE>, 가짜 주석
    } else if (next === "/") {
      if (isAlpha(html[lt + 2])) {
        const tag = readTag(html, lt);
        if (foreignDepth > 0 && FOREIGN.has(tag.name)) foreignDepth--;
        if (foreignDepth === 0 && tag.name === "head") headEnd = Math.min(headEnd, lt);
        i = tag.end;
      } else if (html[lt + 2] === ">") {
        i = lt + 3;
      } else {
        i = afterGt(html, lt + 2, "끝 태그", lt);
      }
    } else if (!isAlpha(next)) {
      i = lt + 1; // 글자로서의 "<"
    } else {
      const tag = readTag(html, lt);
      i = tag.end;
      if (foreignDepth > 0) {
        // SVG·MathML 안은 raw text 규칙이 다르고, 그 안의 <script>도 실행된다 — 추측하지 않는다
        if (tag.name === "script") throw new CspHashError("SVG·MathML 안의 <script>는 해시를 계산하지 않습니다 — 그런 스크립트를 넣지 마세요");
        if (FOREIGN.has(tag.name) && !tag.selfClosing) foreignDepth++;
        continue;
      }
      if (tag.name === "body") headEnd = Math.min(headEnd, lt);
      if (tag.name === "meta") metas.push(tag);
      if (FOREIGN.has(tag.name)) {
        if (!tag.selfClosing) foreignDepth = 1;
        continue;
      }
      if (tag.name === "plaintext") break; // 문서 끝까지 글자
      if (!RAW_TEXT.has(tag.name)) continue;
      const close = findEndTag(html, tag.end, tag.name);
      if (close < 0) throw unterminated(`<${tag.name}>`, lt);
      if (tag.name === "script" && !tag.attrs.has("src")) {
        const text = html.slice(tag.end, close);
        // "<!--"가 있으면 토크나이저가 escape 상태로 들어가 </script>의 뜻이 달라질 수 있다. Next는 페이로드의 "<"를 JS 유니코드
        // 이스케이프(백슬래시 u003c)로 바꿔 넣으므로 생기지 않는다
        if (text.includes("<!--")) throw new CspHashError(`인라인 스크립트(${lt}번째 글자)에 "<!--"가 있어 끝을 확신할 수 없습니다`);
        scripts.push({ text, executable: isExecutable(tag) });
      }
      i = readTag(html, close).end;
    }
  }
  return { metas, scripts, headEnd };
}

/** 페이지의 인라인 <script>(src 없는 것) 전부 — 문서 순서 */
export function findInlineScripts(html: string): InlineScript[] {
  return scan(html).scripts;
}

// MARK: 문자 참조

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** 속성 값의 문자 참조를 푼다. React가 쓰는 것(&amp; &lt; &gt; &quot; &#x27;)과 숫자 참조만 — 그 밖의 이름 참조는 오류. */
export function decodeAttribute(raw: string): string {
  return raw.replace(/&(#[xX][0-9A-Fa-f]+;?|#[0-9]+;?|[A-Za-z][A-Za-z0-9]*;?)/g, (ref: string, body: string) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X";
      const code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (!(code > 0 && code <= 0x10ffff) || (code >= 0xd800 && code <= 0xdfff) || (code >= 0x80 && code <= 0x9f)) {
        throw new CspHashError(`속성 값의 문자 참조 ${ref}를 풀 수 없습니다`);
      }
      return String.fromCodePoint(code);
    }
    const name = body.endsWith(";") ? body.slice(0, -1) : "";
    const ch = NAMED[name];
    if (ch === undefined) throw new CspHashError(`속성 값의 문자 참조 ${ref}는 다루지 않습니다`);
    return ch;
  });
}

const ESCAPES: Record<string, string> = { "&": "&amp;", '"': "&quot;", "'": "&#x27;", "<": "&lt;", ">": "&gt;" };

/** 큰따옴표 속성 값으로 — React와 같은 방식(&amp; &quot; &#x27; &lt; &gt;) */
export function encodeAttribute(value: string): string {
  return value.replace(/[&"'<>]/g, (c) => ESCAPES[c] ?? c);
}

// MARK: 해시·정책

const REPLACEMENT_CHARACTER = String.fromCharCode(0xfffd);

/** CSP 해시 소스 'sha256-…' — 브라우저처럼 줄바꿈(CRLF·CR → LF)과 NUL(→ U+FFFD)을 고친 글자의 UTF-8 */
export function scriptHash(text: string): string {
  const seen = text.replace(/\r\n?/g, "\n").replace(/\0/g, REPLACEMENT_CHARACTER);
  return `'sha256-${createHash("sha256").update(seen, "utf8").digest("base64")}'`;
}

const HASH_SOURCE = /^'sha(256|384|512)-[A-Za-z0-9+/_-]+={0,2}'$/i;

interface Directive {
  /** policy.split(";")의 몇 번째 조각인지 */
  index: number;
  name: string;
  sources: string[];
}

function directives(policy: string): Directive[] {
  return policy.split(";").flatMap((piece, index) => {
    const tokens = piece.split(/[\t\n\f\r ]+/).filter((t) => t !== "");
    return tokens.length === 0 ? [] : [{ index, name: tokens[0].toLowerCase(), sources: tokens.slice(1) }];
  });
}

/**
 * 정책의 script-src에 해시를 넣는다 — 자리표시자 자리에(없으면 이미 있는 해시 뒤, 그것도 없으면 끝에), 이미 있는 해시는 다시 넣지 않는다.
 * 같은 해시로 두 번 불러도 결과가 같다. script-src가 없거나 여럿이거나, 'unsafe-inline'·script-src-elem이 있으면 CspHashError.
 */
export function withScriptHashes(policy: string, hashes: readonly string[]): string {
  const all = directives(policy);
  const scriptSrc = all.filter((d) => d.name === "script-src");
  if (scriptSrc.length !== 1) throw new CspHashError(`CSP에 script-src가 ${scriptSrc.length}개입니다(1개여야 합니다)`);
  if (all.some((d) => d.name === "script-src-elem")) {
    throw new CspHashError("CSP에 script-src-elem이 있습니다 — 스크립트 요소에는 그 지시어가 쓰여 script-src의 해시가 효과가 없습니다");
  }
  const d = scriptSrc[0];
  if (d.sources.some((s) => s.toLowerCase() === "'unsafe-inline'")) {
    throw new CspHashError(
      `script-src에 'unsafe-inline'이 있습니다 — src/csp.ts는 그 자리에 ${SCRIPT_HASHES_PLACEHOLDER}를 넣어야 합니다(해시가 대신한다)`,
    );
  }
  const present = new Set(d.sources.filter((s) => HASH_SOURCE.test(s)));
  const toAdd = [...new Set(hashes)].filter((h) => !present.has(h));
  const placeholder = d.sources.indexOf(SCRIPT_HASHES_PLACEHOLDER);
  if (placeholder < 0 && toAdd.length === 0) return policy; // 이미 끝난 페이지 — 글자 하나 바꾸지 않는다
  const kept = d.sources.filter((s) => s !== SCRIPT_HASHES_PLACEHOLDER);
  let at: number;
  if (placeholder >= 0) at = placeholder;
  else {
    const lastHash = kept.findLastIndex((s) => HASH_SOURCE.test(s));
    at = lastHash >= 0 ? lastHash + 1 : kept.length;
  }
  const sources = [...kept.slice(0, at), ...toAdd, ...kept.slice(at)];
  const pieces = policy.split(";");
  const lead = /^[\t\n\f\r ]*/.exec(pieces[d.index])?.[0] ?? "";
  pieces[d.index] = `${lead}script-src${sources.length > 0 ? ` ${sources.join(" ")}` : ""}`;
  return pieces.join(";");
}

function isCspMeta(tag: StartTag): boolean {
  const v = tag.attrs.get("http-equiv");
  return v != null && decodeAttribute(v.raw).trim().toLowerCase() === "content-security-policy";
}

export interface RewriteResult {
  html: string;
  /** 이 페이지에 CSP 메타가 있었는지(개발 빌드 등 없으면 그대로 둔다) */
  hasCsp: boolean;
  /** script-src에 들어간(이미 있던 것 포함) 이 페이지 인라인 스크립트의 해시 */
  hashes: string[];
}

/**
 * 한 페이지를 다시 쓴다: 실행되는 인라인 스크립트의 해시를 CSP 메타 script-src에 넣고, 메타를 <meta charset> 바로 뒤로 옮긴다
 * (메타 정책은 그보다 앞에 나온 요소에 적용되지 않는다 — Next는 자기 CSS·스크립트 청크를 메타 앞에 둔다). 다시 불러도 결과가 같다.
 * CSP 메타가 없으면 그대로. 메타가 여럿이거나 content가 없거나 정책을 고칠 수 없으면 CspHashError.
 */
export function rewriteCspHtml(html: string): RewriteResult {
  const { metas, scripts, headEnd } = scan(html);
  const csp = metas.filter(isCspMeta);
  if (csp.length === 0) return { html, hasCsp: false, hashes: [] };
  if (csp.length > 1) throw new CspHashError(`CSP 메타가 ${csp.length}개입니다(1개여야 합니다)`);
  const meta = csp[0];
  const content = meta.attrs.get("content");
  if (!content) throw new CspHashError("CSP 메타에 content가 없습니다");
  const hashes = [...new Set(scripts.filter((s) => s.executable).map((s) => scriptHash(s.text)))];
  const policy = withScriptHashes(decodeAttribute(content.raw), hashes);
  const tag = `${html.slice(meta.start, content.start)}"${encodeAttribute(policy)}"${html.slice(content.end, meta.end)}`;
  const charset = metas.find((m) => m.attrs.has("charset"));
  const out =
    charset && charset.end <= meta.start && meta.start < headEnd
      ? html.slice(0, charset.end) + tag + html.slice(charset.end, meta.start) + html.slice(meta.end)
      : html.slice(0, meta.start) + tag + html.slice(meta.end);
  return { html: out, hasCsp: true, hashes };
}

// MARK: 확인

/** CSP 메타 content(느슨하게 — 정규식) 목록. 토크나이저와 따로 찾아 다시 쓰기에서 빠진 메타도 잡는다. */
function looseCspContents(html: string): string[] {
  const out: string[] = [];
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (!/http-equiv\s*=\s*["']?\s*content-security-policy(?=[\s"'/>])/i.test(tag)) continue;
    const m = /\scontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const raw = m ? (m[1] ?? m[2] ?? m[3] ?? "") : "";
    // 풀 수 없는 참조는 원문 그대로 둔다(여기서는 찾기만)
    out.push(raw.replace(/&#x27;|&#39;|&apos;/gi, "'").replace(/&quot;|&#x22;|&#34;/gi, '"').replace(/&amp;/gi, "&"));
  }
  return out;
}

/**
 * 다시 쓴 페이지가 올바른지 — 문제 목록(비었으면 통과).
 * - (느슨) 어느 CSP 메타든 script-src·script-src-elem에 'unsafe-inline'이나 자리표시자가 남았으면 문제.
 * - (엄격) CSP 메타가 하나일 때, 실행되는 인라인 스크립트의 해시가 모두 script-src에 있어야 한다.
 */
export function cspProblems(html: string): string[] {
  const problems: string[] = [];
  for (const policy of looseCspContents(html)) {
    for (const d of directives(policy)) {
      if (d.name !== "script-src" && d.name !== "script-src-elem") continue;
      if (d.sources.some((s) => s.toLowerCase() === "'unsafe-inline'")) problems.push(`${d.name}에 'unsafe-inline'이 남아 있습니다`);
      if (d.sources.includes(SCRIPT_HASHES_PLACEHOLDER)) problems.push(`${d.name}에 자리표시자 ${SCRIPT_HASHES_PLACEHOLDER}가 남아 있습니다`);
    }
  }
  let s: Scan;
  try {
    s = scan(html);
  } catch (e) {
    return [...problems, e instanceof Error ? e.message : String(e)];
  }
  const csp = s.metas.filter(isCspMeta);
  if (csp.length > 1) problems.push(`CSP 메타가 ${csp.length}개입니다`);
  if (csp.length !== 1) return problems;
  const content = csp[0].attrs.get("content");
  let sources: string[] = [];
  try {
    sources = directives(decodeAttribute(content?.raw ?? "")).find((d) => d.name === "script-src")?.sources ?? [];
  } catch (e) {
    problems.push(e instanceof Error ? e.message : String(e));
  }
  const missing = s.scripts.filter((x) => x.executable && !sources.includes(scriptHash(x.text))).length;
  if (missing > 0) problems.push(`인라인 스크립트 ${missing}개의 해시가 script-src에 없습니다`);
  return problems;
}
