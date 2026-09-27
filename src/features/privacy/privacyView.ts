import { ROUTES } from "@/routes";

// 개인정보처리방침(/privacy/) 보기 규칙 — 화면(PrivacyPolicyHeader)은 이 값을 그대로 쓴다.

export interface PrivacyBackInput {
  /** 저장소를 읽었는가 — 읽기 전(정적 HTML·첫 렌더)에는 로그인 여부를 모른다 */
  hydrated: boolean;
  isSignedIn: boolean;
  hasOnboarded: boolean;
}

/**
 * /privacy/로 링크하는 화면 — 서비스 소개(바닥글)와 설정(MoreView.swift:76).
 * [뒤로]를 누를 때 바로 앞 기록이 이 중 하나면 그 화면으로 돌아간다(history back — 로그인한 사람이
 * 서비스 소개에서 열었으면 서비스 소개로). 로그인·온보딩 화면은 이 주소 대신 시트(PrivacyPolicyDialog)로 연다.
 */
export const PRIVACY_BACK_FROM: readonly string[] = [ROUTES.landing, ROUTES.settings];

/**
 * 앞 기록이 PRIVACY_BACK_FROM이 아닐 때(주소로 바로 들어옴 등) [뒤로] 갈 곳 — 뒤로 링크의 주소이기도 하다.
 * 앱을 쓰는 사람(로그인 + 온보딩 완료)은 이 화면을 여는 설정(MoreView.swift:76)으로,
 * 그 밖(주소로 바로 온 로그인 전 방문자 등)은 서비스 소개로 — 설정으로 보내면 관문이 로그인 화면으로 돌린다.
 * 저장소를 읽기 전에는 공개 주소인 서비스 소개를 둔다(읽으면 바로 바뀐다).
 */
export function privacyBackHref({ hydrated, isSignedIn, hasOnboarded }: PrivacyBackInput): string {
  return hydrated && isSignedIn && hasOnboarded ? ROUTES.settings : ROUTES.landing;
}
