// 글자 크게·확대·좁은 폭에서 화면이 깨지지 않는지 — docs/ACCESSIBILITY.md §1-1·§3의 자동 검사를 시험으로 옮긴 것.
// 한 번의 page.evaluate로 지금 화면(맨 위 → 각 컨트롤 위치로 스크롤)을 잰다:
//   - 문서 가로 넘침(가로 스크롤이 생김) — WCAG 1.4.4·1.4.10
//   - 화면 오른쪽(또는 왼쪽) 밖으로 나간 요소(가로로 스크롤하는 상자 안은 제외)
//   - 잘린 글자 — overflow 숨김·말줄임 상자 안에서 글자가 넘침(가로·세로)
//   - 짓눌린 글자 — 4글자 이상인 글줄의 폭이 글자 2개(2em)보다 좁음(날짜 칸 옆 라벨이 한 줄에 1~2글자로 세로로 늘어지던 문제, §3)
//   - 컨트롤(단추·링크·입력·스위치·슬라이더…)을 보이는 곳으로 스크롤했을 때 화면 밖이거나 다른 요소(붙는 막대 등)에 가려짐
// 예외는 선택자 + 이유로만(LAYOUT_ALLOWANCES).
import type { Page } from "@playwright/test";
import { expect } from "./fixtures";

export interface LayoutProblem {
  kind: "page-hscroll" | "offscreen" | "clipped-text" | "squeezed-text" | "control-covered" | "control-offscreen";
  target: string;
  detail: string;
}

export interface LayoutAllowance {
  kind: LayoutProblem["kind"];
  selector: string;
  reason: string;
}

/** 근거가 있는 예외만 — 선택자에 맞는 요소(또는 그 안)에 걸린 문제만 뺀다 */
export const LAYOUT_ALLOWANCES: readonly LayoutAllowance[] = [
  {
    kind: "clipped-text",
    selector: "[data-allow-truncate]",
    reason: "한 줄 말줄임을 일부러 둔 글자(기록장 목록 글 제목 — iOS lineLimit(1), docs/ACCESSIBILITY.md §6 '그대로 둔 것'). 전체 글은 글 상세에 있다",
  },
];

