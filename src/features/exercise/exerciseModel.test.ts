import { describe, expect, it } from "vitest";
import { fetchVideos } from "@/api/video";
import { isVideoBackendConfigured } from "@/config";
import type { MaternityRecord } from "@/domain/types";
import { OFFLINE_TEXT } from "@/features/home/useOnline";
import { EXERCISE_TEXT, routeTag, type Video } from "@/rules/exercise";
import { COLD_START_TEXT } from "./videoLoad";
import {
  NEEDS_DELIVERY_DATE_TEXT,
  VIDEO_LOAD_THROWN,
  excludedStageLines,
  exerciseBody,
  exerciseGate,
  exerciseSubtitle,
  exerciseWeek,
  videoLoadFromResult,
  type VideoLoad,
} from "./exerciseModel";

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

// 테스트 입력용 영상(화면에 쓰이지 않는다)
function video(id: string, stage: string, url = `https://www.youtube.com/watch?v=${id}`, description = ""): Video {
  return { video_id: id, title: `영상 ${id}`, url, description, tags: [`stage_${stage}`, "route_cesarean_section"] };
}

const NOW = new Date("2026-09-23T21:30:00+09:00");
const R_PELVIC = "골반통·치골결합 통증이 있어 한다리·비대칭 동작(클램·런지 등)은 피해요";
const R_DRA = "복직근 이개(DRA)가 있어 복압을 올리는 복근 운동은 회복 전까지 피해요";

describe("운동 탭 본문 분기", () => {
  it("분만 방식이 없으면 레드플래그보다 먼저 분만 방식을 묻는다(ExerciseView.swift:33-39)", () => {
    expect(exerciseGate(null, "2026-07-17", true)).toBe("needsDelivery");
    expect(exerciseGate(null, null, false)).toBe("needsDelivery");
  });

  it("레드플래그면 출산일과 무관하게 운동 추천을 멈춘다", () => {
    expect(exerciseGate("cesarean", "2026-07-17", true)).toBe("redFlag");
    expect(exerciseGate("cesarean", null, true)).toBe("redFlag");
  });

  it("출산일이 없거나 읽을 수 없으면 0주차로 추정하지 않고 출산일을 묻는다(웹 전용)", () => {
    expect(exerciseGate("vaginal", null, false)).toBe("needsDeliveryDate");
    expect(exerciseGate("vaginal", "2026-02-31", false)).toBe("needsDeliveryDate");
    expect(exerciseGate("vaginal", "2026-07-17", false)).toBe("plan");
    expect(NEEDS_DELIVERY_DATE_TEXT.title).toBe("출산일이 필요해요");
  });
});

describe("헤더", () => {
  it("스크린샷과 같은 주차·부제 — 7/17 출산, 9/23 → 산후 9주차 · 제왕절개 기준", () => {
    const week = exerciseWeek("2026-07-17", NOW);
    expect(week).toBe(9);
    expect(exerciseSubtitle("cesarean", week)).toBe("산후 9주차 · 제왕절개 기준");
    expect(exerciseSubtitle(null, week)).toBe("산후 9주차");
  });

  it("출산일이 없으면 주차도 부제도 없다", () => {
    expect(exerciseWeek(null, NOW)).toBeNull();
    expect(exerciseSubtitle("cesarean", null)).toBeNull();
  });
});

describe("영상 조회 결과", () => {
  it("미설정 → 준비 중(재시도 없음), 서버·네트워크 실패 → 연결 실패(재시도)", () => {
    expect(videoLoadFromResult({ ok: false, kind: "notConfigured", message: "m" })).toEqual({ kind: "unavailable", message: "m" });
    expect(videoLoadFromResult({ ok: false, kind: "server", message: "s", status: 500 })).toEqual({ kind: "failed", message: "s" });
    expect(videoLoadFromResult({ ok: false, kind: "network", message: "" })).toEqual({ kind: "failed", message: "영상을 불러오지 못했어요." });
    expect(VIDEO_LOAD_THROWN).toEqual({ kind: "failed", message: "영상을 불러오지 못했어요." });
    const videos = [video("a", "recovery_priority")];
    expect(videoLoadFromResult({ ok: true, videos })).toEqual({ kind: "loaded", videos });
  });

  it.runIf(!isVideoBackendConfigured())("서버가 설정되지 않은 배포에서는 '영상 준비 중' 문구가 VideoDBClient 원문이다", async () => {
    const load = videoLoadFromResult(await fetchVideos(routeTag("cesarean")));
    expect(load).toEqual({ kind: "unavailable", message: "운동 영상 추천은 준비 중이에요. 곧 만나보실 수 있어요." });
  });
});

