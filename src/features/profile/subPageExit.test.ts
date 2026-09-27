import { describe, expect, it } from "vitest";
import { canLeaveWithHistoryBack, canLeaveWithHistoryBackToAny } from "./subPageExit";

const ORIGIN = "https://5seoyoung.github.io";
const BASE = "/onmom_web";
const WRITE = `${ORIGIN}${BASE}/journal/write/`;
const LIST = `${ORIGIN}${BASE}/journal/`;

describe("canLeaveWithHistoryBack — Navigation API가 있을 때", () => {
  it("앞 기록이 부모 화면이면 back()", () => {
    expect(
      canLeaveWithHistoryBack({ currentUrl: WRITE, previousEntryUrl: LIST, documentEntryUrl: LIST, basePath: BASE, parentHref: "/journal/" }),
    ).toBe(true);
  });

  it("주소로 바로 들어와 앞 기록이 없으면 replace", () => {
    expect(
      canLeaveWithHistoryBack({ currentUrl: WRITE, previousEntryUrl: null, documentEntryUrl: WRITE, basePath: BASE, parentHref: "/journal/" }),
    ).toBe(false);
  });

  it("같은 출처라도 다른 저장소 페이지(basePath 밖)면 replace", () => {
    expect(
      canLeaveWithHistoryBack({
        currentUrl: WRITE,
        previousEntryUrl: `${ORIGIN}/other_repo/`,
        documentEntryUrl: LIST,
        basePath: BASE,
        parentHref: "/journal/",
      }),
    ).toBe(false);
    // "/onmom_web2/…"처럼 접두만 같은 경로도 앱 밖이다
    expect(
      canLeaveWithHistoryBack({
        currentUrl: WRITE,
        previousEntryUrl: `${ORIGIN}${BASE}2/journal/`,
        documentEntryUrl: LIST,
        basePath: BASE,
        parentHref: "/journal/",
      }),
    ).toBe(false);
  });

  it("앞 기록이 부모가 아닌 앱 화면이면(홈에서 주소로 들어옴 등) replace — back()은 부모로 가지 않는다", () => {
    expect(
      canLeaveWithHistoryBack({
        currentUrl: WRITE,
        previousEntryUrl: `${ORIGIN}${BASE}/`,
        documentEntryUrl: WRITE,
        basePath: BASE,
        parentHref: "/journal/",
      }),
    ).toBe(false);
    expect(
      canLeaveWithHistoryBack({
        currentUrl: WRITE,
        previousEntryUrl: `${ORIGIN}${BASE}/settings/profile/`,
        documentEntryUrl: WRITE,
        basePath: BASE,
        parentHref: "/journal/",
      }),
    ).toBe(false);
  });

  it("부모 주소의 끝 슬래시·쿼리는 따지지 않는다", () => {
    expect(
      canLeaveWithHistoryBack({
        currentUrl: WRITE,
        previousEntryUrl: `${ORIGIN}${BASE}/journal?x=1#top`,
        documentEntryUrl: LIST,
        basePath: BASE,
        parentHref: "/journal/",
      }),
    ).toBe(true);
  });

  it("다시 불러오기로 문서가 바뀌어도 앞 기록이 부모 화면이면 back()", () => {
    expect(
      canLeaveWithHistoryBack({ currentUrl: WRITE, previousEntryUrl: LIST, documentEntryUrl: WRITE, basePath: BASE, parentHref: "/journal/" }),
    ).toBe(true);
  });

  it("basePath가 비어도(커스텀 도메인) 부모 화면이면 back()", () => {
    expect(
      canLeaveWithHistoryBack({
        currentUrl: "https://onmom.example/settings/profile/",
        previousEntryUrl: "https://onmom.example/settings/",
        documentEntryUrl: "https://onmom.example/profile/",
        basePath: "",
        parentHref: "/settings/",
      }),
    ).toBe(true);
  });

  it("다른 출처거나 읽을 수 없는 주소면 replace", () => {
    expect(
      canLeaveWithHistoryBack({
        currentUrl: WRITE,
        previousEntryUrl: "https://example.com/onmom_web/journal/",
        documentEntryUrl: LIST,
        basePath: BASE,
        parentHref: "/journal/",
      }),
    ).toBe(false);
    expect(
      canLeaveWithHistoryBack({ currentUrl: WRITE, previousEntryUrl: "not a url", documentEntryUrl: LIST, basePath: BASE, parentHref: "/journal/" }),
    ).toBe(false);
  });
});

describe("canLeaveWithHistoryBack — Navigation API가 없을 때(대체 판단)", () => {
  it("문서를 연 주소와 지금 주소가 다르면 앱 안에서 이동해 온 것 → back()", () => {
    expect(canLeaveWithHistoryBack({ currentUrl: WRITE, documentEntryUrl: LIST, basePath: BASE, parentHref: "/journal/" })).toBe(true);
  });

  it("지금 화면이 문서를 연 화면이면(주소로 바로 들어옴) replace", () => {
    expect(canLeaveWithHistoryBack({ currentUrl: WRITE, documentEntryUrl: WRITE, basePath: BASE, parentHref: "/journal/" })).toBe(false);
    // 해시만 다른 건 같은 화면
    expect(canLeaveWithHistoryBack({ currentUrl: `${WRITE}#x`, documentEntryUrl: WRITE, basePath: BASE, parentHref: "/journal/" })).toBe(false);
  });

  it("쿼리가 다르면 다른 화면(글 상세 ?id=)", () => {
    expect(
      canLeaveWithHistoryBack({
        currentUrl: `${ORIGIN}${BASE}/journal/post/?id=b`,
        documentEntryUrl: `${ORIGIN}${BASE}/journal/post/?id=a`,
        basePath: BASE,
        parentHref: "/journal/",
      }),
    ).toBe(true);
  });

  it("문서를 연 주소를 모르면 replace", () => {
    expect(canLeaveWithHistoryBack({ currentUrl: WRITE, documentEntryUrl: null, basePath: BASE, parentHref: "/journal/" })).toBe(false);
  });
});

describe("canLeaveWithHistoryBackToAny — 앞 화면이 여럿인 화면", () => {
  const PRIVACY = `${ORIGIN}${BASE}/privacy/`;
  const PARENTS = ["/", "/settings/"];
  const from = (previousEntryUrl: string | null) => ({ currentUrl: PRIVACY, previousEntryUrl, documentEntryUrl: PRIVACY, basePath: BASE });

  it("앞 기록이 후보 중 하나면 back()", () => {
    expect(canLeaveWithHistoryBackToAny(from(`${ORIGIN}${BASE}/`), PARENTS)).toBe(true);
    expect(canLeaveWithHistoryBackToAny(from(`${ORIGIN}${BASE}/settings/`), PARENTS)).toBe(true);
  });

  it("앞 기록이 후보가 아니거나 없으면 replace", () => {
    expect(canLeaveWithHistoryBackToAny(from(`${ORIGIN}${BASE}/home/`), PARENTS)).toBe(false);
    expect(canLeaveWithHistoryBackToAny(from(null), PARENTS)).toBe(false);
  });

  it("Navigation API가 없으면 canLeaveWithHistoryBack과 같은 대체 판단", () => {
    expect(canLeaveWithHistoryBackToAny({ currentUrl: PRIVACY, documentEntryUrl: `${ORIGIN}${BASE}/`, basePath: BASE }, PARENTS)).toBe(true);
    expect(canLeaveWithHistoryBackToAny({ currentUrl: PRIVACY, documentEntryUrl: PRIVACY, basePath: BASE }, PARENTS)).toBe(false);
  });
});
