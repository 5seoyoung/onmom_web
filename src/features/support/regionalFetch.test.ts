// 빌드 전 우리 지역 지원사업 수집(regionalFetch.mts·scripts/support-fetch.mjs) — 가짜 fetch로 공공데이터포털(api.odcloud.kr)을 흉내 낸다(실제 요청 없음).
// 응답 모양은 공개 명세(https://infuser.odcloud.kr/api/stages/44436/api-docs)와 시험 자료(fixtures/gov24-serviceList.sample.json)를 따른다.
// 키는 주소의 serviceKey로만(로그·경고·파일에 없음), 실패는 빈 표시 + 경고 한 줄, 고른 사업은 임신·출산·개인 대상·지역을 알 수 있는 것만.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/gov24-serviceList.sample.json";
import { EMPTY_META, parseDataset, parseMeta, serializeMeta } from "./regionalCore.mjs";
import {
  GOV24_LIST_URL,
  MAX_PAGES,
  PER_PAGE,
  RETRY_DELAY_MS,
  normalizeServiceKey,
  runSupportFetch,
  selectPrograms,
  type FetchLike,
  type RunOptions,
  type SupportFetchOutput,
} from "./regionalFetch.mjs";

const KEY = "TEST-ONLY-KEY+must/not=leak";
/** 2026-11-08 03:30 한국 시간(전날 18:30 UTC — 매일 배포 시각) */
const NOW = new Date("2026-11-07T18:30:00.000Z");
const FIXTURE_ITEMS = fixture.data as Record<string, unknown>[];

type Failure = number | "network" | "badJson" | "noData" | { perPage: number } | { body: unknown };

interface FakeApi {
  items?: Record<string, unknown>[];
  /** totalCount를 따로 정한다(기본: items 수) */
  totalCount?: number;
  /** 요청 순번(0부터) → 실패 */
  failAt?: Record<number, Failure>;
}

function fakeGov24(api: FakeApi) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const items = api.items ?? FIXTURE_ITEMS;
  const fetch: FetchLike = async (url, init) => {
    const index = calls.length;
    calls.push({ url, headers: init.headers });
    const u = new URL(url);
    const page = Number(u.searchParams.get("page"));
    const perPage = Number(u.searchParams.get("perPage"));
    const failure = api.failAt?.[index];
    if (failure === "network") throw new TypeError(`fetch failed ${url}`);
    if (failure === "badJson") return { ok: true, status: 200, json: async () => JSON.parse("<html>") };
    if (failure === "noData") return { ok: true, status: 200, json: async () => ({ page, perPage, totalCount: items.length }) };
    if (typeof failure === "number") {
      // 공공데이터포털 오류 응답에 키가 되비쳐 와도 로그에 옮기지 않아야 한다
      return { ok: false, status: failure, json: async () => ({ code: -4, msg: `등록되지 않은 인증키 ${u.searchParams.get("serviceKey")}` }) };
    }
    if (failure !== undefined && "body" in failure) return { ok: true, status: 200, json: async () => failure.body };
    const echoedPerPage = failure !== undefined && "perPage" in failure ? failure.perPage : perPage;
    const data = items.slice((page - 1) * perPage, page * perPage);
    return {
      ok: true,
      status: 200,
      json: async () => ({ page, perPage: echoedPerPage, totalCount: api.totalCount ?? items.length, currentCount: data.length, matchCount: data.length, data }),
    };
  };
  return { fetch, calls };
}

async function run(api: FakeApi = {}, patch: Partial<RunOptions> = {}) {
  const { fetch, calls } = fakeGov24(api);
  const logs: string[] = [];
  const warnings: string[] = [];
  const writes: SupportFetchOutput[] = [];
  const sleeps: number[] = [];
  const code = await runSupportFetch({
    serviceKey: KEY,
    fetch,
    hash: () => "0123456789ab",
    write: async (o) => void writes.push(o),
    log: (l) => void logs.push(l),
    warn: (l) => void warnings.push(l),
    now: () => NOW,
    sleep: async (ms) => void sleeps.push(ms),
    ...patch,
  });
  const last = writes[writes.length - 1];
  return { code, calls, logs, warnings, writes, sleeps, meta: last ? parseMeta(JSON.parse(last.meta)) : null, data: last?.data ?? null };
}

