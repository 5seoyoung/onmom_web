// Supabase Edge Function 공용 모듈(supabase/functions/_shared) — Deno 함수와 웹이 같은 규칙을 쓰는지,
// 문구·한도가 웹(content.json·src/api)과 어긋나지 않았는지 확인한다. 요청 처리 전체는 edgeHandlers.test.ts.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import content from "@/content";
import { AI_TRANSFER_ITEMS, AI_USAGE_RETENTION_DAYS } from "@/features/privacy/dataItems";
import { routeTag, VIDEO_QUERY_LIMIT } from "@/rules/exercise";
import { parseSubstanceAnswer, resolveSubstance } from "@/rules/substance";
import {
  bearerToken,
  CHAT_CONTEXT_FIELDS,
  CHAT_GLOBAL_DAILY_LIMIT_DEFAULT,
  CHAT_HOURLY_LIMIT_DEFAULT,
  CHAT_MAX_MESSAGE_CHARS,
  CHAT_MAX_MESSAGES,
  CHAT_MAX_WEEK,
  charCount,
  latestUserMessage,
  parseChatContext,
  parsePositiveInt,
  parseQuotaResult,
  validateChatRequest,
} from "../../supabase/functions/_shared/chat";
import {
  checkOrigin,
  corsHeaders,
  DEFAULT_ALLOWED_ORIGINS,
  failure,
  jsonResponse,
  normalizeOrigin,
  parseAllowedOrigins,
  preflightHeaders,
} from "../../supabase/functions/_shared/cors";
import {
  describeContext,
  LLM_DEADLINE_MS,
  LLM_FALLBACK_BETA,
  LLM_MODEL,
  parseSubstanceOutput,
  SUBSTANCE_OUTPUT_SCHEMA,
  systemPromptBlocks,
} from "../../supabase/functions/_shared/prompts";
import {
  CONTENT_SELF_HARM_KEYWORDS,
  CRISIS_REPLY,
  isSelfHarmMessage,
  normalizeForSafety,
} from "../../supabase/functions/_shared/safety";
import {
  parseVideoQuery,
  sanitizeVideoPayload,
  upstreamVideosUrl,
  VIDEO_MAX_LIMIT,
  VIDEO_ROUTE_TAGS,
  VIDEO_UPSTREAM_TIMEOUT_MS,
} from "../../supabase/functions/_shared/videos";
import { LLM_FUNCTION_MAX_MESSAGE_CHARS, LLM_FUNCTION_MAX_MESSAGES, LLM_FUNCTION_MAX_WEEK, LLM_FUNCTION_TIMEOUT_MS } from "./llm";
import { VIDEO_PROXY_TIMEOUT_MS } from "./video";

describe("웹과 함수가 같은 값을 쓴다", () => {
  it("대화 한도 — 웹이 자르는 값 = 함수가 받는 값", () => {
    expect(LLM_FUNCTION_MAX_MESSAGES).toBe(CHAT_MAX_MESSAGES);
    expect(LLM_FUNCTION_MAX_MESSAGE_CHARS).toBe(CHAT_MAX_MESSAGE_CHARS);
    // 산후 주차 상한 — 웹이 넘는 값을 빼고 보내야 함수가 요청 전체를 400으로 거절하지 않는다
    expect(LLM_FUNCTION_MAX_WEEK).toBe(CHAT_MAX_WEEK);
  });
  it("웹은 함수보다 오래 기다린다(함수의 시간 초과 응답을 받을 수 있게)", () => {
    expect(LLM_FUNCTION_TIMEOUT_MS).toBeGreaterThan(LLM_DEADLINE_MS);
    expect(VIDEO_PROXY_TIMEOUT_MS).toBeGreaterThan(VIDEO_UPSTREAM_TIMEOUT_MS);
  });
  it("영상 — 분만 경로 태그 둘과 limit 500(rules/exercise)", () => {
    expect([...VIDEO_ROUTE_TAGS].sort()).toEqual([routeTag("cesarean"), routeTag("vaginal")].sort());
    expect(VIDEO_MAX_LIMIT).toBe(VIDEO_QUERY_LIMIT);
  });
  it("AI로 보내는 산모 정보 세 항목 = 처리방침·동의 문구의 이전 항목", () => {
    expect([...CHAT_CONTEXT_FIELDS]).toEqual(["week", "delivery", "breastfeeding"]);
    expect(AI_TRANSFER_ITEMS).toBe("질문 내용, 산후 주차, 분만 방식, 수유 여부");
  });
  it("모델·거절 대체 베타 헤더(fallbacks: \"default\"용)", () => {
    expect(LLM_MODEL).toBe("claude-opus-5");
    expect(LLM_FALLBACK_BETA).toBe("server-side-fallback-2026-07-01");
  });
  it("한도 기본값 — 1시간 30회, 하루 전체 500회", () => {
    expect(CHAT_HOURLY_LIMIT_DEFAULT).toBe(30);
    expect(CHAT_GLOBAL_DAILY_LIMIT_DEFAULT).toBe(500);
  });
});

