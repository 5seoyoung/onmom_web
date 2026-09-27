// LLM 프록시 호출 — iOS LLMClient.swift 이식. POST {llmURL}/chat → { text }
//
// 키·시스템 프롬프트(임상 가드레일)·코퍼스는 서버가 소유한다. 클라이언트는 preset만 고르고 system 필드는 보내지 않는다(검수 #50).
// LLM은 판정 경로 밖이다(원칙 2): 이 함수는 텍스트만 돌려주고, 실패 시 무엇을 보여줄지는 호출하는 화면이 정한다.
// 응답 text는 신뢰할 수 없는 값이다 — 마크다운·HTML로 렌더하지 말고 plain text로만 보여준다(검수 #51, iOS Text()와 동일).

import { defaultBackendConfig, joinBackendUrl, requestJson, type BackendConfig } from "./http";

/** 서버가 소유한 시스템 프롬프트 프리셋 */
export type LLMPreset = "patient_edu" | "substance";

export type LLMMessage = { role: "user" | "assistant"; content: string };

export type LLMFailureKind = "notConfigured" | "server" | "network" | "empty";

export type LLMResult =
  | { ok: true; text: string }
  | { ok: false; kind: LLMFailureKind; message: string; status?: number };

export const LLM_MESSAGES: Record<LLMFailureKind, string> = {
  notConfigured: "AI 상담은 준비 중이에요.", // 원문: LLMClient.swift:33
  network: "AI 서버에 연결할 수 없어요.", // 원문: LLMClient.swift:34
  server: "AI 응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.", // 원문: LLMClient.swift:35
  empty: "응답이 비어 있어요.", // 원문: LLMClient.swift:36
};

/** 호출 지점별 iOS 값 — 챗봇은 LLMClient 기본값, 약물 조회는 SubstanceCheckView가 준 값 */
export const LLM_PRESET_DEFAULTS: Record<LLMPreset, { maxTokens: number; timeoutMs: number }> = {
  patient_edu: { maxTokens: 1024, timeoutMs: 40_000 }, // LLMClient.swift:27, :64
  substance: { maxTokens: 512, timeoutMs: 25_000 }, // SubstanceCheckView.swift:121, :125
};

export type LLMRequest = {
  preset: LLMPreset;
  messages: LLMMessage[];
  /** 산모 프로필 요약 등 요청별 컨텍스트. 무엇을 담을지는 호출자가 정한다(처리방침 고지 범위 — 검수 #14). */
  context?: string | null;
  maxTokens?: number;
};

export type LLMOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  config?: BackendConfig;
};

const fail = (kind: LLMFailureKind, status?: number): LLMResult => ({
  ok: false,
  kind,
  message: LLM_MESSAGES[kind],
  status,
});

/**
 * 한 턴 질의. 호출자가 signal로 취소하면 network로 끝나므로, 취소한 쪽은 자기 signal을 보고 결과를 버린다.
 */
export async function llmComplete(req: LLMRequest, opts: LLMOptions = {}): Promise<LLMResult> {
  // iOS와 같은 순서 — 설정 확인이 먼저다(LLMClient.swift:66)
  const cfg = opts.config ?? defaultBackendConfig;
  const url = joinBackendUrl(cfg.llmURL, "chat");
  if (!url) return fail("notConfigured");

  // 첫 메시지는 항상 user여야 한다 — 화면이 심은 인사말(assistant)은 빼고 보낸다(ChatView.swift:171-172)
  const firstUser = req.messages.findIndex((m) => m.role === "user");
  // user 턴이 없으면 iOS는 빈 대화를 보내 서버에 거절당했다(→ server). 결과는 같게, 요청은 보내지 않는다.
  // 던지지 않는다 — 호출자는 실패 시 규칙 기반 폴백을 보여줘야 한다(ChatView.swift:175-185).
  if (firstUser < 0) return fail("server");
  const messages = req.messages.slice(firstUser).map(({ role, content }) => ({ role, content }));

  const defaults = LLM_PRESET_DEFAULTS[req.preset];
  const body: Record<string, unknown> = {
    messages,
    preset: req.preset,
    max_tokens: req.maxTokens ?? defaults.maxTokens,
  };
  if (req.context != null) body.context = req.context;

  const res = await requestJson(url.toString(), {
    method: "POST",
    body,
    timeoutMs: opts.timeoutMs ?? defaults.timeoutMs,
    signal: opts.signal,
    config: cfg,
  });
  if (!res.ok) return res.kind === "status" ? fail("server", res.status) : fail("network");

  const text = (res.data as { text?: unknown } | null)?.text;
  // iOS는 디코딩 실패를 unreachable로 묶는다(LLMClient.swift:90-91)
  if (typeof text !== "string") return fail("network");
  if (text.trim() === "") return fail("empty");
  return { ok: true, text };
}
