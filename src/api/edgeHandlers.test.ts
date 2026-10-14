// Supabase Edge Function의 요청 처리(supabase/functions/*/handler.ts) — 가짜 로그인·한도·LLM·영상 서버로 확인한다.
// handler는 웹 표준 Request/Response만 써서 Node(vitest)에서도 Deno와 같게 돈다. Deno 연결(index.ts)은 `deno check`로 본다.

import { describe, expect, it } from "vitest";
import { CHAT_MAX_BODY_BYTES, CHAT_MAX_MESSAGE_CHARS, type QuotaResult } from "../../supabase/functions/_shared/chat";
import { SUBSTANCE_OUTPUT_SCHEMA } from "../../supabase/functions/_shared/prompts";
import { CRISIS_REPLY } from "../../supabase/functions/_shared/safety";
import {
  createChatHandler,
  type ChatLogEntry,
  type LlmCallInput,
  type LlmCallResult,
} from "../../supabase/functions/chat/handler";
import { createVideosHandler, type VideosLogEntry } from "../../supabase/functions/videos/handler";

const SITE = "https://5seoyoung.github.io";

describe("Edge Function chat", () => {
  const QUESTION = "오로가 언제까지 나오나요?";
  const usage = { inputTokens: 120, outputTokens: 80, fallback: false };

  interface Options {
    user?: { id: string } | null | "throw";
    quota?: QuotaResult | null | "throw";
    llm?: LlmCallResult;
  }

  function setup(opts: Options = {}) {
    const calls = { verify: [] as string[], quota: [] as string[], llm: [] as LlmCallInput[] };
    const logs: ChatLogEntry[] = [];
    const handler = createChatHandler({
      allowedOrigins: [SITE],
      verifyUser: (token) => {
        calls.verify.push(token);
        if (opts.user === "throw") return Promise.reject(new Error("down"));
        return Promise.resolve(opts.user === undefined ? { id: "user-1" } : opts.user);
      },
      consumeQuota: (id) => {
        calls.quota.push(id);
        if (opts.quota === "throw") return Promise.reject(new Error("db down"));
        return Promise.resolve(opts.quota === undefined ? "ok" : opts.quota);
      },
      complete: (input) => {
        calls.llm.push(input);
        return Promise.resolve(opts.llm ?? { kind: "text", text: "  보통 4~6주 정도 나와요.  ", usage });
      },
      log: (e) => logs.push(e),
    });
    return { handler, calls, logs };
  }

  function post(body: unknown, headers: Record<string, string> = {}) {
    return new Request("https://proj.supabase.co/functions/v1/chat", {
      method: "POST",
      headers: { Origin: SITE, Authorization: "Bearer user.jwt.token", "Content-Type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  }

  const ask = (content = QUESTION, extra: Record<string, unknown> = {}) => ({
    preset: "patient_edu",
    messages: [{ role: "user", content }],
    ...extra,
  });

  it("정상 — 로그인 확인 → 한도 → LLM, 답은 앞뒤 공백을 다듬어 { ok, text }", async () => {
    const { handler, calls, logs } = setup();
    const res = await handler(post(ask(QUESTION, { context: { week: 3, delivery: "cesarean", breastfeeding: true } })));
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe(SITE);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true, text: "보통 4~6주 정도 나와요." });
    expect(calls.verify).toEqual(["user.jwt.token"]);
    expect(calls.quota).toEqual(["user-1"]);
    expect(calls.llm).toHaveLength(1);
    const input = calls.llm[0];
    expect(input.preset).toBe("patient_edu");
    expect(input.jsonSchema).toBeNull();
    expect(input.messages).toEqual([{ role: "user", content: QUESTION }]);
    expect(input.system).toHaveLength(2);
    expect(input.system[1]).toBe("사용자 정보(설명을 맞추는 참고용): 산후 3주차, 제왕절개, 모유수유 중");
    // 로그에는 질문·답·컨텍스트·사용자 id가 없다
    const logged = JSON.stringify(logs);
    for (const secret of ["오로", "4~6주", "user-1", "제왕", "user.jwt"]) expect(logged).not.toContain(secret);
    expect(logs).toEqual([
      { fn: "chat", status: 200, ms: logs[0].ms, preset: "patient_edu", input_tokens: 120, output_tokens: 80, fallback: false },
    ]);
  });

  it("약물 — structured outputs 형식을 붙이고, 검증한 JSON을 { ok, json }으로", async () => {
    const { handler, calls } = setup({
      llm: { kind: "text", text: '{"verdict":"caution","detail":"근거가 제한적이에요.","sources":["LactMed","https://x.example"]}', usage },
    });
    const res = await handler(
      post({ preset: "substance", messages: [{ role: "user", content: "모르는약" }], context: { week: 5, breastfeeding: true } }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, json: { verdict: "caution", detail: "근거가 제한적이에요.", sources: ["LactMed"] } });
    expect(calls.llm[0].jsonSchema).toBe(SUBSTANCE_OUTPUT_SCHEMA);
  });

  it("약물 답 형식이 틀리면 502 bad_output", async () => {
    const { handler } = setup({ llm: { kind: "text", text: '{"verdict":"maybe","detail":"x","sources":[]}', usage } });
    const res = await handler(post({ preset: "substance", messages: [{ role: "user", content: "모르는약" }] }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, code: "bad_output" });
  });

  it("자해 표현 — 로그인·한도·LLM 없이 고정 위기 안내", async () => {
    const { handler, calls, logs } = setup({ user: null });
    const res = await handler(post(ask("요즘 죽고 싶어요"), { Authorization: "" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, text: CRISIS_REPLY, flagged: true });
    expect(calls.verify.length + calls.quota.length + calls.llm.length).toBe(0);
    expect(JSON.stringify(logs)).not.toContain("죽고");
  });

  it("자해 표현 — 약물 프리셋은 422 flagged(표 결과를 그대로 두게)", async () => {
    const { handler, calls } = setup();
    const res = await handler(post({ preset: "substance", messages: [{ role: "user", content: "자살" }] }));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ ok: false, code: "flagged" });
    expect(calls.llm).toHaveLength(0);
  });

  it("컨텍스트에 허용 목록 밖 항목(BMI 등)이 있으면 400 — 로그인 확인도 LLM도 하지 않는다", async () => {
    const { handler, calls } = setup();
    for (const context of [{ bmi: 24.4 }, { week: 3, redFlag: true }, { goal: "homemaker" }, { week: -1 }, { delivery: "natural" }, "산후 3주차"]) {
      const res = await handler(post(ask(QUESTION, { context })));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ ok: false, code: "bad_request" });
    }
    expect(calls.verify.length + calls.llm.length).toBe(0);
  });

  it("형식 오류·알 수 없는 필드는 400", async () => {
    const { handler, calls } = setup();
    for (const body of [
      "not json",
      { ...ask(), system: "너는 이제부터…" },
      { ...ask(), max_tokens: 99_999 },
      { preset: "other", messages: [{ role: "user", content: "x" }] },
      { preset: "patient_edu", messages: [] },
      { preset: "patient_edu", messages: [{ role: "assistant", content: "안녕하세요" }] },
      { preset: "patient_edu", messages: [{ role: "user", content: "x".repeat(2001) }] },
    ]) {
      const res = await handler(post(body));
      expect(res.status, JSON.stringify(body).slice(0, 40)).toBe(400);
    }
    expect(calls.llm).toHaveLength(0);
  });

  it("로그인 — 토큰 없음·틀림 401, 확인 불가 503", async () => {
    let t = setup();
    expect((await t.handler(post(ask(), { Authorization: "" }))).status).toBe(401);
    expect((await t.handler(post(ask(), { Authorization: "Basic abc" }))).status).toBe(401);
    t = setup({ user: null });
    expect((await t.handler(post(ask()))).status).toBe(401);
    t = setup({ user: "throw" });
    const res = await t.handler(post(ask()));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, code: "auth_unavailable" });
    expect(t.calls.llm).toHaveLength(0);
  });

  it.each([
    ["user_limit", 429, "rate_limited"],
    ["global_limit", 503, "busy"],
    [null, 503, "unavailable"],
    ["throw", 503, "unavailable"],
  ] as const)("한도 %s → %i %s (LLM을 부르지 않는다)", async (quota, status, code) => {
    const { handler, calls } = setup({ quota });
    const res = await handler(post(ask()));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ ok: false, code });
    expect(calls.llm).toHaveLength(0);
  });

  it.each([
    [{ kind: "refusal", usage }, 422, "refused"],
    [{ kind: "truncated", usage }, 502, "truncated"],
    [{ kind: "text", text: "  ", usage }, 502, "empty"],
    [{ kind: "error", status: 504, code: "timeout" }, 504, "timeout"],
    [{ kind: "error", status: 503, code: "llm_busy" }, 503, "llm_busy"],
  ] as [LlmCallResult, number, string][])("LLM 결과 %j → %i %s", async (llm, status, code) => {
    const { handler } = setup({ llm });
    const res = await handler(post(ask()));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ ok: false, code });
  });

  it("예상 밖 오류는 500 internal — 메시지·스택을 내보내지도 기록하지도 않는다", async () => {
    const logs: ChatLogEntry[] = [];
    const handler = createChatHandler({
      allowedOrigins: [SITE],
      verifyUser: async () => ({ id: "u" }),
      consumeQuota: async () => "ok",
      complete: async () => {
        throw new Error("secret internals at stack");
      },
      log: (e) => logs.push(e),
    });
    const res = await handler(post(ask()));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ ok: false, code: "internal" });
    expect(text + JSON.stringify(logs)).not.toContain("secret");
  });

  it("CORS — 허용 밖 origin 403, preflight 204, 너무 큰 본문 413, GET 405", async () => {
    const { handler, calls } = setup();
    const denied = await handler(post(ask(), { Origin: "https://evil.example" }));
    expect(denied.status).toBe(403);
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();

    const pre = await handler(new Request("https://proj.supabase.co/functions/v1/chat", { method: "OPTIONS", headers: { Origin: SITE } }));
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
    expect(pre.headers.get("access-control-allow-headers")).toContain("authorization");

    const big = await handler(post(ask("가".repeat(300_000))));
    expect(big.status).toBe(413);

    const get = await handler(new Request("https://proj.supabase.co/functions/v1/chat", { headers: { Origin: SITE } }));
    expect(get.status).toBe(405);
    expect(get.headers.get("allow")).toBe("POST, OPTIONS");
    expect(calls.llm).toHaveLength(0);
  });

  const CHUNK = 64 * 1024;
  /** 상한의 8배(2MB)를 64KB씩 — 다 읽었다면 read.bytes가 상한을 한참 넘는다 */
  const HUGE = Array.from({ length: (8 * CHAT_MAX_BODY_BYTES) / CHUNK }, () => new Uint8Array(CHUNK).fill(0x20));

  /** Content-Length 없이(청크 전송처럼) 조각으로 오는 본문. 읽힌 바이트 수·취소 여부를 센다. */
  function streamed(chunks: Uint8Array[], headers: Record<string, string> = {}) {
    const read = { bytes: 0, cancelled: false };
    let i = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = chunks[i++];
        if (chunk === undefined) return controller.close();
        read.bytes += chunk.byteLength;
        controller.enqueue(chunk);
      },
      cancel() {
        read.cancelled = true;
      },
    });
    const req = new Request("https://proj.supabase.co/functions/v1/chat", {
      method: "POST",
      headers: { Origin: SITE, Authorization: "Bearer user.jwt.token", "Content-Type": "application/json", ...headers },
      body,
      duplex: "half",
    } as RequestInit);
    return { req, read };
  }

  it("Content-Length가 없어도 상한(CHAT_MAX_BODY_BYTES)까지만 읽고 413 too_large — 큰 본문을 끝까지 모으지 않는다", async () => {
    const { handler, calls, logs } = setup();
    expect(new Request("https://x.example", { method: "POST", body: "{}" }).headers.get("content-length")).toBeNull(); // 시험 전제
    const { req, read } = streamed(HUGE);
    expect(req.headers.get("content-length")).toBeNull();
    const res = await handler(req);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ ok: false, code: "too_large" });
    expect(read.cancelled).toBe(true);
    // 상한을 넘긴 조각에서 멈춘다(스트림이 미리 당겨 둔 조각 몇 개 정도만 더 읽힐 수 있다)
    expect(read.bytes).toBeLessThanOrEqual(CHAT_MAX_BODY_BYTES + 4 * CHUNK);
    expect(calls.verify.length + calls.quota.length + calls.llm.length).toBe(0);
    expect(logs.map((l) => l.code)).toEqual(["too_large"]);
  });

  it("Content-Length를 작게 적고 더 보내도 413 — 적힌 값이 아니라 읽은 바이트로 센다", async () => {
    const { handler, calls } = setup();
    const { req, read } = streamed(HUGE, { "Content-Length": "100" });
    expect(req.headers.get("content-length")).toBe("100");
    expect((await handler(req)).status).toBe(413);
    expect(read.bytes).toBeLessThanOrEqual(CHAT_MAX_BODY_BYTES + 4 * CHUNK);
    expect(calls.llm).toHaveLength(0);
  });

  it("적힌 Content-Length가 상한보다 크면 본문을 읽지 않고 413", async () => {
    const { handler } = setup();
    const { req, read } = streamed(HUGE, { "Content-Length": String(CHAT_MAX_BODY_BYTES + 1) });
    expect((await handler(req)).status).toBe(413);
    expect(read.bytes).toBeLessThanOrEqual(4 * CHUNK); // 스트림이 미리 당겨 둔 조각뿐
  });

  it("상한 안의 본문은 조각으로 와도(Content-Length 없음) 그대로 처리한다 — 여러 바이트 글자가 조각 경계에 걸려도", async () => {
    const { handler, calls } = setup();
    const bytes = new TextEncoder().encode(JSON.stringify(ask("오로가 언제까지 나오나요? ".repeat(40).trim())));
    const exact = new TextEncoder().encode(JSON.stringify(ask("가".repeat(CHAT_MAX_MESSAGE_CHARS))));
    // 한글(3바이트) 가운데에서 자른다
    const cut = bytes.indexOf(0xec) + 1;
    const { req } = streamed([bytes.slice(0, cut), bytes.slice(cut)]);
    const res = await handler(req);
    expect(res.status).toBe(200);
    expect(calls.llm[0].messages[0].content).toBe("오로가 언제까지 나오나요? ".repeat(40).trim());
    // 상한 이하 큰 본문(2000자 × 3바이트)도 받는다
    expect(exact.byteLength).toBeLessThan(CHAT_MAX_BODY_BYTES);
    const big = streamed([exact.slice(0, 1000), exact.slice(1000)]);
    expect((await handler(big.req)).status).toBe(200);
    expect(big.read.cancelled).toBe(false);
  });

  it("빈 본문은 400 bad_request(413 아님)", async () => {
    const { handler } = setup();
    const { req } = streamed([]);
    const res = await handler(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, code: "bad_request" });
  });

  it("자해 표현 — 마지막이 아닌 앞선 사용자 메시지에 있어도 LLM 없이 고정 위기 안내", async () => {
    const { handler, calls, logs } = setup();
    const res = await handler(
      post({
        preset: "patient_edu",
        messages: [
          { role: "user", content: "요즘 죽고 싶어요" },
          { role: "assistant", content: "그 말씀을 들으니 걱정돼요." },
          { role: "user", content: "오로가 언제까지 나오나요?" },
        ],
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, text: CRISIS_REPLY, flagged: true });
    expect(calls.verify.length + calls.quota.length + calls.llm.length).toBe(0);
    expect(logs.map((l) => l.code)).toEqual(["flagged"]);
    expect(JSON.stringify(logs)).not.toContain("죽고");

    // 가운데 사용자 메시지도 본다
    const middle = await handler(
      post({
        preset: "patient_edu",
        messages: [
          { role: "user", content: "산후 3주차예요" },
          { role: "assistant", content: "네." },
          { role: "user", content: "self-harm 생각이 들어요" },
          { role: "assistant", content: "네." },
          { role: "user", content: "커피 마셔도 되나요?" },
        ],
      }),
    );
    expect(await middle.json()).toEqual({ ok: true, text: CRISIS_REPLY, flagged: true });
    expect(calls.llm).toHaveLength(0);
  });

  it("어시스턴트 메시지는 선필터가 보지 않는다 — 앱의 위기 안내 글(\"자살예방상담\")이 대화에 남아 있어도 다음 질문은 LLM으로", async () => {
    const { handler, calls } = setup();
    const res = await handler(
      post({
        preset: "patient_edu",
        messages: [
          { role: "user", content: "산후 우울이 걱정돼요" },
          { role: "assistant", content: CRISIS_REPLY },
          { role: "user", content: "오로가 언제까지 나오나요?" },
        ],
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, text: "보통 4~6주 정도 나와요." });
    expect(calls.llm).toHaveLength(1);
  });
});