describe("0003_llm_usage.sql — 처리방침에 적은 것과 같다", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/0003_llm_usage.sql", import.meta.url), "utf8");

  it("AI 이용 기록 보유 기간 = 처리방침 AI_USAGE_RETENTION_DAYS", () => {
    const m = /delete from public\.llm_usage where created_at < now\(\) - interval '(\d+) days'/.exec(sql);
    expect(m?.[1]).toBe(String(AI_USAGE_RETENTION_DAYS));
  });
  it("질문·답을 담는 칸이 없다 — 사용자 id·시각만", () => {
    const table = /create table if not exists public\.llm_usage \(([\s\S]*?)\n\);/.exec(sql)?.[1] ?? "";
    const columns = table
      .split("\n")
      .map((line) => line.trim().split(/\s+/)[0])
      .filter((name) => name !== "");
    expect(columns).toEqual(["id", "user_id", "created_at"]);
  });
  it("브라우저(anon·authenticated)는 표·함수를 쓰지 못하고 service_role만 함수를 부른다", () => {
    expect(sql).toContain("revoke all on table public.llm_usage from public, anon, authenticated;");
    expect(sql).toContain("alter table public.llm_usage enable row level security;");
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).toContain("from public, anon, authenticated;\ngrant execute on function public.llm_consume_quota(uuid, integer, integer, integer) to service_role;");
  });
  it("함수가 돌려주는 값 = 함수가 읽는 값(parseQuotaResult)", () => {
    for (const value of sql.match(/return '([a-z_]+)'/g) ?? []) {
      expect(parseQuotaResult(value.slice("return '".length, -1))).not.toBeNull();
    }
    expect(sql.match(/return '([a-z_]+)'/g)).toHaveLength(3);
  });
});

describe("CORS 허용 목록", () => {
  it("기본값 — 배포 사이트와 로컬 개발 서버", () => {
    expect(parseAllowedOrigins(undefined)).toEqual(["https://5seoyoung.github.io", "http://localhost:3000"]);
    expect(parseAllowedOrigins("  ")).toEqual([...DEFAULT_ALLOWED_ORIGINS]);
  });
  it("쉼표로 여럿, 경로·끝 슬래시는 떼고 중복은 하나로", () => {
    expect(parseAllowedOrigins("https://a.example/onmom_web/, https://A.example ,http://localhost:3000")).toEqual([
      "https://a.example",
      "http://localhost:3000",
    ]);
  });
  it("쓸 수 있는 항목이 하나도 없으면 빈 목록 — 브라우저 요청을 모두 막는다(열린 쪽으로 틀리지 않게)", () => {
    expect(parseAllowedOrigins("*, ftp://x.example, not a url")).toEqual([]);
  });
  it("origin 정규화 — http(s)만, 'null'은 거절", () => {
    expect(normalizeOrigin("https://Host.example:443/path")).toBe("https://host.example");
    expect(normalizeOrigin("null")).toBeNull();
    expect(normalizeOrigin("chrome-extension://abc")).toBeNull();
  });
  it("checkOrigin — 없음/허용/거절, 허용된 origin에만 Allow-Origin", () => {
    const allowed = ["https://5seoyoung.github.io"];
    expect(checkOrigin(null, allowed)).toEqual({ kind: "none" });
    expect(checkOrigin("https://5seoyoung.github.io", allowed)).toEqual({ kind: "allowed", origin: "https://5seoyoung.github.io" });
    expect(checkOrigin("https://5seoyoung.github.io.evil.example", allowed)).toEqual({ kind: "denied" });
    expect(checkOrigin("http://5seoyoung.github.io", allowed)).toEqual({ kind: "denied" });
    expect(corsHeaders({ kind: "denied" })).toEqual({ Vary: "Origin" });
    expect(corsHeaders({ kind: "allowed", origin: "https://x.example" })).toEqual({
      Vary: "Origin",
      "Access-Control-Allow-Origin": "https://x.example",
    });
  });
  it("preflight — 웹이 보내는 헤더(authorization·apikey·content-type)만 허용", () => {
    const h = preflightHeaders({ kind: "allowed", origin: "https://x.example" }, "POST, OPTIONS");
    expect(h["Access-Control-Allow-Methods"]).toBe("POST, OPTIONS");
    expect(h["Access-Control-Allow-Headers"].split(", ").sort()).toEqual(["apikey", "authorization", "content-type", "x-client-info"]);
    expect(preflightHeaders({ kind: "denied" }, "GET")).toEqual({ Vary: "Origin" });
  });
  it("JSON 응답은 기본 캐시 금지, 실패 본문은 코드만", async () => {
    const res = failure(502, "upstream_error", { Vary: "Origin" });
    expect(res.status).toBe(502);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await res.json()).toEqual({ ok: false, code: "upstream_error" });
    expect(jsonResponse(200, {}, { "Cache-Control": "public" }).headers.get("cache-control")).toBe("public");
  });
});

