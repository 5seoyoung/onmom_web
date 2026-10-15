// 빌드 전 유튜브 수집(youtubeFetch.mts·scripts/youtube-fetch.mjs) — 가짜 fetch로 YouTube Data API를 흉내 낸다(실제 요청 없음).
// 싼 끝점만(videos·channels·playlistItems — search 없음), 키는 헤더로만(주소·로그·파일에 없음), 실패는 빈 목록 + HTTP 상태만.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import content from "@/content";
import allowlistJson from "@/content/youtube-allowlist.json";
import { EMPTY_CATALOG, orderedStageKeys, serializeCatalog } from "./youtubeCore.mjs";
import {
  IDS_PER_REQUEST,
  MAX_UPLOAD_PAGES,
  YOUTUBE_API_BASE,
  runYouTubeFetch,
  unplayableReason,
  type FetchLike,
  type RunOptions,
  type VideoResource,
} from "./youtubeFetch.mjs";

const STAGES = orderedStageKeys(content.stage_buckets);
const KEY = "TEST-ONLY-KEY-must-not-leak-12345";
const NOW = new Date("2026-10-15T18:30:00.000Z");

const CH_AUTO = "UCtestAutoShowChannel000";
const CH_REVIEW = "UCtestReviewOnlyChannel0";
const vid = (n: number) => `testVid${String(n).padStart(4, "0")}`;

interface FakeVideo {
  id: string;
  title: string;
  description?: string;
  channelId?: string;
  privacyStatus?: string;
  uploadStatus?: string;
  embeddable?: boolean;
  ytRating?: string;
  live?: string;
  regionRestriction?: { allowed?: string[]; blocked?: string[] };
}

interface FakeApi {
  videos?: FakeVideo[];
  /** 채널 ID → 업로드 재생목록 ID */
  channels?: Record<string, string>;
  /** 재생목록 ID → 쪽마다 영상(쪽 순서대로) */
  playlists?: Record<string, { videoId: string; title: string; description?: string }[][]>;
  /** n번째 요청(0부터)을 실패시킨다: HTTP 상태, "network"(연결 실패), "badJson" */
  failAt?: { index: number; with: number | "network" | "badJson" };
}

function fakeYouTube(api: FakeApi) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetch: FetchLike = async (url, init) => {
    const index = calls.length;
    calls.push({ url, headers: init.headers });
    if (api.failAt?.index === index) {
      if (api.failAt.with === "network") throw new TypeError(`fetch failed ${url}`);
      if (api.failAt.with === "badJson") return { ok: true, status: 200, json: async () => JSON.parse("<html>") };
      const status = api.failAt.with;
      return { ok: false, status, json: async () => ({ error: { message: `key ${init.headers["X-Goog-Api-Key"]} quota` } }) };
    }
    const u = new URL(url);
    const endpoint = u.pathname.split("/").pop();
    const ids = (u.searchParams.get("id") ?? "").split(",").filter(Boolean);
    let body: Record<string, unknown>;
    if (endpoint === "videos") {
      body = {
        items: (api.videos ?? [])
          .filter((v) => ids.includes(v.id))
          .map((v) => ({
            id: v.id,
            snippet: {
              title: v.title,
              description: v.description ?? "",
              channelId: v.channelId ?? CH_AUTO,
              channelTitle: "시험 채널",
              publishedAt: "2026-09-01T00:00:00Z",
              liveBroadcastContent: v.live ?? "none",
              thumbnails: { medium: { url: "https://evil.example/thumb.jpg" } },
            },
            status: { privacyStatus: v.privacyStatus ?? "public", uploadStatus: v.uploadStatus ?? "processed", embeddable: v.embeddable ?? true },
            contentDetails: { contentRating: v.ytRating ? { ytRating: v.ytRating } : {}, ...(v.regionRestriction ? { regionRestriction: v.regionRestriction } : {}) },
          })),
      };
    } else if (endpoint === "channels") {
      const items = ids.filter((id) => api.channels?.[id]).map((id) => ({ id, contentDetails: { relatedPlaylists: { uploads: api.channels![id] } } }));
      body = items.length > 0 ? { items } : { pageInfo: { totalResults: 0 } }; // 없는 채널이면 items가 빠진다
    } else if (endpoint === "playlistItems") {
      const pages = api.playlists?.[u.searchParams.get("playlistId") ?? ""] ?? [[]];
      const page = Number(u.searchParams.get("pageToken") ?? "0");
      body = {
        items: (pages[page] ?? []).map((p) => ({
          snippet: { title: p.title, description: p.description ?? "", resourceId: { kind: "youtube#video", videoId: p.videoId } },
          contentDetails: { videoId: p.videoId, videoPublishedAt: "2026-09-02T00:00:00Z" },
        })),
        ...(page + 1 < pages.length ? { nextPageToken: String(page + 1) } : {}),
      };
    } else {
      throw new Error(`시험이 모르는 끝점: ${url}`);
    }
    return { ok: true, status: 200, json: async () => body };
  };
  return { fetch, calls };
}

