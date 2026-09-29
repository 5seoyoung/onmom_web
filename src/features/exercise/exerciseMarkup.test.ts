// 운동 탭 본문 마크업 검사 — 영상 서버(프록시)가 살아 있을 때의 실제 영상 카드와 상태 블록(서버 렌더로 확인).
// [영상 보기]는 safeExternalUrl을 거친 주소로 새 탭(EXTERNAL_LINK_PROPS), 배지·잠김 문구는 규칙(rules/exercise) 결과 그대로,
// 콜드스타트 안내·연결 실패 [다시 시도]·오프라인 문구·빈 목록·영상 준비 중이 각각 그려지는지 본다.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EXTERNAL_LINK_PROPS } from "@/api/safeUrl";
import type { MaternityRecord } from "@/domain/types";
import { OFFLINE_TEXT } from "@/features/home/useOnline";
import { EXERCISE_TEXT, type Video } from "@/rules/exercise";
import { ExerciseBodyView } from "./ExerciseBlocks";
import { exerciseBody, type VideoLoad } from "./exerciseModel";
import { COLD_START_TEXT } from "./videoLoad";

const noop = () => {};
const count = (html: string, needle: string) => html.split(needle).length - 1;

function maternity(patch: Partial<MaternityRecord> = {}): MaternityRecord {
  return { isPrimiparous: true, gdm: false, anemia: false, heavyBleeding: false, preeclampsia: false, pelvicPain: false, diastasisRecti: false, ...patch };
}

function video(id: string, stage: string, url = `https://www.youtube.com/watch?v=${id}`, description = ""): Video {
  return { video_id: id, title: `영상 ${id}`, url, description, tags: [`stage_${stage}`, "route_cesarean_section"] };
}

const R_PELVIC = "골반통·치골결합 통증이 있어 한다리·비대칭 동작(클램·런지 등)은 피해요";

/** 제왕절개 9주 + 골반통: 회복 우선기·코어 깨우기·골반저근 가능, 기능 강화는 임상 차단, 코어 강화는 12주에 열림 */
const LIVE: VideoLoad = {
  kind: "loaded",
  videos: [
    video("a", "recovery_priority", undefined, "호흡과 걷기"),
    video("b", "early_core_activation"),
    video("c", "pelvic_floor"),
    video("d", "functional_strengthening"),
    video("e", "full_core"),
    // 허용되지 않은 주소(http) — 카드는 그리되 [영상 보기] 링크는 만들지 않는다(검수 #51)
    video("f", "recovery_priority", "http://example.com/video"),
  ],
};

describe("영상 목록(프록시 살아 있음) — 실제 영상 카드", () => {
  const html = renderToStaticMarkup(h(ExerciseBodyView, { body: exerciseBody(LIVE, "cesarean", 9, maternity({ pelvicPain: true })), onRetry: noop }));

  it("두 섹션: 지금 가능한 운동 4 · 지금은 권하지 않는 운동 2(임상 차단이 있으면 '아직 이른' 대신)", () => {
    expect(html).toContain(EXERCISE_TEXT.unlockedSection);
    expect(html).toContain(EXERCISE_TEXT.lockedSectionBlocked);
    expect(html).not.toContain(EXERCISE_TEXT.lockedSectionEarly);
    expect(count(html, "<article")).toBe(6);
  });

  it("[영상 보기]는 safeExternalUrl 주소로 새 탭(target=_blank · rel) — 허용되지 않은 주소(http)는 링크를 그리지 않는다", () => {
    const links = html.match(/<a [^>]*href="https:\/\/www\.youtube\.com\/watch\?v=[a-e]"[^>]*>/g) ?? [];
    // 가능한 4개(a·b·c는 가능, d는 차단, e는 잠김) — 가능 카드에만 [영상 보기]
    expect(links).toHaveLength(3);
    for (const a of links) {
      expect(a).toContain(`target="${EXTERNAL_LINK_PROPS.target}"`);
      expect(a).toContain(`rel="${EXTERNAL_LINK_PROPS.rel}"`);
    }
    expect(count(html, EXERCISE_TEXT.watchVideo)).toBe(3);
    expect(html).not.toContain('href="http://example.com/video"');
  });

  it("배지: 가능 / 지금은 권장 안 함 / 12주에 열림 — 잠긴 카드는 사유(차단) 또는 단계 요약을 보인다", () => {
    expect(count(html, ">가능<")).toBe(4); // a·b·c·f
    expect(count(html, ">지금은 권장 안 함<")).toBe(1);
    expect(count(html, ">12주에 열림<")).toBe(1);
    expect(html).toContain(R_PELVIC);
    // 설명이 있는 카드만 설명 줄
    expect(html).toContain("호흡과 걷기");
    // 잠긴 카드는 흐리게
    expect(count(html, "opacity-70")).toBe(2);
  });

  it("단계명은 규칙의 단계 제목 그대로", () => {
    for (const title of ["회복 우선기", "코어 깨우기", "골반저근", "기능 강화", "코어 강화"]) expect(html).toContain(title);
  });
});

