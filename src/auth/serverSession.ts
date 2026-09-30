// 이 계정에 서버(Supabase) 세션이 있는가 — 서버 행이 있어야 하는 기능(매일 리마인더 구독 저장 등)이 켤 수 있는지 판단한다.
//
// 설정이 있는 빌드에서도 세션이 없는 계정이 있다: 익명 가입이 안 된 게스트(꺼짐·요청 제한·사람 확인 실패·오프라인 — session.ts)는
// 이 브라우저 전용으로 시작한다. 그런 계정에서 서버 행을 쓰려 하면 RLS·세션 없음으로 실패하므로, 화면은 먼저 이 판단을 보고
// 켤 수 없는 까닭을 알린다(서버에 없는 것을 있는 척하지 않는다).
//
// 판단 근거는 이 브라우저에 저장된 세션과 그 세션 사용자의 앱 계정(kakaoAccount.accountFromSessionUser — session.ts sessionIs와 같은 규칙).
// 네트워크 요청은 하지 않는다(세션 읽기는 저장소에서 — 만료됐으면 supabase-js가 갱신을 시도한다).

/** checking = 아직 읽는 중이거나 읽지 못함, server = 이 계정의 세션이 있다, none = 없다 */
export type ServerSessionStatus = "checking" | "server" | "none";

/**
 * 세션을 읽은 결과.
 * - undefined: 아직 읽지 않았다
 * - "error": 읽지 못했다(번들을 못 받음·갱신 실패 등) — 모른다
 * - null: 세션이 없다
 * - { accountId }: 세션 사용자의 앱 계정 id(카카오·익명 게스트가 아니면 null)
 */
export type SessionRead = undefined | "error" | null | { accountId: string | null };

export interface ServerSessionInput {
  /** Supabase 설정이 있는 빌드(config.isSupabaseConfigured) */
  configured: boolean;
  /** 스토어의 로그인 계정 id — 없으면 null */
  accountId: string | null;
  /** 이 브라우저에 저장된 Supabase 세션이 있는가(client.hasStoredAuthSession — 읽기만) */
  storedSession: boolean;
  session: SessionRead;
}

export function serverSessionStatus(input: ServerSessionInput): ServerSessionStatus {
  if (!input.configured || input.accountId === null) return "none";
  // 저장된 세션이 없으면 서버 계정이 없다(익명 가입 실패 게스트·로그아웃 뒤) — 읽을 것도 없다
  if (!input.storedSession) return "none";
  const s = input.session;
  if (s === undefined || s === "error") return "checking";
  if (s === null) return "none";
  // 다른 사용자의 세션(계정 전환 중 등)이면 이 계정의 서버 행을 쓸 수 없다
  return s.accountId === input.accountId ? "server" : "none";
}
