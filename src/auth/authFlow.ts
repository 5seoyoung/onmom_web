// 로그인 흐름이 카카오를 다녀오는 동안 이 브라우저에 남기는 표시 — 콜백 화면이 "무엇을 하던 중이었는지" 알게.
// 키는 "onmom.web." 접두라 계정 삭제(eraseAll)가 함께 지운다. 건강 정보는 없다(계정 id·Supabase 사용자 id·시각만).
//
// - link:   게스트가 [카카오 계정 연결](설정)·[카카오로 시작하기]를 눌렀다 — 돌아오면 같은 사람으로 본다(가져온 기록 표시 없음).
//           anonUserId = 연결하려는 익명(게스트) Supabase 사용자. 브라우저 전용 게스트(익명 계정 없음)면 null.
// - switch: 연결하려던 카카오 계정이 이미 다른 온맘 계정이었다(identity_already_exists) — 그 계정으로 로그인하러 카카오에 다시
//           갔다. 돌아오면(code) 익명 사용자를 그 세션으로 먼저 지우고, 카카오 세션으로 바꾼 뒤 게스트 기록을 합친다.
// 표시는 30분 뒤 무효 — 카카오 화면에서 그냥 떠난 흐름이 나중의 다른 로그인에 끼어들지 않게.
//
// 익명 로그인 쉬기: Supabase가 익명 로그인을 끄고 있거나(anonymous_provider_disabled) 요청이 많다고 거절하면
// 한동안 다시 요청하지 않는다(게스트는 이 브라우저에만 저장하며 계속 쓴다).

import type { StorageLike } from "@/store/persistence";

export const AUTH_FLOW_KEY = "onmom.web.authflow.v1";
export const ANON_PAUSE_KEY = "onmom.web.authflow.anonpause.v1";
export const AUTH_FLOW_TTL_MS = 30 * 60 * 1000;

export type PendingAuthFlow =
  | { kind: "link"; guestAccountId: string; anonUserId: string | null; at: string }
  | { kind: "switch"; guestAccountId: string; anonUserId: string; at: string };

export interface AuthFlowStore {
  load(): PendingAuthFlow | null;
  save(flow: PendingAuthFlow): void;
  clear(): void;
  /** 익명 로그인을 쉬는 중인가 */
  anonPaused(): boolean;
  pauseAnon(ms: number): void;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function decodeFlow(raw: unknown): PendingAuthFlow | null {
  if (!isRecord(raw) || typeof raw.guestAccountId !== "string" || typeof raw.at !== "string") return null;
  if (raw.kind === "link") {
    const anonUserId = typeof raw.anonUserId === "string" ? raw.anonUserId : null;
    return { kind: "link", guestAccountId: raw.guestAccountId, anonUserId, at: raw.at };
  }
  if (raw.kind === "switch" && typeof raw.anonUserId === "string") {
    return { kind: "switch", guestAccountId: raw.guestAccountId, anonUserId: raw.anonUserId, at: raw.at };
  }
  return null;
}

export function createAuthFlowStore(getStorage: () => StorageLike | null, now: () => Date = () => new Date()): AuthFlowStore {
  function read(key: string): unknown {
    try {
      const text = getStorage()?.getItem(key) ?? null;
      return text === null ? null : (JSON.parse(text) as unknown);
    } catch {
      return null;
    }
  }
  function write(key: string, value: unknown | null) {
    try {
      const s = getStorage();
      if (!s) return;
      if (value === null) s.removeItem(key);
      else s.setItem(key, JSON.stringify(value));
    } catch {
      // 못 쓰면 콜백은 보통 로그인으로 처리한다(연결·전환 없이)
    }
  }

  return {
    load() {
      const flow = decodeFlow(read(AUTH_FLOW_KEY));
      if (flow === null) return null;
      const age = now().getTime() - Date.parse(flow.at);
      return Number.isNaN(age) || age < 0 || age > AUTH_FLOW_TTL_MS ? null : flow;
    },
    save(flow) {
      write(AUTH_FLOW_KEY, flow);
    },
    clear() {
      write(AUTH_FLOW_KEY, null);
    },
    anonPaused() {
      const raw = read(ANON_PAUSE_KEY);
      return isRecord(raw) && typeof raw.until === "number" && raw.until > now().getTime();
    },
    pauseAnon(ms) {
      write(ANON_PAUSE_KEY, { until: now().getTime() + ms });
    },
  };
}
