import { describe, expect, it } from "vitest";
import content from "@/content";
import type { DeliveryMethod, MaternityRecord } from "@/domain/types";
import { STAGE_BUCKETS, currentStage, exercisePlan, type Video } from "@/rules/exercise";
import { recoveryRecommendation } from "@/rules/recovery";
import { ROUTES } from "@/routes";
import { exerciseGate } from "./exerciseModel";
import {
  RESTRICTION_STAGE_KEY,
  TODAY_ROUTINE_MAX,
  TODAY_ROUTINE_TEXT,
  localDayNumber,
  openStages,
  pickTodayStages,
  routineCheckModel,
  routinePool,
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
/** 산모수첩 소견 64개 조합 */
const ALL_MATERNITY = Array.from({ length: 1 << ALL_FLAGS.length }, (_, mask) => maternity(...ALL_FLAGS.filter((_, i) => mask & (1 << i))));

/** 로컬 날짜(달은 1부터) */
const day = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min);

function routineKeys(r: TodayRoutineModel): string[] {
  return r.kind === "routine" ? r.items.map((i) => i.key) : [];
}

function asRoutine(r: TodayRoutineModel): Extract<TodayRoutineModel, { kind: "routine" }> {
  if (r.kind !== "routine") throw new Error(`routine이 아님: ${r.kind}`);
  return r;
}

const keys = (stages: readonly { key: string }[]) => stages.map((s) => s.key);
/** 고를 단계 — 화면과 같게 지금 단계(currentStage)를 넘긴다 */
const poolOf = (d: DeliveryMethod, week: number, m: MaternityRecord) => routinePool(openStages(d, week, m), currentStage(d, week, m));

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

  it("0~1주는 회복 우선기·골반저근 둘(rules-1.3 — 골반저근 0주), 12주부터 다섯 단계", () => {
    for (const d of DELIVERIES) {
      expect(keys(openStages(d, 0, maternity()))).toEqual(["recovery_priority", "pelvic_floor"]);
      expect(keys(openStages(d, 1, maternity()))).toEqual(["recovery_priority", "pelvic_floor"]);
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
        for (const m of ALL_MATERNITY) {
          const unlocked = exercisePlan(videos, d, week, m)
            .filter((p) => p.unlocked)
            .map((p) => p.bucket.key);
          expect(keys(openStages(d, week, m)), `${d} ${week}주 ${JSON.stringify(m)}`).toEqual(unlocked);
        }
      }
    }
  });
});

