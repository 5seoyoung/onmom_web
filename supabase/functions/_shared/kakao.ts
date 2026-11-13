// Edge Function 공용 — 카카오 연결 끊기(unlink)와 연결 해제 웹훅. Deno 전역·npm: 가져오기 없이(cors.ts 머리말 — vitest·Next tsc도 읽는다).
//
// 왜(법률 자체 검토 2026-11 L13·F4): 카카오 개발자 문서가 서비스 탈퇴 때 연결 해제를 요청하라고 안내한다. 법 의무는 아니어서
//   대표 결정(Q5) 전에는 꺼 둔다 — 함수 비밀값 KAKAO_ADMIN_KEY(카카오 앱의 어드민 키)가 없으면 아무것도 하지 않는다.
//
// 카카오 공식 문서(2026-11-13 확인)
// - 연결 끊기 API: https://developers.kakao.com/docs/ko/kakaologin/rest-api (연결 끊기)
//     POST https://kapi.kakao.com/v1/user/unlink · Authorization: KakaoAK ${SERVICE_APP_ADMIN_KEY}
//     Content-Type: application/x-www-form-urlencoded;charset=utf-8 · 본문 target_id_type=user_id&target_id=<회원번호>
//     응답 { "id": <끊은 회원번호> }
// - 연결 해제 웹훅: https://developers.kakao.com/docs/ko/kakaologin/callback (연결 해제 웹훅)
//     사용자가 서비스 밖(카카오계정 설정·카카오톡 연결 서비스 관리·계정 탈퇴·고객센터 등)에서 연결을 끊으면 카카오가 등록한 주소로
//     GET(쿼리) 또는 POST(URL 인코딩 본문)를 보낸다. 파라미터 app_id·user_id·referrer_type(필수), group_user_token(그룹앱만).
//     헤더 Authorization: KakaoAK ${PRIMARY_ADMIN_KEY}. 받은 뒤 3초 안에 200 OK — 사용자 정보가 없거나 오류가 나도 200.
//     서비스가 연결 끊기 API를 직접 부른 경우에는 보내지 않는다(그래서 삭제 흐름이 끊기를 불러도 웹훅이 되돌아오지 않는다).
//     등록 위치: 카카오 개발자 콘솔 [앱] > [웹훅] > [연결 해제 웹훅].
// 한 앱이면 두 문서의 어드민 키는 같은 값이다 — 비밀값 하나(KAKAO_ADMIN_KEY)를 둘 다에 쓴다.

export const KAKAO_UNLINK_URL = "https://kapi.kakao.com/v1/user/unlink";
/** 카카오 연결 끊기 요청의 시간 제한 — 삭제 흐름을 오래 붙잡지 않는다 */
export const KAKAO_UNLINK_TIMEOUT_MS = 3_000;

/** 카카오 회원번호 — 숫자(Long)만. 그 밖은 쓰지 않는다(SQL·요청 본문에 넣기 전에 거른다) */
const KAKAO_ID = /^[0-9]{1,20}$/;

export function isKakaoUserId(value: unknown): value is string {
  return typeof value === "string" && KAKAO_ID.test(value);
}

/** 비밀값 정리 — 비었으면 null(= 기능 꺼짐) */
export function kakaoAdminKeyFrom(raw: string | null | undefined): string | null {
  const v = raw?.trim() ?? "";
  return v === "" ? null : v;
}

/** 같은 길이를 끝까지 비교한다(먼저 다른 글자에서 멈추지 않는다) — 웹훅 헤더 확인용 */
export function constantTimeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  const n = Math.max(ea.length, eb.length);
  for (let i = 0; i < n; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

/** 웹훅의 Authorization이 "KakaoAK <어드민 키>"와 같은가. 키가 없으면 늘 거짓(웹훅 꺼짐). */
export function kakaoWebhookAuthorized(header: string | null, adminKey: string | null): boolean {
  if (adminKey === null || header === null) return false;
  return constantTimeEqual(header.trim(), `KakaoAK ${adminKey}`);
}

export const KAKAO_REFERRER_TYPES: readonly string[] = [
  "ACCOUNT_DELETE",
  "FORCED_ACCOUNT_DELETE",
  "UNLINK_FROM_ADMIN",
  "UNLINK_FROM_APPS",
  "INCOMPLETE_SIGN_UP",
];

export interface KakaoUnlinkNotice {
  appId: string;
  userId: string;
  referrerType: string;
}

/** 웹훅 파라미터(GET 쿼리 또는 POST 본문) — 필수 셋이 없거나 회원번호가 숫자가 아니면 null */
export function parseKakaoUnlinkNotice(params: URLSearchParams): KakaoUnlinkNotice | null {
  const appId = params.get("app_id")?.trim() ?? "";
  const userId = params.get("user_id")?.trim() ?? "";
  const referrerType = params.get("referrer_type")?.trim() ?? "";
  if (appId === "" || referrerType === "" || !isKakaoUserId(userId)) return null;
  return { appId, userId, referrerType };
}

/** Auth가 돌려준 사용자 객체의 로그인 수단 하나(supabase-js UserIdentity 중 여기서 보는 것만) */
export interface IdentityLike {
  provider?: string;
  /** GoTrue identity의 id — 공급자 쪽 사용자 번호(카카오 회원번호) */
  id?: string;
  provider_id?: string;
  identity_data?: Record<string, unknown> | null;
}

/** 사용자의 카카오 회원번호 — 카카오 identity가 없거나 번호를 읽지 못하면 null */
export function kakaoUserIdOf(identities: readonly IdentityLike[] | null | undefined): string | null {
  for (const i of identities ?? []) {
    if (i.provider !== "kakao") continue;
    const data = i.identity_data ?? {};
    for (const v of [i.provider_id, i.id, data.provider_id, data.sub]) {
      if (isKakaoUserId(v)) return v;
    }
  }
  return null;
}

/** 화면이 받는 결과 */
export type KakaoUnlinkOutcome = "unlinked" | "failed" | "skipped" | "not_kakao";
