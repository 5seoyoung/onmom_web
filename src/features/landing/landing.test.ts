import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import content from "@/content";
import { CLINICS_TEXT } from "@/features/clinics/clinicsView";
import { createAppStore, type AppStore } from "@/store/appStore";
import { createMemoryStorage, createStoragePersistence } from "@/store/persistence";
import { StoreProvider } from "@/store/StoreProvider";
import { LandingPage, splitAfterComma, type LandingPageProps } from "./LandingPage";
import { BARE_BUILD, FEATURES, LANDING_TEXT, NAV_ITEMS, PRINCIPLES, SECTION_ID, STEPS } from "./landingContent";

// iOS 원본·App Store 문안(web/)은 공개 저장소에 없다 — 로컬에 있을 때만 원문과 대조하고, CI에서는 건너뛴다.
const WEB_DIR = fileURLToPath(new URL("../../../web/reference/", import.meta.url));
const swift = (file: string) => `${WEB_DIR}swift/${file}`;
const APP_STORE_MD = `${WEB_DIR}docs/APP_STORE.md`;

/** Swift 원문 그대로인 문구 → 파일. Swift 문자열 안 줄바꿈은 소스에 `\n`으로 적혀 있다. */
const SWIFT_VERBATIM: ReadonlyArray<[string, string]> = [
  [LANDING_TEXT.brand, "LoginView.swift"],
  [LANDING_TEXT.ctaTitle, "LoginView.swift"],
  [LANDING_TEXT.start, "OnboardingFlowView.swift"],
  [LANDING_TEXT.eyebrow, "OnboardingFlowView.swift"],
  [LANDING_TEXT.welcome, "OnboardingFlowView.swift"],
  [LANDING_TEXT.privacy, "MoreView.swift"],
  [STEPS[0].title, "OnboardingFlowView.swift"],
  [STEPS[0].body, "OnboardingFlowView.swift"],
  [STEPS[1].title, "RecordFlowView.swift"],
  [STEPS[1].body, "HomeView.swift"],
  [STEPS[2].title, "HomeView.swift"],
];
const SWIFT_FILES = [...new Set(SWIFT_VERBATIM.map(([, f]) => f))];

/** App Store 문안 그대로인 문구(문단을 나눈 것 포함). 웹에 맞게 고친 줄(저장 안내 등)은 뺀다. */
const APP_STORE_VERBATIM: ReadonlyArray<string> = [
  LANDING_TEXT.tagline,
  LANDING_TEXT.promo,
  LANDING_TEXT.featuresTitle,
  LANDING_TEXT.featuresIntro,
  ...FEATURES.filter((f) => f.icon !== "storage").flatMap((f) => [f.title, ...f.body.map((p) => p.text)]),
  // 이용 방법 3단계 본문 = 앱 설명의 두 문장
  ...STEPS[2].body.split(/(?<=[.요])\s+(?=위험)/),
  PRINCIPLES.find((p) => p.icon === "noScore")!.title,
];

const html = (props: LandingPageProps = BARE_BUILD) => renderToStaticMarkup(h(LandingPage, props));

/**
 * 하이드레이션 뒤 모습 — 게스트로 로그인해 온보딩을 마친 메모리 저장소 스토어. 서버 렌더에서도 읽은 뒤 스냅샷이 보이게
 * getServerSnapshot을 getSnapshot으로 바꿔 끼운다(테스트 전용, 배포 코드에는 넣지 않는다).
 */
function onboardedGuestStore(): AppStore {
  const store = createAppStore({
    persistence: createStoragePersistence(() => createMemoryStorage()),
    now: () => new Date("2026-09-27T00:00:00Z"),
    newId: () => "test-id",
  });
  store.actions.signInGuest();
  store.actions.completeOnboarding();
  return { ...store, getServerSnapshot: store.getSnapshot };
}
const textOf = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

