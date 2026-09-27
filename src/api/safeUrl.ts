// 서버·외부 응답에 들어 있는 URL(영상 url, 카카오 place_url)은 신뢰하지 않는다(검수 #51).
// https + 허용 호스트일 때만 링크로 만들고, 그 밖의 값(javascript:, http:, 낯선 도메인)은 버린다.

const ALLOWED_HOSTS: ReadonlySet<string> = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "place.map.kakao.com",
]);

/** 외부 링크는 새 탭으로 열고, 열린 쪽이 window.opener·Referer로 이 페이지를 보지 못하게 한다. */
export const EXTERNAL_LINK_REL = "noopener noreferrer";
export const EXTERNAL_LINK_PROPS = { target: "_blank", rel: EXTERNAL_LINK_REL } as const;

/** 허용된 https 외부 링크면 정규화한 URL, 아니면 null. */
export function safeExternalUrl(url: unknown): string | null {
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
  if (!ALLOWED_HOSTS.has(u.hostname)) return null;
  return u.href;
}
