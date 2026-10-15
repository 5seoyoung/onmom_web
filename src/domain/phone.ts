// 전화번호 표기·전화 링크 — 홈 마음 건강 카드, 회복 가이드 등 문장 속 번호(features/guide/PhoneLinks), 가까운 산부인과 목록이 함께 쓴다.
// 순수 함수만(가져오는 것 없음) — 서버 컴포넌트에서도, 카카오 SDK 없이도 쓸 수 있다.

/** 국제 형식(+82 2-933-8828)을 국내 표기(02-933-8828)로. 비었으면 null. (NearbyClinics.swift:19-24) */
export function toDomesticPhone(phone: string | null | undefined): string | null {
  if (!phone || phone.trim() === "") return null;
  const compact = phone.replace(/ /g, "");
  if (!compact.startsWith("+82")) return phone;
  return "0" + compact.slice(3);
}

/**
 * 눌러서 걸 수 있는 tel: 링크 — 숫자만 남긴다(HomeView.swift:308 `number.filter(\.isNumber)`, NearbyClinics.swift:27-30).
 * 숫자가 하나도 없으면 null — 화면은 링크를 그리지 않는다("tel:"만 있는 링크를 만들지 않는다).
 */
export function telHref(phone: string | null | undefined): string | null {
  const digits = toDomesticPhone(phone)?.replace(/\D/g, "") ?? "";
  return digits === "" ? null : `tel:${digits}`;
}
