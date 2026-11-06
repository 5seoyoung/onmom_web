"use client";

// AI 답변 동의(민감정보 처리·국외 이전 — Anthropic, 미국) — AI 상담을 처음 쓸 때 따로 받는 동의.
// 온보딩 동의 화면의 안내(features/onboarding/consentText.ts AI_TRANSFER_NOTICE)와 처리방침(4절·6절 ①)이 약속한 것이다.
// AI는 상담에만 쓴다(약물 체크는 표만 본다). 시범 동안 카카오 계정만 — 익명 게스트에게는 묻지 않는다(aiMode "login"). 동의 전에는 서버(LLM)로 아무것도 보내지 않는다.
//
// 저장: 이 브라우저의 localStorage "onmom.web.aiConsent.v1" = { accountId, version, acceptedAt }.
// - 계정별 — 같은 브라우저에서 다른 계정이 로그인하면(공용 PC) 그 사람에게 다시 묻는다.
// - 판(AI_CONSENT_VERSION)이 바뀌면 다시 묻는다. 동의 카드의 글자(AiConsentCard·AI_TRANSFER_NOTICE)를 바꾸면 판을 올린다.
// - 키 접두 "onmom.web." — 계정 삭제(store deleteAccount)가 함께 지운다.
// - 프로필(서버 저장 상태)에 새 필드를 두지 않는다(consentText.ts 머리말). 그래서 다른 기기에서는 처음 쓸 때 한 번 더 묻는다.
// 서버 기록: 동의하면 이 계정의 서버 세션이 있을 때 public.ai_consents에도 판·시각·두 동의를 남긴다(aiConsentRecord.ts — 화면은 기다리지 않는다,
//   실패하면 한 번 더). Edge Function chat은 그 행이 지금 판이고 두 동의가 모두 있을 때만 답한다 — 아니면 403 ai_consent_required이고, 화면은 이 계정의
//   동의를 지우고(revoke) 동의 카드를 다시 띄운다. Supabase가 없는 빌드는 서버에 아무것도 보내지 않는다(지금과 같다).
// 철회: 설정 > 내 데이터(features/settings/AiConsentWithdraw.tsx)가 서버 행과 이 브라우저의 기록을 지운다(useAiConsentStatus). 그 뒤에는 다시 동의하기 전까지 AI를 부르지 않는다.
// 동의하지 않기는 저장하지 않는다 — 그 화면을 떠나면 다음에 다시 묻는다(영구 거절로 두지 않는다).

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { readAiConsentOnServer, startAiConsentRecord, withdrawAiConsent } from "./aiConsentRecord";
// 판은 Edge Function chat과 한 곳에서 — 함수가 서버 기록(ai_consents)의 판을 이 값과 비교한다(가져오는 것이 없는 순수 모듈)
import { AI_CONSENT_VERSION } from "../../../supabase/functions/_shared/aiConsent";

/**
 * 동의 글자의 판 — 동의 카드(AiConsentCard의 제목·첫 문장)나 두 동의의 요약·전문(consentText.ts AI_CONSENT_ITEMS)을 바꾸면 올린다.
 * 값은 supabase/functions/_shared/aiConsent.ts에 있다(웹과 함수가 같은 값). aiConsent.test.ts가 글자의 지문을 판에 묶어 두어,
 * 판을 올리지 않고 글자만 바꾸면 테스트가 실패한다.
 */
export { AI_CONSENT_VERSION };

export const AI_CONSENT_STORAGE_KEY = "onmom.web.aiConsent.v1";

/**
 * AI를 쓰는 방식 — off: 서버에 묻지 않는다(스위치 꺼짐·이번에 동의하지 않음), login: 서버에 묻지 않고 동의 카드도 없이 앱 안내로 답하며 카카오 연결을 권한다
 * (시범 동안 카카오 계정이 아님), ask: 쓰기 전에 동의를 묻는다, on: 서버에 묻는다.
 */
export type AiMode = "off" | "login" | "ask" | "on";

export function aiMode(input: { aiAvailable: boolean; loginRequired: boolean; consented: boolean; declined: boolean }): AiMode {
  if (!input.aiAvailable) return "off";
  if (input.loginRequired) return "login";
  if (input.declined) return "off";
  return input.consented ? "on" : "ask";
}

interface StoredAiConsent {
  accountId: string;
  version: string;
  acceptedAt: string;
}

/** 저장된 값이 이 계정의 지금 판 동의인가 */
export function parseAiConsent(raw: string | null, accountId: string | null): boolean {
  if (raw === null || !accountId) return false;
  try {
    const v = JSON.parse(raw) as Partial<StoredAiConsent> | null;
    return typeof v === "object" && v !== null && v.accountId === accountId && v.version === AI_CONSENT_VERSION;
  } catch {
    return false;
  }
}

export function serializeAiConsent(accountId: string, now: Date): string {
  const value: StoredAiConsent = { accountId, version: AI_CONSENT_VERSION, acceptedAt: now.toISOString() };
  return JSON.stringify(value);
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null; // 저장소를 막은 브라우저
  }
}

