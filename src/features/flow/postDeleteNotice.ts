// 계정을 지운 뒤 로그인 화면에 한 번 보일 안내 — 카카오 연결을 끊지 못했을 때(auth/session.ts deleteAccount의 kakaoUnlinkFailed).
// 계정을 지우면 앱 관문이 로그인 화면으로 옮기므로, 삭제한 화면(설정·온보딩)이 이 탭의 sessionStorage에 표시를 남기고 로그인 화면이 읽어 지운다.
// 표시는 "있다/없다"뿐이다(계정·카카오 정보는 남기지 않는다). sessionStorage가 막힌 환경이면 안내 없이 지나간다(삭제는 이미 끝났다).

export interface NoticeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** 브라우저 sessionStorage — 없거나 막힌 환경이면 null */
function browserSessionStorage(): NoticeStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export const KAKAO_UNLINK_FAILED_KEY = "onmom.web.notice.kakaoUnlinkFailed.v1";

export const POST_DELETE_NOTICE_TEXT = {
  // 웹 신규 문구 — CPO 확인 필요 (계정 삭제 뒤 카카오 연결 끊기 실패 — 법률 자체 검토 2026-11 F4. 처리방침 5절 안내와 같은 경로)
  kakaoUnlinkFailed: "계정을 삭제했어요. 카카오 연결은 끊지 못했어요. 카카오계정 설정 > 연결된 서비스 관리에서 끊어 주세요.",
} as const;

export function rememberKakaoUnlinkFailed(storage: NoticeStorage | null | undefined = browserSessionStorage()): void {
  try {
    storage?.setItem(KAKAO_UNLINK_FAILED_KEY, "1");
  } catch {
    // 막힌 환경 — 안내 없이 지나간다
  }
}

/** 남은 표시가 있으면 지우고 true(한 번만 보인다) */
export function takeKakaoUnlinkFailed(storage: NoticeStorage | null | undefined = browserSessionStorage()): boolean {
  try {
    if (storage?.getItem(KAKAO_UNLINK_FAILED_KEY) !== "1") return false;
    storage.removeItem(KAKAO_UNLINK_FAILED_KEY);
    return true;
  } catch {
    return false;
  }
}
