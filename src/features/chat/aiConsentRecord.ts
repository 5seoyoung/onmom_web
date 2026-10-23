// AI 국외 이전 동의의 서버 기록 — public.ai_consents 한 행(supabase/migrations/0008_ai_consents.sql). Edge Function chat이 이 행으로
// 동의를 확인하고, 지금 판의 행이 없으면 403 ai_consent_required로 답한다(supabase/functions/_shared/aiConsent.ts).
//
// - 쓰는 때: 동의 카드에서 [동의하고 계속하기]를 누른 뒤(aiConsent.ts useAiConsent accept), 이 계정의 서버 세션이 있을 때만.
//   판(AI_CONSENT_VERSION)·동의 시각을 upsert한다(같은 사용자는 판·시각만 바뀐다). 화면은 기다리지 않는다 — 실패하면 한 번 더.
// - 바로 뒤의 AI 요청은 이 기록이 끝난 뒤(성공·실패 모두) 보낸다(afterAiConsentRecord) — 함수가 행을 보기 전에 요청이 닿아
//   403이 되고 동의 카드가 다시 뜨는 일이 없게. 한 번의 시도는 AI_CONSENT_RECORD_TIMEOUT_MS에서 끊는다(오래 기다리지 않게).
// - 요청하지 않는 때: Supabase가 없는 빌드(브라우저 전용 — 지금과 같다, 네트워크 없음)·이 브라우저에 저장된 세션 없음·
//   세션 사용자가 이 계정이 아님(계정 전환 중 — 남의 행을 쓰지 않는다).
// - 행 수준 보안(RLS)이 본인 행만 쓰게 막는다. user_id는 세션 사용자 id(서버가 auth.uid()와 같은지 확인한다).
// 질문·답·건강 정보는 보내지 않는다. 처리방침·동의 문구의 "동의한 내용과 일시"(features/privacy/dataItems.ts SETTING_ITEMS)에 든다.

import { getSupabaseClient, hasStoredAuthSession } from "@/auth/client";
import { accountFromSessionUser } from "@/auth/kakaoAccount";
import { isSupabaseConfigured } from "@/config";
import { AI_CONSENT_VERSION, AI_CONSENTS_TABLE } from "../../../supabase/functions/_shared/aiConsent";

/** 한 번 쓰는 행 */
export interface AiConsentRow {
  user_id: string;
  version: string;
  /** ISO 시각(브라우저) — 동의를 누른 때 */
  accepted_at: string;
}

export type AiConsentRecordResult =
  /** 서버에 남겼다 */
  | "recorded"
  /** 남기지 않았다 — Supabase 없는 빌드·저장된 세션 없음·세션이 다른 계정(요청을 만들지 않았거나 세션 확인에서 멈춤) */
  | "skipped"
  /** 처음과 한 번 더, 둘 다 실패(오프라인·서버 오류·시간 초과) — 다음 AI 요청이 403이면 동의 카드가 다시 뜬다 */
  | "failed";

/** 바깥 의존성 — 브라우저 기본값은 browserAiConsentPorts, 테스트는 가짜를 넣는다 */
export interface AiConsentRecordPorts {
  /** 쓸 수 있는 빌드·브라우저인가 — 읽기만(네트워크 없음). false면 아무 요청도 만들지 않는다 */
  canRecord: () => boolean;
  /** 지금 세션의 사용자 id와 그 사용자의 앱 계정 id. 세션이 없으면 null, 읽지 못하면 throw */
  session: () => Promise<{ userId: string; accountId: string | null } | null>;
  /** 행 쓰기(user_id로 upsert). 실패하면 throw */
  upsert: (row: AiConsentRow) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
}

/** 한 번 더 하기 전 기다림 */
export const AI_CONSENT_RECORD_RETRY_MS = 1_000;
/** 한 번의 시도(세션 읽기·쓰기 각각)를 기다리는 최대 시간 — 넘으면 그 시도는 실패로 본다 */
export const AI_CONSENT_RECORD_TIMEOUT_MS = 6_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** 동의를 서버에 남긴다 — 실패하면 한 번 더(모두 두 번). 던지지 않는다. */
export async function recordAiConsent(
  accountId: string,
  acceptedAt: Date,
  ports: AiConsentRecordPorts = browserAiConsentPorts,
): Promise<AiConsentRecordResult> {
  try {
    if (!ports.canRecord()) return "skipped";
  } catch {
    return "skipped";
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await ports.sleep(AI_CONSENT_RECORD_RETRY_MS);
    try {
      const session = await withTimeout(ports.session(), AI_CONSENT_RECORD_TIMEOUT_MS);
      // 세션이 없거나 다른 계정의 세션 — 다시 해도 같다. 남의 행을 쓰지 않는다.
      if (session === null || session.accountId !== accountId) return "skipped";
      await withTimeout(
        ports.upsert({ user_id: session.userId, version: AI_CONSENT_VERSION, accepted_at: acceptedAt.toISOString() }),
        AI_CONSENT_RECORD_TIMEOUT_MS,
      );
      return "recorded";
    } catch {
      // 오프라인·서버 오류·시간 초과 — 한 번만 더
    }
  }
  return "failed";
}

async function supabaseClientOrThrow() {
  const client = await getSupabaseClient();
  if (!client) throw new Error("no_client");
  return client;
}

/** 브라우저 기본값 — Supabase 설정과 저장된 세션이 있을 때만 supabase-js를 부른다 */
export const browserAiConsentPorts: AiConsentRecordPorts = {
  canRecord: () => isSupabaseConfigured() && hasStoredAuthSession(),
  session: async () => {
    const client = await supabaseClientOrThrow();
    const { data, error } = await client.auth.getSession();
    if (error) throw new Error("session_error");
    const s = data.session;
    return s ? { userId: s.user.id, accountId: accountFromSessionUser(s.user)?.id ?? null } : null;
  },
  upsert: async (row) => {
    const client = await supabaseClientOrThrow();
    const { error } = await client.from(AI_CONSENTS_TABLE).upsert(row, { onConflict: "user_id" });
    if (error) throw new Error("upsert_failed");
  },
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** 계정별로 진행 중인 기록 — 끝나면 지운다 */
const pending = new Map<string, Promise<AiConsentRecordResult>>();

/** 기록을 시작하고(기다리지 않아도 된다), 바로 뒤 AI 요청이 기다릴 수 있게 계정별로 잡아 둔다 */
export function startAiConsentRecord(
  accountId: string,
  acceptedAt: Date,
  ports?: AiConsentRecordPorts,
): Promise<AiConsentRecordResult> {
  const run = recordAiConsent(accountId, acceptedAt, ports).catch((): AiConsentRecordResult => "failed");
  pending.set(accountId, run);
  void run.then(() => {
    if (pending.get(accountId) === run) pending.delete(accountId);
  });
  return run;
}

/** 이 계정의 진행 중인 기록이 끝날 때까지(없으면 바로) — 결과와 상관없이 끝나기만 기다린다 */
export async function aiConsentRecordSettled(accountId: string | null): Promise<void> {
  if (accountId === null) return;
  await pending.get(accountId);
}

/**
 * AI 요청 함수(llmComplete)를 이 계정의 서버 동의 기록이 끝난 뒤에 보내게 감싼다 —
 * [동의하고 계속하기] 직후의 첫 요청이 함수의 동의 확인(403)보다 먼저 닿지 않게. 진행 중인 기록이 없으면 그대로 보낸다.
 */
export function afterAiConsentRecord<A extends unknown[], R>(accountId: string | null, fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return async (...args: A) => {
    await aiConsentRecordSettled(accountId);
    return fn(...args);
  };
}
