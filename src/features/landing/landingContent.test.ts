import { describe, expect, it } from "vitest";
import type { RootScreen } from "@/store/appStore";
import { ROUTES } from "@/routes";
import {
  BARE_BUILD,
  FEATURES,
  LANDING_META,
  LANDING_TEXT,
  NAV_ITEMS,
  PRINCIPLES,
  SECTION_ID,
  STEPS,
  ctaNoteFor,
  paragraphText,
  sectionTitle,
  startAction,
  type LandingBuild,
} from "./landingContent";

/** 켜짐·꺼짐 조합 8가지 */
const ALL_BUILDS: ReadonlyArray<LandingBuild> = [false, true].flatMap((clinicSearchReady) =>
  [false, true].flatMap((kakaoLoginReady) => [false, true].map((llmReady) => ({ clinicSearchReady, kakaoLoginReady, llmReady }))),
);

/** 사용자에게 보이는 모든 문자열 */
function allStrings(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(allStrings);
  if (v !== null && typeof v === "object") return Object.values(v).flatMap(allStrings);
  return [];
}
const EVERY_TEXT = allStrings([LANDING_TEXT, LANDING_META, FEATURES, STEPS, PRINCIPLES, NAV_ITEMS.map((n) => n.label)]);

// 가짜 데이터(원칙 3) — 이용자 수·평점·후기·순위·제휴 같은 "사회적 증거"와 자리표시 문구
const FORBIDDEN: ReadonlyArray<[string, RegExp]> = [
  ["수치 + 단위(명·개·건·회·점·%·위·배)", /\d[\d,.]*\s*(만|천|백)?\s*(명|개|건|회|점|%|위|배)/],
  ["만 명·천 명 같은 규모", /(만|천)\s*명/],
  ["별점 기호", /[★☆⭐]/],
  ["후기·평점", /후기|리뷰|평점|별점|만족도|추천율|재방문/],
  ["규모·순위 자랑", /누적|다운로드|이용자\s*수|사용자\s*수|회원\s*수|1위|No\.?\s*1|최고의|국내\s*최초/i],
  ["제휴·수상", /파트너|제휴|수상|인증\s*받은|공식\s*인증/],
  ["자리표시", /lorem|ipsum|예시|샘플|sample|dummy|placeholder|TODO|TBD/i],
  ["앱 마켓", /App\s*Store|앱\s*스토어|Google\s*Play|플레이\s*스토어|iPhone|아이폰|다운받/i],
];