describe("영상 준비 중 블록(D7)", () => {
  const unavailable: VideoLoad = { kind: "unavailable", message: EXERCISE_TEXT.unavailableBody };

  it("제왕절개 9주 + 골반통 — 막힌 '기능 강화' 대신 '골반저근'을 현재 단계로, 제외 줄을 함께(감사 #4)", () => {
    expect(exerciseBody(unavailable, "cesarean", 9, maternity("pelvicPain"))).toEqual({
      kind: "unavailable",
      title: "영상 준비 중",
      message: "운동 영상 추천은 준비 중이에요. 곧 만나보실 수 있어요.",
      stage: { line: "지금은 9주차 · 골반저근 단계예요", summary: "케겔(골반저근 운동)" },
      excluded: [`기능 강화 제외 — ${R_PELVIC}`],
    });
  });

  it("차단이 없으면 제외 줄이 없다", () => {
    const body = exerciseBody(unavailable, "cesarean", 9, maternity());
    expect(body).toMatchObject({ kind: "unavailable", stage: { line: "지금은 9주차 · 기능 강화 단계예요" }, excluded: [] });
  });

  it("주차가 아직 안 된 차단 단계는 제외 줄에 나오지 않는다(홈과 같은 blockedNow)", () => {
    expect(excludedStageLines("vaginal", 5, maternity("diastasisRecti"))).toEqual([]);
    expect(excludedStageLines("vaginal", 13, maternity("diastasisRecti"))).toEqual([`코어 강화 제외 — ${R_DRA}`]);
  });
});

describe("연결 실패 · 조회 중", () => {
  it("실패 메시지 + [다시 시도]", () => {
    expect(exerciseBody({ kind: "failed", message: "x" }, "vaginal", 3, maternity())).toEqual({
      kind: "failed",
      title: "연결 실패",
      message: "x",
      retry: "다시 시도",
    });
  });

  it("결과가 없으면 조회 중 — 8초 전에는 안내 없음", () => {
    expect(exerciseBody(null, "vaginal", 3, maternity())).toEqual({
      kind: "loading",
      srLabel: "운동 영상을 불러오고 있어요",
      notice: null,
    });
  });

  it("8초가 지났거나 자동 재시도 중(waking)이면 스피너 아래 콜드스타트 안내(05 §0)", () => {
    expect(exerciseBody(null, "vaginal", 3, maternity(), { waking: true })).toMatchObject({
      kind: "loading",
      notice: "서버를 깨우는 중이에요 — 조금만 기다려 주세요",
    });
    const body = exerciseBody(null, "vaginal", 3, maternity(), { waking: true });
    if (body.kind !== "loading") throw new Error("loading");
    expect(body.notice).toBe(COLD_START_TEXT);
  });

  it("오프라인이면 실패 문구를 오프라인 안내로 — 제목·[다시 시도]는 그대로", () => {
    const failed: VideoLoad = { kind: "failed", message: EXERCISE_TEXT.failedUnreachable };
    expect(exerciseBody(failed, "vaginal", 3, maternity(), { offline: true })).toEqual({
      kind: "failed",
      title: "연결 실패",
      message: OFFLINE_TEXT,
      retry: "다시 시도",
    });
    // 온라인이면 원문 그대로
    const online = exerciseBody(failed, "vaginal", 3, maternity(), { offline: false });
    if (online.kind !== "failed") throw new Error("failed");
    expect(online.message).toBe(EXERCISE_TEXT.failedUnreachable);
  });

  it("오프라인이어도 미설정(준비 중)·목록은 바뀌지 않는다 — 오프라인 안내는 실패에만", () => {
    const unavailable: VideoLoad = { kind: "unavailable", message: EXERCISE_TEXT.unavailableBody };
    expect(exerciseBody(unavailable, "cesarean", 9, maternity(), { offline: true })).toMatchObject({
      kind: "unavailable",
      message: EXERCISE_TEXT.unavailableBody,
    });
    const loaded: VideoLoad = { kind: "loaded", videos: [video("a", "recovery_priority")] };
    expect(exerciseBody(loaded, "cesarean", 9, maternity(), { offline: true }).kind).toBe("plan");
  });
});