function allowlist(patch: Record<string, unknown> = {}): unknown {
  return {
    channels: [],
    videos: [],
    stageKeywords: (allowlistJson as { stageKeywords: unknown }).stageKeywords,
    excludeKeywords: (allowlistJson as { excludeKeywords: unknown }).excludeKeywords,
    excludePatterns: (allowlistJson as { excludePatterns: unknown }).excludePatterns,
    ...patch,
  };
}

async function run(api: FakeApi, patch: Partial<RunOptions> & { allowlistRaw?: unknown } = {}) {
  const { fetch, calls } = fakeYouTube(api);
  const logs: string[] = [];
  const writes: string[] = [];
  const code = await runYouTubeFetch({
    apiKey: KEY,
    allowlistRaw: allowlist(),
    stageKeys: STAGES,
    fetch,
    writeCatalog: async (json) => void writes.push(json),
    log: (l) => void logs.push(l),
    now: () => NOW,
    mode: "build",
    ...patch,
  });
  const written = writes.length > 0 ? (JSON.parse(writes[writes.length - 1]) as { generatedAt: string | null; videos: Record<string, unknown>[] }) : null;
  return { code, calls, logs, writes, written };
}

/** 키가 주소·로그·파일 어디에도 없다 — 헤더에만 */
function expectNoKeyLeak(r: Awaited<ReturnType<typeof run>>) {
  for (const c of r.calls) {
    expect(c.url).not.toContain(KEY);
    expect(c.url).not.toMatch(/[?&]key=/);
    expect(c.headers["X-Goog-Api-Key"]).toBe(KEY);
  }
  for (const l of r.logs) expect(l).not.toContain(KEY);
  for (const w of r.writes) expect(w).not.toContain(KEY);
}

/** 부른 끝점 — 모두 1단위짜리(search 없음) */
function endpoints(calls: { url: string }[]): string[] {
  return calls.map((c) => {
    expect(c.url.startsWith(`${YOUTUBE_API_BASE}/`)).toBe(true);
    return new URL(c.url).pathname.split("/").pop()!;
  });
}

const approved = (n: number, stageKey = "recovery_priority", delivery?: string) => ({ videoId: vid(n), stageKey, ...(delivery ? { delivery } : {}), note: "시험" });

