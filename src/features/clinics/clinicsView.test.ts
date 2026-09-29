import { describe, expect, it } from "vitest";
import {
  CLINIC_MESSAGES,
  searchNearbyClinics,
  type Clinic,
  type ClinicSearchServices,
  type KakaoPlace,
} from "@/api/clinics";
import { OFFLINE_TEXT } from "@/features/home/useOnline";
import {
  CLINICS_TEXT,
  clinicRowView,
  clinicsErrorMessage,
  initialClinicsState,
  mapPoints,
  shouldAutoSearch,
  stateFromSearchResult,
} from "./clinicsView";

const clinic = (over: Partial<Clinic> = {}): Clinic => ({
  id: "1",
  name: "고은산부인과의원",
  address: null,
  phone: "02-960-2164",
  distanceM: 132.7,
  placeUrl: "https://place.map.kakao.com/1",
  coordinate: { lat: 37.59, lng: 127.05 },
  ...over,
});

describe("문구", () => {
  it("iOS 원문(NearbyClinicsView.swift)", () => {
    expect(CLINICS_TEXT.addressTitle).toBe("내 동네");
    expect(CLINICS_TEXT.addressPlaceholder).toBe("예: 서울 강남구 역삼동");
    expect(CLINICS_TEXT.searchLabel).toBe("이 동네에서 산부인과 찾기");
    expect(CLINICS_TEXT.intro).toBe(
      "입력한 동네를 기준으로 가까운 산부인과를 찾아 직선거리 순으로 보여줘요. 길찾기는 지도 아이콘을 눌러 지도 앱에서 확인하세요.",
    );
  });
});

describe("첫 상태 · 자동 검색", () => {
  it("카카오 키가 없으면 동네와 무관하게 '준비 중'(D6)", () => {
    expect(initialClinicsState(false, "")).toEqual({ status: "notConfigured" });
    expect(initialClinicsState(false, "서울 동대문구 회기동")).toEqual({ status: "notConfigured" });
  });

  it("저장된 동네가 있으면 처음부터 찾는 중, 없으면 대기", () => {
    expect(initialClinicsState(true, "서울 동대문구 회기동")).toEqual({ status: "loading" });
    expect(initialClinicsState(true, "")).toEqual({ status: "idle" });
  });

  it("iOS처럼 공백을 자르지 않고 본다(공백만 → 검색 → '동네를 입력해 주세요')", () => {
    expect(shouldAutoSearch("  ")).toBe(true);
    expect(shouldAutoSearch("")).toBe(false);
  });
});

describe("검색 결과 → 화면 상태", () => {
  it("성공 → 지도 가운데 + 목록", () => {
    const c = [clinic()];
    expect(stateFromSearchResult({ ok: true, center: { lat: 1, lng: 2 }, clinics: c })).toEqual({
      status: "results",
      center: { lat: 1, lng: 2 },
      clinics: c,
    });
  });

  it("실패는 원문 문구 카드(종류 포함), 키 없음은 준비 중", () => {
    expect(stateFromSearchResult({ ok: false, kind: "noResults", message: CLINIC_MESSAGES.noResults })).toEqual({
      status: "error",
      kind: "noResults",
      message: "주변에서 산부인과를 찾지 못했어요.",
    });
    expect(stateFromSearchResult({ ok: false, kind: "notConfigured", message: null })).toEqual({ status: "notConfigured" });
  });

  it("오프라인이면 검색 실패(failed)만 오프라인 안내로 — 주소 없음·못 찾음·결과 없음은 원문 그대로(05 §3)", () => {
    const failed = stateFromSearchResult({ ok: false, kind: "failed", message: CLINIC_MESSAGES.failed });
    if (failed.status !== "error") throw new Error("error");
    expect(clinicsErrorMessage(failed, false)).toBe(OFFLINE_TEXT);
    expect(clinicsErrorMessage(failed, true)).toBe("검색에 실패했어요. 잠시 후 다시 시도해 주세요.");
    for (const kind of ["emptyAddress", "notFound", "noResults"] as const) {
      const view = stateFromSearchResult({ ok: false, kind, message: CLINIC_MESSAGES[kind] });
      if (view.status !== "error") throw new Error("error");
      expect(clinicsErrorMessage(view, false)).toBe(CLINIC_MESSAGES[kind]);
    }
  });

  it("검색 흐름과 이어서: 빈 동네 · 못 찾음 · 결과", async () => {
    const place = (id: string, x: string, y: string): KakaoPlace => ({ id, place_name: `병원${id}`, x, y, phone: "02-000-000" + id });
    const services = (places: KakaoPlace[], found = true): ClinicSearchServices => ({
      geocode: async () => (found ? { type: "ok", center: { lat: 37.59, lng: 127.05 } } : { type: "notFound" }),
      searchNearby: async () => ({ type: "ok", places }),
    });
    const run = async (address: string, s: ClinicSearchServices) =>
      stateFromSearchResult(await searchNearbyClinics(address, { kakaoJsKey: "k", services: s }));

    expect(await run("   ", services([]))).toEqual({ status: "error", kind: "emptyAddress", message: "동네(주소)를 입력해 주세요." });
    expect(await run("강남역", services([], false))).toEqual({
      status: "error",
      kind: "notFound",
      message: "입력한 주소를 찾지 못했어요. 동/구 이름으로 다시 시도해 보세요.",
    });
    const state = await run("회기동", services([place("far", "127.06", "37.60"), place("near", "127.0501", "37.5901")]));
    expect(state.status).toBe("results");
    if (state.status === "results") expect(state.clinics.map((c) => c.id)).toEqual(["near", "far"]);
  });
});

describe("병원 한 줄", () => {
  it("거리 · 전화 · tel 링크 · 지도 링크 · 접근성 이름", () => {
    expect(clinicRowView(clinic())).toEqual({
      id: "1",
      name: "고은산부인과의원",
      distance: "직선거리 132m",
      phone: "02-960-2164",
      telHref: "tel:029602164",
      mapHref: "https://place.map.kakao.com/1",
      callLabel: "고은산부인과의원에 전화 걸기",
      mapLabel: "고은산부인과의원 지도로 열기",
    });
  });

  it("1km 이상은 소수 한 자리 km", () => {
    expect(clinicRowView(clinic({ distanceM: 1234 })).distance).toBe("직선거리 1.2km");
  });

  it("번호가 없으면 전화 줄·버튼을 빼고, 확인된 장소 링크가 없으면 지도 버튼을 뺀다", () => {
    const row = clinicRowView(clinic({ phone: null, placeUrl: null }));
    expect(row.phone).toBeNull();
    expect(row.telHref).toBeNull();
    expect(row.mapHref).toBeNull();
  });
});

describe("지도 점", () => {
  it("내 동네가 먼저, 병원은 목록 순서", () => {
    const pts = mapPoints({ lat: 1, lng: 2 }, [clinic({ id: "a", name: "A" }), clinic({ id: "b", name: "B" })]);
    expect(pts.map((p) => [p.kind, p.label])).toEqual([
      ["home", "내 동네"],
      ["clinic", "A"],
      ["clinic", "B"],
    ]);
    expect(pts[0].position).toEqual({ lat: 1, lng: 2 });
  });
});
