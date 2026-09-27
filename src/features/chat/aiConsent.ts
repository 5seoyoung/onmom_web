"use client";

// AI 답변의 국외 이전(Anthropic, 미국) 동의 — AI 기능을 처음 쓸 때 따로 받는 동의.
// 온보딩 동의 화면의 안내(features/onboarding/consentText.ts AI_TRANSFER_NOTICE)와 처리방침(6절 ①)이 약속한 것이다:
// "AI 답변을 쓰는 기능은 처음 쓸 때 따로 동의를 받아요. 동의하지 않아도 온맘에 담긴 안내로 답해요."
// AI 상담과 약물 체크(표에 없는 항목)가 같이 쓴다. 동의 전에는 두 화면 모두 서버(LLM)로 아무것도 보내지 않는다.
//
// 저장: 이 브라우저의 localStorage "onmom.web.aiConsent.v1" = { accountId, version, acceptedAt }.
// - 계정별 — 같은 브라우저에서 다른 계정이 로그인하면(공용 PC) 그 사람에게 다시 묻는다.
// - 판(AI_CONSENT_VERSION)이 바뀌면 다시 묻는다. 동의 카드의 글자(AiConsentCard·AI_TRANSFER_NOTICE)를 바꾸면 판을 올린다.
// - 키 접두 "onmom.web." — 계정 삭제(store deleteAccount)가 함께 지운다.
// - 프로필(서버 저장 상태)에 새 필드를 두지 않는다(consentText.ts 머리말). 그래서 다른 기기에서는 처음 쓸 때 한 번 더 묻는다.
// 동의하지 않기는 저장하지 않는다 — 그 화면을 떠나면 다음에 다시 묻는다(설정에서 바꿀 곳이 없으므로 영구 거절로 두지 않는다).

import { useCallback, useState, useSyncExternalStore } from "react";

export const AI_CONSENT_STORAGE_KEY = "onmom.web.aiConsent.v1";
/**
 * 동의 글자의 판 — 동의 카드(AiConsentCard의 제목·첫 문장)나 전문(consentText.ts AI_TRANSFER_NOTICE.details)을 바꾸면 올린다.
 * aiConsent.test.ts가 글자의 지문을 판에 묶어 두어, 판을 올리지 않고 글자만 바꾸면 테스트가 실패한다.
 * .2: 동의 카드를 "안내"에서 "동의 요청"으로(제목·첫 문장) 바꾸고 전문을 펼쳐 보이게 함(AI 기능을 켜기 전 — 이 판에 동의한 이용자 없음).
 */
export const AI_CONSENT_VERSION = "web-2026-09-28.2";

/**
 * AI를 쓰는 방식 — off: 서버에 묻지 않는다(스위치 꺼짐·이번에 동의하지 않음), ask: 쓰기 전에 동의를 묻는다, on: 서버에 묻는다.
 */
export type AiMode = "off" | "ask" | "on";

export function aiMode(input: { aiAvailable: boolean; consented: boolean; declined: boolean }): AiMode {
  if (!input.aiAvailable || input.declined) return "off";
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

function browserStorage(): StorageLike | null {
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

/** 지금 계정의 AI 국외 이전 동의 — 정적 HTML·첫 렌더에서는 false(동의 안 함으로 본다). */
export function useAiConsent(accountId: string | null): { consented: boolean; accept: () => void } {
  const stored = useSyncExternalStore(
    subscribeAiConsent,
    () => readAiConsent(accountId),
    () => false,
  );
  /** 이번 화면에서 동의한 계정 — 저장소에 쓰지 못한 브라우저에서도 이번에는 동의로 본다 */
  const [acceptedNow, setAcceptedNow] = useState<string | null>(null);
  const accept = useCallback(() => {
    if (!accountId) return;
    setAcceptedNow(accountId);
    saveAiConsent(accountId);
  }, [accountId]);
  return { consented: stored || (accountId !== null && acceptedNow === accountId), accept };
}
