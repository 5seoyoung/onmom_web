import { afterEach, describe, expect, it, vi } from "vitest";
import { LLM_MESSAGES, llmComplete } from "./llm";
import { hangingFetch, jsonResponse, lastCall, stubFetch, testConfig } from "./testUtils";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const ask = [{ role: "user" as const, content: "오로가 언제까지 나오나요?" }];

describe("문구는 LLMClient.swift:33-36 원문", () => {
  it("네 가지", () => {
    expect(LLM_MESSAGES).toEqual({
      notConfigured: "AI 상담은 준비 중이에요.",
      network: "AI 서버에 연결할 수 없어요.",
      server: "AI 응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.",
      empty: "응답이 비어 있어요.",
    });
  });
});

describe("llmComplete", () => {
  it("llmURL이 비면 notConfigured — 요청하지 않는다", async () => {
    const fetch = stubFetch(async () => jsonResponse(200, { text: "x" }));
    const res = await llmComplete({ preset: "patient_edu", messages: ask }, { config: { ...testConfig, llmURL: null } });
    expect(res).toMatchObject({ ok: false, kind: "notConfigured", message: LLM_MESSAGES.notConfigured });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("POST /chat — messages·preset·context·max_tokens만, system 없음", async () => {
    const fetch = stubFetch(async () => jsonResponse(200, { text: "보통 4~6주 정도예요." }));
    const res = await llmComplete(
      { preset: "patient_edu", messages: ask, context: "산후 23일차(3주차), 제왕절개, 모유수유 중" },
      { config: testConfig },
    );
    const { url, init, headers } = lastCall(fetch);
    expect(url).toBe("https://llm.onmom.test/chat");
    expect(init.method).toBe("POST");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-onmom-key")).toBe("test-app-key");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      messages: ask,
      preset: "patient_edu",
      context: "산후 23일차(3주차), 제왕절개, 모유수유 중",
      max_tokens: 1024,
    });
    expect("system" in body).toBe(false);
    expect(res).toEqual({ ok: true, text: "보통 4~6주 정도예요." });
  });

  it("context가 없으면 필드를 빼고 보낸다", async () => {
    const fetch = stubFetch(async () => jsonResponse(200, { text: "ok" }));
    await llmComplete({ preset: "patient_edu", messages: ask }, { config: testConfig });
    expect("context" in JSON.parse(lastCall(fetch).init.body as string)).toBe(false);
  });

  it("substance 프리셋은 max_tokens 512 (SubstanceCheckView.swift:121)", async () => {
    const fetch = stubFetch(async () => jsonResponse(200, { text: "{}" }));
    await llmComplete({ preset: "substance", messages: [{ role: "user", content: "타이레놀" }] }, { config: testConfig });
    expect(JSON.parse(lastCall(fetch).init.body as string)).toMatchObject({ preset: "substance", max_tokens: 512 });
  });

  it("maxTokens를 직접 줄 수 있다", async () => {
    const fetch = stubFetch(async () => jsonResponse(200, { text: "ok" }));
    await llmComplete({ preset: "patient_edu", messages: ask, maxTokens: 300 }, { config: testConfig });
    expect(JSON.parse(lastCall(fetch).init.body as string).max_tokens).toBe(300);
  });

  it("앞쪽 assistant 인사말은 빼고, 필요 없는 필드도 보내지 않는다", async () => {
    const fetch = stubFetch(async () => jsonResponse(200, { text: "ok" }));
    const history = [
      { role: "assistant" as const, content: "안녕하세요, 온맘이에요." },
      { role: "user" as const, content: "질문1" },
      { role: "assistant" as const, content: "답1" },
      { role: "user" as const, content: "질문2", id: "local-only" },
    ];
    await llmComplete({ preset: "patient_edu", messages: history }, { config: testConfig });
    expect(JSON.parse(lastCall(fetch).init.body as string).messages).toEqual([
      { role: "user", content: "질문1" },
      { role: "assistant", content: "답1" },
      { role: "user", content: "질문2" },
    ]);
  });

  it.each([
    ["인사말만", [{ role: "assistant" as const, content: "hi" }]],
    ["빈 대화", []],
  ])("user 메시지가 없으면(%s) 던지지 않고 server — 호출하지 않는다", async (_label, messages) => {
    const fetch = stubFetch(async () => jsonResponse(200, { text: "ok" }));
    const res = await llmComplete({ preset: "patient_edu", messages }, { config: testConfig });
    expect(res).toEqual({ ok: false, kind: "server", message: LLM_MESSAGES.server, status: undefined });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("미설정이 먼저 — user 메시지가 없어도 notConfigured(iOS LLMClient.swift:66 순서)", async () => {
    const fetch = stubFetch(async () => jsonResponse(200, { text: "ok" }));
    const res = await llmComplete({ preset: "patient_edu", messages: [] }, { config: { ...testConfig, llmURL: null } });
    expect(res).toMatchObject({ ok: false, kind: "notConfigured", message: LLM_MESSAGES.notConfigured });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("2xx는 성공(iOS 200..<300)", async () => {
    stubFetch(async () => jsonResponse(201, { text: "ok" }));
    expect(await llmComplete({ preset: "patient_edu", messages: ask }, { config: testConfig })).toEqual({ ok: true, text: "ok" });
  });

  it.each([404, 429, 500])("HTTP %i → server + 원문", async (status) => {
    stubFetch(async () => jsonResponse(status, { detail: "x" }));
    const res = await llmComplete({ preset: "patient_edu", messages: ask }, { config: testConfig });
    expect(res).toMatchObject({ ok: false, kind: "server", message: LLM_MESSAGES.server, status });
  });

  it("빈 text → empty", async () => {
    stubFetch(async () => jsonResponse(200, { text: "  " }));
    const res = await llmComplete({ preset: "patient_edu", messages: ask }, { config: testConfig });
    expect(res).toMatchObject({ ok: false, kind: "empty", message: LLM_MESSAGES.empty });
  });

  it("text가 없거나 문자열이 아니면 network(iOS 디코딩 실패와 같게)", async () => {
    stubFetch(async () => jsonResponse(200, { answer: "x" }));
    expect(await llmComplete({ preset: "patient_edu", messages: ask }, { config: testConfig })).toMatchObject({
      ok: false,
      kind: "network",
      message: LLM_MESSAGES.network,
    });
    stubFetch(async () => jsonResponse(200, null));
    expect(await llmComplete({ preset: "patient_edu", messages: ask }, { config: testConfig })).toMatchObject({
      kind: "network",
    });
  });

  it("CORS 차단·오프라인 → network", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    const res = await llmComplete({ preset: "patient_edu", messages: ask }, { config: testConfig });
    expect(res).toMatchObject({ ok: false, kind: "network", message: LLM_MESSAGES.network });
  });

  it.each([
    ["patient_edu", 40_000],
    ["substance", 25_000],
  ] as const)("%s 타임아웃 %ims → network", async (preset, ms) => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", hangingFetch());
    let settled = false;
    const p = llmComplete({ preset, messages: ask }, { config: testConfig }).finally(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(ms - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await p).toMatchObject({ ok: false, kind: "network" });
  });
});