describe("서비스 소개(/) — 원문 대조", () => {
  it.skipIf(!SWIFT_FILES.every((f) => existsSync(swift(f))))("Swift 원문 그대로인 문구", () => {
    for (const [text, file] of SWIFT_VERBATIM) {
      const src = readFileSync(swift(file), "utf8");
      expect(src, `${file}: ${text}`).toContain(`"${text.replace(/\n/g, "\\n")}"`);
    }
  });

  it.skipIf(!existsSync(APP_STORE_MD))("App Store 문안 그대로인 문구(줄바꿈만 공백으로)", () => {
    // 문안의 강제 줄바꿈은 공백 하나로 — 단, 괄호 앞 줄바꿈("이야기 나눌 곳⏎(정신건강복지센터 등)")은 붙여 쓴다
    const doc = readFileSync(APP_STORE_MD, "utf8")
      .replace(/\n(?=\()/g, "")
      .replace(/\s+/g, " ");
    for (const text of APP_STORE_VERBATIM) expect(doc, text).toContain(text);
  });

  it("바닥글 면책은 content.json 그대로", () => {
    expect(textOf(html())).toContain(content.disclaimers.home_footer);
  });
});

describe("서비스 소개(/) — 구조", () => {
  const markup = html(BARE_BUILD);

  it("머리글·main·바닥글이 하나씩, 제목(h1)은 부제 하나", () => {
    expect(markup.match(/<header\b/g)).toHaveLength(1);
    expect(markup.match(/<main\b/g)).toHaveLength(1);
    expect(markup.match(/<footer\b/g)).toHaveLength(1);
    expect(markup.match(/<h1\b/g)).toHaveLength(1);
    const h1 = markup.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "";
    expect(textOf(h1)).toBe(LANDING_TEXT.tagline);
  });

  it("[시작하기]는 로그인으로 — 정적 HTML은 늘 로그인 전 모양", () => {
    // 끝 "/"는 ROUTES 값 그대로(빌드 때 basePath는 next/link가 붙인다)
    const starts = [...markup.matchAll(/<a[^>]*href="\/login\/?"[^>]*>([\s\S]*?)<\/a>/g)];
    expect(starts.length).toBe(3); // 머리글 · 히어로 · 마지막 권유
    for (const [, inner] of starts) {
      // 보이는 쪽은 [시작하기], [내 회복 기록 열기]는 자리만 차지하고 숨김(폭이 흔들리지 않게)
      expect(inner).toMatch(new RegExp(`<span class="\\[grid-area:1/1\\]">${LANDING_TEXT.start}</span>`));
      expect(inner).toMatch(new RegExp(`<span aria-hidden="true" class="[^"]*invisible[^"]*">${LANDING_TEXT.openApp}</span>`));
    }
    expect(markup).not.toMatch(/href="\/home\/?"/);
  });

  it("섹션 앵커 — 머리 메뉴·[서비스 알아보기]가 가리키는 id가 있다", () => {
    for (const id of Object.values(SECTION_ID)) expect(markup).toContain(`id="${id}"`);
    for (const item of NAV_ITEMS) expect(markup).toContain(`href="#${item.id}"`);
    expect(markup).toMatch(new RegExp(`href="#${SECTION_ID.about}"[^>]*>${LANDING_TEXT.learnMore}`));
  });

  it("기능 6개·단계 3개·지키는 것 4개가 h3 제목으로, 단계는 순서 목록", () => {
    const h3 = [...markup.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/g)].map((m) => textOf(m[1]));
    expect(h3).toEqual([...FEATURES, ...STEPS, ...PRINCIPLES].map((s) => s.title));
    expect(markup.match(/<ol\b/g)).toHaveLength(1);
  });

  it("개인정보처리방침 링크와 ©", () => {
    expect(markup).toMatch(new RegExp(`<a[^>]*href="/privacy/?"[^>]*>${LANDING_TEXT.privacy}</a>`));
    expect(textOf(markup)).toContain(LANDING_TEXT.copyright);
  });

  it("장식 아이콘·로고는 스크린리더에서 숨긴다", () => {
    for (const img of markup.match(/<img\b[^>]*>/g) ?? []) {
      expect(img).toContain('alt=""');
      expect(img).toContain('aria-hidden="true"');
    }
    for (const svg of markup.match(/<svg\b[^>]*>/g) ?? []) expect(svg).toContain('aria-hidden="true"');
  });

  it("가까운 산부인과 찾기 — 키가 없으면 '준비 중', 있으면 없음", () => {
    expect(textOf(markup)).toContain(CLINICS_TEXT.notConfigured);
    expect(textOf(html({ clinicSearchReady: true }))).not.toContain(CLINICS_TEXT.notConfigured);
  });

  it("마지막 권유 안내 줄 — 정적 HTML에서는 보인다(마지막 시작 버튼 바로 아래)", () => {
    expect(markup).toMatch(new RegExp(`href="/login/?"[^>]*>(?:(?!</a>)[\\s\\S])*</a><p class="[^"]*">${LANDING_TEXT.ctaNote}</p>`));
  });

  it("사용자 데이터·지어낸 숫자가 없다(정적 화면)", () => {
    const text = textOf(markup);
    expect(text).not.toMatch(/\d[\d,.]*\s*(만|천)?\s*(명|개|건|점|%)/);
    expect(text).not.toMatch(/[★☆]|후기|리뷰|평점/);
  });
});

