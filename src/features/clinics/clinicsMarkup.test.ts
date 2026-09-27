// 가까운 산부인과 마크업 검사 — 키 없음(현재 배포) 상태와 병원 한 줄의 링크·접근성(서버 렌더로 확인).
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ClinicRow } from "./ClinicRow";
import { clinicRowView, CLINICS_TEXT } from "./clinicsView";
import { NearbyClinics } from "./NearbyClinics";

const noop = () => {};

describe("NearbyClinics — 카카오 키 없음(D6)", () => {
  const html = renderToStaticMarkup(h(NearbyClinics, { address: "서울 동대문구 회기동", onAddressChange: noop }));

  it("동네 입력과 안내문은 그대로, 검색 버튼은 비활성 + 이름", () => {
    expect(html).toContain('value="서울 동대문구 회기동"');
    expect(html).toContain(`placeholder="${CLINICS_TEXT.addressPlaceholder}"`);
    expect(html).toContain(CLINICS_TEXT.intro);
    expect(html).toMatch(/<button type="submit" disabled="" aria-label="이 동네에서 산부인과 찾기"/);
  });

  it("준비 중 카드만 — 지도·목록·찾는 중 없음", () => {
    expect(html).toContain(CLINICS_TEXT.notConfigured);
    expect(html).not.toContain("<ul");
    expect(html).not.toContain(CLINICS_TEXT.loading);
  });

  it("검색 영역 이름 = '내 동네'", () => {
    const id = /<h2 [^>]*id="([^"]+)"[^>]*>내 동네<\/h2>/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`role="search" aria-labelledby="${id}"`);
  });
});

describe("ClinicRow", () => {
  const base = {
    id: "1",
    name: "고은산부인과의원",
    address: null,
    phone: "02-960-2164",
    distanceM: 132,
    placeUrl: "https://place.map.kakao.com/1",
    coordinate: { lat: 37.59, lng: 127.05 },
  };

  it("전화(tel:)·지도(새 탭, noopener noreferrer) 링크에 이름", () => {
    const html = renderToStaticMarkup(h(ClinicRow, { row: clinicRowView(base) }));
    expect(html).toContain('<a href="tel:029602164" aria-label="고은산부인과의원에 전화 걸기"');
    expect(html).toContain(
      '<a href="https://place.map.kakao.com/1" target="_blank" rel="noopener noreferrer" aria-label="고은산부인과의원 지도로 열기"',
    );
    expect(html).toContain("직선거리 132m");
    expect(html).toContain("02-960-2164");
  });

  it("번호·장소 링크가 없으면 버튼을 그리지 않는다", () => {
    const html = renderToStaticMarkup(h(ClinicRow, { row: clinicRowView({ ...base, phone: null, placeUrl: null }) }));
    expect(html).not.toContain("<a ");
    expect(html).toContain("직선거리 132m");
  });
});
