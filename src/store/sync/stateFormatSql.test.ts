// 저장 형식 2(삭제 표시 deleted·고친 시각 updatedAt — store/tombstones)와 서버 SQL이 맞는지 — 실행하지 않고 글자로 확인한다(*Sql.test.ts와 같은 방식).
// - 형식 번호 2를 쓸 수 있다: user_states의 schema_version 제약은 ">= 1"뿐이다(0001). 다른 마이그레이션이 형식 번호를 묶으면 여기서 멈춘다.
// - 관리자 이용 통계(0011)는 상태 JSON의 symptomHistory·moodChecks·communityPosts 배열만 센다. 지운 기록은 그 배열에 없고(목록 밖의 deleted 칸에
//   id·지운 시각만), 고친 기록은 같은 자리의 같은 date라 따로 거를 것이 없다 — 0011이 deleted를 읽기 시작하거나 배열 이름이 바뀌면 여기서 멈춘다.
// - 표시를 목록마다 다 채워도 서버 상태 상한(1MB, 0007)에 넉넉하다.

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DELETED_LISTS, MOOD_CHECKS_LIMIT, SYMPTOM_HISTORY_LIMIT, TOMBSTONE_LIMIT, type PersistedState } from "@/domain/types";
import { RULES_VERSION } from "@/rules/version";
import { initialState } from "../defaults";
import * as S from "../state";
import { STATE_SCHEMA_VERSION } from "./remote";

const MIGRATIONS = fileURLToPath(new URL("../../../supabase/migrations/", import.meta.url));
const FILES = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
const code = (file: string) => readFileSync(`${MIGRATIONS}${file}`, "utf8").replace(/--[^\n]*/g, "").toLowerCase();

describe("형식 번호", () => {
  it("이 웹은 형식 2를 올린다 — 0001의 제약(schema_version >= 1)이 받는다", () => {
    expect(STATE_SCHEMA_VERSION).toBe(2);
    expect(code("0001_user_states.sql").replace(/\s+/g, " ")).toContain("constraint user_states_schema_version_positive check (schema_version >= 1)");
  });

  it("다른 마이그레이션은 형식 번호를 묶지 않는다(1로 고정·상한 없음)", () => {
    for (const file of FILES) {
      const sql = code(file);
      // 괄호 한 겹 안의 조건만(다른 check와 섞이지 않게)
      const checks = [...sql.matchAll(/check\s*\(\s*([^()]*schema_version[^()]*)\)/g)].map((m) => m[1].replace(/\s+/g, " ").trim());
      for (const c of checks) expect(c, file).toBe("schema_version >= 1");
      expect(sql, file).not.toMatch(/schema_version\s*(=|<|<=)\s*\d/);
    }
  });
});

describe("관리자 이용 통계(0011)는 목록 배열만 센다", () => {
  const sql = code("0011_admin_usage_stats.sql");

  it("읽는 칸은 symptomHistory·moodChecks·communityPosts(배열)·profile — 삭제 표시(deleted)·고친 시각은 읽지 않는다", () => {
    const keys = new Set([...sql.matchAll(/->>?\s*'(\w+)'/g)].map((m) => m[1].toLowerCase()));
    for (const k of ["symptomhistory", "moodchecks", "communityposts", "date"]) expect(keys).toContain(k);
    expect(keys).not.toContain("deleted");
    expect(keys).not.toContain("updatedat");
    expect(keys).not.toContain("deletedat");
  });

  it("이 웹이 만드는 JSON — 지운 기록은 세는 배열에 없고, 표시는 id·지운 시각만, 고친 기록은 date가 그대로다", () => {
    const now = new Date("2026-11-08T10:00:00+09:00");
    const rec = (id: string) => ({ id, date: "2026-11-01T01:00:00.000Z", lochiaIncreased: false, lochiaRed: false, feverEvent: false, painNrs: 2, redFlagCode: null, postpartumDays: 30, rulesVersion: RULES_VERSION });
    let s: PersistedState = {
      ...initialState(),
      symptomHistory: [rec("keep"), rec("gone")],
      moodChecks: [{ id: "m", date: "2026-11-01T01:00:00.000Z", questionID: 1, answer: "no", moodVersion: null }],
      communityPosts: [{ id: "p", title: "제목", body: "", authorName: "게스트", date: "2026-11-01T01:00:00.000Z", comments: [] }],
    };
    s = S.deleteSymptomRecord(s, "gone", now);
    s = S.deleteMoodCheck(s, "m", now);
    s = S.deletePost(s, "p", now);
    s = S.updateSymptomRecord(s, "keep", { ...rec("keep"), painNrs: 8, redFlagCode: "severe_pain" }, now);
    const json = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;

    expect((json.symptomHistory as { id: string }[]).map((r) => r.id)).toEqual(["keep"]);
    expect(json.moodChecks).toEqual([]);
    expect(json.communityPosts).toEqual([]);
    expect((json.symptomHistory as { date: string; redFlagCode: string }[])[0]).toMatchObject({ date: "2026-11-01T01:00:00.000Z", redFlagCode: "severe_pain" });
    const deleted = json.deleted as Record<string, Record<string, unknown>[]>;
    expect(Object.keys(deleted).sort()).toEqual([...DELETED_LISTS].sort());
    for (const list of DELETED_LISTS) for (const t of deleted[list]) expect(Object.keys(t).sort()).toEqual(["deletedAt", "id"]);
  });
});

describe("크기", () => {
  it("기록 제한(증상 50·기분 60)과 표시 상한(목록마다 200)을 다 채워도 서버 상한 1MB의 1/10보다 작다", () => {
    const id = (p: string, i: number) => `00000000-0000-4000-${p}-${String(i).padStart(12, "0")}`;
    const at = "2026-11-08T01:00:00.000Z";
    const full: PersistedState = {
      ...initialState(),
      symptomHistory: Array.from({ length: SYMPTOM_HISTORY_LIMIT }, (_, i) => ({
        id: id("8000", i), date: at, lochiaIncreased: true, lochiaRed: true, feverEvent: true, painNrs: 10,
        redFlagCode: "heavy_bleeding_dizzy", postpartumDays: 365, rulesVersion: RULES_VERSION, updatedAt: at,
      })),
      moodChecks: Array.from({ length: MOOD_CHECKS_LIMIT }, (_, i) => ({ id: id("9000", i), date: at, questionID: 7, answer: "no" as const, moodVersion: "m", updatedAt: at })),
      deleted: Object.fromEntries(
        DELETED_LISTS.map((list, k) => [list, Array.from({ length: TOMBSTONE_LIMIT }, (_, i) => ({ id: id(`a00${k}`, i), deletedAt: at }))]),
      ) as unknown as PersistedState["deleted"],
    };
    expect(new TextEncoder().encode(JSON.stringify(full)).byteLength).toBeLessThan(1024 * 1024 / 10);
  });
});
