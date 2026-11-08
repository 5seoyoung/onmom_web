// 빌드 전 운동 영상 목록 수집(videoSnapshotFetch.mts·scripts/videos-fetch.mjs) — 가짜 fetch로 영상 서버를 흉내 낸다(실제 Render·Supabase 요청 없음).
// 주소 모양은 함수와 같고(_shared/videos.ts upstreamVideosUrl), 응답 검사도 같다(sanitizeVideoPayload). 실패는 늘 빈 스냅숏 + 경고, 종료 코드 0.
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import { sanitizeVideoPayload, type VideoRouteTag } from "../../../supabase/functions/_shared/videos";
import { EMPTY_VIDEO_SNAPSHOT, parseVideoSnapshot, serializeVideoSnapshot } from "./videoSnapshot";
import {
  SNAPSHOT_REQUEST_TIMEOUT_MS,
  SNAPSHOT_RETRY_DELAY_MS,
  VIDEO_SNAPSHOT_MAX_BYTES,
  runVideoSnapshotFetch,
  type FetchLike,
  type RunOptions,
} from "./videoSnapshotFetch.mjs";

const V: VideoRouteTag = "route_vaginal_delivery";
const C: VideoRouteTag = "route_cesarean_section";
const BASE = "https://video-api.onmom.test";
const NOW = new Date("2026-11-08T18:30:00.000Z");
const EMPTY = serializeVideoSnapshot(EMPTY_VIDEO_SNAPSHOT);
const DESCRIPTION = "호흡과 깊은 코어 재활성화";

const video = (id: string, tag: string, extra: Record<string, unknown> = {}) => ({
  video_id: id,
  title: `영상 ${id}`,
  url: `https://youtu.be/${id}?t=1`,
  description: DESCRIPTION,
  tags: [tag, "stage_early_core_activation", "breathing"],
  ...extra,
});
const payload = (videos: unknown[]) => ({ count: videos.length, videos });

/** 한 번의 응답: 상태+본문, 연결 실패, 시간 초과, JSON 아님 */
type Reply = { status: number; body?: unknown } | "network" | "timeout" | "badJson";

const OK = {
  [V]: { status: 200, body: payload([video("v2", V, { internal: "upstream-only" }), video("v1", V)]) },
  [C]: { status: 200, body: payload([video("c1", C)]) },
} as const;

/** 경로 태그마다 응답을 차례로 돌려주는 가짜 영상 서버 — 마지막 응답은 계속 쓴다 */
function fakeServer(replies: Partial<Record<string, Reply[]>>) {
  const calls: { url: string; method: string; headers: Record<string, string>; signal: AbortSignal }[] = [];
  const seen = new Map<string, number>();
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, signal: init.signal });
    const tag = new URL(url).searchParams.get("include") ?? "";
    const list = replies[tag] ?? [{ status: 404 }];
    const n = seen.get(tag) ?? 0;
    seen.set(tag, n + 1);
    const r = list[Math.min(n, list.length - 1)];
    if (r === "network") throw new TypeError(`fetch failed ${url}`);
    if (r === "timeout") throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    if (r === "badJson") return { status: 200, json: async () => JSON.parse("<html>waking up</html>") };
    return { status: r.status, json: async () => r.body ?? { detail: `upstream error at ${url}` } };
  };
  return { fetch, calls };
}

async function run(replies: Partial<Record<string, Reply[]>>, patch: Partial<RunOptions> = {}) {
  const server = fakeServer(replies);
  const logs: string[] = [];
  const warns: string[] = [];
  const writes: string[] = [];
  const waits: number[] = [];
  const code = await runVideoSnapshotFetch({
    baseUrl: BASE,
    fetch: server.fetch,
    writeSnapshot: async (json) => void writes.push(json),
    log: (l) => void logs.push(l),
    warn: (l) => void warns.push(l),
    now: () => NOW,
    wait: async (ms) => void waits.push(ms),
    ...patch,
  });
  return { code, calls: server.calls, logs, warns, writes, waits };
}

type RunResult = Awaited<ReturnType<typeof run>>;

/** 빈 스냅숏을 한 번 쓰고 경고 한 줄 — 빌드는 이어진다 */
function expectEmpty(r: RunResult, warning: RegExp) {
  expect(r.code).toBe(0);
  expect(r.writes).toEqual([EMPTY]);
  expect(r.warns).toHaveLength(1);
  expect(r.warns[0]).toMatch(warning);
  expect(r.warns[0]).toContain("빈 목록으로 빌드합니다");
}

