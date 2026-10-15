// 이 계정에 서버(Supabase) 세션이 있는가 — 서버 행이 있어야 하는 기능(매일 리마인더 구독 저장 등)이 켤 수 있는지 판단한다.
//
// 설정이 있는 빌드에서도 세션이 없는 계정이 있다: 익명 가입이 안 된 게스트(꺼짐·요청 제한·사람 확인 실패·오프라인 — session.ts)는
// 이 브라우저 전용으로 시작한다. 그런 계정에서 서버 행을 쓰려 하면 RLS·세션 없음으로 실패하므로, 화면은 먼저 이 판단을 보고
// 켤 수 없는 까닭을 알린다(서버에 없는 것을 있는 척하지 않는다).
//
// 판단 근거는 이 브라우저에 저장된 세션과 그 세션 사용자의 앱 계정(kakaoAccount.accountFromSessionUser — session.ts sessionIs와 같은 규칙).
// 네트워크 요청은 하지 않는다(세션 읽기는 저장소에서 — 만료됐으면 supabase-js가 갱신을 시도한다).

/** checking = 아직 읽는 중(읽지 못해 다시 읽는 중 포함), server = 이 계정의 세션이 있다, none = 없다(또는 끝내 읽지 못했다) */
export type ServerSessionStatus = "checking" | "server" | "none";

/**
 * 세션을 읽은 결과.
 * - undefined: 아직 읽지 않았다
 * - "error": 읽지 못했다(번들을 못 받음·갱신 실패 등) — 모른다. 잠시 뒤 다시 읽는다(readSessionWithRetry)
 * - "unavailable": 다시 읽어도(SESSION_READ_RETRY_DELAYS_MS) 끝내 읽지 못했다 — 서버 세션이 없는 것으로 본다(토글을 영영 잠가 두지 않는다)
 * - null: 세션이 없다
 * - { accountId }: 세션 사용자의 앱 계정 id(카카오·익명 게스트가 아니면 null)
 */
export type SessionRead = undefined | "error" | "unavailable" | null | { accountId: string | null };

/** 한 번 읽은 값 — 아직 읽지 않음·끝내 읽지 못함은 읽는 쪽(readSessionWithRetry)이 정한다 */
export type SessionReadAttempt = Exclude<SessionRead, undefined | "unavailable">;

/** 세션을 읽지 못했을 때 다시 읽는 간격 — 이만큼 다시 해도 못 읽으면 "unavailable"(none) */
export const SESSION_READ_RETRY_DELAYS_MS: readonly number[] = [1_000, 3_000, 10_000];

/**
 * 세션을 읽는다 — 읽지 못하면("error") 간격을 두고 몇 번 더(delaysMs), 그래도 못 읽으면 "unavailable".
 * wait(ms)가 false를 돌려주면(화면을 떠남·계정이 바뀜) 그만 읽고 "unavailable"을 돌려준다(부르는 쪽은 그 값을 쓰지 않는다). 던지지 않는다.
 */
export async function readSessionWithRetry(
  read: () => Promise<SessionReadAttempt>,
  wait: (ms: number) => Promise<boolean>,
  delaysMs: readonly number[] = SESSION_READ_RETRY_DELAYS_MS,
): Promise<Exclude<SessionRead, undefined | "error">> {
  for (let attempt = 0; ; attempt++) {
    let result: SessionReadAttempt;
    try {
      result = await read();
    } catch {
      result = "error";
    }
    if (result !== "error") return result;
    if (attempt >= delaysMs.length || !(await wait(delaysMs[attempt]))) return "unavailable";
  }
}

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
  if (s === null || s === "unavailable") return "none";
  // 다른 사용자의 세션(계정 전환 중 등)이면 이 계정의 서버 행을 쓸 수 없다
  return s.accountId === input.accountId ? "server" : "none";
}
