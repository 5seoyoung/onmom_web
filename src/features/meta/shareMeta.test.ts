// 문서 제목 틀 · 공유 미리보기(Open Graph·트위터) · 사이트 주소(metadataBase). 정적 파일·레이아웃은 글자·바이트로 확인한다(DOM 없음).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveAbsoluteUrlWithPathname, resolveUrl } from "next/dist/lib/metadata/resolvers/resolve-url";
import { describe, expect, it } from "vitest";
import { config, DEFAULT_SITE_URL, siteUrlFrom } from "@/config";
import { ADMIN_TEXT } from "@/features/admin/adminModel";
import { PRODUCTION_BASE_PATH, webManifest } from "@/features/pwa/pwaAssets";
import { TERMS_TEXT } from "@/features/terms/termsText";
import { APP_DESCRIPTION, BASE_OPEN_GRAPH, BASE_TWITTER, ROOT_META, ROOT_OPEN_GRAPH, SHARE_IMAGE, SHARE_TEXT, TITLE_TEMPLATE } from "./shareMeta";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

// iOS 원본·App Store 문안(web/)은 공개 저장소에 없다 — 로컬에 있을 때만 원문과 대조하고, CI에서는 건너뛴다.
const LOGIN_SWIFT = join(ROOT, "web/reference/swift/LoginView.swift");
const APP_STORE_MD = join(ROOT, "web/reference/docs/APP_STORE.md");

describe("사이트 주소(NEXT_PUBLIC_SITE_URL → metadataBase)", () => {
  it("비면 GitHub Pages 주소 — 경로는 운영 basePath(/onmom_web)", () => {
    expect(config.siteUrl).toBe(DEFAULT_SITE_URL);
    expect(siteUrlFrom(undefined, "")).toBe(DEFAULT_SITE_URL);
    expect(siteUrlFrom("  ", "/onmom_web")).toBe(DEFAULT_SITE_URL);
    expect(new URL(DEFAULT_SITE_URL).pathname).toBe(`${PRODUCTION_BASE_PATH}/`);
  });

  it("값을 넣으면 origin + basePath + 끝 슬래시로 — 커스텀 도메인은 BASE_PATH=\"\"와 함께", () => {
    expect(siteUrlFrom("https://5seoyoung.github.io/onmom_web", "/onmom_web")).toBe("https://5seoyoung.github.io/onmom_web/");
    expect(siteUrlFrom("https://onmom.example/", "")).toBe("https://onmom.example/");
    expect(siteUrlFrom("https://onmom.example", "")).toBe("https://onmom.example/");
    expect(siteUrlFrom("http://localhost:3000/", "")).toBe("http://localhost:3000/");
  });

  it("경로가 이 빌드의 basePath와 다르면 빌드를 멈춘다 — 공유 이미지 주소가 없는 파일을 가리키지 않게", () => {
    expect(() => siteUrlFrom("https://onmom.example/", "/onmom_web")).toThrow(/BASE_PATH/);
    expect(() => siteUrlFrom("https://5seoyoung.github.io/onmom_web/", "")).toThrow(/BASE_PATH/);
  });

  it("https(내 컴퓨터 http://localhost만 예외)·쿼리·조각·사용자 정보 없는 주소만", () => {
    expect(() => siteUrlFrom("http://onmom.example/", "")).toThrow(/https/);
    expect(() => siteUrlFrom("https://onmom.example/?a=1", "")).toThrow(/https/);
    expect(() => siteUrlFrom("https://onmom.example/#top", "")).toThrow(/https/);
    expect(() => siteUrlFrom("https://user:pw@onmom.example/", "")).toThrow(/https/);
    expect(() => siteUrlFrom("onmom.example", "")).toThrow(/주소 형식/);
  });

  it("Next가 상대 주소를 metadataBase의 경로 아래로 붙인다 — basePath와 커스텀 도메인 모두(이 설계가 기대는 동작)", () => {
    expect(resolveUrl(SHARE_IMAGE.path, new URL(DEFAULT_SITE_URL)).href).toBe("https://5seoyoung.github.io/onmom_web/og-image.png");
    expect(resolveUrl(SHARE_IMAGE.path, new URL(siteUrlFrom("https://onmom.example/", ""))).href).toBe("https://onmom.example/og-image.png");
    // og:url("/") — 시작 주소(trailingSlash)
    expect(resolveAbsoluteUrlWithPathname("/", new URL(DEFAULT_SITE_URL), "/", { trailingSlash: true, isStaticMetadataRouteFile: false })).toBe(
      "https://5seoyoung.github.io/onmom_web/",
    );
  });

  it("루트 레이아웃이 metadataBase를 config.siteUrl로 둔다", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain("metadataBase: new URL(config.siteUrl)");
    expect(layout).toContain("openGraph: BASE_OPEN_GRAPH");
    expect(layout).toContain("twitter: BASE_TWITTER");
  });

  it("앱 기본 설명은 한 곳(APP_DESCRIPTION) — 루트 레이아웃 description과 웹 앱 매니페스트가 같은 값", () => {
    expect(APP_DESCRIPTION).toBe("엄마의 산후 회복 케어 - 퇴원부터 산후 6주 검진까지");
    expect(read("src/app/layout.tsx")).toContain("description: APP_DESCRIPTION,");
    expect(webManifest("").description).toBe(APP_DESCRIPTION);
  });
});