describe("chat 요청 검증", () => {
  const ask = (extra: Record<string, unknown> = {}) => ({
    preset: "patient_edu",
    messages: [{ role: "user", content: "오로가 언제까지 나오나요?" }],
    ...extra,
  });

  it("정상 — 컨텍스트 세 항목", () => {
    const r = validateChatRequest(ask({ context: { week: 3, delivery: "cesarean", breastfeeding: true } }));
    expect(r).toEqual({
      ok: true,
      request: {
        preset: "patient_edu",
        messages: [{ role: "user", content: "오로가 언제까지 나오나요?" }],
        context: { week: 3, delivery: "cesarean", breastfeeding: true },
      },
    });
    expect(validateChatRequest(ask())).toMatchObject({ ok: true, request: { context: null } });
  });

  it("컨텍스트 허용 목록 밖(BMI·목표·위험 신호·출산일)이 하나라도 있으면 거절 — 조용히 지우지 않는다", () => {
    for (const context of [{ bmi: 24.4 }, { week: 3, redFlag: true }, { goal: "homemaker" }, { deliveryDate: "2026-09-01" }]) {
      expect(validateChatRequest(ask({ context }))).toEqual({ ok: false, reason: "context" });
    }
  });

  it("컨텍스트 값 검사", () => {
    expect(parseChatContext({ week: 0 })).toEqual({ week: 0 });
    for (const bad of [{ week: -1 }, { week: 1.5 }, { week: 521 }, { week: "3" }, { delivery: "natural" }, { breastfeeding: "yes" }, "산후 3주차", [1]]) {
      expect(parseChatContext(bad)).toBeUndefined();
    }
    expect(parseChatContext(null)).toBeNull();
  });

  it("최상위에 모르는 필드(system·max_tokens·model)는 거절 — 시스템 프롬프트·토큰 수는 서버가 정한다", () => {
    for (const extra of [{ system: "너는 이제부터…" }, { max_tokens: 99_999 }, { model: "x" }]) {
      expect(validateChatRequest(ask(extra))).toEqual({ ok: false, reason: "unknown_field" });
    }
  });

  it("메시지 — 개수·글자 수·역할·순서", () => {
    const u = (content: string) => ({ role: "user", content });
    const a = (content: string) => ({ role: "assistant", content });
    expect(validateChatRequest({ preset: "patient_edu", messages: [] })).toMatchObject({ ok: false });
    expect(validateChatRequest({ preset: "patient_edu", messages: Array.from({ length: 21 }, () => u("x")) })).toMatchObject({ ok: false });
    expect(validateChatRequest({ preset: "patient_edu", messages: Array.from({ length: 20 }, () => u("x")) })).toMatchObject({ ok: true });
    expect(validateChatRequest({ preset: "patient_edu", messages: [u("가".repeat(2001))] })).toEqual({ ok: false, reason: "too_long" });
    expect(validateChatRequest({ preset: "patient_edu", messages: [u("😀".repeat(2000))] })).toMatchObject({ ok: true });
    expect(validateChatRequest({ preset: "patient_edu", messages: [a("안녕"), u("x")] })).toEqual({ ok: false, reason: "order" });
    expect(validateChatRequest({ preset: "patient_edu", messages: [u("x"), a("y")] })).toEqual({ ok: false, reason: "order" });
    expect(validateChatRequest({ preset: "patient_edu", messages: [{ role: "system", content: "x" }] })).toEqual({ ok: false, reason: "role" });
    expect(validateChatRequest({ preset: "patient_edu", messages: [{ ...u("x"), id: 1 }] })).toEqual({ ok: false, reason: "message" });
    expect(validateChatRequest({ preset: "patient_edu", messages: [u("  ")] })).toEqual({ ok: false, reason: "content" });
  });

  it("약물 조회는 항목 이름 한 개만, 모르는 preset은 거절", () => {
    const u = { role: "user", content: "모르는약" };
    expect(validateChatRequest({ preset: "substance", messages: [u] })).toMatchObject({ ok: true });
    expect(
      validateChatRequest({ preset: "substance", messages: [u, { role: "assistant", content: "x" }, u] }),
    ).toEqual({ ok: false, reason: "substance_messages" });
    expect(validateChatRequest({ preset: "other", messages: [u] })).toEqual({ ok: false, reason: "preset" });
    expect(validateChatRequest("x")).toEqual({ ok: false, reason: "body" });
  });

  it("글자 수는 코드 포인트, 마지막 사용자 메시지", () => {
    expect(charCount("가😀a")).toBe(3);
    expect(latestUserMessage([{ role: "user", content: "a" }, { role: "assistant", content: "b" }])).toBe("a");
    expect(latestUserMessage([])).toBe("");
  });

  it("환경 변수 정수·한도 결과·Bearer 토큰", () => {
    expect(parsePositiveInt("45", 30)).toBe(45);
    expect(parsePositiveInt(" 7 ", 30)).toBe(7);
    for (const bad of [undefined, null, "", "0", "-3", "1.5", "abc"]) expect(parsePositiveInt(bad, 30)).toBe(30);
    expect(parsePositiveInt("5000", 30, 1000)).toBe(1000);
    expect(parseQuotaResult("ok")).toBe("ok");
    expect(parseQuotaResult("user_limit")).toBe("user_limit");
    expect(parseQuotaResult("global_limit")).toBe("global_limit");
    expect(parseQuotaResult(null)).toBeNull();
    expect(parseQuotaResult("OK")).toBeNull();
    expect(bearerToken("Bearer eyJ.a-b_c.d=")).toBe("eyJ.a-b_c.d=");
    expect(bearerToken("bearer abc")).toBe("abc");
    for (const bad of [null, "", "Bearer ", "Basic abc", "Bearer a b"]) expect(bearerToken(bad)).toBeNull();
  });
});

