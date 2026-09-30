"use client";

import { config } from "@/config";
import { cspMetaContent } from "@/csp";

// CSP 메타(src/csp.ts) — 빌드 때 만드는 정적 HTML에만 싣고, 브라우저에서는 그리지 않는다(null). 운영 빌드에서만(개발 서버는 eval·HMR 필요).
//
// 까닭: 빌드 뒤 단계(scripts/csp-hash.mjs)가 HTML의 메타 content를 해시가 들어간 정책으로 바꾼다. React 19는 <meta>를 hoistable로
// 다뤄 하이드레이션 때 content가 같은 메타를 <head>에서 찾고, 없으면 새 메타를 붙인다 — 서버 컴포넌트가 그린 메타라면 RSC 페이로드에
// 해시 전(자리표시자) 정책이 실려 두 번째 CSP가 생기고, 그것이 인라인 스크립트를 모두 막는다(e2e에서 확인: CSP 메타 2개 + 콘솔 오류).
// 페이로드 스크립트의 해시가 정책에 들어가므로 페이로드 쪽 값을 맞출 수도 없다.
// 브라우저에서 null이면 React가 이 메타를 찾지도 새로 만들지도 않는다. hoistable은 제자리 하이드레이션 대상이 아니라 서버와 결과가
// 달라도 불일치 오류가 없고, CSP 메타는 문서에 들어갈 때 한 번 적용되므로 React가 몰라도 정책은 그대로다.
// 정책은 여기서(서버 렌더 때만) 만든다 — props로 받으면 해시 전 정책 글자가 페이로드에 실린다.
export function CspMeta() {
  if (typeof window !== "undefined") return null;
  const policy = cspMetaContent({
    supabaseUrl: config.supabaseUrl,
    kakaoJsKey: config.kakaoJsKey,
    turnstileSiteKey: config.turnstileSiteKey,
    legacyBackends: [config.videoURL, config.llmURL, config.accountURL],
  });
  return policy === null ? null : <meta httpEquiv="Content-Security-Policy" content={policy} />;
}
