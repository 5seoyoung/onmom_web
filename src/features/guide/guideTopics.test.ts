// @vitest-environment jsdom
// 회복 가이드 주제별 보기(2026-11-15 산부인과 전문의 화면 검토) — 브라우저에서 실제로 누르고 키를 눌렀을 때(jsdom):
// 주소 해시 ↔ 고른 주제, 탭 키보드(←·→·Home·End), 위험 신호 카드는 늘 보임, axe(WCAG 2.1 A/AA + 저장소 규칙 — color-contrast는 jsdom이 못 잰다).
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import axe from "axe-core";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GUIDE_TEXT, LOCHIA_TIMELINE, guideTopics, topicPanelId, topicTabId } from "./guideContent";
import { GuideScreen } from "./GuideScreen";

// next.config의 trailingSlash: true를 흉내 낸다(빌드 때 주입되는 값)
vi.stubEnv("__NEXT_TRAILING_SLASH", "true");

const topics = guideTopics();
const SLOW = 30_000;

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  document.documentElement.lang = "ko";
  document.title = GUIDE_TEXT.title;
});

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  window.history.replaceState(null, "", "/");
});

function open(hash = "") {
  window.history.replaceState(null, "", `/guide/${hash}`);
  act(() => root.render(h(GuideScreen)));
}

const tabs = () => [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
const selectedTab = () => container.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]');
const shownPanels = () => [...container.querySelectorAll<HTMLElement>('[role="tabpanel"]:not([hidden])')];
const key = (target: Element, k: string) =>
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  });

describe("주소 해시 ↔ 고른 주제", () => {
  it("해시가 없으면 첫 주제 — 탭 하나만 고름·Tab으로 닿고, 패널 하나만 보인다", () => {
    open();
    expect(tabs()).toHaveLength(8);
    expect(selectedTab()?.id).toBe(topicTabId(topics[0].slug));
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1, -1, -1, -1, -1, -1, -1]);
    expect(shownPanels().map((p) => p.id)).toEqual([topicPanelId(topics[0].slug)]);
    expect(window.location.hash).toBe(""); // 열기만 해서는 주소를 바꾸지 않는다
  });

  it("#lochia로 열면 오로 주제 — 변화 그림(시간선 3단계 + 주의)이 함께", () => {
    open("#lochia");
    expect(selectedTab()?.textContent).toBe("오로(분비물) 변화");
    const [panel] = shownPanels();
    expect(panel.id).toBe(topicPanelId("lochia"));
    expect(panel.querySelector("figure figcaption")?.textContent).toBe(LOCHIA_TIMELINE.caption);
    expect(panel.querySelectorAll("figure ol > li")).toHaveLength(3);
    expect(panel.textContent).toContain(LOCHIA_TIMELINE.warningTitle);
    // 다른 주제에는 그림이 없다
    expect(container.querySelectorAll("figure")).toHaveLength(1);
  });

  it("모르는 해시·깨진 해시면 첫 주제", () => {
    open("#no-such-topic");
    expect(selectedTab()?.id).toBe(topicTabId(topics[0].slug));
    act(() => root.unmount());
    root = createRoot(container);
    open("#%E0%A4%A");
    expect(selectedTab()?.id).toBe(topicTabId(topics[0].slug));
  });

  it("탭을 누르면 그 주제가 열리고 주소 해시가 바뀐다 — 방문 기록은 쌓지 않는다", () => {
    open();
    const before = window.history.length;
    act(() => tabs()[6].click());
    expect(window.location.hash).toBe(`#${topics[6].slug}`);
    expect(window.location.pathname).toBe("/guide/");
    expect(window.history.length).toBe(before);
    expect(selectedTab()).toBe(tabs()[6]);
    expect(shownPanels().map((p) => p.id)).toEqual([topicPanelId(topics[6].slug)]);
  });

  it("해시가 바깥에서 바뀌면(링크·주소창 → hashchange) 따라간다", () => {
    open();
    act(() => {
      window.history.replaceState(null, "", "#checkup");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(selectedTab()?.textContent).toBe("산후 검진·피임");
  });
});

describe("탭 키보드(APG Tabs, 가로)", () => {
  it("→·←는 앞뒤 주제(끝에서 처음으로), Home·End — 바로 열리고 초점이 따라간다", () => {
    open();
    tabs()[0].focus();
    key(tabs()[0], "ArrowRight");
    expect(document.activeElement).toBe(tabs()[1]);
    expect(selectedTab()).toBe(tabs()[1]);
    expect(tabs()[1].tabIndex).toBe(0);
    expect(window.location.hash).toBe(`#${topics[1].slug}`);

    key(tabs()[1], "End");
    expect(document.activeElement).toBe(tabs()[7]);
    key(tabs()[7], "ArrowRight");
    expect(document.activeElement).toBe(tabs()[0]);
    key(tabs()[0], "ArrowLeft");
    expect(document.activeElement).toBe(tabs()[7]);
    key(tabs()[7], "Home");
    expect(document.activeElement).toBe(tabs()[0]);
    expect(shownPanels().map((p) => p.id)).toEqual([topicPanelId(topics[0].slug)]);
  });

  it("↑·↓·글자 키는 탭을 옮기지 않는다(화면 스크롤 그대로)", () => {
    open();
    tabs()[0].focus();
    for (const k of ["ArrowDown", "ArrowUp", "a", "Enter"]) key(tabs()[0], k);
    expect(selectedTab()).toBe(tabs()[0]);
    expect(window.location.hash).toBe("");
  });
});

describe("위험 신호 카드는 주제와 상관없이 늘 보인다", () => {
  it("어느 주제를 골라도 패널 밖·숨김 밖에 있고, 119·109·1577-0199 전화 링크가 살아 있다", () => {
    open();
    for (let i = 0; i < topics.length; i++) {
      act(() => tabs()[i].click());
      const card = container.querySelector('[aria-labelledby="guide-red-flags"]');
      expect(card, topics[i].slug).not.toBeNull();
      expect(card!.closest('[role="tabpanel"]')).toBeNull();
      expect(card!.closest("[hidden]")).toBeNull();
      for (const tel of ["tel:119", "tel:109", "tel:15770199"]) expect(card!.querySelector(`a[href="${tel}"]`), tel).not.toBeNull();
    }
  });
});

/** WCAG 2.1 A/AA + 저장소 규칙 — e2e/support/axe.ts와 같은 묶음. color-contrast는 jsdom에서 잴 수 없어 끈다. */
async function violations() {
  const results = await axe.run(container, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    rules: {
      "color-contrast": { enabled: false },
      "heading-order": { enabled: true },
      "page-has-heading-one": { enabled: true },
    },
    resultTypes: ["violations"],
  });
  return results.violations.map((v) => ({ rule: v.id, nodes: v.nodes.map((n) => n.html.slice(0, 160)) }));
}

describe("axe(jsdom)", { timeout: SLOW }, () => {
  it("첫 주제·오로 주제(그림 + 출처 보기 펼침)에 위반이 없다", async () => {
    open();
    expect(await violations()).toEqual([]);
    act(() => tabs()[1].click());
    for (const details of container.querySelectorAll("details")) details.open = true;
    expect(await violations()).toEqual([]);
  });
});