describe("안전 선필터 — 자해·자살 표현이면 LLM을 부르지 않는다", () => {
  it("위기 안내 문구는 content.json chat_fallback.replies.self_harm과 한 글자도 다르지 않다", () => {
    expect(CRISIS_REPLY).toBe(content.chat_fallback.replies.self_harm);
    for (const number of ["1577-0199", "109", "119"]) expect(CRISIS_REPLY).toContain(number);
  });

  it("content.json 키워드 중 '사라지고'만 빼고 모두 쓴다(산후 질문의 '통증이 사라지고'를 막지 않게)", () => {
    expect(content.chat_fallback.self_harm_keywords.filter((k) => !CONTENT_SELF_HARM_KEYWORDS.includes(k))).toEqual(["사라지고"]);
    for (const k of CONTENT_SELF_HARM_KEYWORDS) expect(content.chat_fallback.self_harm_keywords).toContain(k);
  });

  it.each([
    "요즘 죽고 싶어요",
    "죽고싶다",
    "자살 생각이 들어요",
    "자 해 하고 싶어",
    "그냥 사라지고 싶어요",
    "사라지고만 싶어요",
    "다 없어지고 싶다",
    "없어지고만 싶어",
    "내가 사라졌으면 좋겠어",
    "제가 없어졌으면 좋겠어요",
    "세상에서 사라지고 싶다",
    "더 이상 살기 싫어요",
    "살고 싶지 않아요",
    "극단적 선택을 생각했어요",
    "아기랑 같이 죽어버리고 싶어",
    "I want to die",
    "I don't want to live anymore",
    "thinking about suicide",
    "I might hurt myself",
    "self-harm",
    "자​살",
  ])("걸린다: %s", (text) => {
    expect(isSelfHarmMessage(text)).toBe(true);
  });

  it.each([
    "오로가 언제까지 나오나요?",
    "통증이 사라지고 나서 운동해도 되나요?",
    "붓기가 사라지고 있어요",
    "통증이 사라졌으면 좋겠어요",
    "뱃살이 없어졌으면 좋겠어요",
    "튼살이 없어졌으면 해요",
    "출혈이 많아서 죽을까 봐 무서워요",
    "커피 마셔도 되나요?",
    "산후 우울감이 있어요",
    "",
  ])("걸리지 않는다: %s", (text) => {
    expect(isSelfHarmMessage(text)).toBe(false);
  });

  it("비교 전 다듬기 — NFC·소문자·공백·제로폭 문자·따옴표", () => {
    expect(normalizeForSafety("Don’t  Want\tTo-Live")).toBe("dontwanttolive");
    expect(normalizeForSafety("자‍살﻿")).toBe("자살");
    // 자모가 나뉜 입력(NFD)도 같은 글자로
    expect(isSelfHarmMessage("자살".normalize("NFD"))).toBe(true);
  });
});

