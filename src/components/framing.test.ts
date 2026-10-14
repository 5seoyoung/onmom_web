// 클릭재킹 막기(프레임 버스터) — 판단·동작은 가짜 창으로, 화면은 서버 렌더로, 연결은 글자로 확인한다.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FrameGuard } from "./FrameGuard";
import { breakOutOfFrame, FRAMED_ATTRIBUTE, isFramed, type FrameWindowLike } from "./framing";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

/** 맨 위 창(top)을 가진 가짜 창. self === top이면 프레임 밖. */
function fakeWindow(opts: { framed: boolean; href?: string; topLocationThrows?: boolean }) {
  const top: { location: unknown; assigned: unknown[] } = { location: "https://evil.example/", assigned: [] };
  if (opts.topLocationThrows) {
    Object.defineProperty(top, "location", {
      get: () => "https://evil.example/",
      set: () => {
        throw new DOMException("Unsafe attempt to initiate navigation", "SecurityError");
      },
    });
  }
  const win = { location: { href: opts.href ?? "https://5seoyoung.github.io/onmom_web/login/" } } as {
    self: unknown;
    top: typeof top;
    location: { href: string };
  };
  win.self = win;
  win.top = opts.framed ? top : (win as unknown as typeof top);
  return { win: win as FrameWindowLike, top };
}

describe("isFramed", () => {
  it("top이 자기 자신이면 프레임 밖, 다르면 프레임 안", () => {
    expect(isFramed(fakeWindow({ framed: false }).win)).toBe(false);
    expect(isFramed(fakeWindow({ framed: true }).win)).toBe(true);
  });

  it("top이 null(떨어져 나간 문서)이면 프레임 밖으로 본다", () => {
    expect(isFramed({ self: {}, top: null, location: { href: "x" } })).toBe(false);
  });

  it("읽다가 오류가 나면 프레임 안으로 본다(숨기는 쪽이 안전)", () => {
    const win = {
      self: {},
      get top(): { location: unknown } {
        throw new Error("blocked");
      },
      location: { href: "x" },
    };
    expect(isFramed(win)).toBe(true);
  });
});

describe("breakOutOfFrame", () => {
  it("맨 위 창을 이 문서의 주소로 옮긴다(top.location = self.location)", () => {
    const { win, top } = fakeWindow({ framed: true, href: "https://5seoyoung.github.io/onmom_web/home/" });
    expect(breakOutOfFrame(win)).toBe(true);
    expect(top.location).toBe("https://5seoyoung.github.io/onmom_web/home/");
  });

  it("브라우저가 막아도(교차 출처·sandbox) 던지지 않는다 — 숨긴 채로 둔다", () => {
    const { win } = fakeWindow({ framed: true, topLocationThrows: true });
    expect(() => breakOutOfFrame(win)).not.toThrow();
    expect(breakOutOfFrame(win)).toBe(false);
    expect(breakOutOfFrame({ self: {}, top: null, location: { href: "x" } })).toBe(false);
  });
});

describe("FrameGuard", () => {
  it("정적 HTML(서버 렌더)에는 앱을 그대로 그린다 — 프레임 밖 사용자는 숨김·깜빡임 없음", () => {
    const html = renderToStaticMarkup(h(FrameGuard, null, h("main", null, "앱")));
    expect(html).toBe("<main>앱</main>");
  });

  it("들어 있으면 <html>에 표시를 붙이고, globals.css가 그 표시로 문서 전체를 숨긴다", () => {
    expect(FRAMED_ATTRIBUTE).toBe("data-framed");
    const guard = read("./FrameGuard.tsx");
    expect(guard).toContain("useLayoutEffect(");
    expect(guard).toContain("document.documentElement.setAttribute(FRAMED_ATTRIBUTE");
    expect(guard).toContain("breakOutOfFrame(window)");
    expect(guard).toContain("return framed ? null : children;");
    const css = read("../app/globals.css");
    expect(css).toMatch(/html\[data-framed\]\s*\{\s*display:\s*none !important;\s*\}/);
  });

  it("루트 레이아웃이 앱 전체(저장소·관문·PWA)를 감싼다 — 인라인 스크립트 없이", () => {
    const layout = read("../app/layout.tsx");
    const open = layout.indexOf("<FrameGuard>");
    const close = layout.indexOf("</FrameGuard>");
    expect(open).toBeGreaterThan(layout.indexOf("<body"));
    expect(close).toBeGreaterThan(layout.indexOf("<PwaClient />"));
    expect(open).toBeLessThan(layout.indexOf("<StoreProvider>"));
    expect(layout).not.toMatch(/<script|dangerouslySetInnerHTML|next\/script/);
    expect(read("./FrameGuard.tsx")).not.toMatch(/<script|dangerouslySetInnerHTML|next\/script/);
  });
});
