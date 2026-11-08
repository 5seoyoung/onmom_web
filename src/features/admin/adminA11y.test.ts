// @vitest-environment jsdom
// 관리자 대시보드 접근성 검사(axe-core) — 대시보드는 Supabase 관리자 세션이 있어야 그려져서 정적 빌드의 브라우저 시험(e2e/a11y.spec.ts)으로는
// "권한이 없어요" 화면까지만 닿는다. 여기서는 화면 전체(AdminScreen)를 jsdom에 그리고, 서버 대신 가짜 AdminClient가 가짜 행을 돌려준다
// (집계·30일 막대·이용 통계·동의 버전·관리자 목록·계정 찾기·사용자 목록·접근 기록 안내 · CSV 접근 기록 실패 안내 · 계정 삭제 확인 창).
// 규칙: WCAG 2.1 A/AA + 저장소 규칙(e2e/support/axe.ts와 같음). 단 jsdom은 배치·색을 계산하지 못해 color-contrast(1.4.3)는 여기서 끈다 —
// 대비는 토큰 검사(components/ui/contrast.test.ts)와, 이 시험이 남기는 마크업으로 실제 브라우저에서 재는 e2e(admin-dashboard 시험)가 맡는다.
import { writeFileSync, mkdirSync } from "node:fs";
import { createElement as h } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import axe from "axe-core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AdminClient } from "./adminApi";
import { ADMIN_TEXT } from "./adminModel";

const ADMIN_ID = "6f1c3c6e-8a40-4c55-9d2e-3b1f0a6f0001";
const FOUND_ID = "0b6a2f0e-3a51-4d3e-8f7c-5a9b2c1d0002";

/** 2026-10-07 ~ 2026-11-05(한국 날짜) 30칸 — 게스트·카카오 나눔(0005 뒤) */
function newUsersByDay() {
  const start = Date.UTC(2026, 9, 7);
  return Array.from({ length: 30 }, (_, i) => {
    const anon = i % 3;
    const kakao = i === 20 ? 6 : i % 2;
    return { day: new Date(start + i * 86_400_000).toISOString().slice(0, 10), users: anon + kakao, anonymous_users: anon, kakao_users: kakao };
  });
}

function usageDaily(days: number) {
  const end = Date.UTC(2026, 10, 5);
  return Array.from({ length: days }, (_, i) => ({
    day: new Date(end - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10),
    symptom_records: i % 4 === 0 ? 6 : 0,
    mood_answers: i % 5 === 0 ? 7 : null,
    journal_posts: 0,
  }));
}

