// 프로필 탭의 표시 규칙 — iOS ProfileView.swift. 화면(ProfileScreen)은 여기서 고른 것만 그린다.
// 설정(features/settings)도 분만 방식·목표 표시명과 "미설정"을 여기서 가져다 쓴다.

import { parseLocalDate, postpartumDayCount, weekFromDayCount } from "@/domain/date";
import type { DeliveryMethod, LocalDateString, MaternityRecord, RecoveryGoal, UserProfile } from "@/domain/types";
import { DELIVERY_TITLE } from "@/rules/exercise";
import { bmi, formatOneDecimal } from "@/rules/weight";
import { ROUTES } from "@/routes";

export const PROFILE_TEXT = {
  title: "프로필", // 원문: ProfileView.swift:48
  infoTitle: "내 정보", // 원문: ProfileView.swift:75
  deliveryMethod: "분만 방식", // 원문: ProfileView.swift:76
  goal: "목표", // 원문: ProfileView.swift:78
  neighborhood: "내 동네", // 원문: ProfileView.swift:81
  bmi: "BMI", // 원문: ProfileView.swift:85
  maternityFlags: "재활 고려사항", // 원문: ProfileView.swift:90
  unset: "미설정", // 원문: ProfileView.swift:76
} as const;

/**
 * 목표 표시명 — Models.swift:37-41.
 * 같은 표가 rules/chat.ts(GOAL_TITLE, 비공개)에도 있다. 규칙 모듈은 읽기 전용이라 여기 따로 두었다(DEV_NOTES §5 정리 후보).
 */
export const GOAL_TITLE: Readonly<Record<RecoveryGoal, string>> = {
  homemaker: "전업", // 원문: Models.swift:39
  returningToWork: "복직 예정", // 원문: Models.swift:40
};

export function deliveryMethodLabel(method: DeliveryMethod | null): string {
  return method ? DELIVERY_TITLE[method] : PROFILE_TEXT.unset;
}

export function goalLabel(goal: RecoveryGoal | null): string {
  return goal ? GOAL_TITLE[goal] : PROFILE_TEXT.unset;
}

/**
 * 머리의 "산후 n일차 · n주차"(ProfileView.swift:63). 출산일은 로컬 달력 날짜 차이로 센다(DEV_NOTES §2).
 * iOS는 출산일이 늘 있었다. 웹은 출산일이 없으면(온보딩 전·못 읽는 값) 0일차를 지어내지 않고 줄을 뺀다.
 */
export function postpartumLine(deliveryDate: LocalDateString | null, now: Date): string | null {
  if (!parseLocalDate(deliveryDate)) return null;
  const day = postpartumDayCount(deliveryDate, now);
  return `산후 ${day}일차 · ${weekFromDayCount(day)}주차`; // 원문: ProfileView.swift:63
}

/** 내 동네 — 비어 있으면 행을 뺀다(ProfileView.swift:79). 웹은 공백만 있는 값도 빈 값으로 본다. */
export function neighborhoodValue(neighborhood: string): string | null {
  const v = neighborhood.trim();
  return v.length > 0 ? v : null;
}

export interface InfoRow {
  key: "deliveryMethod" | "goal" | "neighborhood" | "bmi";
  label: string;
  value: string;
}

/** "내 정보" 카드의 행 — 분만 방식 · 목표(없으면 "미설정") · 내 동네(있을 때) · BMI(키·현재 체중이 있을 때). ProfileView.swift:72-87 */
export function profileInfoRows(profile: UserProfile): InfoRow[] {
  const rows: InfoRow[] = [
    { key: "deliveryMethod", label: PROFILE_TEXT.deliveryMethod, value: deliveryMethodLabel(profile.deliveryMethod) },
    { key: "goal", label: PROFILE_TEXT.goal, value: goalLabel(profile.goal) },
  ];
  const neighborhood = neighborhoodValue(profile.neighborhood);
  if (neighborhood) rows.push({ key: "neighborhood", label: PROFILE_TEXT.neighborhood, value: neighborhood });
  const b = bmi(profile);
  // iOS String(format: "%.1f") — 정확한 절반은 짝수 쪽(rules/weight formatOneDecimal)
  if (b != null) rows.push({ key: "bmi", label: PROFILE_TEXT.bmi, value: formatOneDecimal(b) });
  return rows;
}

/**
 * 재활 고려사항 칩 — 산모수첩·EMR에서 확인된 항목, Swift 순서 그대로(ProfileView.swift:106-118).
 * "다분만부"는 초산이 꺼져 있을 때만(초산 기본값 true — 입력한 적 없는 칩이 뜨지 않는다).
 * 빈 배열이면 화면에서 칩 행 전체를 그리지 않는다.
 */
export function maternityFlags(m: MaternityRecord): string[] {
  const f: string[] = [];
  if (!m.isPrimiparous) f.push("다분만부"); // 원문: ProfileView.swift:109
  if (m.gdm) f.push("임신성 당뇨"); // 원문: ProfileView.swift:110
  if (m.preeclampsia) f.push("임신중독증·고혈압"); // 원문: ProfileView.swift:111
  if (m.heavyBleeding) f.push("분만 출혈 많음"); // 원문: ProfileView.swift:112
  if (m.anemia) f.push("산후 빈혈"); // 원문: ProfileView.swift:113
  if (m.pelvicPain) f.push("골반통"); // 원문: ProfileView.swift:114
  if (m.diastasisRecti) f.push("복직근 이개"); // 원문: ProfileView.swift:115
  return f;
}

export type ProfileMenuKey = "support" | "lifestyle" | "substance" | "chat" | "region" | "guide" | "settings";

export interface ProfileMenuItem {
  key: ProfileMenuKey;
  title: string;
  subtitle: string;
  /** trailingSlash: true — 항상 "/"로 끝나는 경로 */
  href: string;
}

/** 기능 허브 7개 — 순서 고정(ProfileView.swift:18-26). */
export const PROFILE_MENU: readonly ProfileMenuItem[] = [
  { key: "support", title: "지원사업 추천", subtitle: "내 상황에 맞는 산모 지원사업", href: ROUTES.support }, // 원문: ProfileView.swift:19
  { key: "lifestyle", title: "생활 권고", subtitle: "수면·영양·정신건강", href: ROUTES.lifestyle }, // 원문: ProfileView.swift:20
  { key: "substance", title: "약물·음식 체크", subtitle: "수유 중 안전 분류", href: ROUTES.substance }, // 원문: ProfileView.swift:21
  { key: "chat", title: "AI 상담", subtitle: "산후 회복 질문하기", href: ROUTES.chat }, // 원문: ProfileView.swift:22
  { key: "region", title: "지역 연계", subtitle: "내 동네 가까운 산부인과 찾기", href: ROUTES.region }, // 원문: ProfileView.swift:23
  { key: "guide", title: "회복 가이드", subtitle: "검증된 가이드라인", href: ROUTES.guide }, // 원문: ProfileView.swift:24
  { key: "settings", title: "설정", subtitle: "계정·알림·개인정보", href: ROUTES.settings }, // 원문: ProfileView.swift:25
];
