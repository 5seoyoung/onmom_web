// 색 대비 — src/app/globals.css의 @theme 토큰을 WCAG 2.x 상대 휘도 공식으로 잰다(브라우저 없이).
// - 글자 전용 토큰(state-*-text·primary-text·text-subtle-aa)은 실제로 깔리는 배경(흰 표면·background·coral-tint·divider·
//   배지 12%/15%·출처 칩 10%) 위에서 AA 4.5:1 — 그리고 원색과 같은 색상(hue)을 짙게만 한 값인지도 본다.
// - 포커스 링 토큰은 비텍스트 3:1(WCAG 1.4.11).
// - iOS 원색을 글자로 쓰면 못 미친다는 사실은 it.fails로 적어 둔다(docs/DEV_NOTES.md §3 CPO 12): 원색이 바뀌어 통과하면 그 it.fails가
//   실패하므로, 그때 글자 전용 토큰을 거두고 원색으로 돌아갈 수 있다. 표는 docs/ACCESSIBILITY.md.
// - 공용 컴포넌트가 글자에 원색 대신 글자 전용 토큰을 쓰는지도 소스로 확인한다(기능 폴더는 다른 담당 — 문서에 목록).
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const css = here("../../app/globals.css");

/** `--color-<name>: #rrggbb;` 토큰 전부 */
export function themeColors(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of source.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]] = m[2].toLowerCase();
  return out;
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG 상대 휘도 */
export function luminance(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** WCAG 대비(1~21). 순서는 상관없다. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** 반투명 배경(예: 12% 배지)을 아래 색과 섞은 결과 — 배지 글자 대비는 이 색 위에서 잰다 */
export function blend(top: string, alpha: number, under: string): string {
  const t = parseInt(top.slice(1), 16);
  const u = parseInt(under.slice(1), 16);
  const mix = (shift: number) => Math.round(((t >> shift) & 255) * alpha + ((u >> shift) & 255) * (1 - alpha));
  return `#${[16, 8, 0].map((s) => mix(s).toString(16).padStart(2, "0")).join("")}`;
}

/** HSL 색상각(0~360) — 글자 전용 토큰이 원색과 같은 색 계열인지 볼 때 */
export function hue(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = 60 * (max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4);
  return h < 0 ? h + 360 : h;
}

function hueDistance(a: string, b: string): number {
  const d = Math.abs(hue(a) - hue(b)) % 360;
  return Math.min(d, 360 - d);
}

const C = themeColors(css);
const WHITE = "#ffffff";
const AA_TEXT = 4.5;
const AA_LARGE = 3; // 18pt 이상 또는 14pt 굵게
const AA_NON_TEXT = 3; // 포커스 링·컨트롤 경계(WCAG 1.4.11)
const STATES = ["normal", "watch", "alert"] as const;

describe("색 토큰(globals.css @theme)", () => {
  it("검사에 필요한 토큰이 모두 있다", () => {
    for (const name of [
      "primary", "neutral", "background", "surface", "divider", "coral-tint",
      "state-normal", "state-watch", "state-alert", "text-primary", "text-secondary", "text-subtle",
      "focus-ring", "state-normal-text", "state-watch-text", "state-alert-text", "primary-text", "text-subtle-aa",
    ]) {
      expect(C[name], name).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("공식 확인 — 흰/검 21:1, 같은 색 1:1", () => {
    expect(contrast(WHITE, "#000000")).toBeCloseTo(21, 5);
    expect(contrast(C.primary, C.primary)).toBe(1);
  });
});

describe("본문 글자 — AA 4.5:1", () => {
  it("text-primary·text-secondary는 surface·background·coral-tint·divider 위에서 4.5:1 이상", () => {
    for (const fg of [C["text-primary"], C["text-secondary"]]) {
      for (const bg of [C.surface, C.background, C["coral-tint"], C.divider]) expect(contrast(fg, bg)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it("주 버튼(neutral 배경·흰 글씨)은 4.5:1 이상", () => {
    expect(contrast(WHITE, C.neutral)).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe("글자 전용 토큰 — 원색이 깔린 배경 위에서도 AA 4.5:1 (CPO 12 기본값)", () => {
  const plain = () => [C.surface, C.background, C["coral-tint"], C.divider];

  it("state-*-text: 흰 표면·배경·배지 12%(지표)·15%(운동) 위에서 4.5:1 이상", () => {
    for (const s of STATES) {
      const fg = C[`state-${s}-text`];
      const raw = C[`state-${s}`];
      for (const bg of [...plain(), blend(raw, 0.12, C.surface), blend(raw, 0.15, C.surface)]) {
        expect(contrast(fg, bg), `${s} / ${bg}`).toBeGreaterThanOrEqual(AA_TEXT);
      }
    }
  });

  it("primary-text: 흰 표면·배경·출처 칩 primary 10%·coral-tint 위에서 4.5:1 이상", () => {
    for (const bg of [...plain(), blend(C.primary, 0.1, C.surface)]) {
      expect(contrast(C["primary-text"], bg), bg).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it("text-subtle-aa: 흰 표면·배경·coral-tint·divider 위에서 4.5:1 이상", () => {
    for (const bg of plain()) expect(contrast(C["text-subtle-aa"], bg), bg).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("글자 전용 토큰은 원색과 같은 색상(hue ±10°)을 짙게만 한 값 — 다른 색으로 바뀌지 않았다", () => {
    for (const s of STATES) expect(hueDistance(C[`state-${s}-text`], C[`state-${s}`]), s).toBeLessThanOrEqual(10);
    expect(hueDistance(C["primary-text"], C.primary)).toBeLessThanOrEqual(10);
    expect(hueDistance(C["text-subtle-aa"], C["text-subtle"])).toBeLessThanOrEqual(10);
    for (const s of STATES) expect(luminance(C[`state-${s}-text`])).toBeLessThan(luminance(C[`state-${s}`]));
    expect(luminance(C["text-subtle-aa"])).toBeLessThan(luminance(C["text-subtle"]));
  });

  it("primary와 state-alert가 같은 색이면 primary-text와 state-alert-text도 같다", () => {
    if (C.primary === C["state-alert"]) expect(C["primary-text"]).toBe(C["state-alert-text"]);
  });
});

describe("포커스 링 — 비텍스트 대비 3:1(WCAG 1.4.11)", () => {
  it("focus-ring은 background·surface·coral-tint·divider 위에서 3:1 이상", () => {
    for (const bg of [C.background, C.surface, C["coral-tint"], C.divider]) expect(contrast(C["focus-ring"], bg)).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it("focus-ring은 코랄(primary)·상태색 배경 위에서도 3:1 이상 — 코랄 버튼·배지 옆에 그려져도 보인다", () => {
    for (const bg of [C.primary, C["state-alert"], C["state-watch"], C["state-normal"]]) expect(contrast(C["focus-ring"], bg)).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it("코랄(primary)은 흰 배경에서 3:1에 못 미친다 — 그래서 링에는 focus-ring 토큰을 쓴다", () => {
    expect(contrast(C.primary, C.surface)).toBeLessThan(AA_NON_TEXT);
  });

  it(":focus-visible 규칙이 focus-ring 토큰을 쓴다(primary가 아니다)", () => {
    const rule = /:focus-visible\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toContain("var(--color-focus-ring)");
    expect(rule).not.toContain("var(--color-primary)");
  });

  it("neutral 링은 neutral 면 위에서 1:1(안 보임) — 그래서 bg-neutral 안의 컨트롤은 surface 링(3:1 이상)", () => {
    expect(contrast(C["focus-ring"], C.neutral)).toBeLessThan(AA_NON_TEXT);
    expect(contrast(C.surface, C.neutral)).toBeGreaterThanOrEqual(AA_NON_TEXT);
    const rule = /\.bg-neutral\s+:focus-visible\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toMatch(/outline-color:\s*var\(--color-surface\)/);
  });
});

describe("공용 컴포넌트는 글자에 글자 전용 토큰을 쓴다(원색은 배경·아이콘·로고만)", () => {
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/.*$/gm, "");
  /** 원색 글자 클래스 — 뒤에 -text·-aa가 붙지 않은 것. 앞이 '-'이면 text-text-primary 같은 다른 클래스라 제외 */
  const RAW_TEXT_CLASS = /(?<![\w-])text-(?:state-(?:normal|watch|alert)|text-subtle|primary)(?=[\s"'`])/;

  it("StatusBadge: 글자 state-*-text, 배경 원색 12%/15%", () => {
    const src = here("./StatusBadge.tsx");
    for (const s of STATES) {
      expect(src).toContain(`bg-state-${s}/12 text-state-${s}-text`);
      expect(src).toContain(`bg-state-${s}/15 text-state-${s}-text`);
    }
    expect(stripComments(src)).not.toMatch(RAW_TEXT_CLASS);
  });

  it("EvidenceChip: 출처 칩 글자 primary-text, 배경 primary 10%", () => {
    expect(here("./EvidenceChip.tsx")).toContain("bg-primary/10 text-primary-text");
  });

  it("MeasurementField placeholder는 text-subtle-aa, NrsSlider 값은 primary-text, SideNav 활성 항목은 primary-text", () => {
    expect(here("./MeasurementField.tsx")).toContain("placeholder:text-text-subtle-aa");
    expect(here("./NrsSlider.tsx")).toContain("font-bold text-primary-text");
    expect(here("../shell/SideNav.tsx")).toMatch(/const itemActive = "[^"]*\btext-primary-text\b/);
  });

  /** 이 줄이 속한 JSX 요소(여는 태그부터 이 줄까지, 최대 8줄 위)가 장식(aria-hidden·svg·lucide 아이콘)인가 — className이 다음 줄에 있어도 본다. */
  function isDecorative(lines: string[], index: number): boolean {
    for (let i = index; i >= Math.max(0, index - 8); i--) {
      if (/aria-hidden|<svg|lucide/.test(lines[i])) return true;
      if (i < index && /<[A-Za-z]/.test(lines[i])) return false; // 다른 요소의 여는 태그에 닿았다
    }
    return false;
  }

  it("components/ui·shell의 글자에 원색 클래스가 남아 있지 않다(아이콘(aria-hidden)·로고 워드마크 줄은 제외)", () => {
    const root = fileURLToPath(new URL("../", import.meta.url));
    const hits: string[] = [];
    for (const dir of ["ui", "shell"]) {
      for (const name of readdirSync(join(root, dir))) {
        if (!name.endsWith(".tsx")) continue;
        const file = join(root, dir, name);
        const lines = stripComments(readFileSync(file, "utf8")).split("\n");
        lines.forEach((line, i) => {
          if (!RAW_TEXT_CLASS.test(line)) return;
          if (isDecorative(lines, i) && !/font-|text-\[/.test(line)) return; // 아이콘 색(글자 크기·굵기 클래스가 없는 장식 요소)
          if (/APP_NAV_TEXT\.brand/.test(line)) return; // 사이드바 워드마크 — logotype 예외
          hits.push(`${relative(root, file)}:${i + 1}: ${line.trim().slice(0, 100)}`);
        });
      }
    }
    expect(hits, hits.join("\n")).toEqual([]);
  });
});

// ─── iOS 원색을 글자로 쓰면 — 못 미침(그래서 글자 전용 토큰을 쓴다). 원색이 바뀌어 통과하면 아래가 실패하니 그때 토큰을 거둔다. ───
describe("iOS 원색 글자(DEV_NOTES §3 CPO 12 — it.fails = 지금은 못 미침)", () => {
  it.fails("흰 글씨 / primary 코랄(레드플래그 카드 라벨 15 bold — 큰 글씨 기준 3:1도 못 미침)", () => {
    expect(contrast(WHITE, C["state-alert"])).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it.fails("text-subtle(면책·placeholder) / surface 4.5:1", () => {
    expect(contrast(C["text-subtle"], C.surface)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.fails("state-watch 글자('{단계} 제외 — 사유' 줄) / surface 4.5:1", () => {
    expect(contrast(C["state-watch"], C.surface)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.fails("상태 배지 글자(state 원색) / 12% 같은 색 배경(surface 위) 4.5:1", () => {
    for (const s of STATES) expect(contrast(C[`state-${s}`], blend(C[`state-${s}`], 0.12, C.surface))).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.fails("출처 칩 글자(primary 원색) / primary 10% 배경 4.5:1", () => {
    expect(contrast(C.primary, blend(C.primary, 0.1, C.surface))).toBeGreaterThanOrEqual(AA_TEXT);
  });
});