const REPLIES: Record<string, { data: unknown; error: { code: string } | null }> = {
  is_admin: { data: true, error: null },
  admin_overview: {
    data: {
      generated_at: "2026-11-05T05:05:00+00:00",
      totals: { users: 45, anonymous_users: 18, kakao_users: 27, users_with_state: 20, users_with_current_consent: 19 },
      active_users_7d: 12,
      states_updated_7d: 9,
      new_users_by_day: newUsersByDay(),
      consent_versions: [
        { version: "web-2026-11-06", users: 12 },
        { version: "web-2026-09-28", users: 7 },
        { version: null, users: 1 },
      ],
    },
    error: null,
  },
  admin_usage_stats: {
    data: {
      generated_at: "2026-11-05T08:14:35+00:00",
      days: 30,
      period: { from: "2026-10-07", to: "2026-11-05" },
      k: 5,
      suppressed: false,
      totals: { consented_users: 42, active_users: 17 },
      daily: usageDaily(30),
      adoption: { symptom_records: 12, mood_answers: 21, journal_posts: null },
      return_rate: { recording_users: 25, returning_users: 10 },
      distributions: {
        postpartum_weeks: { total: 42, counts: { weeks_0_1: 6, weeks_2_5: 11, weeks_6_11: null, weeks_12_plus: null, unknown: 7 } },
        delivery_method: { total: 42, counts: { vaginal: 20, cesarean: 15, unknown: 7 } },
        goal: null,
        mood_answers: { percents: { yes: 56, unsure: null, no: null } },
        red_flag: { percents: { red_flag: 12, other: 88 } },
      },
    },
    error: null,
  },
  admin_list_users: {
    data: [
      { id: ADMIN_ID, created_at: "2026-10-24T01:00:00+00:00", last_sign_in_at: "2026-11-05T01:00:00+00:00", is_anonymous: false, provider: "kakao", email: "owner@example.com", has_state: true, consent_version: "web-2026-11-06", state_updated_at: "2026-11-05T01:00:00+00:00" },
      { id: FOUND_ID, created_at: "2026-10-25T01:00:00+00:00", last_sign_in_at: null, is_anonymous: true, provider: "anonymous", email: null, has_state: false, consent_version: null, state_updated_at: null },
      { id: "9d3e1f0a-1b2c-4d5e-8f90-a1b2c3d40003", created_at: "2026-10-26T01:00:00+00:00", last_sign_in_at: "2026-11-01T01:00:00+00:00", is_anonymous: false, provider: "kakao", email: null, has_state: true, consent_version: "web-2026-09-28", state_updated_at: "2026-10-30T01:00:00+00:00" },
    ],
    error: null,
  },
  admin_list_admins: {
    data: [
      { user_id: ADMIN_ID, added_at: "2026-10-23T01:00:00+00:00", last_sign_in_at: "2026-11-05T01:00:00+00:00", is_me: true },
      { user_id: "1a2b3c4d-0000-4000-8000-000000000004", added_at: "2026-10-24T01:00:00+00:00", last_sign_in_at: null, is_me: false },
    ],
    error: null,
  },
  admin_find_user: {
    data: [{ id: FOUND_ID, created_at: "2026-10-25T01:00:00+00:00", last_sign_in_at: null, is_anonymous: true, provider: "anonymous", email: null, has_state: false, consent_version: null, state_updated_at: null }],
    error: null,
  },
  // CSV 내려받기 — 접근 기록 함수(0009)가 없는 서버: 파일을 만들지 않고 안내를 보인다
  admin_log_users_export: { data: null, error: { code: "PGRST202" } },
};

const fake = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("@/config", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/config")>()), isSupabaseConfigured: () => true }));
vi.mock("@/auth/client", () => ({ getSupabaseClient: async () => ({}) }));
vi.mock("./adminApi", async (importOriginal) => ({ ...(await importOriginal<typeof import("./adminApi")>()), adminClientFrom: () => fake.client }));

const fakeClient: AdminClient = {
  getSessionUser: async () => ({ user: { id: ADMIN_ID, is_anonymous: false }, failed: false }),
  rpc: async (fn) => REPLIES[fn] ?? { data: null, error: { code: "PGRST202" } },
  onSignedOut: () => () => {},
};
fake.client = fakeClient;

/** WCAG 2.1 A/AA + 저장소 규칙 — e2e/support/axe.ts와 같은 묶음. color-contrast는 jsdom에서 잴 수 없어 끈다(머리말). */
async function audit(context: Element | Document = document) {
  const results = await axe.run(context, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    rules: {
      "color-contrast": { enabled: false },
      "heading-order": { enabled: true },
      "page-has-heading-one": { enabled: true },
      "landmark-one-main": { enabled: true },
      "landmark-no-duplicate-main": { enabled: true },
      "landmark-unique": { enabled: true },
    },
    resultTypes: ["violations"],
  });
  return {
    violations: results.violations.map((v) => ({ rule: v.id, help: v.help, nodes: v.nodes.map((n) => `${n.target.join(" ")} ${n.html.slice(0, 160)}`) })),
    /** 위반 없이 통과한 규칙 — 검사가 빈 화면을 본 것이 아닌지 확인용 */
    passed: results.passes.map((r) => r.id),
  };
}

async function violations(context: Element | Document = document) {
  return (await audit(context)).violations;
}

/** React가 받는 입력 — 값 설정자를 거쳐 input 이벤트를 보낸다 */
function typeInto(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function buttonNamed(name: string | RegExp): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((b) => (typeof name === "string" ? b.textContent?.trim() === name : name.test(b.textContent ?? "")));
  if (!found) throw new Error(`단추 없음: ${name}`);
  return found;
}

async function settle(check: () => void) {
  await vi.waitFor(check, { timeout: 10_000, interval: 20 });
  await act(async () => {});
}

