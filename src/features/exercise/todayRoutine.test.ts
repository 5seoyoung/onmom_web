import { describe, expect, it } from "vitest";
import content from "@/content";
import type { DeliveryMethod, MaternityRecord } from "@/domain/types";
import { STAGE_BUCKETS, currentStage, exercisePlan, type Video } from "@/rules/exercise";
import { exerciseGate } from "./exerciseModel";
import {
  TODAY_ROUTINE_MAX,
  TODAY_ROUTINE_TEXT,
  localDayNumber,
  openStages,
  pickTodayStages,
  todayRoutine,
  type TodayRoutineModel,
} from "./todayRoutine";

type Flag = Exclude<keyof MaternityRecord, "isPrimiparous">;

function maternity(...flags: Flag[]): MaternityRecord {
  const m: MaternityRecord = {
    isPrimiparous: true,
    gdm: false,
    anemia: false,
    heavyBleeding: false,
    preeclampsia: false,
    pelvicPain: false,
    diastasisRecti: false,
  };
  for (const f of flags) m[f] = true;
  return m;
}

const ALL_FLAGS: Flag[] = ["gdm", "anemia", "heavyBleeding", "preeclampsia", "pelvicPain", "diastasisRecti"];
const DELIVERIES: DeliveryMethod[] = ["vaginal", "cesarean"];

/** 로컬 날짜(달은 1부터) */
const day = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min);

function routineKeys(r: TodayRoutineModel): string[] {
  return r.kind === "routine" ? r.items.map((i) => i.key) : [];
}

const keys = (stages: readonly { key: string }[]) => stages.map((s) => s.key);

describe("열린 단계 — 운동 탭과 같은 주차 게이팅·산모수첩 차단", () => {
  it("제왕절개 6주: 기능 강화(8주)는 아직, 자연분만 6주: 기능 강화(6주)까지", () => {
    expect(keys(openStages("cesarean", 6, maternity()))).toEqual(["recovery_priority", "early_core_activation", "pelvic_floor"]);
    expect(keys(openStages("vaginal", 6, maternity()))).toEqual([
      "recovery_priority",
      "early_core_activation",
      "pelvic_floor",
      "functional_strengthening",
    ]);
  });

  it("0~1주는 회복 우선기 하나, 12주부터 다섯 단계", () => {
    for (const d of DELIVERIES) {
      expect(keys(openStages(d, 0, maternity()))).toEqual(["recovery_priority"]);
      expect(keys(openStages(d, 1, maternity()))).toEqual(["recovery_priority"]);
      expect(keys(openStages(d, 12, maternity()))).toEqual(STAGE_BUCKETS.map((b) => b.key));
    }
  });

  it("골반통은 기능 강화를, 복직근 이개·임신중독증은 코어 강화를 뺀다", () => {
    expect(keys(openStages("vaginal", 20, maternity("pelvicPain")))).not.toContain("functional_strengthening");
    expect(keys(openStages("vaginal", 20, maternity("diastasisRecti")))).not.toContain("full_core");
    expect(keys(openStages("vaginal", 20, maternity("preeclampsia")))).not.toContain("full_core");
  });

  it("주의만 하는 소견(빈혈·출혈 과다·임신성 당뇨)은 빼지 않는다 — 운동 탭도 막지 않는다", () => {
    expect(keys(openStages("vaginal", 20, maternity("anemia", "heavyBleeding", "gdm")))).toEqual(STAGE_BUCKETS.map((b) => b.key));
  });

  it("영상 카드의 '가능'(exercisePlan unlocked)과 늘 같다 — 모든 분만 방식·주차·소견 조합", () => {
    const videos: Video[] = STAGE_BUCKETS.map((b) => ({ video_id: b.key, title: b.title, url: "", description: "", tags: [`stage_${b.key}`] }));
    for (const d of DELIVERIES) {
      for (let week = 0; week <= 16; week++) {
        for (let mask = 0; mask < 1 << ALL_FLAGS.length; mask++) {
          const m = maternity(...ALL_FLAGS.filter((_, i) => mask & (1 << i)));
          const unlocked = exercisePlan(videos, d, week, m)
            .filter((p) => p.unlocked)
            .map((p) => p.bucket.key);
          expect(keys(openStages(d, week, m)), `${d} ${week}주 ${mask}`).toEqual(unlocked);
        }
      }
    }
  });
});

