// 가까운 산부인과 찾기 — iOS NearbyClinics.swift 이식(MapKit → 카카오 지도 JS SDK).
// 입력한 동네(주소)를 좌표로 바꾸고 → "산부인과"를 검색해 → 직선거리 순 최대 6곳을 보여준다.
// 기기 위치 권한은 쓰지 않는다(입력한 동네 기준 — 처리방침과 일치).
//
// 이 파일은 순수 로직(거리·정렬·상한·표기)과 흐름(주소 → 검색 → 결과/오류)만 가진다.
// 카카오 SDK 호출은 kakaoMaps.ts가 하고, 테스트는 services를 주입해 SDK 없이 돈다.

import { config } from "@/config";
import { createKakaoClinicServices } from "./kakaoMaps";
import { safeExternalUrl } from "./safeUrl";

export type LatLng = { lat: number; lng: number };

/** 카카오 장소 검색 결과 중 쓰는 필드(문자열 그대로) */
export type KakaoPlace = {
  id: string;
  place_name: string;
  road_address_name?: string;
  address_name?: string;
  phone?: string;
  /** 경도 */
  x: string;
  /** 위도 */
  y: string;
  place_url?: string;
};

export type Clinic = {
  id: string;
  name: string;
  /** 도로명 주소, 없으면 지번 주소 */
  address: string | null;
  /** 국내 표기 전화번호 */
  phone: string | null;
  /** 입력한 동네에서의 직선거리(m) */
  distanceM: number;
  /** 카카오맵 장소 페이지(https, 허용 호스트만) */
  placeUrl: string | null;
  coordinate: LatLng;
};

export type GeocodeOutcome = { type: "ok"; center: LatLng } | { type: "notFound" } | { type: "error" };
export type PlacesOutcome = { type: "ok"; places: KakaoPlace[] } | { type: "error" };

export type NearbySearchRequest = {
  keyword: string;
  center: LatLng;
  radiusM: number;
  categoryGroupCode: string;
};

/** 지오코딩·장소 검색 — 기본은 카카오 JS SDK, 테스트는 가짜를 넣는다 */
export type ClinicSearchServices = {
  geocode(address: string): Promise<GeocodeOutcome>;
  searchNearby(req: NearbySearchRequest): Promise<PlacesOutcome>;
};

export type ClinicFailureKind = "emptyAddress" | "notFound" | "noResults" | "failed";

export type ClinicSearchResult =
  | { ok: true; center: LatLng; clinics: Clinic[] }
  /** 카카오 JS 키가 없음. iOS에는 없던 상태라 원문 문구가 없다 — 화면이 정한다(message: null). */
  | { ok: false; kind: "notConfigured"; message: null }
  | { ok: false; kind: ClinicFailureKind; message: string };

export const CLINIC_MESSAGES: Record<ClinicFailureKind, string> = {
  emptyAddress: "동네(주소)를 입력해 주세요.", // 원문: NearbyClinics.swift:52
  notFound: "입력한 주소를 찾지 못했어요. 동/구 이름으로 다시 시도해 보세요.", // 원문: NearbyClinics.swift:53
  noResults: "주변에서 산부인과를 찾지 못했어요.", // 원문: NearbyClinics.swift:54
  failed: "검색에 실패했어요. 잠시 후 다시 시도해 주세요.", // 원문: NearbyClinics.swift:87
};

export const CLINIC_QUERY = "산부인과"; // 원문: NearbyClinics.swift:100
const CLINIC_FALLBACK_NAME = "산부인과"; // 원문: NearbyClinics.swift:73
export const MAX_CLINICS = 6; // NearbyClinics.swift:80

// iOS의 8km×8km 영역(NearbyClinics.swift:101-103)은 "어디서 찾을지"의 힌트일 뿐이라, 그보다 먼 병원도 결과에 나왔다.
// 카카오 radius는 그 밖을 잘라내므로, 허용 최대(20km)로 넓힌다. 이 검색은 레드플래그 카드 바로 아래에 뜨는 안전 단계라
// (RecordFlowView.swift:269-275) 산부인과가 멀리 있는 지역에서 iOS는 보여주던 병원을 "못 찾았어요"로 바꾸면 안 된다.
// 거리순 정렬 후 6곳만 쓰므로 넓혀도 가까운 병원이 밀려나지 않는다.
// radius를 빼면 넓어지는 게 아니라 SDK 기본값 5km가 적용된다 — 20km 밖은 JS SDK로는 찾을 수 없다.
export const SEARCH_RADIUS_M = 20_000;
/** 카카오 카테고리 "병원" — 주차장·정류장처럼 이름에 '산부인과'만 들어간 장소를 뺀다 */
export const CLINIC_CATEGORY_GROUP = "HP8";

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** 두 좌표의 대원 거리(m) — iOS CLLocation.distance(from:)에 대응 */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 직선거리 표기. 경로 소요시간은 계산하지 않는다(지도에서 확인). */
export function distanceText(meters: number): string {
  // 원문: NearbyClinics.swift:34-36
  return meters >= 1000 ? `직선거리 ${(meters / 1000).toFixed(1)}km` : `직선거리 ${Math.trunc(meters)}m`;
}