describe("요청하지 않는 경우 — 파일도 그대로", () => {
  it("YOUTUBE_API_KEY가 없으면 요청·쓰기 없이 0", async () => {
    for (const apiKey of [undefined, "", "   "]) {
      const r = await run({}, { apiKey, allowlistRaw: allowlist({ videos: [approved(1)] }) });
      expect(r.code).toBe(0);
      expect(r.calls).toEqual([]);
      expect(r.writes).toEqual([]);
      expect(r.logs.join("\n")).toContain("YOUTUBE_API_KEY가 없어 건너뜁니다");
    }
  });

  it("허용 목록이 비면(저장소의 지금 상태) 키가 있어도 요청·쓰기 없이 0", async () => {
    const r = await run({}, { allowlistRaw: allowlistJson });
    expect(r.code).toBe(0);
    expect(r.calls).toEqual([]);
    expect(r.writes).toEqual([]);
  });

  it("허용 목록 형식이 틀리면 요청 없이 1(빌드도 같은 검사로 멈춘다)", async () => {
    const r = await run({}, { allowlistRaw: allowlist({ videos: [{ videoId: vid(1), stageKey: "nope", note: "n" }] }) });
    expect(r.code).toBe(1);
    expect(r.calls).toEqual([]);
    expect(r.writes).toEqual([]);
  });
});

describe("승인 영상 — videos.list(50개까지 1단위)로 상태 확인", () => {
  const api: FakeApi = {
    videos: [
      { id: vid(1), title: "산후 복식호흡 10분" },
      { id: vid(2), title: "비공개 영상", privacyStatus: "private" },
      { id: vid(3), title: "퍼가기 막힘", embeddable: false },
      { id: vid(4), title: "연령 제한", ytRating: "ytAgeRestricted" },
      { id: vid(5), title: "예정 방송", live: "upcoming" },
      { id: vid(6), title: "한국 차단", regionRestriction: { blocked: ["KR"] } },
      { id: vid(7), title: "일본만", regionRestriction: { allowed: ["JP"] } },
      { id: vid(8), title: "처리 중", uploadStatus: "uploaded" },
      { id: vid(9), title: "3일 만에 뱃살 빼는 케겔" },
      { id: vid(10), title: "제왕절개 후 브릿지\u0000  운동" },
    ],
  };
  const list = allowlist({ videos: [...Array.from({ length: 9 }, (_, i) => approved(i + 1)), approved(10, "functional_strengthening", "cesarean"), approved(11)] });

  it("공개·처리 끝·퍼가기 허용·연령 제한 없음·방송 아님·한국에서 볼 수 있고 제목이 제외 키워드에 안 맞는 것만", async () => {
    const r = await run(api, { allowlistRaw: list });
    expect(r.code).toBe(0);
    expect(endpoints(r.calls)).toEqual(["videos"]);
    expect(r.written).toEqual({
      generatedAt: NOW.toISOString(),
      videos: [
        {
          videoId: vid(1),
          channelId: CH_AUTO,
          title: "산후 복식호흡 10분",
          channelTitle: "시험 채널",
          publishedAt: "2026-09-01T00:00:00Z",
          stageKey: "recovery_priority",
          thumbnail: `https://i.ytimg.com/vi/${vid(1)}/mqdefault.jpg`,
        },
        {
          videoId: vid(10),
          channelId: CH_AUTO,
          title: "제왕절개 후 브릿지 운동", // 제어 문자·겹친 공백 정리
          channelTitle: "시험 채널",
          publishedAt: "2026-09-01T00:00:00Z",
          stageKey: "functional_strengthening",
          delivery: "cesarean",
          thumbnail: `https://i.ytimg.com/vi/${vid(10)}/mqdefault.jpg`,
        },
      ],
    });
    // API가 준 미리보기 주소·설명은 싣지 않는다
    expect(r.writes[0]).not.toContain("evil.example");
    expect(r.writes[0]).not.toContain("description");
    expectNoKeyLeak(r);
    expect(r.logs.at(-1)).toContain("요청 1회(할당량 1단위)");
  });

  it(`승인 영상 ${IDS_PER_REQUEST + 1}개 → videos.list 2번(50 + 1)`, async () => {
    const many = Array.from({ length: IDS_PER_REQUEST + 1 }, (_, i) => approved(100 + i));
    const r = await run({ videos: many.map((m) => ({ id: m.videoId, title: "산후 복식호흡" })) }, { allowlistRaw: allowlist({ videos: many }) });
    expect(endpoints(r.calls)).toEqual(["videos", "videos"]);
    expect(r.calls.map((c) => new URL(c.url).searchParams.get("id")!.split(",").length)).toEqual([IDS_PER_REQUEST, 1]);
    expect(r.written?.videos).toHaveLength(IDS_PER_REQUEST + 1);
  });

  it("unplayableReason — 볼 수 있는 영상만 null", () => {
    const base: VideoResource = {
      id: vid(1),
      title: "t",
      description: "",
      channelId: CH_AUTO,
      channelTitle: "c",
      publishedAt: "2026-09-01T00:00:00Z",
      liveBroadcastContent: "none",
      privacyStatus: "public",
      uploadStatus: "processed",
      embeddable: true,
      ytRating: null,
      regionAllowed: null,
      regionBlocked: [],
    };
    expect(unplayableReason(base)).toBeNull();
    expect(unplayableReason({ ...base, privacyStatus: "unlisted" })).not.toBeNull();
    expect(unplayableReason({ ...base, regionAllowed: ["KR", "JP"] })).toBeNull();
    expect(unplayableReason({ ...base, liveBroadcastContent: "live" })).not.toBeNull();
  });
});