describe("splitAfterComma", () => {
  it("쉼표 뒤에서 나눈다 — 글자는 그대로", () => {
    expect(splitAfterComma("산후 회복, 하루 1분 기록으로")).toEqual(["산후 회복,", "하루 1분 기록으로"]);
    expect(splitAfterComma("온맘")).toEqual(["온맘", null]);
  });
});

describe("서비스 소개(/) — 빌드별 문구", () => {
  it("카카오 로그인(서버 저장)이 켜진 빌드 — '준비 중'·'예정'이 사라지고, 게스트·카카오 모두 동의 뒤 서버(서울) 저장 안내", () => {
    const text = textOf(html({ clinicSearchReady: true, kakaoLoginReady: true, llmReady: false }));
    expect(text).not.toMatch(/준비 중|예정/);
    expect(text).toContain(LANDING_TEXT.ctaNoteKakao);
    expect(text).toContain("게스트로 시작해도, 카카오로 로그인해도");
    expect(text).toContain("동의를 받은 뒤 온맘 서버(대한민국 서울)에 저장돼요");
    expect(text).not.toContain("이 브라우저에만");
    // 꺼진 빌드는 그대로 '준비 중', 저장 카드 제목도 지금 배포 그대로
    const bare = textOf(html({ clinicSearchReady: true, kakaoLoginReady: false, llmReady: false }));
    expect(bare).toContain(LANDING_TEXT.ctaNote);
    expect(bare).toMatch(/카카오 로그인은 준비 중.*예정/);
    expect(html(BARE_BUILD)).toMatch(/<h3[^>]*>건강 정보는 이 브라우저에<\/h3>/);
  });

  it("카카오 로그인(서버 저장)이 켜진 빌드 — 저장 카드 제목도 서버 저장 빌드용(landingContent.ts sectionTitle)", () => {
    const storage = FEATURES.find((f) => f.icon === "storage")!;
    const markup = html({ clinicSearchReady: true, kakaoLoginReady: true, llmReady: false });
    expect(markup).toMatch(new RegExp(`<h3[^>]*>${storage.titleWhenKakaoLogin}</h3>`));
    expect(markup).not.toContain(storage.title);
  });

  it("AI 서버가 켜진 빌드 — '서버로 전송되지 않습니다'·'AI는 판단하지 않아요'가 없다", () => {
    expect(textOf(html(BARE_BUILD))).toContain("서버로 전송되지 않습니다");
    expect(textOf(html(BARE_BUILD))).toContain("AI는 판단하지 않아요");
    for (const kakaoLoginReady of [false, true]) {
      const text = textOf(html({ clinicSearchReady: false, kakaoLoginReady, llmReady: true }));
      expect(text).not.toContain("서버로 전송되지 않습니다");
      expect(text).not.toContain("AI는 판단하지 않아요");
    }
  });
});

describe("서비스 소개(/) — 온보딩을 마친 사람(하이드레이션 뒤)", () => {
  const markup = renderToStaticMarkup(h(StoreProvider, { store: onboardedGuestStore() }, h(LandingPage, BARE_BUILD)));

  it("시작 버튼 3개가 모두 [내 회복 기록 열기] → /home/, [시작하기]는 자리만", () => {
    const opens = [...markup.matchAll(/<a[^>]*href="\/home\/?"[^>]*>([\s\S]*?)<\/a>/g)];
    expect(opens.length).toBe(3);
    for (const [, inner] of opens) {
      expect(inner).toMatch(new RegExp(`<span class="\\[grid-area:1/1\\]">${LANDING_TEXT.openApp}</span>`));
      expect(inner).toMatch(new RegExp(`<span aria-hidden="true" class="[^"]*invisible[^"]*">${LANDING_TEXT.start}</span>`));
    }
    expect(markup).not.toMatch(/href="\/login\/?"/);
  });

  it("시작 방법 안내 줄은 숨긴다 — 자리는 남기고(invisible) 스크린리더에서도 뺀다", () => {
    expect(markup).toMatch(new RegExp(`<p aria-hidden="true" class="[^"]*invisible[^"]*">${LANDING_TEXT.ctaNote}</p>`));
  });
});