describe("시스템 프롬프트·약물 답", () => {
  it("컨텍스트 한 줄 — 상담은 세 항목, 약물은 수유 여부 기준", () => {
    expect(describeContext("patient_edu", { week: 3, delivery: "cesarean", breastfeeding: true })).toBe(
      "사용자 정보(설명을 맞추는 참고용): 산후 3주차, 제왕절개, 모유수유 중",
    );
    expect(describeContext("patient_edu", null)).toBeNull();
    expect(describeContext("substance", { week: 5, delivery: "vaginal", breastfeeding: false })).toBe(
      "사용자 정보: 산후 5주차, 모유수유 안 함. 수유를 하지 않으므로 모유수유 영향이 아니라 출산 후 회복 중인 사람을 기준으로 분류합니다.",
    );
    expect(describeContext("substance", null)).toBe("모유수유 중인 사람을 기준으로 분류합니다.");
  });

  it("프롬프트는 서버가 가진다 — 진단·용량 금지와 응급 연락처가 들어 있다", () => {
    const [edu] = systemPromptBlocks("patient_edu", null);
    expect(edu).toContain("진단하지 않습니다");
    expect(edu).toContain("용량");
    expect(edu).toContain("119");
    expect(edu).toContain("1577-0199");
    expect(edu).toContain("마크다운 표");
    const [sub, line] = systemPromptBlocks("substance", { breastfeeding: true });
    expect(sub).toContain("unknown을 고릅니다");
    expect(line).toBe("사용자 정보: 모유수유 중. 모유수유 중인 사람을 기준으로 분류합니다.");
  });

  it("약물 답 형식(structured outputs) — 웹 판정 4값과 같다", () => {
    const verdict = (SUBSTANCE_OUTPUT_SCHEMA.properties as Record<string, { enum?: string[] }>).verdict.enum;
    expect(verdict).toEqual(Object.keys(content.verdict_labels));
    expect(SUBSTANCE_OUTPUT_SCHEMA.additionalProperties).toBe(false);
    expect(SUBSTANCE_OUTPUT_SCHEMA.required).toEqual(["verdict", "detail", "sources"]);
  });

  it("약물 답 검증 — 주소처럼 보이는 출처·빈 출처는 빼고, 중복은 하나로, 5개까지", () => {
    const out = parseSubstanceOutput(
      JSON.stringify({
        verdict: "caution",
        detail: "  근거가 제한적이에요.  ",
        sources: ["LactMed", "https://x.example", "www.x.example", "", "LactMed", "A", "B", "C", "D", "E"],
      }),
    );
    expect(out).toEqual({ verdict: "caution", detail: "근거가 제한적이에요.", sources: ["LactMed", "A", "B", "C", "D"] });
  });

  it("약물 답 거절 — 4값 밖·빈 설명·너무 긴 설명·형식 오류", () => {
    for (const bad of [
      { verdict: "maybe", detail: "x", sources: [] },
      { verdict: "safe", detail: " ", sources: [] },
      { verdict: "safe", detail: "가".repeat(601), sources: [] },
      { verdict: "safe", detail: "x", sources: [1] },
      { verdict: "safe", detail: "x" },
    ]) {
      expect(parseSubstanceOutput(JSON.stringify(bad))).toBeNull();
    }
    expect(parseSubstanceOutput("not json")).toBeNull();
    expect(parseSubstanceOutput("[]")).toBeNull();
  });

  it("함수가 돌려준 약물 답을 웹이 그대로 읽는다 — 출처 칩과 'AI 답변' 표시", async () => {
    const json = parseSubstanceOutput(JSON.stringify({ verdict: "avoid", detail: "피하는 편이 좋아요.", sources: ["LactMed"] }))!;
    expect(parseSubstanceAnswer(JSON.stringify(json))).toEqual(json);
    const r = await resolveSubstance("표에없는항목", { llmLookup: async () => json });
    expect(r).toMatchObject({ verdict: "avoid", source: "llm" });
    expect(r.evidenceChips).toEqual(["src:LactMed", "AI 답변"]);
  });
});

