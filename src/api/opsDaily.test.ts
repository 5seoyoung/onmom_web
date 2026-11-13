// 첫 주 매일 보기(scripts/ops/daily.mjs) — 개수만 묻고, 사람별 값·건강 기록을 묻지 않는지와 로그 묶기를 확인한다.
import { describe, expect, it } from "vitest";
import {
  dailyUsageSql,
  findDailyUsage,
  functionLogsSql,
  gatewaySql,
  insertLedgerRow,
  ledgerRow,
  summarizeFunctionLogs,
  summarizeGateway,
} from "../../scripts/ops/daily.mjs";

describe("daily.mjs SQL — 개수만", () => {
  it("계정·동의 SQL은 건강 기록(state)·이메일·닉네임·메타데이터를 묻지 않는다", () => {
    const sql = dailyUsageSql();
    expect(sql).not.toMatch(/\bstate\b(?!s)/);
    expect(sql).not.toMatch(/email|raw_user_meta_data|user_metadata|phone|identities/i);
    // user_id는 사람 수를 세는 count(distinct …) 안에서만
    expect(sql.match(/user_id/g)?.length).toBe(1);
    expect(sql).toMatch(/count\(distinct user_id\)/);
    // 고르는 것은 json 한 칸
    expect(sql.trim().startsWith("select json_build_object(")).toBe(true);
  });

  it("로그 SQL은 함수 줄(event_message)과 게이트웨이 상태·경로 묶음만 받는다 — 주소 쿼리·IP·토큰 칸을 묻지 않는다", () => {
    expect(functionLogsSql()).toMatch(/^select event_message from logs where source = 'function_logs'/);
    const gw = gatewaySql();
    expect(gw).toMatch(/group by status, path/);
    expect(gw).not.toMatch(/request\.search|request\.url|ip|jwt|auth_user|headers/i);
  });
});

describe("findDailyUsage — 읽기 전용 SQL 결과 모양", () => {
  it("행 배열·문자열 JSON 모두에서 찾는다", () => {
    const payload = { users_total: 3, users_guest: 1 };
    expect(findDailyUsage([{ daily_usage: payload }])).toEqual(payload);
    expect(findDailyUsage([{ daily_usage: JSON.stringify(payload) }])).toEqual(payload);
    expect(findDailyUsage({ result: [{ daily_usage: payload }] })).toBeNull();
    expect(findDailyUsage(null)).toBeNull();
  });
});

describe("summarizeFunctionLogs", () => {
  it("함수·상태·코드별로 세고, 플랫폼 줄은 건너뛴다", () => {
    const s = summarizeFunctionLogs([
      "booted (time: 18ms)",
      "shutdown",
      JSON.stringify({ fn: "chat", startup: "ok", ai: "on" }),
      JSON.stringify({ fn: "chat", status: 200, ms: 4000, preset: "patient_edu", input_tokens: 900, output_tokens: 400 }),
      JSON.stringify({ fn: "chat", status: 200, ms: 4100, preset: "patient_edu", input_tokens: 100, output_tokens: 50, fallback: true }),
      JSON.stringify({ fn: "chat", status: 401, ms: 800, code: "unauthorized" }),
      JSON.stringify({ fn: "videos", status: 204, ms: 0 }),
    ]);
    expect(s.requests).toBe(4);
    expect(s.skipped).toBe(2);
    expect(s.counts.get("chat 200")).toBe(2);
    expect(s.counts.get("chat 401 unauthorized")).toBe(1);
    expect(s.inputTokens).toBe(1000);
    expect(s.outputTokens).toBe(450);
    expect(s.fallback).toBe(1);
    expect(s.alerts).toEqual([]);
  });

  it("5xx·AI 실패 코드·시작 오류는 확인할 것으로 올린다", () => {
    const s = summarizeFunctionLogs([
      JSON.stringify({ fn: "chat", status: 502, ms: 50000, code: "timeout", refunded: true }),
      JSON.stringify({ fn: "chat", status: 200, ms: 3000, code: "truncated" }),
      JSON.stringify({ fn: "send-reminders", startup: "missing_env", names: ["X"] }),
    ]);
    expect(s.alerts).toEqual(["chat 502 timeout", "chat 200 truncated", "send-reminders 시작 오류 missing_env"]);
    expect(s.refunded).toBe(1);
    expect(s.startupErrors).toBe(1);
  });
});

describe("summarizeGateway", () => {
  it("상태 묶음별로 더하고, 5xx 경로의 UUID·쿼리를 지운다", () => {
    const g = summarizeGateway([
      { status: 200, path: "/rest/v1/user_states", n: 10 },
      { status: 401, path: "/functions/v1/chat", n: 2 },
      { status: 503, path: "/rest/v1/rpc/x/123e4567-e89b-12d3-a456-426614174000?a=b", n: 1 },
    ]);
    expect(g.classes).toMatchObject({ "2xx": 10, "4xx": 2, "5xx": 1 });
    expect([...g.errors.entries()]).toEqual([["503 /rest/v1/rpc/x/<id>", 1]]);
  });
});

describe("접근 대장 한 줄", () => {
  it("기록 표의 마지막 줄 뒤, 다음 제목 앞에 넣는다", () => {
    const text = ["# 대장", "", "## 기록", "", "| 일시(KST) | 누가 |", "|---|---|", "| 2026-11-03 | a |", "| 2026-11-08 | b |", "", "## 점검", "| 점검일 |"].join("\n");
    const out = insertLedgerRow(text, "| NEW |").split("\n");
    expect(out.indexOf("| NEW |")).toBe(out.indexOf("| 2026-11-08 | b |") + 1);
    expect(out.indexOf("## 점검")).toBeGreaterThan(out.indexOf("| NEW |"));
  });

  it("한 줄은 일곱 칸이고 개수만 봤다고 적는다", () => {
    const row = ledgerRow(new Date("2026-11-09T00:40:00Z"), "onmom-mac");
    expect(row.startsWith("| 2026-11-09 09:40 |")).toBe(true);
    expect(row).toContain("접속지: 컴퓨터 onmom-mac"); // 고시 §2 3호 — 접속기록의 접속지
    expect(row.split("|").length - 2).toBe(7);
    expect(row).toMatch(/건강 기록은 받지 않음/);
  });
});