describe("허용 채널 — autoShow가 true인 채널만 업로드를 읽는다(기본 false = 검토 대기)", () => {
  const channels = [
    { channelId: CH_AUTO, title: "자동", tier: "A", autoShow: true, note: "시험" },
    { channelId: CH_REVIEW, title: "검토", tier: "A", note: "시험" },
  ];
  const api: FakeApi = {
    channels: { [CH_AUTO]: "UUauto", [CH_REVIEW]: "UUreview" },
    playlists: {
      UUauto: [
        [
          { videoId: vid(1), title: "산후 케겔 운동" },
          { videoId: vid(2), title: "아기 목욕 브이로그", description: "호흡 #케겔" }, // 제목이 단계에 안 맞음 → 후보 아님
          { videoId: vid(3), title: "산후 다이어트 스쿼트" }, // 제외 키워드
        ],
        [{ videoId: vid(4), title: "골반 기울이기" }],
        [{ videoId: vid(5), title: "세 번째 쪽(읽지 않음) 케겔" }],
      ],
      UUreview: [[{ videoId: vid(6), title: "검토 채널 케겔" }]],
    },
    videos: [
      { id: vid(1), title: "산후 케겔 운동", channelId: CH_AUTO },
      { id: vid(4), title: "골반 기울이기", channelId: "UCsomeoneElsesChannel000" }, // 다른 채널 영상 → 뺀다
      { id: vid(5), title: "세 번째 쪽(읽지 않음) 케겔", channelId: CH_AUTO },
      { id: vid(6), title: "검토 채널 케겔", channelId: CH_REVIEW },
    ],
  };

  it(`channels.list 1 + playlistItems ${MAX_UPLOAD_PAGES}쪽(그 뒤는 읽지 않음) + videos.list 1 — 키워드에 맞는 후보만 상태 확인`, async () => {
    const r = await run(api, { allowlistRaw: allowlist({ channels }) });
    expect(endpoints(r.calls)).toEqual(["channels", "playlistItems", "playlistItems", "videos"]);
    expect(new URL(r.calls[0].url).searchParams.get("id")).toBe(CH_AUTO); // autoShow가 꺼진 채널은 읽지 않는다
    expect(new URL(r.calls[3].url).searchParams.get("id")).toBe([vid(1), vid(4)].join(","));
    expect(r.written?.videos.map((v) => [v.videoId, v.stageKey])).toEqual([[vid(1), "pelvic_floor"]]);
    expect(r.written?.videos[0]).not.toHaveProperty("delivery");
    expectNoKeyLeak(r);
  });

  it("승인 영상이 같은 채널에 있으면 승인 값이 이긴다(두 번 싣지 않는다)", async () => {
    const r = await run(api, { allowlistRaw: allowlist({ channels, videos: [approved(1, "functional_strengthening")] }) });
    expect(endpoints(r.calls)).toEqual(["videos", "channels", "playlistItems", "playlistItems", "videos"]);
    expect(r.written?.videos.map((v) => [v.videoId, v.stageKey])).toEqual([[vid(1), "functional_strengthening"]]);
  });

  it("--review: 모든 허용 채널의 최근 업로드를 후보로 출력만 — 파일은 쓰지 않는다", async () => {
    const r = await run(api, { allowlistRaw: allowlist({ channels, videos: [approved(6, "pelvic_floor")] }), mode: "review" });
    expect(r.code).toBe(0);
    expect(r.writes).toEqual([]);
    expect(endpoints(r.calls)).toEqual(["channels", "playlistItems", "playlistItems", "playlistItems"]);
    const out = r.logs.join("\n");
    expect(out).toContain(`${vid(1)}\t2026-09-02\tpelvic_floor\t산후 케겔 운동`);
    expect(out).toContain(`${vid(2)}\t2026-09-02\t단계 없음\t`);
    expect(out).toContain(`${vid(3)}\t2026-09-02\t제외(다이어트)\t`);
    expect(out).toContain(`${vid(6)}\t2026-09-02\t승인됨\t`);
    expectNoKeyLeak(r);
  });
});

