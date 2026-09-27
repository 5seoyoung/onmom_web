import { describe, expect, it, vi } from "vitest";
import type { FetchVideosResult } from "@/api/video";
import { defaultMaternity, defaultProfile } from "@/store/defaults";
import { createAppStore } from "@/store/appStore";
import { createMemoryStorage, createStoragePersistence } from "@/store/persistence";
import { homeStageCard, isRedFlagActive, routeTag, type Video } from "@/rules/exercise";
import { exerciseBody, exerciseWeek } from "@/features/exercise/exerciseModel";
import { formValuesFromSaved, type AnalyzeFormValues } from "./analyzeModel";
import { saveAndAnalyze, type AnalyzeRunDeps } from "./analyzeRun";

const NOW = new Date("2026-09-23T21:30:00+09:00");
// 2026-06-20 출산 → 95일 → 13주차
const DELIVERY_13W = "2026-06-20";
const R_DRA = "복직근 이개(DRA)가 있어 복압을 올리는 복근 운동은 회복 전까지 피해요";

function setup() {
  let n = 0;
  const store = createAppStore({
    persistence: createStoragePersistence(() => createMemoryStorage()),
    now: () => NOW,
    newId: () => `id-${++n}`,
  });
  store.load();
  store.actions.signInGuest();
  return store;
}

// 테스트 입력용 영상(화면에 쓰이지 않는다)
const FULL_CORE: Video = { video_id: "fc", title: "영상 fc", url: "https://www.youtube.com/watch?v=fc", description: "", tags: ["stage_full_core"] };

function form(patch: Partial<AnalyzeFormValues> = {}): AnalyzeFormValues {
  return {
    ...formValuesFromSaved({ ...defaultProfile(), deliveryMethod: "vaginal", deliveryDate: DELIVERY_13W }, defaultMaternity()),
    ...patch,
  };
}

describe("[분석 시작] — 저장 먼저, 저장된 값으로 분석(D10, 감사 #2)", () => {
  it("끝에서 끝: 폼에서 DRA를 켜면 저장되고, 13주 분석·운동 탭·홈이 모두 코어 강화를 막는다", async () => {
    const store = setup();
    const fetchVideos = vi.fn(async (): Promise<FetchVideosResult> => ({ ok: true, videos: [FULL_CORE] }));
    const values = form({ heightCm: 160, currentWeightKg: 60, maternity: { ...defaultMaternity(), diastasisRecti: true } });

    const outcome = await saveAndAnalyze(values, {
      actions: store.actions,
      readSaved: () => store.getSnapshot().state,
      fetchVideos,
      now: () => NOW,
    });

    // 저장됨
    const saved = store.getSnapshot().state;
    expect(saved.profile).toMatchObject({ deliveryMethod: "vaginal", deliveryDate: DELIVERY_13W, heightCm: 160, currentWeightKg: 60 });
    expect(saved.maternity.diastasisRecti).toBe(true);
    expect(fetchVideos).toHaveBeenCalledWith(routeTag("vaginal"), { signal: undefined });

    // 분석: 코어 강화 금지, 영상 목록에 없음
    if (!outcome.ok) throw new Error(outcome.message);
    const forbidden = outcome.output.recommendation.forbidden;
    expect(forbidden.map((f) => f.item)).toEqual(["full_core"]);
    expect(forbidden[0].label).toBe(`코어 강화 — ${R_DRA}`);
    expect(outcome.output.recommendation.allowed.map((a) => a.item)).not.toContain("full_core");
    expect(outcome.output.exerciseVideos).toEqual([]);

    // 운동 탭(같은 저장값): 잠김 + 사유
    const week = exerciseWeek(saved.profile.deliveryDate, NOW);
    expect(week).toBe(13);
    const body = exerciseBody({ kind: "loaded", videos: [FULL_CORE] }, "vaginal", week!, saved.maternity);
    if (body.kind !== "plan") throw new Error("plan");
    expect(body.sections[0].title).toBe("지금은 권하지 않는 운동");
    expect(body.sections[0].cards[0].action).toEqual({ kind: "locked", text: R_DRA, tone: "alert" });

    // 홈 "지금 회복 단계" 카드
    const card = homeStageCard("vaginal", week!, saved.maternity, isRedFlagActive(saved.symptomHistory));
    expect(card).toMatchObject({ kind: "stage", excluded: [`코어 강화 제외 — ${R_DRA}`] });
  });

  it("저장 → 다시 읽기 → 조회 순서이고, 분석은 폼 값이 아니라 다시 읽은 저장값을 쓴다", async () => {
    const log: string[] = [];
    const deps: AnalyzeRunDeps = {
      actions: {
        updateProfile: () => void log.push("updateProfile"),
        updateMaternity: () => void log.push("updateMaternity"),
      },
      readSaved: () => {
        log.push("readSaved");
        // 저장소가 가진 값(예: 저장 규칙이 다르게 정리한 값) — 분석은 이것을 따른다
        return { profile: { ...defaultProfile(), deliveryMethod: "cesarean", deliveryDate: "2026-07-17" }, maternity: defaultMaternity() };
      },
      fetchVideos: async (tag) => {
        log.push(`fetch:${tag}`);
        return { ok: false, kind: "notConfigured", message: "" };
      },
      now: () => NOW,
    };
    const outcome = await saveAndAnalyze(form(), deps);
    expect(log).toEqual(["updateProfile", "updateMaternity", "readSaved", "fetch:route_cesarean_section"]);
    if (!outcome.ok) throw new Error(outcome.message);
    expect(outcome.output.profile).toMatchObject({ deliveryMethod: "cesarean", podDays: 68 });
    expect(outcome.output.videoFetch).toBe("notConfigured");
  });

  it("영상 조회가 예외로 끝나도 분석은 끝나고 영상 상태는 failed", async () => {
    const store = setup();
    const outcome = await saveAndAnalyze(form(), {
      actions: store.actions,
      readSaved: () => store.getSnapshot().state,
      fetchVideos: async () => {
        throw new TypeError("boom");
      },
      now: () => NOW,
    });
    if (!outcome.ok) throw new Error(outcome.message);
    expect(outcome.output.videoFetch).toBe("failed");
  });

  it("저장된 출산일·분만 방식이 없으면 분석하지 않고(조회도 안 함) 이유를 돌려준다", async () => {
    const fetchVideos = vi.fn();
    const deps = () => {
      const store = setup(); // 새 게스트 — 저장된 분만 방식·출산일 없음
      return { actions: store.actions, readSaved: () => store.getSnapshot().state, fetchVideos, now: () => NOW };
    };

    expect(await saveAndAnalyze(form({ deliveryDate: "" }), deps())).toEqual({ ok: false, message: "분만 방식을 먼저 선택해주세요." });
    expect(await saveAndAnalyze(form({ deliveryMethod: null }), deps())).toEqual({ ok: false, message: "분만 방식을 먼저 선택해주세요." });
    expect(fetchVideos).not.toHaveBeenCalled();
  });
});