describe("서비스 소개 문구", () => {
  it("가짜 수치·후기·평점·순위·자리표시가 없다", () => {
    expect(EVERY_TEXT.length).toBeGreaterThan(20);
    for (const text of EVERY_TEXT) {
      for (const [name, re] of FORBIDDEN) {
        expect(re.test(text), `${name}: "${text}"`).toBe(false);
      }
    }
  });

  it("검사식이 실제로 잡는다(검사식 자체의 회귀 방지)", () => {
    const hit = (s: string) => FORBIDDEN.some(([, re]) => re.test(s));
    for (const bad of ["누적 이용자 3만 명", "만족도 98%", "★★★★★", "실제 후기", "앱스토어에서 받기", "1,200개 기록", "예시 데이터"]) {
      expect(hit(bad), bad).toBe(true);
    }
    // 실제 문구의 숫자(부제·출처 연도·주차)는 통과한다
    for (const ok of [LANDING_TEXT.tagline, "2023 임산부수첩", "산후 6주 검진", "1분 만에 기록"]) {
      expect(hit(ok), ok).toBe(false);
    }
  });

  it("주요 기능 6개 · 이용 방법 3단계 · 지키는 것 4개, 모두 제목과 본문이 있다", () => {
    expect(FEATURES).toHaveLength(6);
    expect(STEPS).toHaveLength(3);
    expect(PRINCIPLES).toHaveLength(4);
    for (const s of [...FEATURES, ...PRINCIPLES]) {
      expect(s.title.trim()).not.toBe("");
      expect(s.body.length).toBeGreaterThan(0);
      for (const p of s.body) expect(p.text.trim(), s.title).not.toBe("");
    }
    for (const s of STEPS) {
      expect(s.title.trim()).not.toBe("");
      expect(s.body.trim()).not.toBe("");
    }
  });

  it("제목은 서로 겹치지 않는다(React key로도 쓴다)", () => {
    const titles = [...FEATURES, ...PRINCIPLES, ...STEPS].map((s) => s.title);
    expect(new Set(titles).size).toBe(titles.length);
    for (const s of [...FEATURES, ...PRINCIPLES]) {
      const texts = s.body.map((p) => p.text);
      expect(new Set(texts).size).toBe(texts.length);
    }
  });

  it("웹 저장 안내는 사실대로 — 설정 없는 빌드는 게스트 기록이 이 브라우저에만, 서버 저장 빌드는 게스트·카카오 모두 동의 뒤 서버(서울)", () => {
    const storage = FEATURES.find((f) => f.icon === "storage")!;
    const textIn = (build: LandingBuild) => storage.body.map((p) => paragraphText(p, build)).join(" ");

    const bare = textIn(BARE_BUILD);
    expect(bare).toContain("게스트");
    expect(bare).toContain("이 브라우저에만");
    expect(bare).toContain("서버로 전송되지 않습니다");
    expect(bare).toMatch(/카카오 로그인은 준비 중.*예정/);

    // 서버 저장 빌드(카카오 로그인 = Supabase) — AI 켜짐과 무관하게 같은 문구
    for (const llmReady of [false, true]) {
      const server = textIn({ ...BARE_BUILD, kakaoLoginReady: true, llmReady });
      expect(server).toMatch(/게스트로 시작해도, 카카오로 로그인해도/);
      expect(server).toContain("동의를 받은 뒤");
      expect(server).toContain("대한민국 서울");
      expect(server).toContain("삭제할 수 있어요");
      expect(server).toContain("다른 기기에서도");
      // 게스트도 서버에 저장되므로 "이 브라우저에만"·"전송되지 않습니다"는 거짓
      expect(server).not.toContain("이 브라우저에만");
      expect(server).not.toContain("전송되지 않습니다");
      expect(server).not.toMatch(/준비 중|예정/);
    }

    // 제목도 빌드별 — 설정 없는 빌드(지금 배포)는 지금 제목 그대로, 서버 저장 빌드는 동의 뒤 저장(브라우저라고 말하지 않는다)
    for (const build of ALL_BUILDS) {
      const title = sectionTitle(storage, build);
      if (build.kakaoLoginReady) {
        expect(title).toBe("건강 정보는 동의한 뒤에만 저장해요");
        expect(title).not.toMatch(/브라우저|기기/);
      } else {
        expect(title).toBe("건강 정보는 이 브라우저에");
      }
    }

    // "이 기기에만"(iOS 문구)은 웹에서 사실이 아니다
    expect(EVERY_TEXT.join(" ")).not.toContain("이 기기에만");
  });

  it("AI 서버가 켜진 빌드 — '서버로 전송되지 않습니다'·'AI는 판단하지 않아요'를 쓰지 않는다", () => {
    const all = (build: LandingBuild) =>
      [...FEATURES, ...PRINCIPLES].flatMap((s) => s.body.map((p) => paragraphText(p, build))).join(" ");
    expect(all(BARE_BUILD)).toContain("서버로 전송되지 않습니다");
    expect(all(BARE_BUILD)).toContain("AI는 판단하지 않아요");
    for (const kakaoLoginReady of [false, true]) {
      const text = all({ clinicSearchReady: true, kakaoLoginReady, llmReady: true });
      expect(text).not.toContain("서버로 전송되지 않습니다");
      expect(text).not.toContain("AI는 판단하지 않아요");
      // 규칙이 판단하는 것(병원 신호·운동)은 그대로 말한다
      expect(text).toContain("미리 정해 둔 규칙으로 안내해요");
    }
    // 저장 위치: 서버 저장이 없는 빌드는 이 브라우저, 있는 빌드는 서버
    expect(all({ clinicSearchReady: true, kakaoLoginReady: false, llmReady: true })).toContain("이 브라우저에만 저장됩니다");
    expect(all({ clinicSearchReady: true, kakaoLoginReady: true, llmReady: true })).toContain("온맘 서버(대한민국 서울)에 저장돼요");
  });

  it("카드 제목 — 서버 저장 빌드용 제목이 없는 카드는 모든 빌드에서 같은 제목", () => {
    for (const s of [...FEATURES, ...PRINCIPLES]) {
      if (s.titleWhenKakaoLogin !== undefined) expect(s.titleWhenKakaoLogin.trim()).not.toBe("");
      for (const build of ALL_BUILDS) {
        expect(sectionTitle(s, build)).toBe(build.kakaoLoginReady && s.titleWhenKakaoLogin !== undefined ? s.titleWhenKakaoLogin : s.title);
      }
    }
    expect([...FEATURES, ...PRINCIPLES].filter((s) => s.titleWhenKakaoLogin !== undefined).map((s) => s.icon)).toEqual(["storage"]);
  });

  it("빌드별 문구 — 한 문단에 두 변형이 있으면 카카오(서버 저장) 문구가 이기고, 그 문구는 AI 켜짐에서도 사실 · 모든 빌드에서 모든 카드에 본문", () => {
    for (const p of [...FEATURES, ...PRINCIPLES].flatMap((s) => s.body)) {
      for (const v of [p.whenKakaoLogin, p.whenLlm]) if (v !== undefined) expect(v.trim()).not.toBe("");
      if (p.whenKakaoLogin !== undefined && p.whenLlm !== undefined) {
        // AI가 켜지면 거짓이 되는 말(whenLlm이 기본 문구에서 뺀 말)을 카카오 문구가 하지 않는다
        expect(p.whenKakaoLogin).not.toContain("전송되지 않습니다");
        expect(paragraphText(p, { clinicSearchReady: false, kakaoLoginReady: true, llmReady: true })).toBe(p.whenKakaoLogin);
      }
    }
    for (const build of ALL_BUILDS) {
      for (const s of [...FEATURES, ...PRINCIPLES]) {
        const texts = s.body.map((p) => paragraphText(p, build));
        expect(texts.every((t) => t.trim() !== ""), `${s.title} ${JSON.stringify(build)}`).toBe(true);
        expect(new Set(texts).size).toBe(texts.length);
      }
    }
  });

  it("마지막 권유 안내 줄 — 카카오 로그인이 꺼졌으면 '준비 중', 켜졌으면 게스트·카카오", () => {
    expect(ctaNoteFor({ kakaoLoginReady: false })).toBe(LANDING_TEXT.ctaNote);
    expect(ctaNoteFor({ kakaoLoginReady: false })).toContain("카카오 로그인은 준비 중");
    expect(ctaNoteFor({ kakaoLoginReady: true })).toBe(LANDING_TEXT.ctaNoteKakao);
    expect(ctaNoteFor({ kakaoLoginReady: true })).not.toMatch(/준비 중|예정/);
  });

  it("서버·키가 필요한 문단은 표시돼 있다 — 가까운 산부인과 찾기", () => {
    const flagged = FEATURES.flatMap((f) => f.body).filter((p) => p.requires === "clinicSearch");
    expect(flagged).toHaveLength(1);
    expect(flagged[0].text).toContain("가까운 산부인과");
  });

  it("머리 메뉴는 페이지 안 섹션으로 간다", () => {
    const ids = Object.values(SECTION_ID) as string[];
    for (const item of NAV_ITEMS) expect(ids).toContain(item.id);
  });

  it("문서 제목은 이름 + 부제, 설명은 프로모션 문구", () => {
    expect(LANDING_META.title).toBe("온맘 — 산후 회복, 하루 1분 기록으로");
    expect(LANDING_META.description).toBe(LANDING_TEXT.promo);
  });
});

describe("startAction — 시작 버튼", () => {
  const cases: ReadonlyArray<[RootScreen, string, string]> = [
    ["loading", ROUTES.login, LANDING_TEXT.start], // 정적 HTML·첫 렌더
    ["login", ROUTES.login, LANDING_TEXT.start],
    ["onboarding", ROUTES.onboarding, LANDING_TEXT.start], // 온보딩을 이어서
    ["main", ROUTES.home, LANDING_TEXT.openApp],
    // 다시 동의가 필요한 앱 사용자 — 앱 홈으로, 관문이 다시 동의 화면으로 보낸다
    ["consent", ROUTES.home, LANDING_TEXT.openApp],
  ];
  it.each(cases)("%s → %s", (screen, href, label) => {
    const a = startAction(screen);
    expect(a.href).toBe(href);
    expect(a.label).toBe(label);
    expect(a.opensApp).toBe(screen === "main" || screen === "consent");
  });

  it("앱 홈은 /home/ — 서비스 소개(/)로 되돌아오지 않는다", () => {
    for (const s of ["loading", "login", "onboarding", "consent", "main"] as const) expect(startAction(s).href).not.toBe(ROUTES.landing);
  });
});