/** 로그·경고에 주소·응답 본문이 없다 */
function expectQuietLogs(r: RunResult) {
  const text = [...r.logs, ...r.warns].join("\n");
  expect(text).not.toMatch(/https?:|onmom\.test|youtu\.be/);
  expect(text).not.toContain(DESCRIPTION);
  expect(text).not.toContain("upstream");
}

describe("받기 — 두 경로를 차례로, 함수와 같은 주소·검사", () => {
  it("성공: 질식분만 → 제왕절개 순서로 GET {VIDEO_API_URL}/videos?include=…&limit=500, 다섯 필드만·서버 순서 그대로 쓴다", async () => {
    const r = await run({ [V]: [OK[V]], [C]: [OK[C]] }, { baseUrl: ` ${BASE}/ ` });
    expect(r.code).toBe(0);
    expect(r.calls.map((c) => c.url)).toEqual([`${BASE}/videos?include=${V}&limit=500`, `${BASE}/videos?include=${C}&limit=500`]);
    for (const c of r.calls) {
      expect(c.method).toBe("GET");
      expect(c.headers).toEqual({ Accept: "application/json" });
      expect(c.signal).toBeInstanceOf(AbortSignal);
    }
    expect(r.warns).toEqual([]);
    expect(r.writes).toHaveLength(1);
    const written = JSON.parse(r.writes[0]);
    expect(written.fetchedAt).toBe(NOW.toISOString());
    expect(Object.keys(written.routes)).toEqual([V, C]);
    expect(written.routes[V]).toEqual([video("v2", V), video("v1", V)]);
    expect(written.routes[C]).toEqual([video("c1", C)]);
    expect(r.writes[0]).not.toContain("upstream-only");
    // 앱이 읽는 검사를 통과하고, 쓴 글자는 그 결과를 다시 쓴 것과 같다
    expect(serializeVideoSnapshot(parseVideoSnapshot(written))).toBe(r.writes[0]);
    expect(r.logs).toHaveLength(1);
    expect(r.logs[0]).toMatch(new RegExp(`^videos-fetch: 영상 ${V} 2개 · ${C} 1개, \\d+바이트, 요청 2회, `));
    expectQuietLogs(r);
  });

  it("넉넉히 기다린다 — 요청마다 60초(함수의 40초보다 길게), 다시 묻기 전 5초", () => {
    expect(SNAPSHOT_REQUEST_TIMEOUT_MS).toBe(60_000);
    expect(SNAPSHOT_RETRY_DELAY_MS).toBe(5_000);
  });

  it.each<[string, Reply]>([
    ["시간 초과", "timeout"],
    ["연결 실패", "network"],
    ["HTTP 503", { status: 503 }],
    ["HTTP 502", { status: 502, body: "<html>bad gateway</html>" }],
  ])("잠든 서버(%s) — 5초 쉬고 한 번 더 묻고, 그다음 경로로", async (label, first) => {
    const r = await run({ [V]: [first, OK[V]], [C]: [OK[C]] });
    expect(r.calls.map((c) => new URL(c.url).searchParams.get("include"))).toEqual([V, V, C]);
    expect(r.waits).toEqual([SNAPSHOT_RETRY_DELAY_MS]);
    expect(r.logs[0]).toBe(`videos-fetch: ${V} ${label} - 5초 뒤 한 번 더 묻습니다(잠든 서버일 수 있음).`);
    expect(r.logs[1]).toContain("요청 3회");
    expect(r.warns).toEqual([]);
    expect(JSON.parse(r.writes[0]).fetchedAt).toBe(NOW.toISOString());
    expectQuietLogs(r);
  });
});

