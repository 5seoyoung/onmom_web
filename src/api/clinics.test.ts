import { describe, expect, it, vi } from "vitest";
import {
  CLINIC_CATEGORY_GROUP,
  CLINIC_MESSAGES,
  CLINIC_QUERY,
  distanceMeters,
  distanceText,
  kakaoPlaceUrl,
  MAX_CLINICS,
  SEARCH_RADIUS_M,
  searchNearbyClinics,
  telHref,
  toClinics,
  toDomesticPhone,
  type ClinicSearchServices,
  type KakaoPlace,
  type LatLng,
} from "./clinics";

const center: LatLng = { lat: 37.6543, lng: 127.0565 }; // 서울 노원구 근처

/** center에서 북쪽으로 meters만큼 떨어진 장소 */
function placeAt(id: string, meters: number, extra: Partial<KakaoPlace> = {}): KakaoPlace {
  const lat = center.lat + meters / 111_195;
  return {
    id,
    place_name: `산부인과${id}`,
    road_address_name: `서울 노원구 도로 ${id}`,
    address_name: `서울 노원구 지번 ${id}`,
    phone: "02-933-8828",
    x: String(center.lng),
    y: String(lat),
    place_url: `http://place.map.kakao.com/${id}`,
    ...extra,
  };
}

describe("문구는 NearbyClinics.swift 원문", () => {
  it("네 가지", () => {
    expect(CLINIC_MESSAGES).toEqual({
      emptyAddress: "동네(주소)를 입력해 주세요.",
      notFound: "입력한 주소를 찾지 못했어요. 동/구 이름으로 다시 시도해 보세요.",
      noResults: "주변에서 산부인과를 찾지 못했어요.",
      failed: "검색에 실패했어요. 잠시 후 다시 시도해 주세요.",
    });
  });
});

describe("distanceText", () => {
  it.each([
    [0, "직선거리 0m"],
    [45.9, "직선거리 45m"],
    [999.99, "직선거리 999m"],
    [1000, "직선거리 1.0km"],
    [1234, "직선거리 1.2km"],
    [1260, "직선거리 1.3km"],
    [5657, "직선거리 5.7km"],
    [12_345, "직선거리 12.3km"],
  ])("%d m → %s", (m, text) => {
    expect(distanceText(m)).toBe(text);
  });
});

describe("distanceMeters", () => {
  it("위도 0.01° ≈ 1.11km", () => {
    expect(distanceMeters({ lat: 37.5, lng: 127 }, { lat: 37.51, lng: 127 })).toBeCloseTo(1112, -1);
  });

  it("같은 점은 0", () => {
    expect(distanceMeters(center, center)).toBe(0);
  });
});

describe("전화번호", () => {
  it("국제 형식 → 국내 표기", () => {
    expect(toDomesticPhone("+82 2-933-8828")).toBe("02-933-8828");
    expect(toDomesticPhone("+82 10-1234-5678")).toBe("010-1234-5678");
  });

  it("국내 표기는 그대로, 비면 null", () => {
    expect(toDomesticPhone("02-933-8828")).toBe("02-933-8828");
    expect(toDomesticPhone("")).toBeNull();
    expect(toDomesticPhone(undefined)).toBeNull();
  });

  it("tel: 링크는 숫자만", () => {
    expect(telHref("02-933-8828")).toBe("tel:029338828");
    expect(telHref("+82 2-933-8828")).toBe("tel:029338828");
    expect(telHref("")).toBeNull();
    expect(telHref(null)).toBeNull();
  });
});

describe("kakaoPlaceUrl", () => {
  it("카카오 http place_url은 https로 올린다", () => {
    expect(kakaoPlaceUrl("http://place.map.kakao.com/26338954")).toBe("https://place.map.kakao.com/26338954");
    expect(kakaoPlaceUrl("https://place.map.kakao.com/26338954")).toBe("https://place.map.kakao.com/26338954");
  });

  it("다른 호스트·스킴은 버린다", () => {
    expect(kakaoPlaceUrl("http://evil.example/1")).toBeNull();
    expect(kakaoPlaceUrl("javascript:alert(1)")).toBeNull();
    expect(kakaoPlaceUrl("")).toBeNull();
    expect(kakaoPlaceUrl(undefined)).toBeNull();
  });
});

describe("toClinics", () => {
  it("직선거리 오름차순, 최대 6곳", () => {
    const places = [900, 12_000, 150, 3_000, 5_200, 50, 700, 2_000].map((m, i) => placeAt(String(i), m));
    const clinics = toClinics(places, center);
    expect(clinics).toHaveLength(MAX_CLINICS);
    expect(clinics.map((c) => c.id)).toEqual(["5", "2", "6", "0", "7", "3"]);
    const ds = clinics.map((c) => c.distanceM);
    expect([...ds].sort((a, b) => a - b)).toEqual(ds);
    expect(clinics[0].distanceM).toBeCloseTo(50, 0);
  });

  it("필드 정리 — 도로명 우선·전화·https place_url·좌표", () => {
    const [c] = toClinics([placeAt("1", 800)], center);
    expect(c).toMatchObject({
      id: "1",
      name: "산부인과1",
      address: "서울 노원구 도로 1",
      phone: "02-933-8828",
      placeUrl: "https://place.map.kakao.com/1",
    });
    expect(c.coordinate.lng).toBe(center.lng);
  });

  it("도로명이 없으면 지번, 둘 다 없으면 null / 전화 없으면 null / 이름 없으면 '산부인과'", () => {
    const [a, b] = toClinics(
      [
        placeAt("a", 100, { road_address_name: "" }),
        placeAt("b", 200, { road_address_name: "", address_name: "", phone: "", place_name: "" }),
      ],
      center,
    );
    expect(a.address).toBe("서울 노원구 지번 a");
    expect(b).toMatchObject({ address: null, phone: null, name: "산부인과" });
  });

  it("좌표가 없는 장소는 뺀다", () => {
    expect(toClinics([placeAt("1", 100, { x: "", y: "abc" })], center)).toEqual([]);
  });

  it("결과가 없으면 빈 배열", () => {
    expect(toClinics([], center)).toEqual([]);
  });
});

