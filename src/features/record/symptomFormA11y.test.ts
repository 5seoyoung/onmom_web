// @vitest-environment jsdom
// 기록 폼의 위험 증상 토글·통증 슬라이더를 실제로 눌러 보는 검사(jsdom) — 2026-11-15 산부인과 전문의 의견 반영분.
// · 위험 증상의 기준 설명은 켰을 때만 그 토글 아래에 생기고, 그때만 스위치의 aria-describedby가 그 줄을 가리킨다.
// · 켜고 꺼도 스위치는 같은 요소로 남아 포커스가 그대로다.
// · 통증 슬라이더는 "NRS" 없이 이름 "통증 정도", 설명(aria-describedby)으로 0·10의 뜻을 듣는다.
// axe 규칙은 WCAG 2.1 A/AA — jsdom은 배치·색을 계산하지 못해 color-contrast는 끈다(대비는 components/ui/contrast.test.ts).
import { createElement as h, useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SymptomForm } from "@/rules/record";
import { INITIAL_SYMPTOM_FORM, RECORD_WEB_TEXT } from "./recordView";
import { SymptomFormCards } from "./SymptomFormCards";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Form() {
  const [form, setForm] = useState<SymptomForm>(INITIAL_SYMPTOM_FORM);
  return h(SymptomFormCards, { form, onChange: (patch) => setForm((f) => ({ ...f, ...patch })), showsLochia: false, showsNeighborhood: false });
}

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(h(Form)));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** 이름(연결된 <label>)으로 스위치 찾기 */
function switchNamed(name: string): HTMLButtonElement {
  const label = [...container.querySelectorAll("label")].find((l) => l.textContent === name);
  const el = label ? document.getElementById(label.htmlFor) : null;
  if (!(el instanceof HTMLButtonElement) || el.getAttribute("role") !== "switch") throw new Error(`switch ${name}`);
  return el;
}

/** aria-describedby가 가리키는 글자(없으면 null) */
function description(el: Element): string | null {
  const ids = el.getAttribute("aria-describedby");
  if (ids === null) return null;
  return ids
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent ?? `#${id} 없음`)
    .join(" ");
}

async function audit() {
  const result = await axe.run(container, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, rules: { "color-contrast": { enabled: false } } });
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

describe("위험 증상 — 기준 설명은 켰을 때만", () => {
  it("꺼져 있으면 설명도 aria-describedby도 없고, 켜면 생기고, 끄면 사라진다 — 포커스는 같은 스위치에", async () => {
    const sw = switchNamed(RECORD_WEB_TEXT.bleedingHeavy);
    expect(description(sw)).toBeNull();
    expect(container.textContent).not.toContain(RECORD_WEB_TEXT.bleedingHeavyHint);

    sw.focus();
    await act(async () => sw.click());
    expect(sw.isConnected).toBe(true);
    expect(switchNamed(RECORD_WEB_TEXT.bleedingHeavy)).toBe(sw); // 같은 요소(다시 그려 바뀌지 않음)
    expect(document.activeElement).toBe(sw);
    expect(sw.getAttribute("aria-checked")).toBe("true");
    expect(description(sw)).toBe(RECORD_WEB_TEXT.bleedingHeavyHint);
    // 설명 줄은 그 토글의 라벨 바로 다음 — 다른 토글 사이에 끼지 않는다
    const label = container.querySelector(`label[for="${sw.id}"]`)!;
    expect(label.nextElementSibling?.id).toBe(sw.getAttribute("aria-describedby"));

    await act(async () => sw.click());
    expect(document.activeElement).toBe(sw);
    expect(description(sw)).toBeNull();
    expect(container.textContent).not.toContain(RECORD_WEB_TEXT.bleedingHeavyHint);
  });

  it("해칠 생각의 안내는 켜기 전에도 보인다(체크하면 무엇을 알려 주는지)", () => {
    expect(description(switchNamed(RECORD_WEB_TEXT.harmThoughts))).toBe(RECORD_WEB_TEXT.harmThoughtsHint);
  });

  it("켠 토글이 있는 폼에 axe 위반이 없다", async () => {
    for (const name of [RECORD_WEB_TEXT.bleedingHeavy, RECORD_WEB_TEXT.chestBreath]) {
      const sw = switchNamed(name);
      await act(async () => sw.click());
    }
    expect(await audit()).toEqual([]);
  });
});

describe("통증 정도 슬라이더", () => {
  it('이름은 "통증 정도", 설명으로 0·10의 뜻을 듣는다 — 값 글자는 "n/10"', async () => {
    const slider = container.querySelector<HTMLInputElement>('input[type="range"]')!;
    expect(container.querySelector(`label[for="${slider.id}"]`)?.textContent).toBe(RECORD_WEB_TEXT.painTitle);
    expect(container.textContent).not.toContain("NRS");
    // jsdom의 textContent라 숫자와 뜻 사이에 띄어쓰기가 없다(브라우저는 줄이 다른 두 칸 사이를 띄워 읽는다)
    expect(description(slider)).toBe(`0${RECORD_WEB_TEXT.painMin} 10${RECORD_WEB_TEXT.painMax}`);
    expect(slider.getAttribute("aria-valuetext")).toBe("0/10");
  });
});