describe("영상 목록", () => {
  it("이 라우트에 영상이 없으면 빈 상태 문구(지어낸 영상 없음)", () => {
    expect(exerciseBody({ kind: "loaded", videos: [] }, "cesarean", 9, maternity())).toEqual({
      kind: "empty",
      message: "이 단계에 표시할 영상이 없어요.",
    });
  });

  it("가능 → 잠김 순, 섹션 제목·개수·배지·잠금 문구(ExerciseView.swift:64-74, 189-257)", () => {
    const load: VideoLoad = {
      kind: "loaded",
      videos: [video("c", "full_core"), video("a", "early_core_activation", undefined, "설명"), video("b", "functional_strengthening")],
    };
    const body = exerciseBody(load, "cesarean", 9, maternity());
    expect(body.kind).toBe("plan");
    if (body.kind !== "plan") return;
    expect(body.sections.map((s) => [s.title, s.count])).toEqual([
      ["지금 가능한 운동", 2],
      ["아직 이른 운동", 1],
    ]);
    const [a, b] = body.sections[0].cards;
    expect(a).toEqual({
      id: "a",
      title: "영상 a",
      badge: { text: "가능", tone: "normal" },
      bucketTitle: "코어 깨우기",
      description: "설명",
      action: { kind: "watch", href: "https://www.youtube.com/watch?v=a" },
      dimmed: false,
    });
    expect(b.description).toBeNull();
    expect(body.sections[1].cards[0]).toMatchObject({
      badge: { text: "12주에 열림", tone: "watch" },
      action: { kind: "locked", text: "복근·코어 강화·요가 (분만 무관)", tone: "secondary" },
      dimmed: true,
    });
  });

  it("임상 차단이 하나라도 있으면 잠긴 묶음 제목은 '지금은 권하지 않는 운동', 카드는 사유를 alert 색으로", () => {
    const load: VideoLoad = { kind: "loaded", videos: [video("b", "functional_strengthening")] };
    const body = exerciseBody(load, "cesarean", 9, maternity("pelvicPain"));
    if (body.kind !== "plan") throw new Error("plan이어야 한다");
    expect(body.sections).toHaveLength(1);
    expect(body.sections[0].title).toBe("지금은 권하지 않는 운동");
    expect(body.sections[0].cards[0]).toMatchObject({
      badge: { text: "지금은 권장 안 함", tone: "alert" },
      action: { kind: "locked", text: R_PELVIC, tone: "alert" },
    });
  });

  it("허용되지 않은 영상 주소는 링크로 만들지 않는다(safeExternalUrl)", () => {
    const load: VideoLoad = {
      kind: "loaded",
      videos: [video("x", "recovery_priority", "javascript:alert(1)"), video("y", "recovery_priority", "http://www.youtube.com/watch?v=y")],
    };
    const body = exerciseBody(load, "vaginal", 0, maternity());
    if (body.kind !== "plan") throw new Error("plan이어야 한다");
    expect(body.sections[0].cards.map((c) => c.action)).toEqual([
      { kind: "watch", href: null },
      { kind: "watch", href: null },
    ]);
  });

  it("플랜은 넘겨받은 산모수첩으로 매번 다시 계산한다 — 같은 조회 결과라도 DRA를 켜면 코어 강화가 잠긴다", () => {
    const load: VideoLoad = { kind: "loaded", videos: [video("c", "full_core")] };
    const open = exerciseBody(load, "vaginal", 13, maternity());
    const locked = exerciseBody(load, "vaginal", 13, maternity("diastasisRecti"));
    if (open.kind !== "plan" || locked.kind !== "plan") throw new Error("plan이어야 한다");
    expect(open.sections[0].cards[0].badge.text).toBe("가능");
    expect(locked.sections[0].title).toBe("지금은 권하지 않는 운동");
    expect(locked.sections[0].cards[0].action).toEqual({ kind: "locked", text: R_DRA, tone: "alert" });
  });
});
