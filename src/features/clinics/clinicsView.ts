// 가까운 산부인과(기록 결과·지역 연계 공용)의 화면 규칙 — iOS NearbyClinicsView.swift를 옮긴 것.
// 원본: onmom(iOS) 저장소 Onmom/Features/Region/NearbyClinicsView.swift — web/reference/swift에는 빠져 있다(검수 #34).
// 검색 흐름·문구·거리 표기는 api/clinics.ts가 가진다. 여기엔 "어느 상태에서 무엇을 보여주나"만 둔다.

import { distanceText, telHref, type Clinic, type ClinicFailureKind, type ClinicSearchResult, type LatLng } from "@/api/clinics";
import { OFFLINE_TEXT } from "@/features/home/useOnline";

export const CLINICS_TEXT = {
  addressTitle: "내 동네", // 원문: NearbyClinicsView.swift:30
  addressPlaceholder: "예: 서울 강남구 역삼동", // 원문: NearbyClinicsView.swift:32
  searchLabel: "이 동네에서 산부인과 찾기", // 원문: NearbyClinicsView.swift:46
  intro:
    "입력한 동네를 기준으로 가까운 산부인과를 찾아 직선거리 순으로 보여줘요. 길찾기는 지도 아이콘을 눌러 지도 앱에서 확인하세요.", // 원문: NearbyClinicsView.swift:51
  homeMarker: "내 동네", // 원문: NearbyClinicsView.swift:79
  // 웹 신규 문구 — CPO 확인 필요 (카카오 JS 키가 없을 때. iOS에는 없는 상태 — D6)
  notConfigured: "가까운 산부인과 찾기는 준비 중이에요.",
  // 웹 신규 문구 — CPO 확인 필요 (검색 중 스크린리더 안내. iOS는 ProgressView만 — NearbyClinicsView.swift:56)
  loading: "산부인과를 찾고 있어요",
} as const;

/** 전화 버튼 접근성 이름 — 원문: NearbyClinicsView.swift:128 */
export const callLabel = (name: string) => `${name}에 전화 걸기`;
/** 지도 버튼 접근성 이름 — 원문: NearbyClinicsView.swift:139 */
export const mapLabel = (name: string) => `${name} 지도로 열기`;

export type ClinicsViewState =
  /** 카카오 JS 키 없음 — 입력·안내문은 그대로 두고 "준비 중"만(D6) */
  | { status: "notConfigured" }
  /** 아직 검색하지 않음 */
  | { status: "idle" }
  | { status: "loading" }
  /** 원문 오류 문구(api/clinics CLINIC_MESSAGES). kind는 오프라인 안내로 바꿀지 가르는 데 쓴다(clinicsErrorMessage). */
  | { status: "error"; kind: ClinicFailureKind; message: string }
  | { status: "results"; center: LatLng; clinics: Clinic[] };

/**
 * 화면이 나타날 때 저장된 동네로 바로 찾을지 — 동네가 비어 있지 않으면(NearbyClinicsView.swift:70-72).
 * iOS와 같게 공백을 자르지 않고 본다: 공백만 있으면 검색이 "동네(주소)를 입력해 주세요."로 끝난다.
 */
export function shouldAutoSearch(address: string): boolean {
  return address.length > 0;
}

/** 첫 상태 — 키가 없으면 "준비 중", 자동 검색이면 처음부터 "찾는 중"(빈 화면이 한 번 번쩍이지 않게). */
export function initialClinicsState(configured: boolean, address: string): ClinicsViewState {
  if (!configured) return { status: "notConfigured" };
  return shouldAutoSearch(address) ? { status: "loading" } : { status: "idle" };
}

/** 검색 결과 → 화면 상태. 결과 없음·주소 못 찾음·실패는 원문 오류 문구 카드(NearbyClinicsView.swift:57-64). */
export function stateFromSearchResult(r: ClinicSearchResult): ClinicsViewState {
  if (r.ok) return { status: "results", center: r.center, clinics: r.clinics };
  if (r.kind === "notConfigured") return { status: "notConfigured" };
  return { status: "error", kind: r.kind, message: r.message };
}

/**
 * 오류 카드 문구. 검색 실패("failed" — SDK 로드·주소 변환·검색 요청 오류)인데 브라우저가 오프라인이면
 * 원문 "검색에 실패했어요…" 대신 오프라인 안내(05 §3 오프라인 동작). 주소 없음·못 찾음·결과 없음은 연결과 무관하니 원문 그대로.
 */
export function clinicsErrorMessage(view: Extract<ClinicsViewState, { status: "error" }>, online: boolean): string {
  return view.kind === "failed" && !online ? OFFLINE_TEXT : view.message;
}

export interface ClinicRowView {
  id: string;
  name: string;
  /** "직선거리 132m" / "직선거리 1.2km" */
  distance: string;
  /** 국내 표기 전화번호 — 없으면 줄을 뺀다 */
  phone: string | null;
  /** tel: 링크 — 번호가 없으면 전화 버튼을 뺀다(NearbyClinicsView.swift:120) */
  telHref: string | null;
  /**
   * 지도 버튼 링크 — 카카오맵 장소 페이지(허용된 https만, api/clinics kakaoPlaceUrl).
   * iOS는 늘 지도 앱을 열었지만(openInMaps), 웹은 확인된 장소 링크가 없으면 버튼을 뺀다(지어낸 링크 금지).
   */
  mapHref: string | null;
  callLabel: string;
  mapLabel: string;
}

export function clinicRowView(c: Clinic): ClinicRowView {
  return {
    id: c.id,
    name: c.name,
    distance: distanceText(c.distanceM),
    phone: c.phone,
    telHref: telHref(c.phone),
    mapHref: c.placeUrl,
    callLabel: callLabel(c.name),
    mapLabel: mapLabel(c.name),
  };
}

/** 지도에 찍을 점 — 내 동네(가운데) 1개 + 병원들. 목록과 같은 순서(직선거리 순). */
export interface MapPoint {
  kind: "home" | "clinic";
  label: string;
  position: LatLng;
}

export function mapPoints(center: LatLng, clinics: readonly Clinic[]): MapPoint[] {
  return [
    { kind: "home", label: CLINICS_TEXT.homeMarker, position: center },
    ...clinics.map((c): MapPoint => ({ kind: "clinic", label: c.name, position: c.coordinate })),
  ];
}