describe("API 실패 — HTTP 상태만 남기고 빈 목록(예전 목록·일부 목록을 남기지 않는다)", () => {
  const channels = [{ channelId: CH_AUTO, title: "자동", tier: "A", autoShow: true, note: "시험" }];
  const api: FakeApi = {
    videos: [{ id: vid(1), title: "산후 복식호흡" }],
    channels: { [CH_AUTO]: "UUauto" },
    playlists: { UUauto: [[{ videoId: vid(2), title: "케겔" }]] },
  };
  const list = allowlist({ channels, videos: [approved(1)] });

  it.each([
    [0, 403, "videos.list HTTP 403"],
    [1, 500, "channels.list HTTP 500"], // 승인 영상은 받았지만 다음 호출이 실패 → 일부만 싣지 않는다
    [2, 404, "playlistItems.list HTTP 404"],
    [0, "network", "videos.list 연결 실패"],
    [0, "badJson", "videos.list HTTP 200"],
  ] as const)("%i번째 요청 실패(%s) → '%s'", async (index, failure, label) => {
    const r = await run({ ...api, failAt: { index, with: failure } }, { allowlistRaw: list });
    expect(r.code).toBe(0);
    expect(r.writes).toEqual([serializeCatalog(EMPTY_CATALOG)]);
    expect(r.logs).toEqual([`youtube-fetch: YouTube API 실패(${label}) - 유튜브 추천 영상 없이 빌드합니다.`]);
    // 응답 본문·주소·키를 로그에 옮기지 않는다
    expect(r.logs.join("\n")).not.toMatch(/googleapis|quota|https?:/);
    expectNoKeyLeak(r);
  });
});

describe("scripts/youtube-fetch.mjs — 저장소의 빈 허용 목록이면 무엇도 하지 않는다", () => {
  const script = fileURLToPath(new URL("../../../scripts/youtube-fetch.mjs", import.meta.url));
  const generated = fileURLToPath(new URL("../../content/youtube.generated.json", import.meta.url));

  it("키 없이·가짜 키로 실행해도 종료 0, 출력에 키 없음, 생성 파일 그대로", () => {
    const before = readFileSync(generated, "utf8");
    for (const key of ["", KEY]) {
      const out = execFileSync(process.execPath, [script], { env: { ...process.env, YOUTUBE_API_KEY: key }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      expect(out).toContain("youtube-fetch: 허용 목록이 비어 있어 건너뜁니다(요청 없음).");
      expect(out).not.toContain(KEY);
    }
    expect(readFileSync(generated, "utf8")).toBe(before);
  });
});
