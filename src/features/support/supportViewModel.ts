// 지원사업 추천 화면의 보기 모델 — iOS SupportProgramView.swift.
// 추천 규칙(체크 → 영역)은 rules/support가 정한다. 여기서는 "무엇을 어떤 조건에서 보일지"와 링크 검사만 한다.
import { safeExternalUrl, SUPPORT_LINK_HOSTS } from "@/api/safeUrl";
import { telHref } from "@/domain/phone";
import { phoneCallLabel } from "@/features/guide/guideContent";
import { checkedSupportDomains, type SupportDomain, type SupportPhone } from "@/rules/support";

export type SupportLink = { kind: "web"; href: string } | { kind: "tel"; href: string };

/** tel:은 숫자(국제번호 + 허용)만 — 그 밖의 글자가 섞이면 링크로 만들지 않는다. */
const TEL_PATTERN = /^tel:\+?\d{3,15}$/;

/** 전화 문의 번호의 표기 — 숫자 2~4자리 뒤에 하이픈 묶음 0~2개(129 · 1350 · 1577-2514 · 02-6454-8500). */
const PHONE_NUMBER_PATTERN = /^\d{2,4}(?:-\d{3,4}){0,2}$/;

export interface SupportPhoneLink {
  href: string;
  /** 화면에 보이는 글자 — 누구의 번호인지 */
  label: string;
  /** 화면에 보이는 번호(표기 그대로) */
  number: string;
  /** 접근성 이름 — 보이는 글자로 시작한다(PhoneLinks의 "{번호} 전화 걸기" 앞에 이름) */
  ariaLabel: string;
}

/**
 * 해결책의 전화 문의(content.json phone)를 화면에 걸어도 되는지 검사한다.
 * 이름이 비었거나 번호 표기가 PHONE_NUMBER_PATTERN 밖이면 null(그리지 않음) — 지어낸 글자가 눌리는 링크가 되지 않게.
 */
export function supportPhone(phone: SupportPhone | null | undefined): SupportPhoneLink | null {
  if (phone === null || typeof phone !== "object") return null;
  if (typeof phone.label !== "string" || typeof phone.number !== "string") return null;
  const label = phone.label.trim();
  const number = phone.number.trim();
  if (label === "" || !PHONE_NUMBER_PATTERN.test(number)) return null;
  const href = telHref(number);
  if (href === null || !TEL_PATTERN.test(href)) return null;
  // 웹 신규 문구 — CPO 확인 필요 (전화 링크의 접근성 이름 "{이름} {번호} 전화 걸기")
  return { href, label, number, ariaLabel: `${label} ${phoneCallLabel(number)}` };
}

/**
 * 해결책 링크를 화면에 걸어도 되는지 검사한다.
 * - https + (공용 허용 목록 또는 SUPPORT_LINK_HOSTS — 둘 다 api/safeUrl.ts) → 새 탭 외부 링크
 * - tel:숫자 → 전화 링크(같은 탭)
 * - 그 밖(null·빈 값·http·낯선 호스트·계정/포트 포함·javascript: 등) → null(글자로만 표시)
 */
export function supportLink(url: string | null | undefined): SupportLink | null {
  if (typeof url !== "string") return null;
  const raw = url.trim();
  if (raw === "") return null;

  if (/^tel:/i.test(raw)) {
    const tel = `tel:${raw.slice(4)}`;
    return TEL_PATTERN.test(tel) ? { kind: "tel", href: tel } : null;
  }

  const href = safeExternalUrl(raw, SUPPORT_LINK_HOSTS);
  return href === null ? null : { kind: "web", href };
}

export interface SupportResultsView {
  /** [추천 받기]를 누른 뒤인지 — 누르기 전에는 결과 자리를 그리지 않는다 */
  visible: boolean;
  /** 추천을 받은 뒤 체크를 모두 풀었을 때만 true(SupportProgramView.swift:132-136) */
  showNothingChecked: boolean;
  /** 체크한 문항이 속한 영역(표 순서) */
  domains: SupportDomain[];
}

/**
 * 추천 결과 자리 — iOS처럼 한 번 누른 뒤에는 체크를 바꿀 때마다 바로 따라 바뀐다
 * (`recommended`는 되돌리지 않고, 영역 목록은 체크에서 계산 — SupportProgramView.swift:103-105·131-139).
 */
export function supportResultsView(checked: ReadonlySet<number>, recommended: boolean): SupportResultsView {
  if (!recommended) return { visible: false, showNothingChecked: false, domains: [] };
  const domains = checkedSupportDomains(checked);
  return { visible: true, showNothingChecked: domains.length === 0, domains };
}

/** 추천 결과 카드 제목의 id — [추천 받기] 뒤 첫 결과로 초점을 옮길 때 쓴다. */
export function supportResultHeadingId(domainId: number): string {
  return `support-result-${domainId}`;
}
