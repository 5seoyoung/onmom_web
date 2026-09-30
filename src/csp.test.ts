import { describe, expect, it } from "vitest";
import { buildCsp, cspDirectives, cspMetaContent, httpsOrigin, SCRIPT_HASHES_PLACEHOLDER, type CspInput } from "./csp";

const NONE: CspInput = { supabaseUrl: null, kakaoJsKey: null, turnstileSiteKey: null, legacyBackends: [] };
const ALL: CspInput = {
  supabaseUrl: "https://proj.supabase.test",
  kakaoJsKey: "kakao-js-key",
  turnstileSiteKey: "turnstile-site-key",
  legacyBackends: [null, "https://llm.onmom.test/v1/", null],
};

const directive = (input: CspInput, name: string) => cspDirectives(input).find(([k]) => k === name)?.[1];

describe("CSP — 설정된 기능의 출처만 넣는다", () => {
  it("설정이 없으면 제3자 출처가 하나도 없다(브라우저 전용 빌드)", () => {
    const csp = buildCsp(NONE);
    expect(csp).not.toMatch(/https:|wss:|kakao|daum/);
    expect(directive(NONE, "connect-src")).toEqual(["'self'"]);
    expect(directive(NONE, "frame-src")).toEqual(["'none'"]);
    expect(directive(NONE, "img-src")).toEqual(["'self'", "data:", "blob:"]);
  });

  it("기본 지시어 — 스크립트는 self + 인라인 해시 자리(빌드 뒤 채움), 'unsafe-inline'·eval 없음, 플러그인·base·form 막음", () => {
    const csp = buildCsp(ALL);
    expect(csp.startsWith("default-src 'self'; ")).toBe(true);
    expect(csp).not.toContain("unsafe-eval");
    expect(directive(ALL, "object-src")).toEqual(["'none'"]);
    expect(directive(ALL, "base-uri")).toEqual(["'self'"]);
    expect(directive(ALL, "form-action")).toEqual(["'self'"]);
    expect(directive(ALL, "worker-src")).toEqual(["'self'"]);
    expect(directive(ALL, "manifest-src")).toEqual(["'self'"]);
    expect(directive(ALL, "font-src")).toEqual(["'self'"]);
    expect(directive(ALL, "style-src")).toEqual(["'self'", "'unsafe-inline'"]);
    // 인라인 스크립트는 해시로만 — 자리표시자는 scripts/csp-hash.mjs가 페이지마다 'sha256-…'로 바꾼다(src/cspHash.test.ts)
    expect(directive(ALL, "script-src")?.slice(0, 2)).toEqual(["'self'", SCRIPT_HASHES_PLACEHOLDER]);
    expect(directive(ALL, "script-src")).not.toContain("'unsafe-inline'");
    // 메타에서 무시되는 지시어는 넣지 않는다(콘솔 경고만 남는다)
    expect(csp).not.toMatch(/frame-ancestors|report-uri|sandbox/);
  });

  it("Supabase — https와 Realtime(wss) origin만(경로 없이)", () => {
    expect(directive({ ...NONE, supabaseUrl: "https://proj.supabase.test/" }, "connect-src")).toEqual([
      "'self'",
      "https://proj.supabase.test",
      "wss://proj.supabase.test",
    ]);
    expect(directive(NONE, "script-src")).toEqual(["'self'", SCRIPT_HASHES_PLACEHOLDER]); // Supabase는 스크립트를 불러오지 않는다
  });

  it("카카오 지도 — 키가 있을 때만 SDK·장소 검색·타일 출처", () => {
    const k = { ...NONE, kakaoJsKey: "k" };
    // scheme 없는 호스트 — 운영(https 페이지)에서는 https만 허용된다
    expect(directive(k, "script-src")).toEqual(["'self'", SCRIPT_HASHES_PLACEHOLDER, "dapi.kakao.com", "t1.daumcdn.net"]);
    expect(directive(k, "connect-src")).toEqual(["'self'", "dapi.kakao.com"]);
    expect(directive(k, "img-src")).toEqual(["'self'", "data:", "blob:", "*.daumcdn.net"]);
    expect(buildCsp({ ...NONE, kakaoJsKey: "  " })).not.toContain("kakao");
  });

  it("Turnstile — 사이트 키가 있을 때만 스크립트·iframe", () => {
    const t = { ...NONE, turnstileSiteKey: "t" };
    expect(directive(t, "script-src")).toContain("https://challenges.cloudflare.com");
    expect(directive(t, "frame-src")).toEqual(["https://challenges.cloudflare.com"]);
  });

  it("예전 백엔드 주소는 connect-src에만, 중복·잘못된 값은 뺀다", () => {
    const input = { ...NONE, legacyBackends: ["https://api.onmom.test/a", "https://api.onmom.test/b", "javascript:alert(1)", "not a url", "http://evil.test"] };
    expect(directive(input, "connect-src")).toEqual(["'self'", "https://api.onmom.test"]);
    expect(buildCsp(input)).not.toMatch(/javascript:|evil/);
  });

  it("값에 세미콜론·공백을 넣어 지시어를 끼워 넣을 수 없다(origin만 쓴다)", () => {
    const csp = buildCsp({ ...NONE, supabaseUrl: "https://proj.supabase.test/; script-src *" });
    expect(csp).not.toContain("script-src *");
  });
});

describe("httpsOrigin", () => {
  it("https와 내 컴퓨터 http만", () => {
    expect(httpsOrigin("https://a.test/x?y=1")).toBe("https://a.test");
    expect(httpsOrigin("http://localhost:8080/v1")).toBe("http://localhost:8080");
    expect(httpsOrigin("http://a.test")).toBeNull();
    expect(httpsOrigin("")).toBeNull();
    expect(httpsOrigin(null)).toBeNull();
  });
});

describe("cspMetaContent — 운영 빌드에서만", () => {
  it("개발 서버·테스트에서는 싣지 않는다(eval·HMR 필요)", () => {
    expect(cspMetaContent(ALL, "development")).toBeNull();
    expect(cspMetaContent(ALL, "test")).toBeNull();
    expect(cspMetaContent(ALL, "production")).toBe(buildCsp(ALL));
  });
});

describe("public/robots.txt — 1.0 공개 전에는 모두 막는다", () => {
  it("NEXT_PUBLIC_SITE_INDEXABLE이 기본(false)인 동안 Disallow: / — 링크 미리보기 봇만 허용", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const txt = readFileSync(join(__dirname, "..", "public", "robots.txt"), "utf8");
    const rules = txt.split("\n").filter((l) => l.trim() !== "" && !l.startsWith("#"));
    expect(rules).toEqual([
      "User-agent: kakaotalk-scrap",
      "User-agent: Twitterbot",
      "User-agent: facebookexternalhit",
      "User-agent: Slackbot-LinkExpanding",
      "Allow: /",
      "User-agent: *",
      "Disallow: /",
    ]);
  });
});