describe("실패는 빈 스냅숏 + 경고 한 줄(종료 코드 0) — 한 경로만 싣지 않는다", () => {
  it("첫 경로가 두 번 다 실패하면 둘째 경로는 묻지 않는다", async () => {
    const r = await run({ [V]: ["timeout", "network"], [C]: [OK[C]] });
    expectEmpty(r, new RegExp(`${V} 시간 초과 → 다시 시도도 연결 실패`));
    expect(r.calls).toHaveLength(2);
    expectQuietLogs(r);
  });

  it("둘째 경로만 실패해도 첫 경로를 싣지 않는다(요청 유무로 분만 방식이 드러나지 않게)", async () => {
    const r = await run({ [V]: [OK[V]], [C]: [{ status: 500 }, { status: 503 }] });
    expectEmpty(r, new RegExp(`${C} HTTP 500 → 다시 시도도 HTTP 503`));
    expect(r.calls).toHaveLength(3);
  });

  it("4xx는 다시 묻지 않는다", async () => {
    const r = await run({ [V]: [{ status: 404 }, OK[V]], [C]: [OK[C]] });
    expectEmpty(r, new RegExp(`${V} HTTP 404`));
    expect(r.calls).toHaveLength(1);
    expect(r.waits).toEqual([]);
    expectQuietLogs(r);
  });

  it("JSON이 아니면 다시 묻지 않고 빈 스냅숏", async () => {
    const r = await run({ [V]: ["badJson", OK[V]], [C]: [OK[C]] });
    expectEmpty(r, new RegExp(`${V} JSON이 아님`));
    expect(r.calls).toHaveLength(1);
  });

  it("응답 형식이 틀리면 거부한다 — 함수(sanitizeVideoPayload)가 거부하는 것과 같은 것들, 한 항목만 틀려도 전체", async () => {
    const bads: unknown[] = [
      null,
      [],
      "videos",
      { videos: [video("v1", V)] },
      { count: "1", videos: [video("v1", V)] },
      { count: -1, videos: [video("v1", V)] },
      { count: 1.5, videos: [video("v1", V)] },
      { count: 1, videos: "v1" },
      payload([video("v1", V), null]),
      payload([video("v1", V), { ...video("v2", V), title: 2 }]),
      payload([{ ...video("v1", V), url: null }]),
      payload([{ ...video("v1", V), description: undefined }]),
      payload([{ ...video("v1", V), tags: V }]),
      payload([{ ...video("v1", V), tags: [V, null] }]),
      payload([{ ...video("v1", V), video_id: 7 }]),
    ];
    for (const body of bads) {
      expect(sanitizeVideoPayload(body), JSON.stringify(body)).toBeNull();
      const r = await run({ [V]: [{ status: 200, body }, OK[V]], [C]: [OK[C]] });
      expectEmpty(r, new RegExp(`${V} 응답 형식이 틀림`));
      expect(r.calls).toHaveLength(1);
    }
  });

  it("한 경로가 비어 있으면(count 0) 받지 못한 것으로 본다", async () => {
    const r = await run({ [V]: [OK[V]], [C]: [{ status: 200, body: payload([]) }] });
    expectEmpty(r, /두 경로 모두 영상이 있어야/);
  });

  it("너무 크면 싣지 않는다(번들이 불지 않게)", async () => {
    expect(VIDEO_SNAPSHOT_MAX_BYTES).toBe(256 * 1024);
    const r = await run({ [V]: [OK[V]], [C]: [OK[C]] }, { maxBytes: 200 });
    expectEmpty(r, /목록이 너무 큽니다\(\d+바이트 > 상한 200바이트\)/);
  });

  it.each([undefined, "", "   "])("VIDEO_API_URL이 없으면(%j) 요청 없이 빈 스냅숏", async (baseUrl) => {
    const r = await run({ [V]: [OK[V]], [C]: [OK[C]] }, { baseUrl });
    expectEmpty(r, /VIDEO_API_URL이 없어 영상 목록을 받지 않았습니다\(요청 없음\)/);
    expect(r.calls).toEqual([]);
  });

  it.each(["http://video.example", "video.example", "https://user:pw@video.example", "ftp://video.example"])(
    "VIDEO_API_URL이 https가 아니면(%s) 요청 없이 빈 스냅숏 — 함수와 같은 규칙",
    async (baseUrl) => {
      const r = await run({ [V]: [OK[V]], [C]: [OK[C]] }, { baseUrl });
      expectEmpty(r, /VIDEO_API_URL 형식이 틀렸습니다/);
      expect(r.calls).toEqual([]);
      expect(r.warns[0]).not.toContain("video.example");
    },
  );
});