describe("문서 제목 틀", () => {
  it('"%s · 온맘" — 제목이 없는 화면은 "온맘"', () => {
    expect(TITLE_TEMPLATE).toBe("%s · 온맘");
    expect(SHARE_TEXT.brand).toBe("온맘");
    expect(read("src/app/layout.tsx")).toContain("title: { default: SHARE_TEXT.brand, template: TITLE_TEMPLATE }");
  });

  it("이름이 이미 든 제목(시작 주소·이용약관·관리자)은 틀을 건너뛴다 — \"온맘 이용약관 · 온맘\"이 되지 않게", () => {
    for (const title of [ROOT_META.title, TERMS_TEXT.title, ADMIN_TEXT.title]) expect(title).toContain(SHARE_TEXT.brand);
    expect(read("src/app/page.tsx")).toContain("title: { absolute: ROOT_META.title }");
    expect(read("src/app/terms/page.tsx")).toContain("title: { absolute: TERMS_TEXT.title }");
    expect(read("src/app/admin/page.tsx")).toContain("title: { absolute: ADMIN_TEXT.title }");
  });
});

describe("시작 주소(/)의 제목·설명", () => {
  it("문서 제목은 이름 + 부제, 설명은 App Store 설명 문구", () => {
    expect(ROOT_META.title).toBe("온맘 - 산후 회복, 하루 1분 기록으로");
    expect(ROOT_META.description).toBe(SHARE_TEXT.promo);
    expect(read("src/app/page.tsx")).toContain("description: ROOT_META.description");
  });

  it.skipIf(!existsSync(LOGIN_SWIFT))("이름은 Swift 원문 그대로", () => {
    expect(readFileSync(LOGIN_SWIFT, "utf8")).toContain(`"${SHARE_TEXT.brand}"`);
  });

  it.skipIf(!existsSync(APP_STORE_MD))("부제·설명은 App Store 문안 그대로(줄바꿈만 공백으로)", () => {
    const doc = readFileSync(APP_STORE_MD, "utf8").replace(/\s+/g, " ");
    for (const text of [SHARE_TEXT.tagline, SHARE_TEXT.promo]) expect(doc, text).toContain(text);
  });
});

describe("공유 미리보기", () => {
  it("시작 주소 — 제목·설명은 위 문구 그대로(새 문장 없음), 주소는 /, 이미지 포함", () => {
    expect(ROOT_OPEN_GRAPH).toMatchObject({
      title: ROOT_META.title,
      description: ROOT_META.description,
      url: "/",
      siteName: SHARE_TEXT.brand,
      locale: "ko_KR",
    });
    expect(ROOT_OPEN_GRAPH.images).toEqual(BASE_OPEN_GRAPH.images);
    expect(read("src/app/page.tsx")).toContain("openGraph: ROOT_OPEN_GRAPH");
  });

  it("기본값(모든 화면) — 제목·설명은 두지 않아 화면 제목을 따르고, 큰 이미지 카드", () => {
    expect(BASE_OPEN_GRAPH).not.toHaveProperty("title");
    expect(BASE_OPEN_GRAPH).not.toHaveProperty("description");
    expect(BASE_OPEN_GRAPH.images).toEqual([
      { url: "/og-image.png", width: 1200, height: 630, alt: SHARE_TEXT.brand, type: "image/png" },
    ]);
    expect(BASE_TWITTER).toEqual({ card: "summary_large_image" });
  });

  it("public/og-image.png가 있고 실제로 1200×630 PNG다", () => {
    const b = readFileSync(join(ROOT, "public", SHARE_IMAGE.path));
    expect(b.subarray(1, 4).toString("latin1")).toBe("PNG");
    expect({ width: b.readUInt32BE(16), height: b.readUInt32BE(20) }).toEqual({ width: SHARE_IMAGE.width, height: SHARE_IMAGE.height });
  });
});
