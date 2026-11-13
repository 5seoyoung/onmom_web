// 웹 처리방침의 지난 판 — 화면에 그대로 공개한다(처리방침 작성지침(2026.4) "이전 버전의 개인정보 처리방침을 함께 공개하고, 각 버전의
// 적용기간을 확인할 수 있도록", 법률 자체 검토 LEGAL_SELF_REVIEW_2026-11 W4·F6).
//
// 고정본(editions/*.json)은 그 판이 게시되던 때의 코드를 저장소 기록에서 꺼내 webPolicySections(그때 운영 빌드의 옵션 — Turnstile·매일 알림·
// 유튜브 모두 꺼짐)를 그대로 돌린 결과다(2026-11-13). 손으로 고치지 않는다 — 지난 판은 그때 보였던 글자 그대로여야 한다.
//   2026-10-24.json  main b17e47e(2026-11-06 15:04, 시행판을 합치기 직전)의 초안 — 2026-10-24 시범 공개부터 게시
//   2026-11-06.json  main 2066239(2026-11-12)의 시행판 — 2026-11-06 15:10 합침 뒤로 글자 변화 없음(주석만 바뀜)
// 새 판을 시행할 때: 지금 판을 같은 방법으로 고정본으로 만들어 여기에 더하고, webPolicyText.ts를 새 판으로 고친다.

import type { PolicySection } from "./policyText";
import draft20261024 from "./editions/2026-10-24.json";
import edition20261106 from "./editions/2026-11-06.json";

export interface FrozenPolicyEdition {
  /** 판 이름(시행일 또는 게시일) */
  id: string;
  /** 적용 기간 — 화면의 접기 제목 */
  period: string;
  draftLabel: string;
  effective: string;
  note: string;
  sections: readonly PolicySection[];
}

// 웹 신규 문구 — CPO 확인 필요 (2026-11-20 개정판: 이전 판의 적용 기간 표시)
/** 직전 판 — 새 판(webPolicyText.ts WEB_POLICY_EFFECTIVE_DATE) 시행 전까지는 이것이 시행 중인 판이다 */
export const EDITION_2026_11_06: FrozenPolicyEdition = {
  id: "2026-11-06",
  period: "2026년 11월 6일 ~ 2026년 11월 19일 적용",
  ...edition20261106,
};

/** 시범 시작 때 게시한 초안 */
export const EDITION_2026_10_24: FrozenPolicyEdition = {
  id: "2026-10-24",
  period: "2026년 10월 24일 ~ 2026년 11월 5일 게시(초안)",
  ...draft20261024,
};

// 웹 신규 문구 — CPO 확인 필요 (2026-11-20 개정판: 개정 안내·이전 판 — 처리방침 18절 "시행 7일 전에 이 화면에 알립니다", 작성지침의 이전 판 공개)
export const POLICY_EDITION_TEXT = {
  upcomingTitle: "개정 안내",
  upcomingLead: (date: string) => `${date}부터 이 방침이 아래와 같이 바뀌어요. 동의를 다시 받는 변경은 아니에요.`,
  upcomingFull: "바뀌는 방침 전체 보기",
  previousTitle: "이전 판",
  previousLead: "지난 판을 적용 기간과 함께 볼 수 있어요.",
} as const;
