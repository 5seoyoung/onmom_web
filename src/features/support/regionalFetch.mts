// 우리 지역 지원사업 수집 — 빌드 전에 한 번(배포 워크플로의 "Fetch regional support programs" 단계, scripts/support-fetch.mjs).
// 행정안전부_대한민국 공공서비스(혜택) 정보(공공데이터포털 15113968 — https://www.data.go.kr/data/15113968/openapi.do)의
// 공공서비스 목록(GET https://api.odcloud.kr/api/gov24/v3/serviceList)만 부른다. 이용허락범위 제한 없음·무료·개발계정 하루 10,000회.
// 목록 전체(1만 건 남짓)를 PER_PAGE씩 받아(빌드 한 번에 열몇 번) 임신·출산 사업 중 개인·가구 대상만 고른다(regionalCore.mjs).
//
// 서비스 키(DATA_GO_KR_SERVICE_KEY)
// - 공공데이터포털이 정한 대로 주소의 serviceKey로 보낸다(명세의 다른 방식인 Authorization 헤더는 값의 모양이 공개 명세에 없다).
//   그래서 요청 주소를 로그·오류·파일 어디에도 쓰지 않는다 — 로그에는 HTTP 상태와 개수만 남긴다.
// - 포털의 "인코딩" 키(%2B 등)를 넣어도 되게 한 번 풀어서 쓴다(URLSearchParams가 다시 인코딩한다).
// 실패는 조용히(fail soft): 어느 쪽이든 실패하면 경고 한 줄과 빈 표시를 쓴다(목록 파일은 지운다) — 일부만 싣거나 예전 목록을 남기지 않는다.
// 그러면 화면은 이 기능을 그리지 않는다. 배포는 이어진다(종료 코드 0).
//
// Node가 그대로 불러온다(타입 제거 — youtubeFetch.mts와 같은 규칙): 지울 수 있는 타입 문법만, 불러오는 모듈은 ./regionalCore.mjs 하나.
// 이 파일은 앱 번들에 들어가지 않는다(scripts/support-fetch.mjs와 테스트만 부른다). 문구는 개발용 로그다.

import {
  EMPTY_META,
  MAX_AGENCY_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PROGRAMS,
  MAX_SUMMARY_LENGTH,
  canonicalDetailUrl,
  cleanText,
  isForIndividuals,
  isPregnancyBirthService,
  officialDetailUrl,
  parseDataset,
  parseMeta,
  programRegion,
  serializeDataset,
  serializeMeta,
  summaryText,
} from "./regionalCore.mjs";
import type { RegionalDataset, RegionalMeta, RegionalProgram } from "./regionalCore.mjs";

