// 클릭재킹 막기(프레임 버스터) — 판단·동작만(화면은 FrameGuard.tsx). 테스트는 가짜 창을 넣는다.
//
// GitHub Pages는 응답 헤더(frame-ancestors·X-Frame-Options)를 붙일 수 없고, CSP 메타의 frame-ancestors는 브라우저가 무시한다(src/csp.ts).
// 그래서 다른 사이트가 온맘을 <iframe>에 넣으면 스크립트로 막는다: 앱을 숨기고(html[data-framed] — globals.css), 맨 위 창을 온맘
// 주소로 옮겨 본다. 옮기지 못하면(브라우저가 막음·sandbox) 숨긴 채로 둔다 — 눌릴 것이 보이지 않으니 겹쳐 누르게 할 수 없다.
// 인라인 스크립트는 쓰지 않는다(CSP 해시 — 스크립트는 번들로만).

/** <html>에 붙이는 표시 — globals.css가 이 표시가 있으면 문서 전체를 숨긴다. */
export const FRAMED_ATTRIBUTE = "data-framed";

/** window 중 여기서 쓰는 부분 */
export interface FrameWindowLike {
  readonly self: unknown;
  readonly top: { location: unknown } | null;
  readonly location: { readonly href: string };
}

/**
 * 다른 창 안(iframe)에 들어 있는가. top이 null(문서가 떨어져 나감)이면 아니라고 본다.
 * 읽다가 오류가 나면(이상한 환경) 들어 있다고 본다 — 숨기는 쪽이 안전하다.
 */
export function isFramed(win: FrameWindowLike): boolean {
  try {
    return win.top !== null && win.top !== win.self;
  } catch {
    return true;
  }
}

/** 맨 위 창을 이 문서 주소로 옮겨 본다(top.location = self.location). 막혀도 던지지 않는다. 시도했으면 true. */
export function breakOutOfFrame(win: FrameWindowLike): boolean {
  try {
    if (win.top === null) return false;
    win.top.location = win.location.href;
    return true;
  } catch {
    return false;
  }
}
