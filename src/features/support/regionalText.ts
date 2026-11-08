// 우리 지역 지원사업(지원사업 화면 아래 카드) 문구 — iOS에 없는 웹 기능이라 원문이 없다.
// 사업 이름·기관·요약은 정부24 공공서비스 정보의 글자를 그대로 싣는다(이 파일에 없다). 여기 문구는 안내만 — 의료 효과를 말하지 않는다.

// 웹 신규 문구 — CPO 확인 필요
export const REGIONAL_TEXT = {
  title: "우리 지역 지원사업",
  intro: "사는 지역을 고르면 정부24에 등록된 임신·출산 지원사업을 전국 사업과 함께 보여 드려요.",
  /** 고른 지역은 화면 상태에만 있다(저장·전송 없음 — RegionalProgramsSection 머리말) */
  privacy: "고른 지역은 이 화면에서만 쓰고, 저장하거나 보내지 않아요.",
  open: "지역 고르기",
  loading: "목록을 불러오고 있어요.",
  error: "목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
  retry: "다시 시도",
  sidoLabel: "시·도",
  sidoPlaceholder: "시·도를 골라 주세요",
  sigunguLabel: "시·군·구",
  sigunguNone: "고르지 않음(시·도 사업만)",
  /** 세종처럼 시·군·구 사업이 없는 시·도 */
  sigunguEmpty: "이 시·도에는 시·군·구별 사업이 없어요",
  pickSido: "시·도를 고르면 그 지역 사업이 여기에 보여요.",
  pickSigungu: "시·군·구를 고르면 그 지역 사업도 함께 보여요.",
  nationalTitle: "전국 공통 사업",
  /** 고른 지역에 실린 사업이 없을 때 */
  noLocal: "이 지역에 실린 사업이 없어요. 정부24에서 한 번 더 확인해 보세요.",
  regionTitle: (place: string) => `${place} 사업`,
  count: (n: number) => `${n}개`,
  showMore: (n: number) => `${n}개 더 보기`,
  detail: "자세히 보기(정부24)",
  /** 새 탭으로 열리는 링크임을 스크린리더에 알리는 숨은 글자(화면에는 안 보임) — 지원사업 화면의 NEW_TAB_HINT와 같다 */
  newTab: " (새 창)",
  missingSigungu: "찾는 시·군·구가 목록에 없으면",
  missingSigunguLink: "정부24 지역별 출산 지원 서비스",
  missingSigunguTail: "에서 찾아보세요.",
  asOf: (date: string) => `정부24 공공서비스 정보 ${date} 기준이에요.`,
  authoritative: "대상·금액·신청 방법은 바뀔 수 있어요. 신청하기 전에 정부24 공식 안내를 꼭 확인해 주세요.",
  source: "출처: 행정안전부 대한민국 공공서비스(혜택) 정보(공공데이터포털)",
} as const;

/** 정부24 "지역별 출산 지원 서비스 조회" — 목록에 없는 시·군·구를 찾을 곳(공식 페이지, 2026-11-08 확인) */
export const GOV24_LOCAL_BIRTH_URL = "https://www.gov.kr/portal/onestopSvc/happyBirthLocalBirth";
