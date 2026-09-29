// 접근성·복원력 소스 검사(브라우저 없이) — docs/ACCESSIBILITY.md의 "자동 검사" 절.
// - 오류 화면(src/app/error.tsx·global-error.tsx·not-found.tsx): 클라이언트 경계, 한국어 문구, 다시 시도, 오류 내용 로그 금지.
// - globals.css: 움직임 줄이기 전역 규칙, 포커스 링 토큰·base 층, 확대 존중(text-size-adjust).
// - 껍데기(AppShell): 본문 바로가기 + 화면 전환 뒤 초점 이동(RouteFocus).
// - 공용 UI·껍데기·app 폴더: 글자가 들어가는 상자에 고정 높이(h-숫자·h-[…])를 쓰지 않는다 — 글자 150%에서 잘리지 않게(08 §4 완료 기준).
//   기능 폴더(features)는 다른 담당이라 여기서 막지 않고 목록만 문서에 적는다.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ERROR_SCREEN_TEXT, ErrorScreen } from "./ErrorScreen";

const SRC = fileURLToPath(new URL("../../", import.meta.url));
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

/** 주석을 뺀 소스 — 주석에 적힌 "error.message"·":focus-visible" 같은 말이 검사에 걸리지 않게(TS·TSX·CSS 공용). */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\s\/\/.*$/gm, ""); // "https://" 앞은 ':'라 지워지지 않는다
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(tsx|ts|css)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
}