describe("고를 단계 — 회복 우선기는 지금 단계일 때만", () => {
  it("0~1주(회복 우선기가 지금 단계)에는 회복 우선기 + 골반저근 — 제한 문구 '복부운동 금지'가 함께 보인다", () => {
    for (const d of DELIVERIES) {
      for (const week of [0, 1]) {
        expect(currentStage(d, week, maternity())?.key).toBe(RESTRICTION_STAGE_KEY);
        expect(keys(poolOf(d, week, maternity()))).toEqual([RESTRICTION_STAGE_KEY, "pelvic_floor"]);
      }
    }
  });

  it("2주부터는 어떤 소견 조합에서도 회복 우선기를 넣지 않는다 — 요약이 뒤 단계와 어긋나는 제한 문구라서", () => {
    for (const d of DELIVERIES) {
      for (let week = 2; week <= 16; week++) {
        for (const m of ALL_MATERNITY) {
          const pool = keys(poolOf(d, week, m));
          expect(pool, `${d} ${week}주`).not.toContain(RESTRICTION_STAGE_KEY);
          expect(pool.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("2~5주는 코어 깨우기·골반저근, 자연분만 12주는 회복 우선기를 뺀 네 단계", () => {
    expect(keys(poolOf("cesarean", 3, maternity()))).toEqual(["early_core_activation", "pelvic_floor"]);
    expect(keys(poolOf("vaginal", 12, maternity()))).toEqual([
      "early_core_activation",
      "pelvic_floor",
      "functional_strengthening",
      "full_core",
    ]);
  });

  it("회복 우선기 key는 content.json에 있다(이름이 바뀌면 모듈이 불러올 때 멈춘다)", () => {
    expect(content.stage_buckets.some((b) => b.key === RESTRICTION_STAGE_KEY)).toBe(true);
  });
});

describe("오늘 고르기 — 날짜마다 정해지고 날마다 돈다", () => {
  const pool4 = poolOf("vaginal", 12, maternity());

  it("같은 날이면 몇 시든 같은 목록(자정 직후·직전)", () => {
    const a = pickTodayStages(pool4, localDayNumber(day(2026, 11, 8, 0, 1)));
    const b = pickTodayStages(pool4, localDayNumber(day(2026, 11, 8, 23, 59)));
    expect(keys(a)).toEqual(keys(b));
  });

  it("고를 단계가 상한보다 많으면 날마다 바뀌고, 앞 단계는 같은 횟수로 나온다", () => {
    const start = localDayNumber(day(2026, 11, 8));
    const earlier = pool4.slice(0, -1).map((b) => b.key);
    const seen = new Map<string, number>();
    let prev: string[] | null = null;
    for (let i = 0; i < earlier.length * 3; i++) {
      const picked = keys(pickTodayStages(pool4, start + i));
      expect(picked).toHaveLength(TODAY_ROUTINE_MAX);
      if (prev !== null) expect(picked).not.toEqual(prev);
      prev = picked;
      for (const k of picked) seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    // 앞 단계 3개 × 3바퀴(9일): 하루 2개씩 → 각 6번, 지금 단계는 날마다
    for (const k of earlier) expect(seen.get(k)).toBe(6);
    expect(seen.get("full_core")).toBe(earlier.length * 3);
  });

  it("지금 단계(currentStage)는 늘 들어가고, 목록은 단계순 · 중복 없음 · 고를 단계 안에서만", () => {
    for (const d of DELIVERIES) {
      for (let week = 0; week <= 16; week++) {
        for (const m of [maternity(), maternity("pelvicPain"), maternity("diastasisRecti"), maternity("pelvicPain", "preeclampsia")]) {
          const pool = poolOf(d, week, m);
          const current = currentStage(d, week, m);
          for (let n = 0; n < 10; n++) {
            const picked = pickTodayStages(pool, 20_000 + n, current);
            expect(picked).toHaveLength(Math.min(TODAY_ROUTINE_MAX, pool.length));
            expect(keys(picked), `${d} ${week}주`).toContain(current?.key);
            expect(new Set(keys(picked)).size).toBe(picked.length);
            expect(picked.map((b) => b.order)).toEqual([...picked.map((b) => b.order)].sort((x, y) => x - y));
            for (const b of picked) expect(pool).toContain(b);
          }
        }
      }
    }
  });

  it("고를 단계가 3개 이하면 날마다 모두(바뀌지 않는다)", () => {
    const pool3 = poolOf("vaginal", 6, maternity());
    expect(pool3).toHaveLength(3);
    for (let n = 0; n < 5; n++) expect(keys(pickTodayStages(pool3, n))).toEqual(keys(pool3));
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

  it("플랜이면 오늘의 단계 — 제목·요약은 content.json stage_buckets 그대로, 목록 아래 멈춤 안내", () => {
    const r = asRoutine(todayRoutine("plan", "vaginal", 12, maternity(), today));
    expect(r.heading).toBe(TODAY_ROUTINE_TEXT.heading);
    expect(r.intro).toBe(TODAY_ROUTINE_TEXT.introRotating);
    expect(r.items).toHaveLength(TODAY_ROUTINE_MAX);
    expect(r.stopNote).toBe(TODAY_ROUTINE_TEXT.stopNote);
    for (const item of r.items) {
      const src = content.stage_buckets.find((b) => b.key === item.key);
      expect(src).toBeDefined();
      expect(item.title).toBe(src?.title);
      expect(item.summary).toBe(src?.summary);
    }
  });

  it("0주는 회복 우선기·골반저근, 제왕절개 7주는 코어 깨우기·골반저근(회복 우선기 빠짐) — 안내는 '골랐어요'", () => {
    const early = asRoutine(todayRoutine("plan", "cesarean", 0, maternity(), today));
    expect(routineKeys(early)).toEqual(["recovery_priority", "pelvic_floor"]);
    expect(early.intro).toBe(TODAY_ROUTINE_TEXT.introPicked);
    const seven = asRoutine(todayRoutine("plan", "cesarean", 7, maternity(), today));
    expect(routineKeys(seven)).toEqual(["early_core_activation", "pelvic_floor"]);
    expect(seven.intro).toBe(TODAY_ROUTINE_TEXT.introPicked);
  });

  it("막힌 단계는 어느 날에도 나오지 않는다(골반통 + 복직근 이개, 자연분만 20주)", () => {
    const m = maternity("pelvicPain", "diastasisRecti");
    for (let i = 0; i < 14; i++) {
      const picked = routineKeys(todayRoutine("plan", "vaginal", 20, m, day(2026, 11, 8 + i)));
      expect(picked).toEqual(["early_core_activation", "pelvic_floor"]);
    }
  });

  it("읽을 수 없는 날짜면 카드 없음", () => {
    expect(todayRoutine("plan", "vaginal", 12, maternity(), new Date(Number.NaN))).toEqual({ kind: "none" });
  });
});

describe("주의 사항 — 회복 단계 분석과 같은 판정, 문구는 되풀이하지 않고 분석 화면으로", () => {
  const today = day(2026, 11, 8);

  it("주의 오버레이가 하나라도 있으면 한 줄 + 분석 화면 링크, 없으면 null — 모든 소견 조합에서 분석과 같다", () => {
    for (const d of DELIVERIES) {
      for (const week of [0, 3, 7, 12]) {
        for (const m of ALL_MATERNITY) {
          const r = asRoutine(todayRoutine("plan", d, week, m, today));
          const expected = recoveryRecommendation(d, week, m).caution.length > 0;
          expect(r.caution !== null, `${d} ${week}주 ${JSON.stringify(m)}`).toBe(expected);
          if (r.caution !== null) {
            expect(r.caution).toEqual({ text: TODAY_ROUTINE_TEXT.cautionNote, linkLabel: TODAY_ROUTINE_TEXT.cautionLink, href: ROUTES.analyze });
          }
        }
      }
    }
  });

  it("빈혈만 있어도(단계를 막지 않는 소견) 주의 줄이 보인다 · 소견이 없으면 없다", () => {
    expect(asRoutine(todayRoutine("plan", "cesarean", 3, maternity("anemia"), today)).caution).not.toBeNull();
    expect(asRoutine(todayRoutine("plan", "cesarean", 3, maternity(), today)).caution).toBeNull();
  });

  it("카드에 주의 오버레이 문구를 싣지 않는다 — 분석 결과의 '주의' 묶음에만", () => {
    const all = JSON.stringify(todayRoutine("plan", "vaginal", 12, maternity(...ALL_FLAGS), today));
    for (const o of content.caution_overlays) expect(all).not.toContain(o.label);
  });

  it("링크 이름은 분석 화면 제목을 그대로 쓴다", () => {
    expect(TODAY_ROUTINE_TEXT.cautionLink).toBe("회복 단계 분석에서 확인하기");
  });
});

describe("[오늘 했어요] 모델", () => {
  // 2026-11-08은 일요일 — 이번 주는 11-02(월) ~ 11-08
  const sunday = day(2026, 11, 8, 21, 0);

  it("오늘 체크했으면 눌림, 이번 주(월요일부터) 체크한 날 수", () => {
    expect(routineCheckModel(["2026-11-08", "2026-11-05", "2026-11-02", "2026-11-01"], sunday)).toEqual({
      label: TODAY_ROUTINE_TEXT.checkLabel,
      done: true,
      weekText: "이번 주 3일",
      deviceNote: TODAY_ROUTINE_TEXT.deviceNote,
    });
  });

  it("오늘 체크하지 않았으면 눌리지 않음, 이번 주 0일이면 수를 그리지 않는다", () => {
    expect(routineCheckModel(["2026-11-01"], sunday)).toMatchObject({ done: false, weekText: null });
    expect(routineCheckModel([], sunday)).toMatchObject({ done: false, weekText: null });
  });

  it("월요일이 되면 새 주 — 지난주 체크는 세지 않는다", () => {
    expect(routineCheckModel(["2026-11-08", "2026-11-07"], day(2026, 11, 9, 0, 5))).toMatchObject({ done: false, weekText: null });
  });
});

describe("문구", () => {
  const strings: string[] = [
    ...Object.values(TODAY_ROUTINE_TEXT).flatMap((v) => (typeof v === "string" ? [v] : [])),
    TODAY_ROUTINE_TEXT.weekCount(3),
  ];

  it("em dash·평가하는 말이 없다", () => {
    for (const s of strings) {
      expect(s).not.toContain("—");
      for (const w of ["잘했", "부족", "좋아요", "훌륭", "효과", "꾸준"]) expect(s, s).not.toContain(w);
    }
  });

  it("체크는 이 브라우저에만 저장되고 서버로 보내지 않는다고 말한다", () => {
    expect(TODAY_ROUTINE_TEXT.deviceNote).toContain("이 브라우저에만");
    expect(TODAY_ROUTINE_TEXT.deviceNote).toContain("서버로 보내지 않아요");
  });
});