/** 키가 로그·경고·쓴 파일 어디에도 없다 — 요청 주소의 serviceKey에만 */
function expectNoKeyLeak(r: Awaited<ReturnType<typeof run>>) {
  const forms = [KEY, encodeURIComponent(KEY), new URLSearchParams({ k: KEY }).toString().slice(2)];
  for (const text of [...r.logs, ...r.warnings, ...r.writes.flatMap((w) => [w.meta, w.data ?? ""])]) {
    for (const f of forms) expect(text).not.toContain(f);
  }
  for (const c of r.calls) expect(JSON.stringify(c.headers)).not.toContain(KEY);
}

/** 많은 사업 — n건, 앞의 절반은 임신·출산 지자체 사업 */
function manyItems(n: number): Record<string, unknown>[] {
  return Array.from({ length: n }, (_, i) => ({
    서비스ID: `T${String(i).padStart(9, "0")}`,
    서비스명: i % 2 === 0 ? `[시험] 출산 지원 ${i}` : `[시험] 다른 사업 ${i}`,
    서비스목적요약: "시험 자료",
    상세조회URL: `https://www.gov.kr/portal/rcvfvrSvc/dtlEx/T${String(i).padStart(9, "0")}`,
    소관기관명: "경기도 성남시",
    소관기관유형: "지방자치단체",
    사용자구분: "개인",
    서비스분야: "생활안정",
    조회수: i,
  }));
}

