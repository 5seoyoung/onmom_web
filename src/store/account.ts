// 계정 식별 — iOS AccountStore.swift를 옮긴 것(Apple 로그인은 웹에 없음 — 08 §로그인).
//
// 게스트 id 규칙(`guest-` 접두)과 그 판정(isGuestID)은 반드시 이 파일 한 곳에 둔다 —
// 계정 전환 시 데이터 귀속/삭제 판정(state.ts bindToAccount)이 이 함수에 의존한다(AccountStore.swift:49-51).

import { isRecord } from "./decode";

/** "kakao" | "guest" — iOS는 문자열로 저장했고 모르는 값도 그대로 두었다. */
export type AccountProvider = "kakao" | "guest" | (string & {});

export interface Account {
  /** 게스트는 "guest-<uuid>", 카카오는 "kakao-<회원번호>" */
  id: string;
  /** 카카오 닉네임(선택 동의) — 없으면 null */
  name: string | null;
  provider: AccountProvider;
}

export const GUEST_ID_PREFIX = "guest-";

export function isGuestID(id: string): boolean {
  return id.startsWith(GUEST_ID_PREFIX);
}

/** 게스트 id — 브라우저당 한 번 발급해 재사용한다(발급·보관은 appStore). */
export function makeGuestID(uuid: string): string {
  return `${GUEST_ID_PREFIX}${uuid}`;
}

/** 카카오 계정 id — "kakao-" + 카카오 회원번호(LoginView.swift:114, 04 §3). */
export function kakaoAccountID(memberId: string | number): string {
  return `kakao-${memberId}`;
}

/**
 * 화면에 보이는 이름 — 닉네임이 있으면 그것, 없으면 제공자별 이름(AccountStore.swift:74-82).
 * 기록장 글·댓글의 authorName은 작성 시점의 이 값을 스냅샷으로 저장한다.
 */
export function displayName(account: Account | null): string {
  if (account?.name) return account.name;
  switch (account?.provider) {
    case "guest":
      return "게스트"; // 원문: AccountStore.swift:77
    case "kakao":
      return "카카오 사용자"; // 원문: AccountStore.swift:78
    case "apple":
      return "Apple 사용자"; // 원문: AccountStore.swift:79
    default:
      return "사용자"; // 원문: AccountStore.swift:80
  }
}

/**
 * 저장된 계정 JSON을 관대하게 읽는다(AccountStore.swift:24-29 — provider 없으면 "guest").
 * iOS와 다른 점: id가 비었거나 없으면 로그인 안 한 것으로 본다. iOS는 id ""로 로그인 상태가 되어
 * 다음 bind에서 실제 계정의 데이터를 지울 수 있었다.
 */
export function decodeAccount(raw: unknown): Account | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== "string" || raw.id.length === 0) return null;
  return {
    id: raw.id,
    name: typeof raw.name === "string" ? raw.name : null,
    provider: typeof raw.provider === "string" ? raw.provider : "guest",
  };
}