function fakeServices(overrides: Partial<ClinicSearchServices> = {}): ClinicSearchServices {
  return {
    geocode: vi.fn(async () => ({ type: "ok" as const, center })),
    searchNearby: vi.fn(async () => ({ type: "ok" as const, places: [placeAt("1", 300)] })),
    ...overrides,
  };
}

describe("searchNearbyClinics", () => {
  it("카카오 JS 키가 없으면 notConfigured(원문 없음 → message null)", async () => {
    const services = fakeServices();
    const res = await searchNearbyClinics("서울 노원구", { kakaoJsKey: null, services });
    expect(res).toEqual({ ok: false, kind: "notConfigured", message: null });
    expect(services.geocode).not.toHaveBeenCalled();
  });

  it("빈 주소 → emptyAddress, 검색하지 않는다", async () => {
    const services = fakeServices();
    const res = await searchNearbyClinics("   ", { kakaoJsKey: "k", services });
    expect(res).toEqual({ ok: false, kind: "emptyAddress", message: CLINIC_MESSAGES.emptyAddress });
    expect(services.geocode).not.toHaveBeenCalled();
  });

  it("주소 앞뒤 공백을 지우고 지오코딩 → '산부인과' 병원 카테고리 검색", async () => {
    const services = fakeServices();
    const res = await searchNearbyClinics("  서울 노원구  ", { kakaoJsKey: "k", services });
    expect(services.geocode).toHaveBeenCalledWith("서울 노원구");
    expect(services.searchNearby).toHaveBeenCalledWith({
      keyword: CLINIC_QUERY,
      center,
      radiusM: SEARCH_RADIUS_M,
      categoryGroupCode: CLINIC_CATEGORY_GROUP,
    });
    expect(CLINIC_QUERY).toBe("산부인과");
    expect(res).toMatchObject({ ok: true, center, clinics: [{ id: "1" }] });
  });

  it("반경은 카카오 최대 20km — iOS 영역(8km)은 힌트라 더 먼 병원도 나왔다(NearbyClinics.swift:101-103)", async () => {
    expect(SEARCH_RADIUS_M).toBe(20_000);
    // 산부인과가 먼 지역: 레드플래그 중에 "못 찾았어요"가 아니라 가까운 순으로 보여준다
    const places = [18_000, 9_500, 14_000].map((m, i) => placeAt(String(i), m));
    const res = await searchNearbyClinics("군 단위 지역", {
      kakaoJsKey: "k",
      services: fakeServices({ searchNearby: async () => ({ type: "ok", places }) }),
    });
    if (!res.ok) throw new Error("expected ok");
    expect(res.clinics.map((c) => c.id)).toEqual(["1", "2", "0"]);
    expect(res.clinics.map((c) => distanceText(c.distanceM))).toEqual(["직선거리 9.5km", "직선거리 14.0km", "직선거리 18.0km"]);
  });

  it("결과를 정렬·상한 처리한다", async () => {
    const places = [7_000, 100, 3_000, 200, 6_000, 300, 400].map((m, i) => placeAt(String(i), m));
    const res = await searchNearbyClinics("노원구", {
      kakaoJsKey: "k",
      services: fakeServices({ searchNearby: async () => ({ type: "ok", places }) }),
    });
    if (!res.ok) throw new Error("expected ok");
    expect(res.clinics.map((c) => c.id)).toEqual(["1", "3", "5", "6", "2", "4"]);
  });

  it("주소를 못 찾으면 notFound", async () => {
    const res = await searchNearbyClinics("없는동네", {
      kakaoJsKey: "k",
      services: fakeServices({ geocode: async () => ({ type: "notFound" }) }),
    });
    expect(res).toEqual({ ok: false, kind: "notFound", message: CLINIC_MESSAGES.notFound });
  });

  it("주변 결과가 0건이면 noResults", async () => {
    const res = await searchNearbyClinics("노원구", {
      kakaoJsKey: "k",
      services: fakeServices({ searchNearby: async () => ({ type: "ok", places: [] }) }),
    });
    expect(res).toEqual({ ok: false, kind: "noResults", message: CLINIC_MESSAGES.noResults });
  });

  it.each([
    ["지오코딩 오류", fakeServices({ geocode: async () => ({ type: "error" }) })],
    ["지오코딩 좌표가 이상함", fakeServices({ geocode: async () => ({ type: "ok", center: { lat: NaN, lng: 127 } }) })],
    ["검색 오류", fakeServices({ searchNearby: async () => ({ type: "error" }) })],
    [
      "SDK 로드 실패(throw)",
      fakeServices({
        geocode: async () => {
          throw new Error("script error");
        },
      }),
    ],
  ])("%s → failed", async (_label, services) => {
    const res = await searchNearbyClinics("노원구", { kakaoJsKey: "k", services });
    expect(res).toEqual({ ok: false, kind: "failed", message: CLINIC_MESSAGES.failed });
  });
});
