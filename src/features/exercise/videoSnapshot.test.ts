// 운동 영상 목록 스냅숏의 형식(videoSnapshot.ts) — 빌드 전 수집과 앱이 같이 쓰는 검사.
// 영상 한 건은 Edge Function과 같은 규칙(sanitizeVideoPayload), 두 경로는 함께 있거나 함께 없다(요청 유무로 분만 방식이 드러나지 않게).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import snapshotJson from "@/content/videos.generated.json";
import { parseVideoResponse } from "@/api/video";
import { routeTag } from "@/rules/exercise";
import { sanitizeVideoPayload, VIDEO_ROUTE_TAGS, type VideoRouteTag } from "../../../supabase/functions/_shared/videos";
import { EMPTY_VIDEO_SNAPSHOT, parseVideoSnapshot, sanitizeRouteVideos, serializeVideoSnapshot, snapshotVideos, VideoSnapshotError } from "./videoSnapshot";

const V: VideoRouteTag = "route_vaginal_delivery";
const C: VideoRouteTag = "route_cesarean_section";
const NOW = "2026-11-08T18:30:00.000Z";

const video = (id: string, tag: string) => ({
  video_id: id,
  title: `영상 ${id}`,
  url: `https://youtu.be/${id}`,
  description: "호흡과 깊은 코어 재활성화",
  tags: [tag, "stage_early_core_activation"],
});

const full = () => ({ fetchedAt: NOW, routes: { [V]: [video("v1", V), video("v2", V)], [C]: [video("c1", C)] } });

/** 영상 한 건의 틀린 모양 — 함수(sanitizeVideoPayload)·웹(parseVideoResponse)이 전체를 거부하는 것들 */
const BAD_VIDEOS: readonly unknown[] = [
  null,
  "v1",
  { ...video("x", V), video_id: 1 },
  { ...video("x", V), title: null },
  { ...video("x", V), url: undefined },
  { ...video("x", V), description: 3 },
  { ...video("x", V), tags: "route_vaginal_delivery" },
  { ...video("x", V), tags: [V, 7] },
];

describe("저장소의 파일", () => {
  it("빈 스냅숏이다 — serializeVideoSnapshot(EMPTY)와 글자까지 같다(받은 목록은 커밋하지 않는다)", () => {
    const committed = readFileSync(fileURLToPath(new URL("../../content/videos.generated.json", import.meta.url)), "utf8");
    expect(committed).toBe(serializeVideoSnapshot(EMPTY_VIDEO_SNAPSHOT));
    expect(parseVideoSnapshot(snapshotJson)).toEqual(EMPTY_VIDEO_SNAPSHOT);
  });

  it("경로 태그는 함수와 웹이 같은 둘", () => {
    expect([V, C]).toEqual([routeTag("vaginal"), routeTag("cesarean")]);
    expect([...VIDEO_ROUTE_TAGS]).toEqual([V, C]);
    expect(Object.keys(EMPTY_VIDEO_SNAPSHOT.routes)).toEqual([V, C]);
  });
});

describe("parseVideoSnapshot", () => {
  it("받은 스냅숏: 다섯 필드만, 순서 그대로", () => {
    const raw = full();
    (raw.routes[V][0] as Record<string, unknown>).internal = "upstream-only";
    const s = parseVideoSnapshot(raw);
    expect(s.fetchedAt).toBe(NOW);
    expect(s.routes[V].map((v) => v.video_id)).toEqual(["v1", "v2"]);
    expect(Object.keys(s.routes[V][0])).toEqual(["video_id", "title", "url", "description", "tags"]);
    expect(s.routes[C]).toEqual([video("c1", C)]);
  });

  it("쓰고 읽으면 같다", () => {
    const s = parseVideoSnapshot(full());
    expect(parseVideoSnapshot(JSON.parse(serializeVideoSnapshot(s)))).toEqual(s);
  });

  it("영상 한 건이 틀리면 거부한다 — 함수·웹 응답 검사가 거부하는 것과 같은 것들", () => {
    for (const bad of BAD_VIDEOS) {
      const raw = full();
      (raw.routes[C] as unknown[]).push(bad);
      expect(() => parseVideoSnapshot(raw), JSON.stringify(bad)).toThrow(VideoSnapshotError);
      // 같은 목록을 함수·웹 응답으로 보면 둘 다 거부한다
      expect(sanitizeVideoPayload({ count: raw.routes[C].length, videos: raw.routes[C] })).toBeNull();
      expect(parseVideoResponse({ count: raw.routes[C].length, videos: raw.routes[C] })).toBeNull();
      expect(sanitizeRouteVideos(raw.routes[C])).toBeNull();
    }
  });

  it("두 경로는 함께 있거나 함께 없다 — 한쪽만 있거나 한쪽이 비면 거부(한쪽 사용자만 함수에 묻게 되지 않게)", () => {
    expect(() => parseVideoSnapshot({ fetchedAt: NOW, routes: { [V]: [video("v1", V)], [C]: [] } })).toThrow(/두 경로 모두/);
    expect(() => parseVideoSnapshot({ fetchedAt: NOW, routes: { [V]: [], [C]: [] } })).toThrow(/두 경로 모두/);
    expect(() => parseVideoSnapshot({ fetchedAt: NOW, routes: { [V]: [video("v1", V)] } })).toThrow(VideoSnapshotError);
    expect(() => parseVideoSnapshot({ fetchedAt: null, routes: { [V]: [video("v1", V)], [C]: [] } })).toThrow(/null이면/);
  });

  it("틀린 겉모양은 거부한다", () => {
    const bads: unknown[] = [
      null,
      [],
      "{}",
      { routes: { [V]: [], [C]: [] } },
      { fetchedAt: null },
      { fetchedAt: null, routes: [] },
      { fetchedAt: null, routes: { [V]: [], [C]: [] }, extra: 1 },
      { fetchedAt: null, routes: { [V]: [], [C]: [], route_other: [] } },
      { fetchedAt: "어제", routes: full().routes },
      { fetchedAt: "2026-11-08", routes: full().routes },
      { fetchedAt: 0, routes: full().routes },
      { fetchedAt: NOW, routes: { [V]: "v1", [C]: [video("c1", C)] } },
    ];
    for (const bad of bads) expect(() => parseVideoSnapshot(bad), JSON.stringify(bad)).toThrow(VideoSnapshotError);
  });
});

describe("snapshotVideos — 이 경로의 받아 둔 영상", () => {
  it("받은 스냅숏이면 그 경로 목록(같은 배열), 빈 스냅숏·모르는 태그면 null", () => {
    const s = parseVideoSnapshot(full());
    expect(snapshotVideos(s, V)).toBe(s.routes[V]);
    expect(snapshotVideos(s, C)?.map((v) => v.video_id)).toEqual(["c1"]);
    expect(snapshotVideos(s, "")).toBeNull();
    expect(snapshotVideos(s, "route_other")).toBeNull();
    for (const tag of [V, C]) expect(snapshotVideos(EMPTY_VIDEO_SNAPSHOT, tag)).toBeNull();
  });
});
