// Content-Security-Policy — GitHub Pages는 응답 헤더를 붙일 수 없어 루트 레이아웃의 <meta http-equiv>로 싣는다(src/app/layout.tsx).
// 설정된 기능의 출처만 넣는다(빈 값이면 그 출처도 없다). 허용 목록을 바꾸면 docs/SECURITY.md §CSP도 고친다.
//
// 메타 태그의 한계(헤더와 다른 점)
// - frame-ancestors·report-uri·sandbox는 메타에서 무시된다 — 클릭재킹 막기는 GitHub Pages에서는 할 수 없다(커스텀 도메인 + 프록시 필요).
// - 메타보다 앞에 나온 요소에는 적용되지 않는다. React는 메타를 Next의 CSS·스크립트 청크 뒤에 두지만, 빌드 뒤 단계
//   (scripts/csp-hash.mjs)가 메타를 <meta charset> 바로 뒤로 옮겨 문서 전체에 적용된다.
// - 카카오 지도 SDK(kakao.js)는 옛 IE 확인용 try { eval("document.namespaces") } catch {}를 한 번 부른다 — CSP가 막아
//   securitypolicyviolation(eval) 이벤트가 하나 생기지만 지도·검색은 그대로 동작한다(localhost:3000 실제 키로 확인). 'unsafe-eval'을 열 까닭이 아니다.
//
// 인라인 스크립트는 해시로만 허용한다('unsafe-inline' 없음). Next 정적 내보내기(output: "export")는 페이지마다 RSC 페이로드를 인라인
// <script>(self.__next_f.push(…))로 넣고, 내용이 페이지·빌드마다 다르다. nonce는 요청마다 만드는 서버가 없어 쓸 수 없으므로
// - 여기서는 script-src에 자리표시자 SCRIPT_HASHES_PLACEHOLDER를 넣고,
// - `next build`가 out/을 다 쓴 뒤 scripts/csp-hash.mjs(next.config.ts의 adapterPath, 로직 src/cspHash.mts)가 페이지마다 실행되는
//   인라인 스크립트의 sha256을 계산해 그 자리를 바꾼다. npm run build·npm run e2e·직접 `npx next build` 모두 같다.
// 자리표시자는 브라우저가 모르는 값이라 무시된다 — 그 단계가 빠진 HTML은 인라인 스크립트가 모두 막혀 화면이 멈춘다(약한 정책으로
// 조용히 나가지 않게 일부러 그렇게 둔다). npm run build는 마지막에 `node scripts/csp-hash.mjs --check`로 한 번 더 확인한다.
// 메타는 브라우저에서 다시 그리지 않는다(src/components/CspMeta.tsx — 까닭은 그 파일).
// 런타임에 인라인 스크립트를 새로 만드는 코드(<script>에 글자를 넣기, next/script의 인라인·beforeInteractive, on… 속성 문자열,
// javascript: 주소)는 해시가 없어 막힌다 — 스크립트는 src로만 불러온다(카카오·Turnstile 로더처럼).
// 'unsafe-eval'은 넣지 않는다(운영 빌드·카카오 지도 SDK·Turnstile 모두 필요 없음 — 브라우저에서 확인). 개발 서버(next dev)는
// eval·HMR 웹소켓이 필요해 운영 빌드에서만 싣는다(cspMetaContent).
// 사용자가 쓴 글은 React가 늘 글자로만 그린다(dangerouslySetInnerHTML 없음 — docs/SECURITY.md).

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

/**
 * script-src의 인라인 스크립트 해시 자리 — 빌드 뒤 scripts/csp-hash.mjs가 그 페이지의 'sha256-…' 목록으로 바꾼다.
 * src/cspHash.mts에 같은 값이 있다(테스트가 같은지 확인). CSP 키워드가 아니라 브라우저는 무시한다.
 */
export const SCRIPT_HASHES_PLACEHOLDER = "'onmom-script-hashes'";

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
    [
      "script-src",
      uniq(["'self'", SCRIPT_HASHES_PLACEHOLDER, ...(kakao ? KAKAO_SCRIPT_ORIGINS : []), turnstile ? TURNSTILE_ORIGIN : null]),
    ],
    // 스타일은 인라인 허용 그대로 — Next·React의 style 속성과 카카오 지도 SDK가 인라인 스타일을 쓴다
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