describe("scripts/videos-fetch.mjs — 실제 Node로", () => {
  const exec = promisify(execFile);
  const script = fileURLToPath(new URL("../../../scripts/videos-fetch.mjs", import.meta.url));
  const committed = fileURLToPath(new URL("../../content/videos.generated.json", import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), "onmom-videos-fetch-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  /** 표준 오류에 모듈 형식 경고(--disable-warning으로 끈다)·오류가 없다 — Node 버전마다 다른 경고 줄은 보지 않는다 */
  const expectCleanStderr = (stderr: string) => {
    expect(stderr).not.toContain("MODULE_TYPELESS_PACKAGE_JSON");
    expect(stderr).not.toMatch(/Error/);
  };
  const node = (out: string, env: Record<string, string>) =>
    exec(process.execPath, ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", script, out], {
      env: { ...process.env, GITHUB_ACTIONS: "", ...env },
      encoding: "utf8",
    });

  it("VIDEO_API_URL 없이: 종료 0, 경고 한 줄, 빈 스냅숏(배포 워크플로에서는 annotation) — 저장소 파일은 그대로", async () => {
    const before = readFileSync(committed, "utf8");
    const out = join(dir, "none.json");
    const local = await node(out, { VIDEO_API_URL: "" });
    expect(local.stdout.trim()).toMatch(/^videos-fetch: VIDEO_API_URL이 없어/);
    expectCleanStderr(local.stderr);
    expect(readFileSync(out, "utf8")).toBe(EMPTY);
    const ci = await node(out, { VIDEO_API_URL: "", GITHUB_ACTIONS: "true" });
    expect(ci.stdout.trim()).toMatch(/^::warning title=운동 영상 목록::videos-fetch: VIDEO_API_URL이 없어/);
    expect(readFileSync(committed, "utf8")).toBe(before);
  });

  it("로컬 가짜 서버(127.0.0.1)에서 두 경로를 받아 쓴다", async () => {
    const asked: string[] = [];
    const server = createServer((req, res) => {
      const u = new URL(req.url ?? "/", "http://127.0.0.1");
      asked.push(`${req.method} ${u.pathname}?${u.searchParams}`);
      const tag = u.searchParams.get("include") ?? "";
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(payload([video(`${tag}-1`, tag)])));
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    try {
      const { port } = server.address() as AddressInfo;
      const out = join(dir, "local.json");
      const { stdout, stderr } = await node(out, { VIDEO_API_URL: `http://127.0.0.1:${port}` });
      expectCleanStderr(stderr);
      expect(stdout).toMatch(new RegExp(`videos-fetch: 영상 ${V} 1개 · ${C} 1개`));
      expect(asked).toEqual([`GET /videos?include=${V}&limit=500`, `GET /videos?include=${C}&limit=500`]);
      const snapshot = parseVideoSnapshot(JSON.parse(readFileSync(out, "utf8")));
      expect(snapshot.routes[V].map((v) => v.video_id)).toEqual([`${V}-1`]);
      expect(snapshot.routes[C].map((v) => v.video_id)).toEqual([`${C}-1`]);
    } finally {
      await new Promise((done) => server.close(done));
    }
  });
});

describe("deploy.yml — 빌드 전에 받고, 값은 그 단계에만", () => {
  const deploy = readFileSync(fileURLToPath(new URL("../../../.github/workflows/deploy.yml", import.meta.url)), "utf8");
  const stepAt = (name: string) => deploy.indexOf(`- name: ${name}`);
  const fetchStep = () => {
    const start = stepAt("Fetch exercise video list");
    const next = deploy.indexOf("\n      - ", start + 1);
    return deploy.slice(start, next);
  };

  it("단계: 늘 성공하는 스크립트 + Variable VIDEO_API_URL", () => {
    expect(fetchStep()).toContain("run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/videos-fetch.mjs");
    expect(fetchStep()).toContain("VIDEO_API_URL: ${{ vars.VIDEO_API_URL }}");
    expect(fetchStep()).not.toContain("continue-on-error");
  });

  it("테스트 뒤, 두 빌드(e2e용·배포용) 앞 — 두 빌드가 같은 목록을 싣는다", () => {
    const order = ["- run: npm test", "- name: Fetch exercise video list", "- name: Build (browser-only, for e2e)", "- name: Build\n"].map((s) =>
      deploy.indexOf(s),
    );
    for (const at of order) expect(at).toBeGreaterThan(0);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("VIDEO_API_URL은 이 단계에만 — 빌드(브라우저 번들)에는 넘기지 않는다", () => {
    expect(deploy.match(/VIDEO_API_URL:/g)).toHaveLength(1);
  });
});