describe("selectPrograms — 시험 자료(fixtures/gov24-serviceList.sample.json)", () => {
  const { programs, stats } = selectPrograms(FIXTURE_ITEMS);
  const byId = new Map(programs.map((p) => [p.id, p]));

  it("임신·출산(분야 또는 이름) · 개인/가구 · 지역을 알 수 있는 것만, 조회수 많은 순", () => {
    expect(programs.map((p) => p.id)).toEqual([
      "135200000901",
      "B55100000902",
      "322000000903",
      "611000000904",
      "378000000906",
      "484000000907",
      "362000000908",
      "418000000909",
      "569000000910",
      "502000000911",
      "000000000916",
      "741000000905",
    ]);
    expect(stats).toEqual({ received: 16, pregnancyBirth: 15, notIndividual: 1, unknownRegion: 1, badRecord: 1, national: 3, local: 9 });
  });

  it("지역: 기관명의 시·도·시·군·구(예전 이름은 지금 시·도로), 전국은 sido null", () => {
    const region = (id: string) => [byId.get(id)?.sido, byId.get(id)?.sigungu];
    expect(region("135200000901")).toEqual([null, null]);
    expect(region("B55100000902")).toEqual([null, null]);
    expect(region("322000000903")).toEqual(["seoul", "강남구"]);
    expect(region("611000000904")).toEqual(["seoul", null]);
    expect(region("741000000905")).toEqual(["seoul", null]);
    expect(region("378000000906")).toEqual(["gyeonggi", "성남시"]);
    expect(region("484000000907")).toEqual(["jeonnam-gwangju", "광양시"]);
    expect(region("362000000908")).toEqual(["jeonnam-gwangju", "북구"]);
    expect(region("418000000909")).toEqual(["gangwon", "춘천시"]);
    expect(region("569000000910")).toEqual(["sejong", null]);
    expect(region("502000000911")).toEqual(["jeju", "서귀포시"]);
  });

  it("상세 주소: 정부24 https면 그대로, 비었거나 다른 곳(javascript:·비슷한 도메인)이면 정부24 상세 화면 주소", () => {
    expect(byId.get("135200000901")?.url).toBe("https://www.gov.kr/portal/rcvfvrSvc/dtlEx/135200000901");
    expect(byId.get("741000000905")?.url).toBe("https://www.gov.kr/portal/rcvfvrSvc/dtlEx/741000000905");
    expect(byId.get("502000000911")?.url).toBe("https://www.gov.kr/portal/rcvfvrSvc/dtlEx/502000000911");
    expect(byId.get("000000000916")?.url).toBe("https://www.gov.kr/portal/rcvfvrSvc/dtlEx/000000000916");
  });

  it("요약: 서비스목적요약, 비었으면 지원내용(글머리표를 떼고 한 줄로)", () => {
    expect(byId.get("135200000901")?.summary).toBe("시험 자료 - 전국 산모를 위한 건강관리 안내입니다.");
    expect(byId.get("B55100000902")?.summary).toBe("시험 자료 - 진료비 안내 첫 줄 둘째 줄");
  });

  it("화면에 싣는 값만 — 지원대상·전화·부서·조회수 등은 싣지 않는다", () => {
    for (const p of programs) expect(Object.keys(p).sort()).toEqual(["agency", "id", "name", "sido", "sigungu", "summary", "url"]);
  });

  it("글자가 아닌 값·보이지 않는 문자·긴 글자도 다듬어 싣는다", () => {
    const RLO = String.fromCharCode(0x202e);
    const { programs: out } = selectPrograms([
      {
        서비스ID: "X1",
        서비스명: `[시험] ${RLO}출산 ${"가".repeat(200)}`,
        서비스목적요약: 42,
        지원내용: ["목록"],
        소관기관명: "서울특별시   강남구",
        소관기관유형: "지방자치단체",
        사용자구분: "개인",
        서비스분야: null,
        조회수: "많음",
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].name).not.toContain(RLO);
    expect(out[0].name.length).toBeLessThanOrEqual(80);
    expect(out[0]).toMatchObject({ agency: "서울특별시 강남구", sido: "seoul", sigungu: "강남구", summary: "" });
    expect(() => parseDataset({ version: 1, asOf: "2026-11-08", programs: out })).not.toThrow();
  });
});

describe("runSupportFetch — 키 없음", () => {
  it.each([undefined, "", "   "])("요청 없이 빈 표시, 목록 파일 지움, 종료 0 (키: %j)", async (serviceKey) => {
    const r = await run({}, { serviceKey });
    expect(r.code).toBe(0);
    expect(r.calls).toHaveLength(0);
    expect(r.writes).toEqual([{ meta: serializeMeta(EMPTY_META), data: null }]);
    expect(r.logs.join("\n")).toContain("DATA_GO_KR_SERVICE_KEY가 없어 건너뜁니다");
    expect(r.warnings).toEqual([]);
  });
});

describe("runSupportFetch — 성공", () => {
  it("serviceList만, 쪽마다 perPage·JSON·serviceKey — 표시(기준일은 한국 날짜)와 목록을 쓴다", async () => {
    const r = await run();
    expect(r.code).toBe(0);
    expect(r.calls).toHaveLength(1);
    const u = new URL(r.calls[0].url);
    expect(`${u.origin}${u.pathname}`).toBe(GOV24_LIST_URL);
    expect(Object.fromEntries(u.searchParams)).toEqual({ page: "1", perPage: String(PER_PAGE), returnType: "JSON", serviceKey: KEY });
    expect(r.meta).toEqual({ asOf: "2026-11-08", count: 12, hash: "0123456789ab" });
    const ds = parseDataset(JSON.parse(r.data!));
    expect(ds.asOf).toBe("2026-11-08");
    expect(ds.programs).toHaveLength(12);
    expect(r.logs.join("\n")).toContain("싣는 사업 12건(전국 3 · 지역 9)");
    // 기관명에서 시·도를 찾지 못한 지자체 사업이 있으면 경고(규칙을 고칠 때 본다)
    expect(r.warnings).toEqual([expect.stringContaining("지자체 사업 1건의 기관명에서 시·도를 찾지 못해")]);
    expectNoKeyLeak(r);
  });

  it("목록 파일은 한 줄, 같은 응답이면 같은 내용(해시가 같다)", async () => {
    const a = await run();
    const b = await run();
    expect(a.data).toBe(b.data);
    expect(a.data).not.toContain("\n");
  });

  it("여러 쪽 — totalCount로 쪽 수를 정해 다 받는다", async () => {
    const items = manyItems(PER_PAGE * 2 + 500);
    const r = await run({ items });
    expect(r.calls.map((c) => new URL(c.url).searchParams.get("page"))).toEqual(["1", "2", "3"]);
    expect(r.meta?.count).toBe(Math.ceil(items.length / 2));
  });

  it("포털의 인코딩 키(%2B·%2F·%3D)는 한 번 풀어 보낸다(두 번 인코딩하지 않게)", async () => {
    const r = await run({}, { serviceKey: encodeURIComponent(KEY) });
    expect(new URL(r.calls[0].url).searchParams.get("serviceKey")).toBe(KEY);
    expect(normalizeServiceKey(" abc%2Bdef%3D%3D ")).toBe("abc+def==");
    expect(normalizeServiceKey("abc+def==")).toBe("abc+def==");
    expect(normalizeServiceKey("%E0%A4%A")).toBe("%E0%A4%A");
    expectNoKeyLeak(r);
  });

  it("연결 실패·5xx·429는 한 번 쉬고 다시 — 그다음에 되면 그대로 싣는다", async () => {
    for (const failure of ["network", 500, 503, 429] as const) {
      const r = await run({ failAt: { 0: failure } });
      expect(r.calls, String(failure)).toHaveLength(2);
      expect(r.sleeps).toEqual([RETRY_DELAY_MS]);
      expect(r.meta?.count).toBe(12);
    }
  });
});

describe("runSupportFetch — 실패하면 빈 표시 + 경고 한 줄(종료 0 — 배포는 이어진다)", () => {
  it.each<[string, FakeApi, RegExp]>([
    ["인증 실패(401)는 다시 시도하지 않는다", { failAt: { 0: 401 } }, /serviceList 1쪽 HTTP 401/],
    ["권한 없음(403)", { failAt: { 0: 403 } }, /HTTP 403/],
    ["5xx 두 번", { failAt: { 0: 500, 1: 500 } }, /HTTP 500/],
    ["연결 실패 두 번", { failAt: { 0: "network", 1: "network" } }, /연결 실패/],
    ["JSON이 아님", { failAt: { 0: "badJson" } }, /JSON 아님/],
    ["data 목록 없음", { failAt: { 0: "noData" } }, /data 목록 없음/],
    ["totalCount 없음", { failAt: { 0: { body: { data: [] } } } }, /totalCount 없음/],
    ["totalCount 0", { items: [], totalCount: 0 }, /totalCount 0/],
    ["서버가 쪽 크기를 줄임", { failAt: { 0: { perPage: 100 } } }, /perPage 100/],
    ["쪽이 너무 많음", { totalCount: PER_PAGE * MAX_PAGES + 1 }, /쪽이 너무 많음/],
    ["둘째 쪽 실패", { items: manyItems(PER_PAGE + 10), failAt: { 1: 404 } }, /serviceList 2쪽 HTTP 404/],
    ["일부만 받음", { items: manyItems(PER_PAGE), totalCount: PER_PAGE * 2 }, /빈 쪽/],
    ["중복을 빼면 모자람", { items: [...manyItems(PER_PAGE), ...manyItems(PER_PAGE)] }, /1000\/2000건만 받음/],
    ["고른 사업이 0건", { items: manyItems(1).map((i) => ({ ...i, 서비스명: "[시험] 다른 사업" })) }, /고른 사업이 0건/],
  ])("%s", async (_label, api, warning) => {
    const r = await run(api);
    expect(r.code).toBe(0);
    expect(r.writes).toEqual([{ meta: serializeMeta(EMPTY_META), data: null }]);
    expect(r.warnings.at(-1)).toMatch(warning);
    expect(r.warnings.at(-1)).toContain("우리 지역 지원사업 없이 빌드합니다");
    expectNoKeyLeak(r);
  });

  it("인증 실패에 키가 되비쳐 와도 로그·경고에 응답 본문을 옮기지 않는다", async () => {
    const r = await run({ failAt: { 0: 401 } });
    expect(r.calls).toHaveLength(1);
    expect([...r.logs, ...r.warnings].join("\n")).not.toContain("등록되지 않은 인증키");
    expectNoKeyLeak(r);
  });
});

describe("deploy.yml — 키는 수집 단계에만, 수집은 두 빌드 전에", () => {
  const deploy = readFileSync(fileURLToPath(new URL("../../../.github/workflows/deploy.yml", import.meta.url)), "utf8");

  it("secrets.DATA_GO_KR_SERVICE_KEY는 'Fetch regional support programs' 단계 한 곳에만(NEXT_PUBLIC_이 아니다)", () => {
    expect(deploy.match(/DATA_GO_KR_SERVICE_KEY: \$\{\{ secrets\.DATA_GO_KR_SERVICE_KEY \}\}/g)).toHaveLength(1);
    expect(deploy).not.toMatch(/NEXT_PUBLIC_[A-Z_]*DATA_GO/);
    const start = deploy.indexOf("- name: Fetch regional support programs");
    const next = deploy.indexOf("\n      - ", start + 1);
    expect(deploy.slice(start, next)).toContain("run: node scripts/support-fetch.mjs");
    expect(deploy.slice(start, next)).toContain("DATA_GO_KR_SERVICE_KEY: ${{ secrets.DATA_GO_KR_SERVICE_KEY }}");
  });

  it("단위 시험(npm test) 뒤, 브라우저 전용 빌드·배포 빌드 전", () => {
    const at = (s: string) => {
      const i = deploy.indexOf(s);
      expect(i, s).toBeGreaterThanOrEqual(0);
      return i;
    };
    const fetchStep = at("- name: Fetch regional support programs");
    expect(at("- run: npm test")).toBeLessThan(fetchStep);
    expect(fetchStep).toBeLessThan(at("- name: Build (browser-only, for e2e)"));
    expect(fetchStep).toBeLessThan(at("- name: Build\n"));
  });
});

describe("scripts/support-fetch.mjs — Node가 그대로 실행한다", () => {
  const script = fileURLToPath(new URL("../../../scripts/support-fetch.mjs", import.meta.url));
  const metaFile = fileURLToPath(new URL("../../content/support-programs.generated.json", import.meta.url));

  it("키 없이 실행하면 종료 0, 요청 없음, 저장소의 빈 표시 그대로", () => {
    const before = readFileSync(metaFile, "utf8");
    // 내 컴퓨터에서 --fixture로 미리 본 뒤라면(표시가 빈 표시가 아니면) 그 파일을 지우지 않게 건너뛴다 — 위 regionalCore 시험이 알린다
    if (before !== serializeMeta(EMPTY_META)) return;
    const out = execFileSync(process.execPath, [script], {
      env: { ...process.env, DATA_GO_KR_SERVICE_KEY: "", GITHUB_ACTIONS: "" },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    expect(out).toContain("support-fetch: DATA_GO_KR_SERVICE_KEY가 없어 건너뜁니다(요청 없음)");
    expect(readFileSync(metaFile, "utf8")).toBe(before);
  });
});
