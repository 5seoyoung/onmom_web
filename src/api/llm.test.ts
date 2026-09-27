import { afterEach, describe, expect, it, vi } from "vitest";
import {
  functionContext,
  functionMessages,
  legacyContextText,
  LLM_FUNCTION_MAX_MESSAGE_CHARS,
  LLM_MESSAGES,
  llmComplete,
  parseFunctionReply,
} from "./llm";
import { hangingFetch, jsonResponse, lastCall, stubFetch, supabaseTestConfig, testConfig } from "./testUtils";

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
      { preset: "patient_edu", messages: ask, context: { week: 3, delivery: "cesarean", breastfeeding: true } },
      { config: testConfig },
    );
    const { url, init, headers } = lastCall(fetch);
    expect(url).toBe("https://llm.onmom.test/chat");
    expect(init.method).toBe("POST");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-onmom-key")).toBe("test-app-key");
    const body = JSON.parse(init.body as string);
    // 예전 경로도 컨텍스트는 세 항목만 — 문자열로 보낸다
    expect(body).toEqual({
      messages: ask,
      preset: "patient_edu",
      context: "산후 3주차, 제왕절개, 모유수유 중",
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

describe("컨텍스트 허용 목록", () => {
  it("week·delivery·breastfeeding만 새 객체로 옮긴다 — 다른 값이 섞여도 나가지 않는다", () => {
    const mixed = { week: 5, delivery: "vaginal", breastfeeding: false, bmi: 24.4, goal: "homemaker", redFlag: true };
    expect(functionContext(mixed as never)).toEqual({ week: 5, delivery: "vaginal", breastfeeding: false });
  });
  it("틀린 값은 뺀다, 모두 빠지면 null", () => {
    expect(functionContext({ week: -1, delivery: "natural" as never })).toBeNull();
    expect(functionContext({ week: 2.5, breastfeeding: true })).toEqual({ breastfeeding: true });
    // 함수가 받는 범위(0~520주) 밖이면 그 항목만 뺀다 — 잘못 고른 출산 연도로 모든 AI 요청이 400이 되지 않게
    expect(functionContext({ week: 520, breastfeeding: true })).toEqual({ week: 520, breastfeeding: true });
    expect(functionContext({ week: 1070, delivery: "vaginal", breastfeeding: true })).toEqual({ delivery: "vaginal", breastfeeding: true });
    expect(functionContext({ week: 521 })).toBeNull();
    expect(functionContext(null)).toBeNull();
    expect(functionContext(undefined)).toBeNull();
  });
  it("예전 경로 문자열 — iOS 표기(ChatView.swift:189-191)의 세 항목만", () => {
    expect(legacyContextText({ week: 0, delivery: "vaginal", breastfeeding: false })).toBe("산후 0주차, 자연분만, 모유수유 안 함");
    expect(legacyContextText({ breastfeeding: true })).toBe("모유수유 중");
    expect(legacyContextText(null)).toBeNull();
  });
});

describe("functionMessages — 함수 형식 검증을 통과하는 대화", () => {
  const u = (content: string) => ({ role: "user" as const, content });
  const a = (content: string) => ({ role: "assistant" as const, content });

  it("앞쪽 인사말을 빼고, role·content만", () => {
    const withExtra = [a("안녕하세요"), { ...u("질문"), id: 3 }];
    expect(functionMessages(withExtra)).toEqual([u("질문")]);
  });
  it("최근 20개만 — 잘라서 assistant로 시작하면 그것도 뺀다", () => {
    const long = Array.from({ length: 25 }, (_, i) => (i % 2 === 0 ? u(`q${i}`) : a(`a${i}`)));
    const out = functionMessages(long)!;
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out[0].role).toBe("user");
    expect(out.at(-1)).toEqual(u("q24"));
  });
  it("지난 메시지는 2000자에서 자르고, 마지막 질문이 2000자를 넘으면 보내지 않는다(null)", () => {
    const longAnswer = "가".repeat(LLM_FUNCTION_MAX_MESSAGE_CHARS + 50);
    const out = functionMessages([u("q1"), a(longAnswer), u("q2")])!;
    expect(Array.from(out[1].content)).toHaveLength(LLM_FUNCTION_MAX_MESSAGE_CHARS);
    expect(functionMessages([u("가".repeat(LLM_FUNCTION_MAX_MESSAGE_CHARS + 1))])).toBeNull();
    // 한글·이모지는 한 글자로 센다(서버와 같은 코드 포인트 기준)
    expect(functionMessages([u("😀".repeat(LLM_FUNCTION_MAX_MESSAGE_CHARS))])).not.toBeNull();
  });
  it("마지막이 user가 아니거나 질문이 없으면 null", () => {
    expect(functionMessages([u("q"), a("a")])).toBeNull();
    expect(functionMessages([a("hi")])).toBeNull();
    expect(functionMessages([])).toBeNull();
    expect(functionMessages([u("  ")])).toBeNull();
  });
});

describe("parseFunctionReply", () => {
  it("{ ok, text } → text, { ok, json } → JSON 문자열(약물 답은 예전처럼 text 안의 JSON)", () => {
    expect(parseFunctionReply({ ok: true, text: "답" })).toEqual({ ok: true, text: "답" });
    const json = { verdict: "caution", detail: "d", sources: ["LactMed"] };
    expect(parseFunctionReply({ ok: true, json })).toEqual({ ok: true, text: JSON.stringify(json) });
  });
  it("빈 text → empty, 모양이 틀리면 network", () => {
    expect(parseFunctionReply({ ok: true, text: " " })).toMatchObject({ ok: false, kind: "empty" });
    for (const bad of [null, "x", { ok: false, code: "x" }, { ok: true }, { ok: true, json: [1] }, { text: "x" }]) {
      expect(parseFunctionReply(bad)).toMatchObject({ ok: false, kind: "network" });
    }
  });
});

describe("llmComplete — Supabase Edge Function chat", () => {
  const token = async () => "user.jwt";
  const ctx = { week: 3, delivery: "cesarean" as const, breastfeeding: true };

  it("POST {functionsURL}/chat — Authorization·apikey, preset·messages·context만(max_tokens·system 없음)", async () => {
    const fetch = stubFetch(async () => jsonResponse(200, { ok: true, text: "보통 4~6주 정도예요." }));
    const history = [{ role: "assistant" as const, content: "인사말" }, ...ask];
    const res = await llmComplete(
      { preset: "patient_edu", messages: history, context: ctx, maxTokens: 300 },
      { config: supabaseTestConfig, getAccessToken: token },
    );
    const { url, init, headers } = lastCall(fetch);
    expect(url).toBe("https://proj.supabase.test/functions/v1/chat");
    expect(init.method).toBe("POST");
    expect(headers.get("authorization")).toBe("Bearer user.jwt");
    expect(headers.get("apikey")).toBe("sb_publishable_test");
    expect(headers.get("content-type")).toBe("application/json");
    // 예전 백엔드용 앱 키는 Supabase로 보내지 않는다
    expect(headers.has("x-onmom-key")).toBe(false);
    expect(JSON.parse(init.body as string)).toEqual({ preset: "patient_edu", messages: ask, context: ctx });
    expect(init.credentials).toBe("omit");
    expect(res).toEqual({ ok: true, text: "보통 4~6주 정도예요." });
  });

  it("컨텍스트가 없으면 필드를 빼고, 섞인 값은 보내지 않는다", async () => {
    const fetch = stubFetch(async () => jsonResponse(200, { ok: true, text: "ok" }));
    await llmComplete({ preset: "patient_edu", messages: ask }, { config: supabaseTestConfig, getAccessToken: token });
    expect("context" in JSON.parse(lastCall(fetch).init.body as string)).toBe(false);
    const mixed = { ...ctx, bmi: 24.4 } as never;
    await llmComplete({ preset: "patient_edu", messages: ask, context: mixed }, { config: supabaseTestConfig, getAccessToken: token });
    expect(JSON.parse(lastCall(fetch).init.body as string).context).toEqual(ctx);
  });

  it("약물 — { ok, json }을 text(JSON)로", async () => {
    const json = { verdict: "unknown", detail: "근거가 부족해요.", sources: [] };
    stubFetch(async () => jsonResponse(200, { ok: true, json }));
    const res = await llmComplete(
      { preset: "substance", messages: [{ role: "user", content: "모르는약" }], context: { breastfeeding: true }, maxTokens: 512 },
      { config: supabaseTestConfig, getAccessToken: token },
    );
    expect(res).toEqual({ ok: true, text: JSON.stringify(json) });
  });

  it("AI 스위치가 꺼져 있으면 notConfigured — 토큰도 묻지 않고 요청하지 않는다", async () => {
    const fetch = stubFetch(async () => jsonResponse(200, { ok: true, text: "x" }));
    const getAccessToken = vi.fn(token);
    const res = await llmComplete(
      { preset: "patient_edu", messages: ask },
      { config: { ...supabaseTestConfig, aiChatEnabled: false }, getAccessToken },
    );
    expect(res).toMatchObject({ ok: false, kind: "notConfigured" });
    expect(fetch).not.toHaveBeenCalled();
    expect(getAccessToken).not.toHaveBeenCalled();
  });

  it("Supabase 빌드는 예전 NEXT_PUBLIC_LLM_URL을 쓰지 않는다", async () => {
    const fetch = stubFetch(async () => jsonResponse(200, { ok: true, text: "x" }));
    await llmComplete({ preset: "patient_edu", messages: ask }, { config: supabaseTestConfig, getAccessToken: token });
    expect(lastCall(fetch).url.startsWith("https://llm.onmom.test")).toBe(false);
  });

  it("로그인 세션이 없으면 보내지 않고 server(401)", async () => {
    const fetch = stubFetch(async () => jsonResponse(200, { ok: true, text: "x" }));
    for (const getAccessToken of [async () => null, async () => Promise.reject(new Error("storage"))]) {
      const res = await llmComplete({ preset: "patient_edu", messages: ask }, { config: supabaseTestConfig, getAccessToken });
      expect(res).toMatchObject({ ok: false, kind: "server", status: 401 });
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("보낼 질문이 없거나 너무 길면 요청하지 않고 server", async () => {
    const fetch = stubFetch(async () => jsonResponse(200, { ok: true, text: "x" }));
    const tooLong = [{ role: "user" as const, content: "가".repeat(LLM_FUNCTION_MAX_MESSAGE_CHARS + 1) }];
    for (const messages of [[], [{ role: "assistant" as const, content: "hi" }], tooLong]) {
      const res = await llmComplete({ preset: "patient_edu", messages }, { config: supabaseTestConfig, getAccessToken: token });
      expect(res).toMatchObject({ ok: false, kind: "server" });
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([400, 401, 413, 422, 429, 502, 503, 504])("HTTP %i { ok: false, code } → server", async (status) => {
    stubFetch(async () => jsonResponse(status, { ok: false, code: "x" }));
    const res = await llmComplete({ preset: "patient_edu", messages: ask }, { config: supabaseTestConfig, getAccessToken: token });
    expect(res).toMatchObject({ ok: false, kind: "server", status });
  });

  it("연결 실패 → network", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    const res = await llmComplete({ preset: "patient_edu", messages: ask }, { config: supabaseTestConfig, getAccessToken: token });
    expect(res).toMatchObject({ ok: false, kind: "network" });
  });

  it("함수 경로는 60초까지 기다린다(함수가 Anthropic을 50초 기다리므로)", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", hangingFetch());
    let settled = false;
    const p = llmComplete(
      { preset: "substance", messages: [{ role: "user", content: "x" }] },
      { config: supabaseTestConfig, getAccessToken: token },
    ).finally(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(59_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await p).toMatchObject({ ok: false, kind: "network" });
  });
});
