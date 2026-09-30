// 서버·외부 응답에 들어 있는 URL(영상 url, 카카오 place_url)은 신뢰하지 않는다(검수 #51).
// https + 허용 호스트일 때만 링크로 만들고, 그 밖의 값(javascript:, http:, 낯선 도메인)은 버린다.
// 외부 링크 허용 호스트는 이 파일 한 곳에 둔다 — 서버 응답용(ALLOWED_HOSTS)과 지원사업 공식 페이지용(SUPPORT_LINK_HOSTS).

const ALLOWED_HOSTS: ReadonlySet<string> = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "place.map.kakao.com",
]);

/**
 * 지원사업 공식 페이지 호스트 — 지원사업 화면(features/support supportLink)만 safeExternalUrl에 더해 넘긴다.
 * 영상·카카오 장소처럼 서버 응답에서 온 주소에는 허용하지 않는다.
 * content.json의 링크는 공식 URL이 확인된 항목에만 있다(SupportProgramView.swift:7-9).
 * 검토한 호스트: www.gov.kr(정부24, 행복출산 원스톱 — support_universal.url).
 * 새 링크가 content.json에 생기면 호스트를 검토한 뒤 여기에 더한다. 목록에 없으면 링크 없이 글자로만 보인다.
 */
export const SUPPORT_LINK_HOSTS: ReadonlySet<string> = new Set(["www.gov.kr"]);

const NO_EXTRA_HOSTS: ReadonlySet<string> = new Set();

/** 외부 링크는 새 탭으로 열고, 열린 쪽이 window.opener·Referer로 이 페이지를 보지 못하게 한다. */
export const EXTERNAL_LINK_REL = "noopener noreferrer";
export const EXTERNAL_LINK_PROPS = { target: "_blank", rel: EXTERNAL_LINK_REL } as const;

/**
 * 허용된 https 외부 링크면 정규화한 URL, 아니면 null.
 * extraHosts: 이 호출에서만 더 허용할 호스트(지원사업 화면의 SUPPORT_LINK_HOSTS) — 검사 규칙은 같다.
 */
export function safeExternalUrl(url: unknown, extraHosts: ReadonlySet<string> = NO_EXTRA_HOSTS): string | null {
  if (typeof url !== "string" || url.trim() === "") return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  if (u.username !== "" || u.password !== "") return null;
  if (u.port !== "") return null;
  if (!ALLOWED_HOSTS.has(u.hostname) && !extraHosts.has(u.hostname)) return null;
  return u.href;
}
