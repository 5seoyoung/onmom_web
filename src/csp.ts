// Content-Security-Policy — GitHub Pages는 응답 헤더를 붙일 수 없어 루트 레이아웃의 <meta http-equiv>로 싣는다(src/app/layout.tsx).
// 설정된 기능의 출처만 넣는다(빈 값이면 그 출처도 없다). 허용 목록을 바꾸면 docs/SECURITY.md §CSP도 고친다.
//
// 메타 태그의 한계(헤더와 다른 점)
// - frame-ancestors·report-uri·sandbox는 메타에서 무시된다 — 클릭재킹 막기는 GitHub Pages에서는 할 수 없다(커스텀 도메인 + 프록시 필요).
// - 메타보다 앞에 나온 요소에는 적용되지 않는다. 레이아웃 <head>에 두지만 Next가 자기 CSS·스크립트 청크(<link>·<script src async>, 모두
//   'self')를 그 앞으로 올린다 — 그 청크들은 어차피 허용 대상이고, 인라인 RSC 스크립트·화면이 불러오는 제3자 자원은 모두 메타 뒤라 적용된다.
// - 카카오 지도 SDK(kakao.js)는 옛 IE 확인용 try { eval("document.namespaces") } catch {}를 한 번 부른다 — CSP가 막아
//   securitypolicyviolation(eval) 이벤트가 하나 생기지만 지도·검색은 그대로 동작한다(localhost:3000 실제 키로 확인). 'unsafe-eval'을 열 까닭이 아니다.
//
// script-src 'unsafe-inline'인 까닭: Next 정적 내보내기(output: "export")는 페이지마다 RSC 페이로드를 인라인 <script>
// (self.__next_f.push(…))로 넣는다. 내용이 페이지·빌드마다 달라 해시를 쓰려면 빌드 뒤 모든 HTML을 다시 써야 하고, nonce는 요청마다
// 새로 만드는 서버가 없어 쓸 수 없다. 대신 script-src를 'self'와 필요한 제3자 출처로 묶어 외부 스크립트 주입을 막고, 사용자가 쓴 글은
// React가 늘 글자로만 그린다(dangerouslySetInnerHTML 없음 — docs/SECURITY.md).
// 'unsafe-eval'은 넣지 않는다(운영 빌드·카카오 지도 SDK·Turnstile 모두 필요 없음 — 브라우저에서 확인). 개발 서버(next dev)는
// eval·HMR 웹소켓이 필요해 운영 빌드에서만 싣는다(cspMetaContent).

export interface CspInput {
  /** https://<ref>.supabase.co — Auth·REST·Edge Functions(https)와 Realtime(wss) */
  supabaseUrl: string | null;
  /** 카카오 지도 JavaScript 키 — 있으면 지도 SDK·타일·장소 검색 출처를 연다 */
  kakaoJsKey: string | null;
  /** Cloudflare Turnstile 사이트 키 — 있으면 스크립트·iframe 출처를 연다 */
  turnstileSiteKey: string | null;
  /** Supabase가 없을 때 직접 부르는 예전 백엔드(NEXT_PUBLIC_VIDEO_URL·LLM_URL·ACCOUNT_URL) — connect-src에만 */
  legacyBackends: readonly (string | null)[];
}

// 카카오 지도 JS SDK — sdk.js(dapi.kakao.com)가 본체(t1.daumcdn.net/mapjsapi/…/kakao.js)를 페이지와 같은 scheme으로 부르고,
// 장소 검색(services)은 dapi.kakao.com, 지도 타일·마커·로고는 *.daumcdn.net 여러 하위 도메인.
// scheme 없이 적는다 — CSP의 scheme 없는 호스트는 "페이지와 같은 scheme(또는 https로 올린 것)"만 허용하므로, 운영(https)에서는 https만,
// 내 컴퓨터 시험(http://localhost:3000 — 카카오 콘솔에 등록된 도메인)에서는 SDK가 http로 부르는 본체도 통과한다.
export const KAKAO_SCRIPT_ORIGINS = ["dapi.kakao.com", "t1.daumcdn.net"] as const;
export const KAKAO_CONNECT_ORIGINS = ["dapi.kakao.com"] as const;
export const KAKAO_IMG_ORIGINS = ["*.daumcdn.net"] as const;
export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

/** https 주소의 origin만(경로·쿼리 없이). 아니면 null — 잘못된 값이 정책을 깨뜨리거나 넓히지 않게. */
export function httpsOrigin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const local = u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
    if (u.protocol !== "https:" && !local) return null;
    return u.origin;
  } catch {
    return null;
  }
}

function uniq(xs: readonly (string | null)[]): string[] {
  return [...new Set(xs.filter((x): x is string => x !== null && x.length > 0))];
}

/** 지시어 → 출처 목록. 순서가 정책 문자열의 순서다. */
export function cspDirectives(input: CspInput): [string, string[]][] {
  const supabase = httpsOrigin(input.supabaseUrl);
  const supabaseWs = supabase?.startsWith("https://") ? supabase.replace(/^https:/, "wss:") : null;
  const kakao = input.kakaoJsKey !== null && input.kakaoJsKey.trim() !== "";
  const turnstile = input.turnstileSiteKey !== null && input.turnstileSiteKey.trim() !== "";

  const d: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", uniq(["'self'", "'unsafe-inline'", ...(kakao ? KAKAO_SCRIPT_ORIGINS : []), turnstile ? TURNSTILE_ORIGIN : null])],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", uniq(["'self'", "data:", "blob:", ...(kakao ? KAKAO_IMG_ORIGINS : [])])],
    ["font-src", ["'self'"]],
    [
      "connect-src",
      uniq(["'self'", supabase, supabaseWs, ...(kakao ? KAKAO_CONNECT_ORIGINS : []), ...input.legacyBackends.map(httpsOrigin)]),
    ],
    ["frame-src", turnstile ? [TURNSTILE_ORIGIN] : ["'none'"]],
    ["worker-src", ["'self'"]],
    ["manifest-src", ["'self'"]],
    ["media-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
  ];
  return d;
}

export function buildCsp(input: CspInput): string {
  return cspDirectives(input)
    .map(([k, v]) => `${k} ${v.join(" ")}`)
    .join("; ");
}

/** 운영 빌드에서만 정책 문자열, 개발 서버에서는 null(메타를 싣지 않는다). */
export function cspMetaContent(input: CspInput, nodeEnv: string | undefined = process.env.NODE_ENV): string | null {
  return nodeEnv === "production" ? buildCsp(input) : null;
}