let root: Root;
// jsdom에서 axe 한 번에 1~2초 — 다른 시험과 함께 돌거나(e2e/admin-dashboard.spec.ts가 이 파일을 부른다) 느린 CI에서도 넉넉하게
const SLOW = 30_000;

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  document.documentElement.lang = "ko";
  document.title = ADMIN_TEXT.title;
  // jsdom에 없는 브라우저 기능 — 이 화면이 쓰는 것만 최소로
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      this.removeAttribute("open");
    };
  }
  globalThis.IntersectionObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
  const { AdminScreen } = await import("./AdminScreen");
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(h(AdminScreen));
  });
  await settle(() => {
    expect(document.querySelector("h1")?.textContent).toBe(ADMIN_TEXT.title);
    expect(document.querySelectorAll('[role="status"] .sr-only, [aria-busy="true"]')).toHaveLength(0);
    expect(document.body.textContent).toContain("owner@example.com");
  });
}, SLOW);

afterAll(() => {
  act(() => root.unmount());
});

describe("관리자 대시보드 — axe(jsdom)", { timeout: SLOW }, () => {
  it("데이터가 다 온 대시보드(집계·막대·이용 통계·동의 버전·관리자·찾기·사용자 목록)에 위반이 없다", async () => {
    const { violations, passed } = await audit();
    expect(violations).toEqual([]);
    // 빈 화면을 본 것이 아니다 — 단추 이름·입력 라벨·표 머리·목록·제목 규칙이 실제 요소에서 통과했다
    expect(passed).toEqual(expect.arrayContaining(["button-name", "label", "th-has-data-cells", "list", "listitem", "heading-order", "td-headers-attr", "aria-valid-attr-value"]));
  });

  it("접근 기록 안내가 화면에 글로 있다 — 아이콘은 숨기고, 개인정보 안내와 한 문단", () => {
    const note = [...document.querySelectorAll("main p")].find((p) => p.textContent?.includes(ADMIN_TEXT.accessLogNote));
    expect(note).toBeDefined();
    expect(note!.textContent).toContain(ADMIN_TEXT.privacyNote);
    expect(note!.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("계정 찾기 결과 · CSV 접근 기록 실패 안내(0009 없음)에도 위반이 없다", async () => {
    const input = document.querySelector<HTMLInputElement>("main form input")!;
    await act(async () => typeInto(input, FOUND_ID));
    await act(async () => buttonNamed(ADMIN_TEXT.searchButton).click());
    await settle(() => expect(document.body.textContent).toContain(ADMIN_TEXT.colAccountId));
    await settle(() => expect(buttonNamed(ADMIN_TEXT.csvExport)).toBeDefined());
    await act(async () => buttonNamed(ADMIN_TEXT.csvExport).click());
    await settle(() => expect(document.body.textContent).toContain(ADMIN_TEXT.auditSetupHint));
    expect([...document.querySelectorAll('[role="alert"]')].some((a) => a.textContent === ADMIN_TEXT.auditSetupHint)).toBe(true);
    expect(await violations()).toEqual([]);

    // 실제 브라우저(색·글자 150%)로 같은 마크업을 재는 e2e가 쓰도록 남긴다(저장소에 올리지 않음 — e2e/support/admin-dashboard.ts)
    const out = process.env.ONMOM_ADMIN_MARKUP_OUT;
    if (out) {
      mkdirSync(out.replace(/\/[^/]+$/, ""), { recursive: true });
      writeFileSync(out, document.querySelector("main")!.outerHTML);
    }
  });

  it("계정 삭제 확인 창 — 창 안에 위반이 없다", async () => {
    const rowDelete = [...document.querySelectorAll("main button")].find((b) => b.textContent?.trim() === ADMIN_TEXT.deleteUser && !(b as HTMLButtonElement).disabled);
    expect(rowDelete).toBeDefined();
    await act(async () => (rowDelete as HTMLButtonElement).click());
    const dialog = await vi.waitFor(() => {
      const d = document.querySelector("dialog[open]");
      if (!d) throw new Error("창이 아직 없다");
      return d;
    });
    expect(dialog.getAttribute("aria-labelledby") ?? dialog.getAttribute("aria-label")).toBeTruthy();
    expect(await violations(dialog)).toEqual([]);
  });
});
