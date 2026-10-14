// 시작 화면 마크업(서버 렌더) — 시작 주소("/")는 불러오는 중 표시만 그리고, 로그인 화면이 예전 서비스 소개 바닥글의
// 개인정보처리방침·이용약관·문의를 이어받는다(서비스 소개 화면은 2026-10-14 CPO 결정으로 없앴다).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createAppStore, type AppStore } from "@/store/appStore";
import { createMemoryStorage, createStoragePersistence } from "@/store/persistence";
import { StoreProvider } from "@/store/StoreProvider";
import { CONTACT_EMAIL, CONTACT_TEXT, mailtoHref } from "@/features/terms/contact";
import { TERMS_TEXT } from "@/features/terms/termsText";
import { GATE_LOADING_TEXT } from "./AppGate";
import { LoginScreen } from "./LoginScreen";
import { LOGIN_TEXT } from "./loginText";
import { RootRedirect } from "./RootRedirect";

// 서버 렌더에는 앱 라우터가 없다 — 옮기기(router.replace)는 effect에서만 부르므로 렌더 결과에는 닿지 않는다.
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: () => {} }) }));

/** 메모리 저장소 스토어 — 서버 렌더에서도 읽은 뒤 스냅샷이 보이게 getServerSnapshot을 바꿔 끼운다(테스트 전용). */
function memoryStore(setup: (store: AppStore) => void = () => {}): AppStore {
  const store = createAppStore({
    persistence: createStoragePersistence(() => createMemoryStorage()),
    now: () => new Date("2026-10-14T00:00:00Z"),
    newId: () => "test-id",
  });
  setup(store);
  return { ...store, getServerSnapshot: store.getSnapshot };
}

const render = (store: AppStore, el: Parameters<typeof h>[0]) => renderToStaticMarkup(h(StoreProvider, { store }, h(el)));

describe("시작 주소(/) — RootRedirect", () => {
  const loading = renderToStaticMarkup(h(RootRedirect));

  it("불러오는 중 표시(스피너 + 낭독 문구)만 그린다 — 정적 HTML에 다른 화면이 번쩍이지 않게", () => {
    expect(loading).toMatch(/^<div role="status"[^>]*>/);
    expect(loading).toContain(GATE_LOADING_TEXT);
    expect(loading).not.toMatch(/<a\b|<h1\b|<main\b|<button\b/);
  });

  it("저장소를 읽은 뒤(처음 온 사람·온보딩을 마친 사람)에도 같은 표시 — 옮기는 동안 화면이 바뀌지 않는다", () => {
    const fresh = memoryStore();
    const onboarded = memoryStore((s) => {
      s.actions.signInGuest();
      s.actions.completeOnboarding();
    });
    for (const store of [fresh, onboarded]) expect(render(store, RootRedirect)).toBe(loading);
  });

  it("페이지는 RootRedirect를 그리고, 스크립트가 없으면 로그인 링크(basePath 포함)를 보인다", () => {
    const page = readFileSync(fileURLToPath(new URL("../../app/page.tsx", import.meta.url)), "utf8");
    expect(page).toContain("<RootRedirect />");
    expect(page).toMatch(/<noscript>[\s\S]*href=\{`\$\{config\.basePath\}\$\{ROUTES\.login\}`\}[\s\S]*min-h-11[\s\S]*<\/noscript>/);
    expect(page).toContain("웹 신규 문구 — CPO 확인 필요");
  });
});

describe("로그인 화면 — 개인정보처리방침·이용약관·문의", () => {
  const html = render(memoryStore(), LoginScreen);

  it("방침·약관은 시트로 여는 버튼, 문의는 방침의 이메일로 mailto — 셋 다 누르는 높이 44(min-h-11)", () => {
    const policy = new RegExp(`<button type="button" aria-haspopup="dialog" class="([^"]*)">${LOGIN_TEXT.policy}</button>`).exec(html);
    const terms = new RegExp(`<button type="button" aria-haspopup="dialog" class="([^"]*)">${TERMS_TEXT.openLink}</button>`).exec(html);
    expect(CONTACT_EMAIL).not.toBeNull();
    const contactHref = mailtoHref(CONTACT_EMAIL!).replace(/&/g, "&amp;");
    const contact = new RegExp(`<a href="${contactHref.replace(/[.?+]/g, "\\$&")}" class="([^"]*)">${CONTACT_TEXT.label}</a>`).exec(html);
    for (const m of [policy, terms, contact]) {
      expect(m).not.toBeNull();
      expect(m![1].split(" ")).toContain("min-h-11");
    }
  });

  it("로고·이름은 링크가 아니다 — 시작 주소(/)로 가는 링크가 없다(그 주소가 다시 이 화면이다)", () => {
    expect(html).toMatch(/<h1 [^>]*><img [^>]*>온맘<\/h1>/);
    expect(html).not.toMatch(/href="\/"/);
  });
});