export function readAiConsent(accountId: string | null, storage: StorageLike | null = browserStorage()): boolean {
  if (!storage) return false;
  try {
    return parseAiConsent(storage.getItem(AI_CONSENT_STORAGE_KEY), accountId);
  } catch {
    return false;
  }
}

const listeners = new Set<() => void>();

/** 동의를 남긴다. 저장하지 못해도(사생활 보호 모드 등) 이번 화면에서는 동의로 본다(useAiConsent). */
export function saveAiConsent(accountId: string, now: Date = new Date(), storage: StorageLike | null = browserStorage()): void {
  try {
    storage?.setItem(AI_CONSENT_STORAGE_KEY, serializeAiConsent(accountId, now));
  } catch {
    // 저장 실패 — 다음 방문에 다시 묻는다
  }
  for (const listener of listeners) listener();
}

/**
 * 이 계정의 동의를 지운다 — 서버가 동의 기록을 찾지 못했을 때(403 ai_consent_required)와 철회할 때. 다음에 다시 묻는다.
 * 남아 있는 값이 다른 계정의 것이면 건드리지 않는다. 지우지 못해도(저장소 막힘) 던지지 않는다.
 */
export function clearAiConsent(accountId: string, storage: Pick<Storage, "getItem" | "removeItem"> | null = browserStorage()): void {
  try {
    const raw = storage?.getItem(AI_CONSENT_STORAGE_KEY) ?? null;
    if (raw !== null && (JSON.parse(raw) as Partial<StoredAiConsent> | null)?.accountId === accountId) {
      storage?.removeItem(AI_CONSENT_STORAGE_KEY);
    }
  } catch {
    // 깨진 값·저장소 막힘 — 읽어도 동의가 아니다(parseAiConsent)
  }
  for (const listener of listeners) listener();
}

function subscribeAiConsent(listener: () => void): () => void {
  listeners.add(listener);
  // 다른 탭에서 동의했거나 계정 삭제로 지워졌을 때
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === AI_CONSENT_STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * 지금 계정의 AI 답변 동의 — 정적 HTML·첫 렌더에서는 false(동의 안 함으로 본다).
 * accept: 이 브라우저에 남기고, 서버 세션이 있으면 서버 기록을 시작한다(기다리지 않는다 — 바로 뒤 AI 요청은 afterAiConsentRecord로 감싼다).
 * revoke: 서버가 동의 기록을 찾지 못했을 때(403 ai_consent_required) — 이 계정의 동의를 지워 다시 묻게 한다.
 */
export function useAiConsent(accountId: string | null): { consented: boolean; accept: () => void; revoke: () => void } {
  const stored = useSyncExternalStore(
    subscribeAiConsent,
    () => readAiConsent(accountId),
    () => false,
  );
  /** 이번 화면에서 동의한 계정 — 저장소에 쓰지 못한 브라우저에서도 이번에는 동의로 본다 */
  const [acceptedNow, setAcceptedNow] = useState<string | null>(null);
  const accept = useCallback(() => {
    if (!accountId) return;
    const now = new Date();
    setAcceptedNow(accountId);
    saveAiConsent(accountId, now);
    void startAiConsentRecord(accountId, now);
  }, [accountId]);
  const revoke = useCallback(() => {
    if (!accountId) return;
    setAcceptedNow(null);
    clearAiConsent(accountId);
  }, [accountId]);
  return { consented: stored || (accountId !== null && acceptedNow === accountId), accept, revoke };
}

/**
 * 설정의 철회 행 — 이 계정의 동의가 남아 있는가(이 브라우저 기록 또는 서버 행)와 철회.
 * 서버 행을 함께 본다: 카카오 계정은 다른 기기에서 동의했을 수 있고, 사이트 데이터를 지운 브라우저에도 철회할 길이 있어야 한다.
 * accountId가 null이면(게스트·설정 없는 빌드의 로그인 전) 서버에 묻지 않는다.
 * withdraw는 서버 행을 먼저 지우고, 그 뒤에 이 브라우저의 기록을 지운다. 서버에서 지우지 못하면 아무것도 지우지 않고 false —
 * 철회하지 못했는데 철회된 것처럼 보이면 안 되고, 다시 시도할 행도 남아야 한다.
 */
export function useAiConsentStatus(accountId: string | null): { present: boolean; withdraw: () => Promise<boolean> } {
  const stored = useSyncExternalStore(
    subscribeAiConsent,
    () => readAiConsent(accountId),
    () => false,
  );
  /** 서버 행이 있는 계정 — 없거나 아직 모르면 null */
  const [onServer, setOnServer] = useState<string | null>(null);

  useEffect(() => {
    if (accountId === null) return;
    let cancelled = false;
    void readAiConsentOnServer(accountId).then((found) => {
      if (!cancelled) setOnServer(found === true ? accountId : null);
    });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const withdraw = useCallback(async () => {
    if (accountId === null) return false;
    if ((await withdrawAiConsent(accountId)) !== "withdrawn") return false;
    setOnServer(null);
    clearAiConsent(accountId);
    return true;
  }, [accountId]);

  return { present: stored || (accountId !== null && onServer === accountId), withdraw };
}
