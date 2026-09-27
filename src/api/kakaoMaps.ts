// 카카오 지도 JavaScript SDK 연결부 — 필요할 때만 스크립트를 넣고, 지오코딩·장소 검색을 Promise로 감싼다.
//
// JavaScript 키(config.kakaoJsKey)만 쓴다. 공개값이며 카카오 개발자 콘솔의 "사이트 도메인"으로 보호된다.
// REST 키는 도메인 제한이 없어 브라우저에 두면 안 된다(검수 #22).
// SDK는 요청의 Referer로 도메인을 확인하므로, 이 스크립트가 도는 페이지에 Referrer-Policy: no-referrer를 걸면 검색이 막힌다.

import type { ClinicSearchServices, GeocodeOutcome, KakaoPlace, PlacesOutcome } from "./clinics";

const SDK_URL = "https://dapi.kakao.com/v2/maps/sdk.js";
export const SDK_LOAD_TIMEOUT_MS = 10_000;
export const SERVICE_TIMEOUT_MS = 10_000;

// 쓰는 부분만 최소로 적은 SDK 타입
type KakaoStatus = string;
type KakaoLatLng = object;
type KakaoServices = {
  Status: { OK: KakaoStatus; ZERO_RESULT: KakaoStatus; ERROR: KakaoStatus };
  SortBy: { ACCURACY: unknown; DISTANCE: unknown };
  Geocoder: new () => {
    addressSearch(address: string, cb: (result: { x: string; y: string }[], status: KakaoStatus) => void): void;
  };
  Places: new () => {
    keywordSearch(
      keyword: string,
      cb: (result: KakaoPlace[], status: KakaoStatus) => void,
      options: Record<string, unknown>,
    ): void;
  };
};
export type KakaoMaps = {
  load(cb: () => void): void;
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  services?: KakaoServices;
};
type LoadedKakaoMaps = KakaoMaps & { services: KakaoServices };

/** window.kakao.maps — 전역 타입을 늘리지 않고 읽는다(다른 모듈의 선언과 충돌하지 않게) */
function readKakaoMaps(): KakaoMaps | undefined {
  return (globalThis as { kakao?: { maps?: KakaoMaps } }).kakao?.maps;
}

export function kakaoMapsSdkUrl(appKey: string): string {
  const u = new URL(SDK_URL);
  u.searchParams.set("appkey", appKey);
  u.searchParams.set("libraries", "services");
  u.searchParams.set("autoload", "false");
  return u.toString();
}

let loading: Promise<LoadedKakaoMaps> | null = null;

/** SDK를 한 번만 불러온다. 실패하면 다음 호출에서 다시 시도할 수 있게 비워 둔다. */
export function loadKakaoMaps(appKey: string, timeoutMs = SDK_LOAD_TIMEOUT_MS): Promise<LoadedKakaoMaps> {
  const ready = readKakaoMaps();
  if (ready?.services) return Promise.resolve(ready as LoadedKakaoMaps);
  if (loading) return loading;

  loading = new Promise<LoadedKakaoMaps>((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("kakao maps: no document"));
      return;
    }
    let script: HTMLScriptElement | null = null;
    const timer = setTimeout(() => fail(new Error("kakao maps: load timeout")), timeoutMs);
    function fail(e: Error) {
      clearTimeout(timer);
      script?.remove();
      reject(e);
    }
    function finish(maps: KakaoMaps) {
      maps.load(() => {
        clearTimeout(timer);
        if (maps.services) resolve(maps as LoadedKakaoMaps);
        else fail(new Error("kakao maps: services library missing"));
      });
    }

    // 이전 시도에서 스크립트는 왔지만 load()가 끝나지 않은 경우
    const partial = readKakaoMaps();
    if (partial) {
      finish(partial);
      return;
    }
    script = document.createElement("script");
    script.src = kakaoMapsSdkUrl(appKey);
    script.async = true;
    script.onload = () => {
      const maps = readKakaoMaps();
      if (maps) finish(maps);
      else fail(new Error("kakao maps: sdk did not initialise"));
    };
    script.onerror = () => fail(new Error("kakao maps: script error"));
    document.head.appendChild(script);
  });
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

/** 테스트 전용 — 로더 상태 초기화 */
export function resetKakaoMapsLoader(): void {
  loading = null;
}

/** 콜백이 끝내 오지 않을 때를 대비한 상한 */
function withTimeout<T>(run: (done: (v: T) => void) => void, ms: number, onTimeout: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(onTimeout), ms);
    run((v) => {
      clearTimeout(timer);
      resolve(v);
    });
  });
}

export function createKakaoClinicServices(appKey: string): ClinicSearchServices {
  return {
    async geocode(address) {
      const maps = await loadKakaoMaps(appKey);
      const { Geocoder, Status } = maps.services;
      return withTimeout<GeocodeOutcome>(
        (done) =>
          new Geocoder().addressSearch(address, (result, status) => {
            if (status === Status.OK && result.length > 0) {
              done({ type: "ok", center: { lat: Number(result[0].y), lng: Number(result[0].x) } });
            } else if (status === Status.ZERO_RESULT || status === Status.OK) {
              done({ type: "notFound" });
            } else {
              done({ type: "error" });
            }
          }),
        SERVICE_TIMEOUT_MS,
        { type: "error" },
      );
    },

    async searchNearby({ keyword, center, radiusM, categoryGroupCode }) {
      const maps = await loadKakaoMaps(appKey);
      const { Places, Status, SortBy } = maps.services;
      return withTimeout<PlacesOutcome>(
        (done) =>
          new Places().keywordSearch(
            keyword,
            (result, status) => {
              if (status === Status.OK) done({ type: "ok", places: result });
              else if (status === Status.ZERO_RESULT) done({ type: "ok", places: [] });
              else done({ type: "error" });
            },
            {
              location: new maps.LatLng(center.lat, center.lng),
              radius: radiusM,
              sort: SortBy.DISTANCE,
              category_group_code: categoryGroupCode,
              size: 15,
            },
          ),
        SERVICE_TIMEOUT_MS,
        { type: "error" },
      );
    },
  };
}
