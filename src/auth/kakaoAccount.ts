// Supabase 사용자 → 앱 계정. iOS와 같은 id("kakao-<카카오 회원번호>", LoginView.swift:114)를 써서
// 계정 귀속 규칙(store/state.ts bindToAccount)이 iOS와 같게 동작한다.
//
// 회원번호는 카카오 identity의 provider_id(= sub = identity.id)에서 읽는다(Supabase Auth kakao 공급자가 채움).
// 이름은 카카오 닉네임(동의항목 profile_nickname) — 없거나 비면 null이고, 화면은 "카카오 사용자"를 쓴다(account.ts displayName).
// 이메일은 쓰지 않는다.

import { kakaoAccountID, type Account } from "@/store/account";

/** 필요한 모양만 — supabase-js의 User와 호환 */
export interface AuthUserLike {
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
