"use client";

// 검색된 산부인과 위치 지도 — NearbyClinicsView.swift:75-92(MapKit Map) → 카카오 지도 JS SDK.
// 높이 220, 라운드 card, 내 동네 = 코랄 집 아이콘, 병원 = 빨간 십자 핀 + 이름.
// SDK 로드는 api/kakaoMaps.ts(loadKakaoMaps)가 하고, 지도 그리기에 필요한 SDK 타입만 여기에 적는다.
// 지도를 그리지 못하면(로드 실패·SDK 변경) 지도만 빼고 목록은 그대로 둔다 — 같은 정보가 목록에 있다.
// 접근성(2026-09-30 공개 사이트에서 실제 키로 SDK가 넣는 DOM을 확인): 컨테이너는 이름 있는 영역(role="region").
// SDK 타일 <img>는 alt=""라 이미 숨겨지고, 초점을 받는 것은 로고 링크("Kakao 맵으로 이동(새창열림)") 하나뿐 —
// 이름·초점 링이 있고 Tab이 갇히지 않아 그대로 둔다(보이는 링크를 Tab에서 빼면 키보드로 닿지 못한다).
// 이름 없는 "이미지"로 읽히는 빈 벡터 층 <svg>만 숨긴다(hideSdkVectorLayer). 핀 이름은 목록과 같은 순서의 글자로 남긴다.

import { useEffect, useRef, useState } from "react";
import type { Clinic, LatLng } from "@/api/clinics";
import { loadKakaoMaps } from "@/api/kakaoMaps";
import { CLINICS_TEXT, mapPoints, type MapPoint } from "./clinicsView";

type KakaoLatLng = object;
type KakaoBounds = { extend(p: KakaoLatLng): void };
type KakaoMapInstance = {
  setBounds(b: KakaoBounds, paddingTop?: number, paddingRight?: number, paddingBottom?: number, paddingLeft?: number): void;
  relayout(): void;
};
type KakaoOverlay = { setMap(map: KakaoMapInstance | null): void };
/** 지도 그리기에 쓰는 SDK 부분 — api/kakaoMaps.ts의 KakaoMaps 타입에는 검색 부분만 있다. */
type KakaoMapsDrawing = {
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  LatLngBounds: new () => KakaoBounds;
  Map: new (container: HTMLElement, options: { center: KakaoLatLng; level: number; scrollwheel?: boolean }) => KakaoMapInstance;
  CustomOverlay: new (options: {
    position: KakaoLatLng;
    content: HTMLElement;
    xAnchor?: number;
    yAnchor?: number;
    zIndex?: number;
    clickable?: boolean;
  }) => KakaoOverlay;
};

function hasDrawing(maps: unknown): maps is KakaoMapsDrawing {
  const m = maps as Partial<Record<keyof KakaoMapsDrawing, unknown>>;
  return (
    typeof m.LatLng === "function" &&
    typeof m.LatLngBounds === "function" &&
    typeof m.Map === "function" &&
    typeof m.CustomOverlay === "function"
  );
}

const SVG_NS = "http://www.w3.org/2000/svg";
/** lucide "plus"·"house" 경로 — 핀 안 흰 아이콘 */
const ICON_PATHS: Record<MapPoint["kind"], string[]> = {
  clinic: ["M5 12h14", "M12 5v14"],
  home: [
    "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8",
    "M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  ],
};

/** 핀 DOM — 이름은 textContent로만 넣는다(외부 응답을 HTML로 해석하지 않는다). */
function createPin(point: MapPoint): HTMLElement {
  const pin = document.createElement("div");
  pin.className = `relative flex size-7 items-center justify-center rounded-full border-2 border-white shadow-md ${
    point.kind === "home" ? "bg-primary" : "bg-state-alert"
  }`;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "white");
  svg.setAttribute("stroke-width", point.kind === "home" ? "2.25" : "3");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "size-4");
  for (const d of ICON_PATHS[point.kind]) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  pin.appendChild(svg);
  const label = document.createElement("span");
  label.className =
    "absolute top-full left-1/2 mt-0.5 max-w-32 -translate-x-1/2 truncate text-[0.6875rem] font-semibold whitespace-nowrap text-text-primary [text-shadow:0_0_0.125rem_white,0_0_0.125rem_white,0_0_0.125rem_white]";
  label.textContent = point.label;
  pin.appendChild(label);
  return pin;
}

/**
 * SDK가 지도를 만들 때 넣는 벡터 층 <svg>(선·도형용 — 이 화면은 그리지 않아 <defs>만 있다)를 보조기기에서 숨긴다.
 * Chromium은 이 층을 이름 없는 "이미지"로 내보내 낭독만 늘린다. 층은 지도 생성 때 한 번 만들어지고
 * 범위·확대·이동 뒤에도 같은 노드로 남는다(2026-09-30 공개 사이트에서 확인). 핀을 올리기 전에 부르므로
 * 핀 아이콘(이미 aria-hidden)과 섞이지 않는다. 보이는 모양·동작은 바뀌지 않는다.
 */
export function hideSdkVectorLayer(container: Pick<ParentNode, "querySelectorAll">): void {
  container.querySelectorAll("svg:not([aria-hidden])").forEach((svg) => svg.setAttribute("aria-hidden", "true"));
}

export interface ClinicMapProps {
  kakaoJsKey: string;
  center: LatLng;
  clinics: readonly Clinic[];
}

export function ClinicMap({ kakaoJsKey, center, clinics }: ClinicMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    const overlays: KakaoOverlay[] = [];
    loadKakaoMaps(kakaoJsKey)
      .then((maps) => {
        if (cancelled) return;
        if (!hasDrawing(maps)) throw new Error("kakao maps: drawing API missing");
        const toLatLng = (p: LatLng) => new maps.LatLng(p.lat, p.lng);
        const map = new maps.Map(container, { center: toLatLng(center), level: 5, scrollwheel: false });
        hideSdkVectorLayer(container);
        const bounds = new maps.LatLngBounds();
        mapPoints(center, clinics).forEach((point, i) => {
          const position = toLatLng(point.position);
          bounds.extend(position);
          const overlay = new maps.CustomOverlay({
            position,
            content: createPin(point),
            xAnchor: 0.5,
            yAnchor: 0.5,
            // 내 동네를 맨 위에, 병원은 가까운 곳이 위에
            zIndex: point.kind === "home" ? 100 : 50 - i,
          });
          overlay.setMap(map);
          overlays.push(overlay);
        });
        map.relayout();
        map.setBounds(bounds, 32, 32, 32, 32);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      for (const o of overlays) o.setMap(null);
      // 다시 그릴 때 이전 지도 DOM이 겹치지 않게 비운다(이 div에는 React 자식이 없다)
      container.replaceChildren();
    };
  }, [kakaoJsKey, center, clinics]);

  if (failed) return null;
  // Tailwind preflight의 `img { max-width: 100% }`가 SDK가 절대 위치로 그리는 타일·로고 <img>를 줄이거나 어긋나게 하므로
  // 이 컨테이너 안에서만 푼다(2026-09-30 공개 사이트에서 실제 키로 타일·로고가 제자리에 그려지는 것을 확인).
  // 로고 링크의 초점 링(2px + 간격 2px)은 컨테이너 안쪽에 그려져 overflow-hidden에 잘리지 않는다(같은 날 확인).
  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={CLINICS_TEXT.mapRegion}
      className="h-[13.75rem] w-full overflow-hidden rounded-card bg-divider [&_img]:max-w-none"
    />
  );
}