describe("오늘 고르기 — 날짜마다 정해지고 날마다 돈다", () => {
  const open5 = openStages("vaginal", 12, maternity());

  it("같은 날이면 몇 시든 같은 목록(자정 직후·직전)", () => {
    const a = pickTodayStages(open5, localDayNumber(day(2026, 11, 8, 0, 1)));
    const b = pickTodayStages(open5, localDayNumber(day(2026, 11, 8, 23, 59)));
    expect(keys(a)).toEqual(keys(b));
  });

  it("열린 단계가 상한보다 많으면 날마다 바뀌고, 앞 단계는 같은 횟수로 나온다", () => {
    const start = localDayNumber(day(2026, 11, 8));
    const earlier = open5.slice(0, -1).map((b) => b.key);
    const seen = new Map<string, number>();
    let prev: string[] | null = null;
    for (let i = 0; i < earlier.length * 3; i++) {
      const picked = keys(pickTodayStages(open5, start + i));
      expect(picked).toHaveLength(TODAY_ROUTINE_MAX);
      if (prev !== null) expect(picked).not.toEqual(prev);
      prev = picked;
      for (const k of picked) seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    // 앞 단계 4개 × 3바퀴: 하루 2개씩 → 각 6번, 지금 단계는 날마다
    for (const k of earlier) expect(seen.get(k)).toBe(6);
    expect(seen.get("full_core")).toBe(earlier.length * 3);
  });

  it("지금 단계(currentStage)는 늘 들어가고, 목록은 단계순 · 중복 없음", () => {
    for (const d of DELIVERIES) {
      for (let week = 0; week <= 16; week++) {
        for (const m of [maternity(), maternity("pelvicPain"), maternity("diastasisRecti"), maternity("pelvicPain", "preeclampsia")]) {
          const open = openStages(d, week, m);
          const current = currentStage(d, week, m);
          for (let n = 0; n < 10; n++) {
            const picked = pickTodayStages(open, 20_000 + n);
            expect(picked).toHaveLength(Math.min(TODAY_ROUTINE_MAX, open.length));
            expect(picked.at(-1)?.key).toBe(current?.key);
            expect(new Set(keys(picked)).size).toBe(picked.length);
            expect(picked.map((b) => b.order)).toEqual([...picked.map((b) => b.order)].sort((x, y) => x - y));
            for (const b of picked) expect(open).toContain(b);
          }
        }
      }
    }
  });

  it("열린 단계가 3개 이하면 날마다 모두(바뀌지 않는다)", () => {
    const open3 = openStages("cesarean", 6, maternity());
    for (let n = 0; n < 5; n++) expect(keys(pickTodayStages(open3, n))).toEqual(keys(open3));
    expect(pickTodayStages([], 3)).toEqual([]);
  });

  it("날짜 순번은 로컬 달력 기준 — 달·해가 바뀌어도 하루에 1씩", () => {
    expect(localDayNumber(day(2026, 12, 1)) - localDayNumber(day(2026, 11, 30))).toBe(1);
    expect(localDayNumber(day(2027, 1, 1, 0, 0)) - localDayNumber(day(2026, 12, 31, 23, 59))).toBe(1);
    expect(localDayNumber(day(1970, 1, 1))).toBe(0);
  });
});

describe("카드 모델 — 본문 분기 그대로", () => {
  const today = day(2026, 11, 8);

  it("레드플래그면 멈춤(항목 없음) — 분만 방식·출산일이 있어도", () => {
    const gate = exerciseGate("vaginal", "2026-08-01", true);
    expect(gate).toBe("redFlag");
    expect(todayRoutine(gate, "vaginal", 14, maternity(), today)).toEqual({ kind: "stopped" });
  });

  it("분만 방식이 없으면 레드플래그보다 먼저 '분만 방식 필요' — 카드 없음", () => {
    expect(todayRoutine(exerciseGate(null, "2026-08-01", true), null, 14, maternity(), today)).toEqual({ kind: "none" });
    expect(todayRoutine(exerciseGate(null, "2026-08-01", false), null, 14, maternity(), today)).toEqual({ kind: "none" });
  });

  it("출산일이 없으면 주차를 모른다 — 카드 없음", () => {
    expect(todayRoutine(exerciseGate("cesarean", null, false), "cesarean", null, maternity(), today)).toEqual({ kind: "none" });
  });

  it("플랜이면 오늘의 단계 — 제목·요약은 content.json stage_buckets 그대로", () => {
    const r = todayRoutine("plan", "vaginal", 12, maternity(), today);
    expect(r.kind).toBe("routine");
    if (r.kind !== "routine") return;
    expect(r.heading).toBe(TODAY_ROUTINE_TEXT.heading);
    expect(r.intro).toBe(TODAY_ROUTINE_TEXT.introRotating);
    expect(r.items).toHaveLength(TODAY_ROUTINE_MAX);
    for (const item of r.items) {
      const src = content.stage_buckets.find((b) => b.key === item.key);
      expect(src).toBeDefined();
      expect(item.title).toBe(src?.title);
      expect(item.summary).toBe(src?.summary);
    }
  });

  it("열린 단계가 적으면 모두 담았다는 안내, 0주는 회복 우선기 하나", () => {
    const early = todayRoutine("plan", "cesarean", 0, maternity(), today);
    expect(routineKeys(early)).toEqual(["recovery_priority"]);
    expect(early.kind === "routine" ? early.intro : null).toBe(TODAY_ROUTINE_TEXT.introAll);
    const three = todayRoutine("plan", "cesarean", 7, maternity(), today);
    expect(routineKeys(three)).toEqual(["recovery_priority", "early_core_activation", "pelvic_floor"]);
  });

  it("막힌 단계는 어느 날에도 나오지 않는다(골반통 + 복직근 이개, 자연분만 20주)", () => {
    const m = maternity("pelvicPain", "diastasisRecti");
    for (let i = 0; i < 14; i++) {
      const picked = routineKeys(todayRoutine("plan", "vaginal", 20, m, day(2026, 11, 8 + i)));
      expect(picked).not.toContain("functional_strengthening");
      expect(picked).not.toContain("full_core");
      expect(picked).toEqual(["recovery_priority", "early_core_activation", "pelvic_floor"]);
    }
  });

  it("읽을 수 없는 날짜면 카드 없음", () => {
    expect(todayRoutine("plan", "vaginal", 12, maternity(), new Date(Number.NaN))).toEqual({ kind: "none" });
  });

  it("문구에 em dash·평가하는 말이 없다", () => {
    for (const s of Object.values(TODAY_ROUTINE_TEXT)) {
      expect(s).not.toContain("—");
      for (const w of ["잘했", "부족", "좋아요", "효과"]) expect(s).not.toContain(w);
    }
  });
});