describe("Edge Function videos", () => {
  const video = {
    video_id: "vd_kegel_basic",
    title: "케겔 운동 기초",
    url: "https://www.youtube.com/watch?v=abc",
    description: "골반저근 수축·이완 기본 동작",
    tags: ["route_vaginal_delivery", "kegel"],
    internal_note: "업스트림에만 있는 필드",
  };

  function setup(upstream: (url: string, init: RequestInit) => Promise<Response>) {
    const calls: { url: string; init: RequestInit }[] = [];
    const logs: VideosLogEntry[] = [];
    const handler = createVideosHandler({
      allowedOrigins: [SITE, "http://localhost:3000"],
      upstreamBaseUrl: "https://video.example.test",
      timeoutMs: 1000,
      fetch: (url, init) => {
        calls.push({ url, init });
        return upstream(url, init);
      },
      log: (e) => logs.push(e),
    });
    return { handler, calls, logs };
  }

  const ok = () => Promise.resolve(Response.json({ count: 1, videos: [video] }));
  const get = (query: string, origin: string | null = SITE, method = "GET") =>
    new Request(`https://proj.supabase.co/functions/v1/videos${query}`, {
      method,
      headers: origin ? { Origin: origin, apikey: "sb_publishable_x" } : {},
    });

  it("preflight — 허용 origin이면 204 + 메서드·헤더, 업스트림을 부르지 않는다", async () => {
    const { handler, calls } = setup(ok);
    const res = await handler(get("", SITE, "OPTIONS"));
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(SITE);
    expect(res.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
    expect(res.headers.get("access-control-allow-headers")).toContain("apikey");
    expect(calls).toHaveLength(0);
  });

  it("허용 목록 밖 origin은 403 — 업스트림을 부르지 않고 Allow-Origin도 없다", async () => {
    const { handler, calls } = setup(ok);
    for (const method of ["OPTIONS", "GET"]) {
      const res = await handler(get("?include=route_vaginal_delivery&limit=500", "https://evil.example", method));
      expect(res.status).toBe(403);
      expect(res.headers.get("access-control-allow-origin")).toBeNull();
    }
    expect(calls).toHaveLength(0);
  });

  it("GET — 업스트림 주소(시간 제한 signal 포함), 알려진 필드만, 캐시·CORS 헤더", async () => {
    const { handler, calls, logs } = setup(ok);
    const res = await handler(get("?include=route_cesarean_section&limit=500"));
    expect(res.status).toBe(200);
    expect(calls.map((c) => c.url)).toEqual(["https://video.example.test/videos?include=route_cesarean_section&limit=500"]);
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
    expect(res.headers.get("access-control-allow-origin")).toBe(SITE);
    expect(res.headers.get("vary")).toBe("Origin");
    expect(res.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=600");
    const { internal_note: dropped, ...expected } = video;
    expect(dropped).toBeTruthy();
    expect(await res.json()).toEqual({ count: 1, videos: [expected] });
    // 로그에 분만 경로 태그(= 사용자의 분만 방식)가 남지 않는다
    expect(JSON.stringify(logs)).not.toContain("route_");
  });

  it("limit이 없으면 500, origin 없는 요청(서버·curl)도 받는다", async () => {
    const { handler, calls } = setup(ok);
    const res = await handler(get("?include=route_vaginal_delivery", null));
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    expect(calls.map((c) => c.url)).toEqual(["https://video.example.test/videos?include=route_vaginal_delivery&limit=500"]);
  });

  it("잘못된 요청은 400 — 업스트림을 부르지 않는다", async () => {
    const { handler, calls } = setup(ok);
    for (const q of [
      "",
      "?include=stage_pelvic_floor",
      "?include=route_vaginal_delivery&include=route_cesarean_section",
      "?include=route_vaginal_delivery&limit=501",
      "?include=route_vaginal_delivery&limit=0",
      "?include=route_vaginal_delivery&exclude=x",
    ]) {
      const res = await handler(get(q));
      expect(res.status, q).toBe(400);
      expect(await res.json()).toEqual({ ok: false, code: "bad_request" });
    }
    expect(calls).toHaveLength(0);
  });

  it("GET 외 메서드는 405", async () => {
    const { handler } = setup(ok);
    const res = await handler(get("?include=route_vaginal_delivery", SITE, "POST"));
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET, OPTIONS");
  });

  it("영상 서버 주소 설정이 틀리면(https 아님) 500 not_configured — 부르지 않는다", async () => {
    const handler = createVideosHandler({
      allowedOrigins: [SITE],
      upstreamBaseUrl: "http://video.example.test",
      timeoutMs: 1000,
      fetch: () => Promise.reject(new Error("should not be called")),
      log: () => {},
    });
    const res = await handler(get("?include=route_vaginal_delivery"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, code: "not_configured" });
  });

  it.each([
    [() => Promise.resolve(new Response("Traceback: secret internals", { status: 500 })), "upstream_error"],
    [() => Promise.reject(new DOMException("timed out", "TimeoutError")), "upstream_timeout"],
    [() => Promise.reject(new TypeError("connection refused")), "upstream_unreachable"],
    [() => Promise.resolve(new Response("<html>", { status: 200 })), "upstream_bad_response"],
    [() => Promise.resolve(Response.json({ count: 1, videos: [{ ...video, tags: "x" }] })), "upstream_bad_response"],
  ] as [() => Promise<Response>, string][])("업스트림 실패 → 502 %s, 본문을 내보내지 않는다(#%#)", async (upstream, code) => {
    const { handler } = setup(upstream);
    const res = await handler(get("?include=route_vaginal_delivery"));
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ ok: false, code });
    expect(text).not.toContain("Traceback");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("access-control-allow-origin")).toBe(SITE);
  });
});
