// Supabase 사용자 → 앱 계정. iOS와 같은 id("kakao-<카카오 회원번호>", LoginView.swift:114)를 써서
// 계정 귀속 규칙(store/state.ts bindToAccount)이 iOS와 같게 동작한다.
//
// 회원번호는 카카오 identity의 provider_id(= sub = identity.id)에서 읽는다(Supabase Auth kakao 공급자가 채움).
// 이름은 카카오 닉네임(동의항목 profile_nickname) — 없거나 비면 null이고, 화면은 "카카오 사용자"를 쓴다(account.ts displayName).
// 이메일은 쓰지 않는다.
//
// 게스트 = Supabase 익명 사용자(is_anonymous) → "guest-<Supabase 사용자 id>". 익명 사용자에 카카오를 연결(linkIdentity)하면
// 같은 사용자 id에 카카오 identity가 붙는다 → "kakao-<회원번호>".
// 카카오 identity가 있으면 is_anonymous와 무관하게 카카오 계정으로 본다 — Supabase Auth는 연결한 공급자의 이메일이 확인된 것일 때만
// is_anonymous를 false로 바꾼다(카카오 이메일 동의를 안 했거나 확인되지 않은 이메일이면 identity만 붙고 익명으로 남을 수 있다).

import { GUEST_ID_PREFIX, isGuestID, kakaoAccountID, makeGuestID, type Account } from "@/store/account";

/** 필요한 모양만 — supabase-js의 User와 호환 */
export interface AuthUserLike {
  id?: string;
  is_anonymous?: boolean;
  app_metadata?: { provider?: unknown; providers?: unknown } | null;
  user_metadata?: Record<string, unknown> | null;
  identities?: readonly { provider: string; id?: unknown; identity_data?: Record<string, unknown> | null }[] | null;
}

const MEMBER_ID_RE = /^\d{1,20}$/;

function memberId(v: unknown): string | null {
  if (typeof v === "number" && Number.isSafeInteger(v) && v >= 0) return String(v);
  if (typeof v === "string" && MEMBER_ID_RE.test(v.trim())) return v.trim();
  return null;
}

function nickname(data: Record<string, unknown> | null | undefined): string | null {
  if (!data) return null;
  for (const k of ["name", "full_name", "preferred_username", "user_name", "nickname"]) {
    const v = data[k];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

/** 카카오로 로그인한 사용자면 앱 계정, 아니면(다른 공급자·회원번호 없음) null. */
export function accountFromUser(user: AuthUserLike | null | undefined): Account | null {
  if (!user) return null;
  const identity = user.identities?.find((i) => i.provider === "kakao") ?? null;
  const data = identity?.identity_data ?? null;
  let id = identity ? (memberId(data?.provider_id) ?? memberId(data?.sub) ?? memberId(identity.id)) : null;
  let name = nickname(data);

  // identities가 비어 오는 응답(일부 API)에서는 사용자 메타데이터로 — 공급자가 카카오일 때만.
  if (id === null && user.app_metadata?.provider === "kakao") {
    id = memberId(user.user_metadata?.provider_id) ?? memberId(user.user_metadata?.sub);
    name = name ?? nickname(user.user_metadata);
  }
  if (id === null) return null;
  return { id: kakaoAccountID(id), name: name ?? nickname(user.user_metadata), provider: "kakao" };
}

/** 익명(게스트) 사용자인가 — 카카오를 연결하면 false가 된다 */
export function isAnonymousUser(user: AuthUserLike | null | undefined): boolean {
  return user?.is_anonymous === true;
}

/** 익명 사용자(카카오 identity 없음) → 게스트 계정 "guest-<Supabase 사용자 id>". 익명이 아니거나 카카오가 붙었거나 id가 없으면 null. */
export function guestAccountFromUser(user: AuthUserLike | null | undefined): Account | null {
  if (!isAnonymousUser(user) || typeof user?.id !== "string" || user.id.length === 0) return null;
  if (accountFromUser(user) !== null) return null;
  return { id: makeGuestID(user.id), name: null, provider: "guest" };
}

/** 세션 사용자 → 앱 계정: 카카오 identity가 있으면 카카오, 없고 익명이면 게스트, 그 밖(다른 공급자)은 null. */
export function accountFromSessionUser(user: AuthUserLike | null | undefined): Account | null {
  return accountFromUser(user) ?? guestAccountFromUser(user);
}

/**
 * 게스트 계정 id가 가리키는 Supabase 사용자 id("guest-" 뒤). 예전 브라우저 전용 게스트(무작위 id)도 같은 모양이라
 * 이것만으로 익명 계정이 있는지 알 수 없다 — 세션 사용자 id와 같을 때만 그 익명 사용자다.
 */
export function guestUserId(accountId: string): string | null {
  return isGuestID(accountId) ? accountId.slice(GUEST_ID_PREFIX.length) : null;
}