describe("영상 프록시 입력·응답", () => {
  const q = (s: string) => parseVideoQuery(new URLSearchParams(s));

  it("include는 분만 경로 태그 하나, limit은 1~500(없으면 500)", () => {
    expect(q("include=route_vaginal_delivery")).toEqual({ include: "route_vaginal_delivery", limit: 500 });
    expect(q("include=route_cesarean_section&limit=20")).toEqual({ include: "route_cesarean_section", limit: 20 });
    for (const bad of [
      "",
      "include=stage_pelvic_floor",
      "include=route_vaginal_delivery&include=route_cesarean_section",
      "include=route_vaginal_delivery&limit=501",
      "include=route_vaginal_delivery&limit=0",
      "include=route_vaginal_delivery&limit=01",
      "include=route_vaginal_delivery&limit=1&limit=2",
      "include=route_vaginal_delivery&exclude=x",
    ]) {
      expect(q(bad)).toBeNull();
    }
  });

  it("업스트림 주소 — https만(로컬은 http://localhost), 끝 슬래시 정리, 사용자 정보 금지", () => {
    const query = { include: "route_vaginal_delivery" as const, limit: 500 };
    expect(upstreamVideosUrl("https://hackathon-video-api.onrender.com/", query)).toBe(
      "https://hackathon-video-api.onrender.com/videos?include=route_vaginal_delivery&limit=500",
    );
    expect(upstreamVideosUrl("http://localhost:8000", query)).toBe("http://localhost:8000/videos?include=route_vaginal_delivery&limit=500");
    expect(upstreamVideosUrl("http://video.example", query)).toBeNull();
    expect(upstreamVideosUrl("https://user:pw@video.example", query)).toBeNull();
    expect(upstreamVideosUrl("not a url", query)).toBeNull();
  });

  it("응답은 알려진 필드만 다시 담고, 한 항목이라도 틀리면 전체 거부", () => {
    const v = { video_id: "v1", title: "t", url: "https://www.youtube.com/watch?v=a", description: "d", tags: ["k"] };
    expect(sanitizeVideoPayload({ count: 1, videos: [{ ...v, internal: "x" }], next: "y" })).toEqual({ count: 1, videos: [v] });
    for (const bad of [null, [], { count: 1 }, { count: -1, videos: [] }, { count: 1, videos: [{ ...v, tags: "k" }] }, { count: 1, videos: [null] }]) {
      expect(sanitizeVideoPayload(bad)).toBeNull();
    }
  });
});
