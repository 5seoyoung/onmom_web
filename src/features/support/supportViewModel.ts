// 지원사업 추천 화면의 보기 모델 — iOS SupportProgramView.swift.
// 추천 규칙(체크 → 영역)은 rules/support가 정한다. 여기서는 "무엇을 어떤 조건에서 보일지"와 링크 검사만 한다.
import { safeExternalUrl } from "@/api/safeUrl";
import { checkedSupportDomains, type SupportDomain } from "@/rules/support";

/**
 * 지원사업 공식 페이지 호스트 — 공용 `safeExternalUrl` 허용 목록(영상·카카오 장소)에 없는 것만 여기 둔다.
 * content.json의 링크는 공식 URL이 확인된 항목에만 있다(SupportProgramView.swift:7-9).
 * 검토한 호스트: www.gov.kr(정부24, 행복출산 원스톱 — support_universal.url).
 * 새 링크가 content.json에 생기면 호스트를 검토한 뒤 여기에 더한다. 목록에 없으면 링크 없이 글자로만 보인다.
 */
export const SUPPORT_LINK_HOSTS: ReadonlySet<string> = new Set(["www.gov.kr"]);

export type SupportLink = { kind: "web"; href: string } | { kind: "tel"; href: string };

/** tel:은 숫자(국제번호 + 허용)만 — 그 밖의 글자가 섞이면 링크로 만들지 않는다. */
const TEL_PATTERN = /^tel:\+?\d{3,15}$/;

/**
 * 해결책 링크를 화면에 걸어도 되는지 검사한다.
 * - https + (공용 허용 목록 또는 SUPPORT_LINK_HOSTS) → 새 탭 외부 링크
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

  const shared = safeExternalUrl(raw);
  if (shared) return { kind: "web", href: shared };

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username !== "" || u.password !== "" || u.port !== "") return null;
  if (!SUPPORT_LINK_HOSTS.has(u.hostname)) return null;
  return { kind: "web", href: u.href };
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