describe("상태 블록 — 늘 있는 live region 안에서 바뀐다", () => {
  const render = (body: ReturnType<typeof exerciseBody>) => renderToStaticMarkup(h(ExerciseBodyView, { body, onRetry: noop }));

  it("불러오는 중: 스피너 이름만, 8초 뒤(waking)엔 콜드스타트 안내가 보인다", () => {
    const quiet = render(exerciseBody(null, "cesarean", 9, maternity()));
    expect(quiet).toContain('aria-live="polite"');
    expect(quiet).toContain('role="status"');
    expect(quiet).toContain("운동 영상을 불러오고 있어요");
    expect(quiet).not.toContain(COLD_START_TEXT);
    const waking = render(exerciseBody(null, "cesarean", 9, maternity(), { waking: true }));
    expect(waking).toContain(COLD_START_TEXT);
  });

  it("연결 실패: 제목·원문 문구·[다시 시도] 버튼. 오프라인이면 문구만 오프라인 안내로", () => {
    const failed: VideoLoad = { kind: "failed", message: EXERCISE_TEXT.failedServer };
    const online = render(exerciseBody(failed, "cesarean", 9, maternity()));
    expect(online).toContain(EXERCISE_TEXT.failedTitle);
    expect(online).toContain(EXERCISE_TEXT.failedServer);
    expect(online).toMatch(/<button type="button"[^>]*>다시 시도<\/button>/);
    const offline = render(exerciseBody(failed, "cesarean", 9, maternity(), { offline: true }));
    expect(offline).toContain(OFFLINE_TEXT);
    expect(offline).not.toContain(EXERCISE_TEXT.failedServer);
    expect(offline).toMatch(/<button type="button"[^>]*>다시 시도<\/button>/);
  });

  it("영상 준비 중(미설정): 원문 + 현재 단계(차단 단계 제외) + '{단계} 제외 — {사유}'", () => {
    const html = render(exerciseBody({ kind: "unavailable", message: EXERCISE_TEXT.unavailableBody }, "cesarean", 9, maternity({ pelvicPain: true })));
    expect(html).toContain(EXERCISE_TEXT.unavailableTitle);
    expect(html).toContain(EXERCISE_TEXT.unavailableBody);
    expect(html).toContain("지금은 9주차 · 골반저근 단계예요");
    expect(html).toContain(`기능 강화 제외 — ${R_PELVIC}`);
    expect(html).not.toContain(EXERCISE_TEXT.retry);
  });

  it("조회는 됐지만 이 단계에 영상이 없음: 원문 한 줄, 섹션·면책 없음", () => {
    const html = render(exerciseBody({ kind: "loaded", videos: [] }, "cesarean", 9, maternity()));
    expect(html).toContain(EXERCISE_TEXT.emptyPlan);
    expect(html).not.toContain(EXERCISE_TEXT.unlockedSection);
    expect(html).not.toContain("<article");
  });
});