describe("오류 경계 화면", () => {
  const errorPage = read("app/error.tsx");
  const globalError = read("app/global-error.tsx");
  const notFound = read("app/not-found.tsx");
  const screen = read("components/shell/ErrorScreen.tsx");

  it("error.tsx·global-error.tsx는 클라이언트 경계이고 retry를 [다시 시도]에 잇는다", () => {
    for (const src of [errorPage, globalError]) {
      expect(src.trimStart().startsWith('"use client"')).toBe(true);
      expect(src).toMatch(/retry/);
      expect(src).toContain("ErrorScreen");
    }
  });

  it('global-error는 <html lang="ko">·<body>와 전역 스타일을 스스로 갖춘다(루트 레이아웃을 대신하므로)', () => {
    expect(globalError).toContain('<html lang="ko"');
    expect(globalError).toContain("<body");
    expect(globalError).toContain('import "./globals.css"');
  });

  it("오류 내용을 화면·콘솔에 내지 않는다(민감정보 로그 금지 — web/07 §2)", () => {
    for (const src of [errorPage, globalError, screen].map(stripComments)) {
      expect(src).not.toMatch(/console\./);
      expect(src).not.toMatch(/error\.(message|stack|digest)/);
      expect(src).not.toMatch(/\{error\}|\{error\.|JSON\.stringify\(error/);
    }
  });

  it("오류 화면: 한국어 제목·[다시 시도]·[홈으로](앱 홈 /home/, 서비스 소개 아님)", () => {
    const html = renderToStaticMarkup(h(ErrorScreen, { onRetry: () => {} }));
    expect(html).toContain("<h1");
    expect(html).toContain(ERROR_SCREEN_TEXT.title);
    expect(html).toContain(ERROR_SCREEN_TEXT.body);
    expect(html).toContain(`<button type="button"`);
    expect(html).toContain(ERROR_SCREEN_TEXT.retry);
    expect(html).toMatch(/href="[^"]*\/home\/"/);
    expect(html).not.toMatch(/href="\/"/);
    // 새 문구는 표시해 둔다
    expect(screen).toContain("웹 신규 문구 — CPO 확인 필요");
  });

  it("오류 화면이 나타나면 초점이 제목(h1 tabIndex -1)으로 간다 — 누르던 버튼이 사라져 <body>로 떨어지지 않게", () => {
    const html = renderToStaticMarkup(h(ErrorScreen, { onRetry: () => {} }));
    expect(html).toMatch(/<h1[^>]*tabindex="-1"/);
    expect(html).toMatch(/<h1[^>]*focus:outline-none/); // 제목은 컨트롤이 아니라 링 없이 초점만
    const code = stripComments(screen);
    expect(code).toMatch(/ref=\{headingRef\}/);
    expect(code).toMatch(/useEffect\(\(\) => \{\s*headingRef\.current\?\.focus\(\);?\s*\}, \[\]\)/);
  });

  it("not-found.tsx: 서버 컴포넌트, 한국어 제목 metadata + noindex, 홈·서비스 소개 링크(ROUTES)", () => {
    expect(notFound.trimStart().startsWith('"use client"')).toBe(false);
    expect(notFound).toContain("export const metadata");
    expect(notFound).toMatch(/robots:\s*\{\s*index:\s*false/);
    expect(notFound).toContain("ROUTES.home");
    expect(notFound).toContain("ROUTES.landing");
    expect(notFound).not.toMatch(/href="\//); // 문자열 경로 금지(DEV_NOTES §4)
    expect(notFound).toContain("CardColumn");
    expect(notFound).toContain("웹 신규 문구 — CPO 확인 필요");
  });
});

describe("globals.css — 확대·움직임 줄이기·포커스", () => {
  const css = stripComments(read("app/globals.css"));

  it("움직임 줄이기 전역 규칙(애니메이션·전환·부드러운 스크롤)", () => {
    const block = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(block).toContain("animation-duration");
    expect(block).toContain("transition-duration");
    expect(block).toContain("scroll-behavior: auto");
  });

  it("포커스 링은 base 층 — 유틸리티(focus:outline-none 등)가 덮을 수 있다", () => {
    const layer = /@layer base\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(layer).toMatch(/:focus-visible\s*\{[^}]*outline: 2px solid var\(--color-focus-ring\)/);
    expect(layer).toContain("outline-offset: 2px");
    // 층 밖에 :focus-visible 규칙이 남아 있지 않다
    expect(css.replace(/@layer base\s*\{[\s\S]*?\n\}/, "")).not.toMatch(/:focus-visible/);
  });

  it("글씨 확대를 막지 않는다(text-size-adjust 100%, px 고정 font-size 없음)", () => {
    expect(css).toContain("-webkit-text-size-adjust: 100%");
    expect(css).not.toMatch(/font-size:\s*\d+px/);
  });

  it("브라우저 확대(핀치 줌)를 막지 않는다 — 루트 viewport에 maximumScale·userScalable=false 없음(WCAG 1.4.4)", () => {
    const layout = stripComments(read("app/layout.tsx"));
    expect(layout).toMatch(/export const viewport/);
    expect(layout).not.toMatch(/maximumScale/);
    expect(layout).not.toMatch(/userScalable\s*:\s*false/);
  });
});

describe("앱 껍데기 — 본문 바로가기·화면 전환 뒤 초점", () => {
  const shell = read("components/shell/AppShell.tsx");

  it("본문 바로가기가 첫 초점이고, 목표는 tabIndex -1 본문 묶음", () => {
    expect(shell).toMatch(/href=\{`#\$\{APP_CONTENT_ID\}`\}/);
    expect(shell).toMatch(/id=\{APP_CONTENT_ID\}\s+tabIndex=\{-1\}/);
  });

  it("화면이 바뀌면 초점을 본문 묶음으로 옮긴다(RouteFocus)", () => {
    expect(shell).toContain("<RouteFocus targetId={APP_CONTENT_ID} />");
    const focus = read("components/shell/RouteFocus.tsx");
    expect(focus).toContain("usePathname");
    expect(focus).toMatch(/focus\(\{ preventScroll: true \}\)/);
  });
});

describe("고정 높이 상자 — 공용 UI·껍데기·app 폴더", () => {
  // h-숫자, h-[…], h-(…) — 글자가 들어가는 요소의 높이를 고정하면 150% 확대에서 잘린다. min-h·max-h·h-full·h-dvh·h-px·h-auto는 괜찮다.
  // size-*·아이콘(svg)·aria-hidden 장식은 글자가 없어 제외한다. 예외는 줄 끝 주석 `// a11y: fixed-height ok — 이유` 로 표시한다.
  const FIXED_HEIGHT = /(?:^|[\s"'`])(?:sm:|md:|lg:|xl:|max-lg:)*h-(?:\d+(?:\.\d+)?|\[[^\]]+\]|\([^)]+\))(?=[\s"'`]|$)/;
  const DECORATIVE = /aria-hidden|<svg|<Icon\b|lucide/;
  const dirs = ["components/ui", "components/shell", "app"];

  /** 이 줄이 속한 JSX 요소의 여는 태그부터 이 줄까지에 장식 표시가 있는가 — className이 cx(...)로 여러 줄에 나뉜 경우까지 본다. */
  function isDecorative(lines: string[], index: number): boolean {
    for (let i = index; i >= Math.max(0, index - 8); i--) {
      if (DECORATIVE.test(lines[i])) return true;
      if (i < index && /<[A-Za-z]/.test(lines[i])) return false; // 다른 요소의 여는 태그에 닿았다
    }
    return false;
  }

  it("텍스트 상자에 h-숫자·h-[…]를 쓰지 않는다", () => {
    const hits: string[] = [];
    for (const dir of dirs) {
      for (const file of walk(join(SRC, dir))) {
        if (!file.endsWith(".tsx")) continue;
        const lines = readFileSync(file, "utf8").split("\n");
        lines.forEach((line, i) => {
          if (!FIXED_HEIGHT.test(line)) return;
          if (/a11y: fixed-height ok/.test(line)) return;
          if (isDecorative(lines, i)) return;
          hits.push(`${relative(SRC, file)}:${i + 1}: ${line.trim().slice(0, 100)}`);
        });
      }
    }
    expect(hits, hits.join("\n")).toEqual([]);
  });
});
