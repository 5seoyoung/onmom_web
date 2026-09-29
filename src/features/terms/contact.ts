// 문의처 — 개인정보처리방침 원문(PrivacyPolicyView.swift:64 → features/privacy/policyText.ts "7. 문의처")의 이메일을 그대로 쓴다.
// 주소를 여기 따로 적지 않는다: 방침의 문의처가 바뀌면 설정·서비스 소개·이용약관의 문의 링크가 함께 바뀌어야 하므로,
// 방침 본문에서 이메일을 읽어 온다(contact.test.ts가 방침 원문·웹 초안 15절과 같은 주소인지 확인한다).
// 방침에서 이메일을 찾지 못하면 null — 화면은 문의 링크를 그리지 않는다(지어낸 주소를 보이지 않는다).

import { PRIVACY_POLICY_SECTIONS, type PolicySection } from "@/features/privacy/policyText";

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

/** 방침 절 중 "문의처" 절의 첫 이메일 주소. 없으면 null. */
export function extractContactEmail(sections: readonly PolicySection[]): string | null {
  const section = sections.find((s) => s.title.includes("문의"));
  const m = section === undefined ? null : EMAIL_RE.exec(section.body);
  return m === null ? null : m[0];
}

/** 이 빌드의 문의 이메일 — iOS 방침 원문의 문의처(웹 초안 15절도 같은 주소) */
export const CONTACT_EMAIL: string | null = extractContactEmail(PRIVACY_POLICY_SECTIONS);

export const CONTACT_TEXT = {
  // 웹 신규 문구 — CPO 확인 필요 (설정 개인정보·안전 카드·서비스 소개 바닥글의 문의 링크 이름)
  label: "문의",
  // 웹 신규 문구 — CPO 확인 필요 (mailto 링크의 메일 제목)
  subject: "온맘 문의",
} as const;

/** mailto: 링크 — 제목만 미리 채운다(본문은 비움 — 건강 정보를 메일에 넣도록 유도하지 않는다). */
export function mailtoHref(email: string, subject: string = CONTACT_TEXT.subject): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}`;
}
