// axe-core 접근성 검사 — WCAG 2.0·2.1 A/AA 규칙 + 이 저장소의 화면 규칙(docs/dev/ACCESSIBILITY.md §9: 화면마다 <main>·h1 하나, 제목 단계 건너뛰지 않음).
// axe를 page.evaluate로 넣는다(<script> 태그를 더하지 않는다) — 페이지의 CSP(인라인 스크립트 해시)를 느슨하게 하지 않고, 위반으로 세지도 않게.
// 예외는 규칙 + 선택자 + 이유로만 둔다(아래 EXCLUSIONS) — 화면 전체·규칙 전체를 끄지 않는다.
import axe from "axe-core";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/** WCAG 2.1 A/AA(2.0 포함) — axe 태그 */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/**
 * 태그 밖(best-practice)이지만 이 저장소가 규칙으로 정한 것(docs/dev/ACCESSIBILITY.md §9) — 켠다.
 * heading-order(제목 건너뜀) · page-has-heading-one · landmark-one-main · landmark-no-duplicate-main · landmark-unique(같은 이름의 같은 랜드마크)
 */
const HOUSE_RULES = ["heading-order", "page-has-heading-one", "landmark-one-main", "landmark-no-duplicate-main", "landmark-unique"];

export interface AxeExclusion {
  /** axe 규칙 id */
  rule: string;
  /** 이 선택자에 맞는 요소(자신)에 걸린 위반만 뺀다 */
  selector: string;
  /** 왜 빼도 되는지 — 실패 메시지·문서에 그대로 */
  reason: string;
}

/**
 * 근거가 있는 예외만. 2026-11-08 기준 — ACCESSIBILITY §6의 "결정 전" 대비 3건(코랄 위 흰 글씨 2.76:1·출처 칩 inverse 2.22:1·
 * 스위치 꺼짐 트랙 1.65:1)은 2026-11-04 CPO 12 결정(04a5382 — strong 코랄·control-off)으로 고쳐져 예외가 필요 없다.
 */
export const EXCLUSIONS: readonly AxeExclusion[] = [
  {
    rule: "color-contrast",
    // 로그인 h1(로고 그림 + "온맘") · 홈 머리 h1 "온맘"(폰) · PC 사이드바 로고 글자 — 셋 다 원색 코랄 #FB6F6F(배경 위 2.64~2.76:1)
    selector: "[data-logotype]",
    reason: "WCAG 1.4.3 예외(Logotypes) — 브랜드 이름 '온맘' 워드마크는 글자 대비 요구 대상이 아니다(docs/dev/ACCESSIBILITY.md §4 끝)",
  },
];

export interface AxeViolationSummary {
  rule: string;
  impact: string | null;
  help: string;
  nodes: { target: string; html: string; summary: string }[];
}

interface AxeRunOptions {
  /** 이 화면에서만 쓰는 예외(공용 EXCLUSIONS에 더한다) */
  exclusions?: readonly AxeExclusion[];
  /** 검사할 부분(기본 문서 전체) — CSS 선택자 */
  include?: string;
}

export interface AxeOutcome {
  /** 위반(예외를 뺀 뒤) — 없어야 한다 */
  violations: AxeViolationSummary[];
  /** axe가 스스로 판단하지 못한 것(겹친 배경·그림 위 글자의 대비 등) — 실패로 세지 않고 보고서에 붙인다(사람이 볼 것) */
  incomplete: AxeViolationSummary[];
}

/** axe를 돌린다. 같은 페이지에 다시 넣지 않는다. */
export async function runAxe(page: Page, options: AxeRunOptions = {}): Promise<AxeOutcome> {
  const injected = await page.evaluate(() => typeof (window as unknown as { axe?: unknown }).axe !== "undefined");
  if (!injected) await page.evaluate(axe.source);
  const exclusions = [...EXCLUSIONS, ...(options.exclusions ?? [])].map(({ rule, selector }) => ({ rule, selector }));
  return page.evaluate(
    async ({ tags, houseRules, exclusions, include }) => {
      const w = window as unknown as { axe: typeof import("axe-core") };
      const rules: Record<string, { enabled: boolean }> = {};
      for (const id of houseRules) rules[id] = { enabled: true };
      const results = await w.axe.run(include ?? document, {
        runOnly: { type: "tag", values: tags },
        rules,
        resultTypes: ["violations", "incomplete"],
        elementRef: true,
      });
      const summarize = (list: typeof results.violations) =>
        list
          .map((v) => ({
            rule: v.id,
            impact: v.impact ?? null,
            help: v.help,
            nodes: v.nodes
              .filter((n) => {
                const el = n.element;
                return !exclusions.some((x) => x.rule === v.id && el instanceof Element && el.matches(x.selector));
              })
              .map((n) => ({ target: n.target.join(" "), html: n.html.slice(0, 300), summary: n.failureSummary ?? "" })),
          }))
          .filter((v) => v.nodes.length > 0);
      return { violations: summarize(results.violations), incomplete: summarize(results.incomplete) };
    },
    { tags: WCAG_TAGS, houseRules: HOUSE_RULES, exclusions, include: options.include ?? null },
  );
}

/** 위반을 사람이 읽을 글로 — 실패 메시지에 그대로 */
export function formatViolations(violations: readonly AxeViolationSummary[]): string {
  return violations
    .map((v) => `[${v.impact}] ${v.rule}: ${v.help}\n${v.nodes.map((n) => `  - ${n.target}\n    ${n.html}\n    ${n.summary.replace(/\n/g, "\n    ")}`).join("\n")}`)
    .join("\n\n");
}

/**
 * 지금 화면에 axe 위반이 없어야 한다 — soft: 한 화면이 걸려도 같은 시험의 다음 화면까지 보고 한 번에 알린다.
 * 판단하지 못한 것(incomplete)은 시험 보고서(playwright-report)에 첨부만 한다.
 */
export async function expectNoAxeViolations(page: Page, label: string, options: AxeRunOptions = {}): Promise<void> {
  const { violations, incomplete } = await runAxe(page, options);
  if (incomplete.length > 0) {
    await test.info().attach(`axe 판단 보류 — ${label}`, { body: formatViolations(incomplete), contentType: "text/plain" });
  }
  expect.soft(violations, `${label}\n${formatViolations(violations)}`).toEqual([]);
}