export const GOV24_LIST_URL = "https://api.odcloud.kr/api/gov24/v3/serviceList";
export const PER_PAGE = 1000;
/** 이 쪽 수를 넘으면(= PER_PAGE × MAX_PAGES 건 넘게) 응답이 이상한 것으로 본다 */
export const MAX_PAGES = 40;
export const REQUEST_TIMEOUT_MS = 30_000;
/** 연결 실패·5xx·429일 때 한 번 더(잠깐 쉬고) */
export const RETRY_DELAY_MS = 3_000;
/** 받은 건수(중복 제외)가 totalCount의 이 비율보다 적으면 일부만 받은 것으로 보고 싣지 않는다 */
export const MIN_COMPLETE_RATIO = 0.98;
/** 목록 파일이 이보다 크면 싣지 않는다(화면이 받는 크기 — 사업 천 건이 대략 300KB) */
export const MAX_DATA_BYTES = 1_500_000;

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}
export type FetchLike = (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<FetchResponseLike>;

/** API 실패 — status가 null이면 연결 실패·시간 초과. 메시지에 주소·키·응답 본문을 넣지 않는다. */
export class Gov24ApiError extends Error {
  readonly status: number | null;
  readonly page: number;
  constructor(page: number, status: number | null, detail?: string) {
    super(`serviceList ${page}쪽 ${status === null ? "연결 실패" : `HTTP ${status}`}${detail ? ` (${detail})` : ""}`);
    this.name = "Gov24ApiError";
    this.status = status;
    this.page = page;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** 포털의 인코딩 키(%XX가 든 값)는 한 번 푼다. 풀 수 없으면 그대로. */
export function normalizeServiceKey(raw: string | undefined): string {
  const key = (raw ?? "").trim();
  if (!/%[0-9A-Fa-f]{2}/.test(key)) return key;
  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
}

interface ListPage {
  totalCount: number;
  data: Record<string, unknown>[];
}

async function getPage(fetchImpl: FetchLike, serviceKey: string, page: number): Promise<ListPage> {
  const params = new URLSearchParams({ page: String(page), perPage: String(PER_PAGE), returnType: "JSON", serviceKey });
  const url = `${GOV24_LIST_URL}?${params.toString()}`;
  let res: FetchResponseLike;
  try {
    res = await fetchImpl(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch {
    throw new Gov24ApiError(page, null);
  }
  if (!res.ok) throw new Gov24ApiError(page, res.status);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Gov24ApiError(page, res.status, "JSON 아님");
  }
  if (!isRecord(body) || !Array.isArray(body.data)) throw new Gov24ApiError(page, res.status, "data 목록 없음");
  const { totalCount, perPage } = body;
  if (typeof totalCount !== "number" || !Number.isInteger(totalCount) || totalCount < 0) {
    throw new Gov24ApiError(page, res.status, "totalCount 없음");
  }
  // 서버가 쪽 크기를 줄여 주면 쪽 번호로 이어 받을 수 없다(건너뛰는 사업이 생긴다)
  if (perPage !== undefined && Number(perPage) !== PER_PAGE) throw new Gov24ApiError(page, res.status, `perPage ${String(perPage)}`);
  return { totalCount, data: body.data.filter(isRecord) };
}

async function getPageWithRetry(
  fetchImpl: FetchLike,
  serviceKey: string,
  page: number,
  sleep: (ms: number) => Promise<void>,
): Promise<{ page: ListPage; requests: number }> {
  try {
    return { page: await getPage(fetchImpl, serviceKey, page), requests: 1 };
  } catch (e) {
    const retryable = e instanceof Gov24ApiError && (e.status === null || e.status === 429 || e.status >= 500);
    if (!retryable) throw e;
    await sleep(RETRY_DELAY_MS);
    return { page: await getPage(fetchImpl, serviceKey, page), requests: 2 };
  }
}

// MARK: - 고르기

/** serviceList 한 건에서 쓰는 값 — 글자가 아니면 빈 글자 */
export interface ServiceRecord {
  id: string;
  name: string;
  agency: string;
  agencyType: string;
  field: string;
  userType: string;
  purposeSummary: string;
  supportContent: string;
  detailUrl: unknown;
  views: number;
}

export function toServiceRecord(item: Record<string, unknown>): ServiceRecord {
  const views = item["조회수"];
  return {
    id: str(item["서비스ID"]).trim(),
    name: str(item["서비스명"]),
    agency: str(item["소관기관명"]),
    agencyType: str(item["소관기관유형"]),
    field: str(item["서비스분야"]),
    userType: str(item["사용자구분"]),
    purposeSummary: str(item["서비스목적요약"]),
    supportContent: str(item["지원내용"]),
    detailUrl: item["상세조회URL"],
    views: typeof views === "number" && Number.isFinite(views) ? views : 0,
  };
}

/** 고르며 빠진 까닭별 개수 — 로그로만 남긴다(규칙을 고칠 때 본다) */
export interface SelectStats {
  received: number;
  pregnancyBirth: number;
  notIndividual: number;
  unknownRegion: number;
  badRecord: number;
  national: number;
  local: number;
}

/**
 * serviceList 전체 → 목록의 사업. 순서: 조회수 많은 것부터, 같으면 서비스ID(같은 응답이면 같은 파일).
 * - 임신·출산 사업(서비스분야 또는 서비스명)이고 개인·가구 대상만.
 * - 지역: 소관기관명이 시·도로 시작하면 그 지역, 아니면 중앙행정기관·공공기관만 전국. 지자체인데 시·도를 못 찾으면 뺀다(unknownRegion).
 * - 상세 주소: 상세조회URL이 정부24 https 주소면 그대로, 아니면 정부24 상세 화면의 정해진 주소(서비스ID로).
 */
export function selectPrograms(items: readonly Record<string, unknown>[]): { programs: RegionalProgram[]; stats: SelectStats } {
  const stats: SelectStats = { received: items.length, pregnancyBirth: 0, notIndividual: 0, unknownRegion: 0, badRecord: 0, national: 0, local: 0 };
  const picked: { program: RegionalProgram; views: number }[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const r = toServiceRecord(item);
    if (!isPregnancyBirthService(r.field, r.name)) continue;
    stats.pregnancyBirth++;
    if (!isForIndividuals(r.userType)) {
      stats.notIndividual++;
      continue;
    }
    const name = cleanText(r.name, MAX_NAME_LENGTH);
    const agency = cleanText(r.agency, MAX_AGENCY_LENGTH);
    const url = officialDetailUrl(r.detailUrl) ?? canonicalDetailUrl(r.id);
    if (r.id === "" || name === "" || agency === "" || url === null || seen.has(r.id)) {
      stats.badRecord++;
      continue;
    }
    const region = programRegion(agency, r.agencyType);
    if (region === null) {
      stats.unknownRegion++;
      continue;
    }
    seen.add(r.id);
    if (region.sido === null) stats.national++;
    else stats.local++;
    const summary = summaryText(r.purposeSummary.trim() !== "" ? r.purposeSummary : r.supportContent, MAX_SUMMARY_LENGTH);
    picked.push({ program: { id: r.id, name, agency, sido: region.sido, sigungu: region.sigungu, summary, url }, views: r.views });
  }
  picked.sort((a, b) => b.views - a.views || (a.program.id < b.program.id ? -1 : a.program.id > b.program.id ? 1 : 0));
  return { programs: picked.map((p) => p.program), stats };
}

/** 한국 날짜(YYYY-MM-DD) — 목록을 받은 날 */
export function seoulDate(now: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(now);
}

// MARK: - 수집

/**
 * serviceList 전체를 받는다. 실패는 Gov24ApiError로 던진다(부르는 쪽이 빈 표시로 바꾼다).
 * 첫 쪽의 totalCount로 쪽 수를 정하고, 다 받은 뒤 중복을 뺀 건수가 totalCount에 모자라면(받는 사이 크게 바뀌었거나 빠진 쪽) 실패.
 */
export async function fetchAllServices(
  fetchImpl: FetchLike,
  serviceKey: string,
  sleep: (ms: number) => Promise<void>,
): Promise<{ items: Record<string, unknown>[]; totalCount: number; requests: number }> {
  let requests = 0;
  const first = await getPageWithRetry(fetchImpl, serviceKey, 1, sleep);
  requests += first.requests;
  const totalCount = first.page.totalCount;
  if (totalCount === 0) throw new Gov24ApiError(1, 200, "totalCount 0");
  const pages = Math.ceil(totalCount / PER_PAGE);
  if (pages > MAX_PAGES) throw new Gov24ApiError(1, 200, `totalCount ${totalCount} - 쪽이 너무 많음`);
  const byId = new Map<string, Record<string, unknown>>();
  const add = (data: readonly Record<string, unknown>[]) => {
    for (const item of data) {
      const id = str(item["서비스ID"]).trim();
      if (id !== "" && !byId.has(id)) byId.set(id, item);
    }
  };
  add(first.page.data);
  for (let page = 2; page <= pages; page++) {
    const next = await getPageWithRetry(fetchImpl, serviceKey, page, sleep);
    requests += next.requests;
    if (next.page.data.length === 0) throw new Gov24ApiError(page, 200, "빈 쪽");
    add(next.page.data);
  }
  if (byId.size < totalCount * MIN_COMPLETE_RATIO) throw new Gov24ApiError(pages, 200, `${byId.size}/${totalCount}건만 받음`);
  return { items: [...byId.values()], totalCount, requests };
}

export interface SupportFetchOutput {
  /** src/content/support-programs.generated.json 내용 */
  meta: string;
  /** public/support-programs.json 내용. null이면 그 파일을 지운다(기능 숨김). */
  data: string | null;
}

export interface RunOptions {
  /** process.env.DATA_GO_KR_SERVICE_KEY — 비면 요청 없이 빈 표시를 쓴다 */
  serviceKey: string | undefined;
  fetch: FetchLike;
  /** 목록 → 해시(sha256 앞 12자). Node의 crypto는 부르는 쪽이 넘긴다(이 파일은 다른 모듈을 불러오지 않는다). */
  hash(text: string): string;
  write(output: SupportFetchOutput): Promise<void>;
  log(line: string): void;
  /** 배포가 이어지는 실패 — CI에서는 경고 표시(::warning::)로 남긴다 */
  warn(line: string): void;
  now(): Date;
  sleep(ms: number): Promise<void>;
}

function failureLabel(e: unknown): string {
  if (e instanceof Gov24ApiError) return e.message;
  if (e instanceof Error && e.name === "RegionalDataError") return "만든 목록이 형식 검사를 통과하지 못함";
  return "예상하지 못한 오류";
}

const EMPTY_OUTPUT: SupportFetchOutput = { meta: serializeMeta(EMPTY_META), data: null };

/**
 * 수집 한 번 — 종료 코드를 돌려준다(늘 0 — 파일을 쓰지 못한 경우만 부르는 쪽에서 1).
 * - 키 없음: 요청 없이 빈 표시(저장소의 빈 표시와 같은 내용)를 쓰고 목록 파일을 지운다.
 * - API 실패·응답 이상·고른 사업이 0건·너무 많거나 큼: 경고 한 줄 + 빈 표시(기능 숨김). 예외 메시지에는 주소·키가 없다.
 * - 성공: 목록 파일(검사를 한 번 더 거친 내용)과 표시(기준일·개수·해시).
 */
export async function runSupportFetch(o: RunOptions): Promise<number> {
  const serviceKey = normalizeServiceKey(o.serviceKey);
  if (serviceKey === "") {
    o.log("support-fetch: DATA_GO_KR_SERVICE_KEY가 없어 건너뜁니다(요청 없음) - 우리 지역 지원사업 없이 빌드합니다.");
    await o.write(EMPTY_OUTPUT);
    return 0;
  }

  let output: SupportFetchOutput;
  try {
    const { items, totalCount, requests } = await fetchAllServices(o.fetch, serviceKey, (ms) => o.sleep(ms));
    const { programs, stats } = selectPrograms(items);
    o.log(
      `support-fetch: 공공서비스 ${totalCount}건(요청 ${requests}회) 중 임신·출산 ${stats.pregnancyBirth}건 → 싣는 사업 ${programs.length}건` +
        `(전국 ${stats.national} · 지역 ${stats.local}). 뺀 것: 개인·가구 대상 아님 ${stats.notIndividual}, 지역을 알 수 없음 ${stats.unknownRegion}, 값 이상 ${stats.badRecord}.`,
    );
    if (stats.unknownRegion > 0) {
      o.warn(`support-fetch: 지자체 사업 ${stats.unknownRegion}건의 기관명에서 시·도를 찾지 못해 뺐습니다(regionalCore.mjs SIDO의 이름을 확인하세요).`);
    }
    if (programs.length === 0) throw new Error("no programs");
    if (programs.length > MAX_PROGRAMS) throw new Error("too many programs");
    const dataset: RegionalDataset = { version: 1, asOf: seoulDate(o.now()), programs };
    // 쓰기 전에 화면과 같은 검사를 거친다(화면이 받는 파일이 늘 이 검사를 통과하게)
    const data = serializeDataset(parseDataset(JSON.parse(serializeDataset(dataset))));
    const bytes = new TextEncoder().encode(data).length;
    if (bytes > MAX_DATA_BYTES) throw new Error("data too large");
    const meta: RegionalMeta = parseMeta({ asOf: dataset.asOf, count: programs.length, hash: o.hash(data) });
    output = { meta: serializeMeta(meta), data };
    o.log(`support-fetch: ${dataset.asOf} 기준 ${programs.length}건, 목록 파일 ${Math.round(bytes / 1024)}KB.`);
  } catch (e) {
    const label =
      e instanceof Error && e.message === "no programs"
        ? "고른 사업이 0건"
        : e instanceof Error && e.message === "too many programs"
          ? `고른 사업이 ${MAX_PROGRAMS}건보다 많음 - 거르는 규칙을 확인하세요`
          : e instanceof Error && e.message === "data too large"
            ? `목록 파일이 ${Math.round(MAX_DATA_BYTES / 1000)}KB보다 큼`
            : failureLabel(e);
    o.warn(`support-fetch: 공공서비스 목록을 싣지 못했습니다(${label}) - 우리 지역 지원사업 없이 빌드합니다.`);
    output = EMPTY_OUTPUT;
  }
  await o.write(output);
  return 0;
}