/** 국제 형식(+82 2-933-8828)을 국내 표기(02-933-8828)로. 비었으면 null. (NearbyClinics.swift:19-24) */
export function toDomesticPhone(phone: string | null | undefined): string | null {
  if (!phone || phone.trim() === "") return null;
  const compact = phone.replace(/ /g, "");
  if (!compact.startsWith("+82")) return phone;
  return "0" + compact.slice(3);
}

/** 눌러서 걸 수 있는 tel: 링크(숫자만). (NearbyClinics.swift:27-30) */
export function telHref(phone: string | null | undefined): string | null {
  const digits = toDomesticPhone(phone)?.replace(/\D/g, "") ?? "";
  return digits === "" ? null : `tel:${digits}`;
}

/** 카카오 place_url은 http로 오므로 https로 올린 뒤 허용 호스트 검사를 거친다 */
export function kakaoPlaceUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return safeExternalUrl(raw.replace(/^http:\/\/place\.map\.kakao\.com\//i, "https://place.map.kakao.com/"));
}

const blankToNull = (s: string | undefined): string | null => (s && s.trim() !== "" ? s : null);

/** 검색 결과 → 직선거리 순 최대 6곳. 좌표가 없는 장소는 거리를 댈 수 없어 뺀다. */
export function toClinics(places: KakaoPlace[], center: LatLng): Clinic[] {
  const clinics: Clinic[] = [];
  for (const p of places) {
    const coordinate = { lat: Number(p.y), lng: Number(p.x) };
    if (!isValidLatLng(coordinate)) continue;
    clinics.push({
      id: p.id,
      name: blankToNull(p.place_name) ?? CLINIC_FALLBACK_NAME,
      address: blankToNull(p.road_address_name) ?? blankToNull(p.address_name),
      phone: toDomesticPhone(p.phone),
      distanceM: distanceMeters(center, coordinate),
      placeUrl: kakaoPlaceUrl(p.place_url),
      coordinate,
    });
  }
  return clinics.sort((a, b) => a.distanceM - b.distanceM).slice(0, MAX_CLINICS);
}

export function isValidLatLng(c: LatLng): boolean {
  return Number.isFinite(c.lat) && Number.isFinite(c.lng) && Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180;
}

export const isClinicSearchConfigured = () => config.kakaoJsKey !== null;

export type ClinicSearchOptions = {
  /** 기본 config.kakaoJsKey. 테스트에서 주입한다. */
  kakaoJsKey?: string | null;
  /** 기본은 카카오 JS SDK */
  services?: ClinicSearchServices;
};

const failure = (kind: ClinicFailureKind): ClinicSearchResult => ({ ok: false, kind, message: CLINIC_MESSAGES[kind] });

export async function searchNearbyClinics(rawAddress: string, opts: ClinicSearchOptions = {}): Promise<ClinicSearchResult> {
  const key = opts.kakaoJsKey !== undefined ? opts.kakaoJsKey : config.kakaoJsKey;
  if (!key) return { ok: false, kind: "notConfigured", message: null };

  const address = rawAddress.trim();
  if (address === "") return failure("emptyAddress");

  const services = opts.services ?? createKakaoClinicServices(key);
  try {
    const geo = await services.geocode(address);
    if (geo.type === "notFound") return failure("notFound");
    if (geo.type === "error" || !isValidLatLng(geo.center)) return failure("failed");

    const found = await services.searchNearby({
      keyword: CLINIC_QUERY,
      center: geo.center,
      radiusM: SEARCH_RADIUS_M,
      categoryGroupCode: CLINIC_CATEGORY_GROUP,
    });
    if (found.type === "error") return failure("failed");

    const clinics = toClinics(found.places, geo.center);
    return clinics.length === 0 ? failure("noResults") : { ok: true, center: geo.center, clinics };
  } catch {
    // SDK 로드 실패(오프라인·도메인 미등록·차단) 포함
    return failure("failed");
  }
}
