import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createKakaoClinicServices, kakaoMapsSdkUrl, loadKakaoMaps, resetKakaoMapsLoader } from "./kakaoMaps";
import type { KakaoPlace } from "./clinics";

const Status = { OK: "OK", ZERO_RESULT: "ZERO_RESULT", ERROR: "ERROR" };
const SortBy = { ACCURACY: "accuracy", DISTANCE: "distance" };

type GeocodeReply = [{ x: string; y: string }[], string];
type PlacesReply = [KakaoPlace[], string];

/** 카카오 SDK 대역 — 응답과 받은 옵션을 기록한다 */
function fakeKakao(geocodeReply: GeocodeReply, placesReply: PlacesReply) {
  const calls = { addressSearch: [] as string[], keywordSearch: [] as { keyword: string; options: Record<string, unknown> }[] };
  const maps = {
    load: vi.fn((cb: () => void) => cb()),
    LatLng: class {
      constructor(
        public lat: number,
        public lng: number,
      ) {}
    },
    services: {
      Status,
      SortBy,
      Geocoder: class {
        addressSearch(address: string, cb: (r: GeocodeReply[0], s: string) => void) {
          calls.addressSearch.push(address);
          cb(...geocodeReply);
        }
      },
      Places: class {
        keywordSearch(keyword: string, cb: (r: PlacesReply[0], s: string) => void, options: Record<string, unknown>) {
          calls.keywordSearch.push({ keyword, options });
          cb(...placesReply);
        }
      },
    },
  };
  return { maps, calls };
}

/** document.createElement('script')·head.appendChild 대역. appendChild 시 onAppend로 로드 결과를 흉내 낸다. */
function fakeDocument(onAppend: (script: FakeScript) => void) {
  const appended: FakeScript[] = [];
  const doc = {
    createElement: vi.fn(() => {
      const s: FakeScript = { src: "", async: false, onload: null, onerror: null, remove: vi.fn() };
      return s;
    }),
    head: {
      appendChild: vi.fn((s: FakeScript) => {
        appended.push(s);
        onAppend(s);
      }),
    },
  };
  return { doc, appended };
}
type FakeScript = { src: string; async: boolean; onload: null | (() => void); onerror: null | (() => void); remove: () => void };

beforeEach(() => resetKakaoMapsLoader());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("kakaoMapsSdkUrl", () => {
  it("JS 키 + services 라이브러리 + autoload=false", () => {
    const u = new URL(kakaoMapsSdkUrl("abc&def"));
    expect(`${u.origin}${u.pathname}`).toBe("https://dapi.kakao.com/v2/maps/sdk.js");
    expect(u.searchParams.get("appkey")).toBe("abc&def");
    expect(u.searchParams.get("libraries")).toBe("services");
    expect(u.searchParams.get("autoload")).toBe("false");
  });
});

describe("loadKakaoMaps", () => {
  it("스크립트를 한 번만 넣고 kakao.maps.load 후 돌려준다", async () => {
    const { maps } = fakeKakao([[], Status.OK], [[], Status.OK]);
    const { doc, appended } = fakeDocument((s) => {
      vi.stubGlobal("kakao", { maps });
      s.onload?.();
    });
    vi.stubGlobal("document", doc);

    const [a, b] = await Promise.all([loadKakaoMaps("key"), loadKakaoMaps("key")]);
    expect(a).toBe(maps);
    expect(b).toBe(maps);
    expect(appended).toHaveLength(1);
    expect(appended[0].src).toBe(kakaoMapsSdkUrl("key"));
    expect(maps.load).toHaveBeenCalledTimes(1);
  });

  it("스크립트 오류면 실패하고, 다음 호출에서 다시 시도한다", async () => {
    let fail = true;
    const { maps } = fakeKakao([[], Status.OK], [[], Status.OK]);
    const { doc, appended } = fakeDocument((s) => {
      if (fail) s.onerror?.();
      else {
        vi.stubGlobal("kakao", { maps });
        s.onload?.();
      }
    });
    vi.stubGlobal("document", doc);

    await expect(loadKakaoMaps("key")).rejects.toThrow();
    expect(appended[0].remove).toHaveBeenCalled();
    fail = false;
    await expect(loadKakaoMaps("key")).resolves.toBe(maps);
    expect(appended).toHaveLength(2);
  });

  it("스크립트가 끝내 오지 않으면 타임아웃", async () => {
    vi.useFakeTimers();
    const { doc } = fakeDocument(() => {});
    vi.stubGlobal("document", doc);
    const p = loadKakaoMaps("key", 1000);
    const check = expect(p).rejects.toThrow(/timeout/);
    await vi.advanceTimersByTimeAsync(1000);
    await check;
  });

  it("document가 없으면(서버 렌더) 실패", async () => {
    await expect(loadKakaoMaps("key")).rejects.toThrow();
  });
});

describe("createKakaoClinicServices", () => {
  const center = { lat: 37.65, lng: 127.05 };
  const place: KakaoPlace = { id: "1", place_name: "온맘산부인과", x: "127.05", y: "37.66" };

  function setup(geocodeReply: GeocodeReply, placesReply: PlacesReply = [[place], Status.OK]) {
    const { maps, calls } = fakeKakao(geocodeReply, placesReply);
    vi.stubGlobal("kakao", { maps });
    return { services: createKakaoClinicServices("key"), calls };
  }

  it("지오코딩 OK → 첫 결과 좌표(y=위도, x=경도)", async () => {
    const { services, calls } = setup([[{ x: "127.05", y: "37.65" }], Status.OK]);
    expect(await services.geocode("서울 노원구")).toEqual({ type: "ok", center });
    expect(calls.addressSearch).toEqual(["서울 노원구"]);
  });

  it("지오코딩 ZERO_RESULT → notFound, ERROR → error", async () => {
    expect(await setup([[], Status.ZERO_RESULT]).services.geocode("x")).toEqual({ type: "notFound" });
    expect(await setup([[], Status.ERROR]).services.geocode("x")).toEqual({ type: "error" });
  });

  it("장소 검색 — 거리순·반경·카테고리·위치를 넘긴다", async () => {
    const { services, calls } = setup([[], Status.OK]);
    const res = await services.searchNearby({ keyword: "산부인과", center, radiusM: 20_000, categoryGroupCode: "HP8" });
    expect(res).toEqual({ type: "ok", places: [place] });
    expect(calls.keywordSearch).toHaveLength(1);
    const { keyword, options } = calls.keywordSearch[0];
    expect(keyword).toBe("산부인과");
    expect(options).toMatchObject({ radius: 20_000, sort: SortBy.DISTANCE, category_group_code: "HP8", size: 15 });
    expect(options.location).toMatchObject({ lat: center.lat, lng: center.lng });
  });

  it("장소 검색 ZERO_RESULT → 빈 목록, ERROR → error", async () => {
    const req = { keyword: "산부인과", center, radiusM: 20_000, categoryGroupCode: "HP8" };
    expect(await setup([[], Status.OK], [[], Status.ZERO_RESULT]).services.searchNearby(req)).toEqual({ type: "ok", places: [] });
    expect(await setup([[], Status.OK], [[], Status.ERROR]).services.searchNearby(req)).toEqual({ type: "error" });
  });
});