export async function layoutProblems(page: Page): Promise<LayoutProblem[]> {
  const allowances = LAYOUT_ALLOWANCES.map(({ kind, selector }) => ({ kind, selector }));
  return page.evaluate((allowances) => {
    const problems: { kind: string; target: string; detail: string; el: Element | null }[] = [];
    const doc = document.documentElement;
    const vw = doc.clientWidth;
    const vh = window.innerHeight;
    const describe = (el: Element) => {
      const id = el.id ? `#${el.id}` : "";
      const cls = typeof el.className === "string" && el.className ? `.${el.className.trim().split(/\s+/).slice(0, 4).join(".")}` : "";
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
      const name = el.getAttribute("aria-label") ?? "";
      return `${el.tagName.toLowerCase()}${id}${cls}${name ? ` [${name}]` : ""}${text ? ` "${text}"` : ""}`;
    };
    const visible = (el: Element) => {
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    /** 화면 낭독기 전용(sr-only)·1px 상자 — 보이는 배치 검사에서 뺀다 */
    const srOnly = (el: Element) => {
      for (let n: Element | null = el; n; n = n.parentElement) {
        const s = getComputedStyle(n);
        const r = n.getBoundingClientRect();
        if ((r.width <= 1 && r.height <= 1) || (s.clip && s.clip !== "auto") || s.clipPath.startsWith("inset(50%")) return true;
      }
      return false;
    };
    /** 가로로 스크롤하는 상자 안인가(그 안에서는 화면 밖으로 나가도 된다 — 스크롤해서 본다) */
    const inHorizontalScroller = (el: Element) => {
      for (let n = el.parentElement; n && n !== doc && n !== document.body; n = n.parentElement) {
        const s = getComputedStyle(n);
        if ((s.overflowX === "auto" || s.overflowX === "scroll") && n.scrollWidth > n.clientWidth) return true;
      }
      return false;
    };
    const ownText = (el: Element) =>
      [...el.childNodes]
        .filter((c) => c.nodeType === Node.TEXT_NODE)
        .map((c) => c.textContent ?? "")
        .join("")
        .replace(/\s+/g, " ")
        .trim();

    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    if (doc.scrollWidth > vw + 1) {
      problems.push({ kind: "page-hscroll", target: "document", detail: `scrollWidth ${doc.scrollWidth} > ${vw}`, el: null });
    }

    const all = [...document.body.querySelectorAll("*")].filter((el) => !el.closest("script, style, template, noscript, next-route-announcer"));
    for (const el of all) {
      if (!visible(el) || srOnly(el)) continue;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      // 화면 밖(가로) — fixed·sticky가 아닌 것도 문서 기준으로 같은 x라 그대로 잰다
      if ((r.right > vw + 1 || r.left < -1) && !inHorizontalScroller(el) && s.position !== "fixed") {
        problems.push({ kind: "offscreen", target: describe(el), detail: `left ${Math.round(r.left)} right ${Math.round(r.right)} > ${vw}`, el });
      }
      const text = (el.textContent ?? "").trim();
      if (text.length === 0) continue;
      // 잘린 글자 — 숨김·말줄임 상자에서 내용이 넘친다
      const hidesX = s.overflowX === "hidden" || s.overflowX === "clip" || s.textOverflow === "ellipsis";
      const hidesY = s.overflowY === "hidden" || s.overflowY === "clip";
      if (hidesX && el.scrollWidth > el.clientWidth + 1) {
        problems.push({ kind: "clipped-text", target: describe(el), detail: `가로 ${el.scrollWidth} > ${el.clientWidth}`, el });
      } else if (hidesY && el.scrollHeight > el.clientHeight + 1 && !s.webkitLineClamp?.match(/^\d/)) {
        problems.push({ kind: "clipped-text", target: describe(el), detail: `세로 ${el.scrollHeight} > ${el.clientHeight}`, el });
      }
      // 짓눌린 글자 — 자기 글자가 4자 이상인데 폭이 2em보다 좁다
      const own = ownText(el);
      const fontSize = parseFloat(s.fontSize);
      if (own.length >= 4 && r.width < fontSize * 2 && s.writingMode.startsWith("horizontal")) {
        problems.push({ kind: "squeezed-text", target: describe(el), detail: `폭 ${Math.round(r.width)}px < 2em(${fontSize * 2}px)`, el });
      }
    }

    // 컨트롤 — 보이는 곳으로 스크롤한 뒤 화면 안이고, 가운데를 다른 요소(붙는 탭바·아래 고정 단추 등)가 덮지 않아야 한다.
    // 모달(<dialog> showModal)이 열려 있으면 뒤 화면은 비활성이라 창 안의 컨트롤만 본다.
    const modal = document.querySelector("dialog:modal");
    const controls = [
      ...(modal ?? document.body).querySelectorAll(
        "a[href], button, input:not([type=hidden]), textarea, select, summary, [role=switch], [role=slider], [role=radio], [role=checkbox], [tabindex]:not([tabindex='-1'])",
      ),
    ].filter((el) => visible(el) && !srOnly(el) && !el.closest("[inert], dialog:not([open])"));
    for (const el of controls) {
      el.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
      const r = el.getBoundingClientRect();
      if (r.left < -1 || r.right > vw + 1) {
        problems.push({ kind: "control-offscreen", target: describe(el), detail: `left ${Math.round(r.left)} right ${Math.round(r.right)} (폭 ${vw})`, el });
        continue;
      }
      const cx = Math.min(Math.max(r.left + r.width / 2, 0), vw - 1);
      const cy = Math.min(Math.max(r.top + r.height / 2, 0), vh - 1);
      const hit = document.elementFromPoint(cx, cy);
      if (hit === null) continue;
      // 라벨을 눌러도 같은 컨트롤이다(줄 전체가 라벨인 라디오·체크 행)
      const label = hit.closest("label");
      const labels = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement ? [...(el.labels ?? [])] : [];
      const ok =
        hit === el ||
        el.contains(hit) ||
        (label !== null && (label.contains(el) || labels.includes(label))) ||
        // 상자가 화면보다 크면(긴 글 영역) 가운데가 화면 밖일 수 있다 — 화면 안에 걸친 것만 본다
        r.height > vh;
      if (!ok) problems.push({ kind: "control-covered", target: describe(el), detail: `가운데(${Math.round(cx)},${Math.round(cy)})를 ${describe(hit)}가 덮음`, el });
    }
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });

    return problems
      .filter((p) => !allowances.some((a) => a.kind === p.kind && p.el !== null && p.el.closest(a.selector) !== null))
      .map(({ kind, target, detail }) => ({ kind, target, detail }));
  }, allowances) as Promise<LayoutProblem[]>;
}

/** 지금 화면에 배치 문제가 없어야 한다 — soft: 같은 시험의 다음 화면까지 본다 */
export async function expectNoLayoutProblems(page: Page, label: string): Promise<void> {
  const problems = await layoutProblems(page);
  // 같은 종류·같은 요소 설명은 한 번만
  const unique = [...new Map(problems.map((p) => [`${p.kind} ${p.target}`, p])).values()];
  expect.soft(unique, `${label}\n${unique.map((p) => `  - ${p.kind}: ${p.target} — ${p.detail}`).join("\n")}`).toEqual([]);
}

/** 글자 크기 150% — 브라우저 기본 글자 크기를 바꾼 것처럼(rem 기준인 이 사이트의 모든 글자가 1.5배). 화면을 옮겨도 유지된다. */
export async function applyRootFontSize150(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const apply = () => {
      if (document.documentElement) document.documentElement.style.fontSize = "150%";
    };
    apply();
    document.addEventListener("DOMContentLoaded", apply);
  });
}
