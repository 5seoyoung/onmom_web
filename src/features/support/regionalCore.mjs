// @ts-check
// 우리 지역 지원사업 — 정부24 공공서비스(혜택) 정보(행정안전부, 공공데이터포털 15113968)에서 고른 임신·출산 사업 목록의 형식과 규칙.
// 빌드 전 수집 단계(scripts/support-fetch.mjs → regionalFetch.mts)와 앱(regionalPrograms.ts — 지원사업 화면)이 같이 쓴다.
//
// 왜 .mjs(JSDoc 타입)인가: Node(빌드 전 수집)·Turbopack(앱 번들)·Vitest·tsc가 모두 그대로 불러오는 형식이라서다
// (features/youtube/youtubeCore.mjs 머리 주석과 같은 까닭). 그래서 다른 모듈을 불러오지 않는다(@/ 별칭은 Node가 모른다).
//
// 파일 두 개
// - 목록(public/support-programs.json): 수집 단계가 쓴다. 저장소에는 없다(.gitignore). 화면은 사용자가 [지역 고르기]를 누를 때 이 파일
//   하나를 통째로 받는다 — 고른 지역이 요청 주소에 실리지 않아 지역 선택이 브라우저 밖으로 나가지 않는다.
// - 표시(src/content/support-programs.generated.json): 목록의 기준일·개수·내용 해시만. 앱 번들에 들어가 기능을 켤지 정한다.
//   저장소에는 빈 표시를 둔다(키가 없는 빌드 = 기능 숨김, 요청 없음).
//
// 이 파일의 오류 문구는 개발용이다(수집 단계 로그·빌드에서만 보인다 — 화면에 그리지 않는다).

// MARK: - 형식

/**
 * 시·도 — 화면의 첫째 선택지. 순서와 이름은 정부24 "지역별 출산 지원 서비스 조회"의 시도 목록을 따른다
 * (https://www.gov.kr/portal/onestopSvc/happyBirthLocalBirth, 2026-11-08 확인 — 광주광역시·전라남도는 전남광주통합특별시로 합쳐 있다).
 * aliases: 예전 이름 — 정부24 자료에 옛 기관명이 남아 있어도 지금 시·도로 묶는다.
 * 시·도 이름이 바뀌거나 합쳐지면 여기를 고친다(모르는 이름의 지자체 사업은 수집 단계가 빼고 개수를 경고로 남긴다).
 * @typedef {object} Sido
 * @property {string} id 파일·화면에서 쓰는 짧은 영문 ID
 * @property {string} name 지금 이름
 * @property {readonly string[]} aliases 예전 이름
 */

/** @type {readonly Sido[]} */
export const SIDO = Object.freeze([
  { id: "seoul", name: "서울특별시", aliases: [] },
  { id: "jeonnam-gwangju", name: "전남광주통합특별시", aliases: ["광주광역시", "전라남도"] },
  { id: "busan", name: "부산광역시", aliases: [] },
  { id: "daegu", name: "대구광역시", aliases: [] },
  { id: "incheon", name: "인천광역시", aliases: [] },
  { id: "daejeon", name: "대전광역시", aliases: [] },
  { id: "ulsan", name: "울산광역시", aliases: [] },
  { id: "sejong", name: "세종특별자치시", aliases: [] },
  { id: "gyeonggi", name: "경기도", aliases: [] },
  { id: "chungbuk", name: "충청북도", aliases: [] },
  { id: "chungnam", name: "충청남도", aliases: [] },
  { id: "gyeongbuk", name: "경상북도", aliases: [] },
  { id: "gyeongnam", name: "경상남도", aliases: [] },
  { id: "jeju", name: "제주특별자치도", aliases: [] },
  { id: "gangwon", name: "강원특별자치도", aliases: ["강원도"] },
  { id: "jeonbuk", name: "전북특별자치도", aliases: ["전라북도"] },
]);

/**
 * 목록의 사업 한 건 — 화면에 그리는 값만(정부24 원문을 줄인 것). 대상·금액·신청 방법은 정부24 상세 화면(url)이 정본이다.
 * @typedef {object} RegionalProgram
 * @property {string} id 정부24 서비스ID
 * @property {string} name 서비스명
 * @property {string} agency 소관기관명(예: "서울특별시 강남구", "보건복지부")
 * @property {string | null} sido SIDO의 id. null이면 전국 사업(중앙행정기관·전국 공공기관)
 * @property {string | null} sigungu 시·군·구 이름(sido가 있을 때만). null이면 시·도 전체 사업
 * @property {string} summary 서비스목적요약(없으면 지원내용 첫머리) — 빈 글자일 수 있다
 * @property {string} url 정부24 상세 화면(https://www.gov.kr/…)
 */

/** @typedef {{ version: 1, asOf: string, programs: RegionalProgram[] }} RegionalDataset */

/**
 * 표시 — 앱 번들에 들어가는 작은 파일. asOf·hash가 있고 count가 1 이상일 때만 기능을 켠다.
 * @typedef {object} RegionalMeta
 * @property {string | null} asOf 목록을 받은 날(한국 날짜 YYYY-MM-DD)
 * @property {number} count 목록의 사업 수
 * @property {string | null} hash 목록 파일 내용의 sha256 앞 12자 — 요청 주소의 ?v=(브라우저 캐시가 낡은 목록을 주지 않게)
 */

export const DATASET_VERSION = 1;
/** 목록 파일 이름 — public/ 아래, 화면은 `${basePath}/${DATA_FILE}?v=${hash}`로 받는다 */
export const DATA_FILE = "support-programs.json";
export const DETAIL_HOST = "www.gov.kr";
export const MAX_ID_LENGTH = 40;
export const MAX_NAME_LENGTH = 80;
export const MAX_AGENCY_LENGTH = 40;
export const MAX_SIGUNGU_LENGTH = 12;
export const MAX_SUMMARY_LENGTH = 120;
export const MAX_URL_LENGTH = 300;
/** 이보다 많으면 거르는 규칙이 잘못된 것으로 보고 싣지 않는다(지금 정부24 전체가 1만 건 남짓, 임신·출산은 천 건 아래) */
export const MAX_PROGRAMS = 3000;

const ID_PATTERN = /^[0-9A-Za-z_-]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const HASH_PATTERN = /^[0-9a-f]{12}$/;
/** 시·군·구 한 단어 — 한글로 끝이 시·군·구(예: 강남구, 수원시, 양평군). 행정시(제주시·서귀포시)도 같은 모양이다. */
const SIGUNGU_PATTERN = /^[가-힣]{1,10}[시군구]$/u;

/** @type {RegionalMeta} */
export const EMPTY_META = Object.freeze({ asOf: null, count: 0, hash: null });

export class RegionalDataError extends Error {
  /**
   * @param {string} file
   * @param {string[]} problems
   */
  constructor(file, problems) {
    super(`${file} 형식 오류:\n  ${problems.slice(0, 20).join("\n  ")}${problems.length > 20 ? `\n  …외 ${problems.length - 20}개` : ""}`);
    this.name = "RegionalDataError";
    /** @type {string[]} */
    this.problems = problems;
  }
}

// MARK: - 글자 다듬기

// 제어 문자·폭 없는 문자·방향 바꾸기 문자(화면에서 글자 순서를 속일 수 있다)는 공백으로
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/gu;

/**
 * 화면에 실을 글자 — NFC·보이지 않는 문자 빼기·공백 한 칸으로·앞뒤 다듬기, 길이 상한을 넘으면 잘라 "…".
 * @param {string} s
 * @param {number} max
 * @returns {string}
 */
export function cleanText(s, max) {
  const t = s.normalize("NFC").replace(INVISIBLE, " ").replace(/\s+/gu, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

/**
 * 한 줄 요약 — 머리의 글머리표(○·-·※ 등)를 떼고 cleanText. 여러 줄이면 내용이 있는 첫 줄부터 이어 붙여 상한까지.
 * @param {string} s
 * @param {number} max
 * @returns {string}
 */
export function summaryText(s, max) {
  const lines = s
    .normalize("NFC")
    .split(/\r?\n/u)
    .map((l) => l.replace(INVISIBLE, " ").replace(/^[\s○●◦◎·•∙\-–—※▶▷■□◇◆☞*]+/u, "").trim())
    .filter((l) => l !== "");
  return cleanText(lines.join(" "), max);
}

/**
 * 비교용 열쇠 — NFKC·공백 없이·가운뎃점 모양 하나로("임신 · 출산" = "임신ㆍ출산" = "임신·출산").
 * @param {string} s
 * @returns {string}
 */
export function matchKey(s) {
  return s
    .normalize("NFKC")
    .replace(/\s+/gu, "")
    .replace(/[\u00b7\u2022\u2027\u2219\u30fb\uff65\u318d\u119e]/gu, "·");
}

// MARK: - 고르는 규칙

/** 서비스분야 — 정부24 분류 "임신 · 출산"(띄어쓰기·가운뎃점 모양은 matchKey가 맞춘다) */
export const PREGNANCY_BIRTH_FIELD = "임신·출산";
/** 분야가 다르게 적혀 있어도 서비스명에 이 말이 있으면 임신·출산 사업으로 본다 */
export const NAME_KEYWORDS = Object.freeze(["임신", "임산부", "출산", "출생", "산모", "산후", "신생아"]);
/** 사용자구분 — 개인·가구 대상만(소상공인·법인/시설/단체 대상은 뺀다) */
export const INDIVIDUAL_USER_TYPES = Object.freeze(["개인", "가구"]);

/**
 * 임신·출산 사업인가 — 서비스분야가 임신·출산이거나 서비스명에 NAME_KEYWORDS가 있다.
 * @param {string} field 서비스분야
 * @param {string} name 서비스명
 * @returns {boolean}
 */
export function isPregnancyBirthService(field, name) {
  if (matchKey(field).includes(PREGNANCY_BIRTH_FIELD)) return true;
  const n = matchKey(name);
  return NAME_KEYWORDS.some((k) => n.includes(k));
}

/**
 * 개인·가구 대상인가 — 사용자구분에 "개인"이나 "가구"가 있다(여러 값이 붙어 와도 된다. 예: "개인||가구").
 * @param {string} userType 사용자구분
 * @returns {boolean}
 */
export function isForIndividuals(userType) {
  const n = matchKey(userType);
  return INDIVIDUAL_USER_TYPES.some((k) => n.includes(k));
}

/**
 * 소관기관유형 → 전국/지역/모름.
 * - 중앙행정기관(중앙부처)·공공기관: 전국. 공공기관이라도 이름이 시·도로 시작하면 regionOfAgency가 먼저 지역으로 본다.
 * - 지방자치단체·교육청·지방 공기업 등: 지역 — 이름에서 시·도를 찾지 못하면 싣지 않는다(엉뚱한 지역에 보이지 않게).
 * @param {string} agencyType
 * @returns {"national" | "local" | "unknown"}
 */
export function scopeOfAgencyType(agencyType) {
  const n = matchKey(agencyType);
  if (n.includes("중앙")) return "national";
  if (n === "공공기관") return "national";
  if (/지방|지자체|자치단체|교육청|시·?도|시·?군·?구/u.test(n)) return "local";
  return "unknown";
}

/** 시·도 이름(지금 이름·예전 이름) → id, 긴 이름부터(앞부분이 겹치는 이름이 생겨도 긴 쪽이 이긴다) */
const SIDO_NAMES = SIDO.flatMap((s) => [s.name, ...s.aliases].map((name) => ({ name, id: s.id }))).sort(
  (a, b) => b.name.length - a.name.length,
);

/**
 * 소관기관명 → 시·도·시·군·구. 시·도로 시작하지 않으면 null.
 * 정부24는 지자체 기관명을 "{시·도} {시·군·구}"로 적는다(예: "서울특별시 강남구", "경기도 성남시", "전남광주통합특별시 광양시").
 * 시·도 이름 뒤에 바로 붙은 이름(예: "경기도교육청")은 시·도 전체로 본다.
 * @param {string} agency
 * @returns {{ sido: string, sigungu: string | null } | null}
 */
export function regionOfAgency(agency) {
  const n = agency.normalize("NFC").replace(/\s+/gu, " ").trim();
  for (const { name, id } of SIDO_NAMES) {
    if (!n.startsWith(name)) continue;
    const rest = n.slice(name.length);
    if (!rest.startsWith(" ")) return { sido: id, sigungu: null };
    const word = rest.trim().split(" ")[0] ?? "";
    return { sido: id, sigungu: SIGUNGU_PATTERN.test(word) && id !== "sejong" ? word : null };
  }
  return null;
}

/**
 * 사업의 지역 — 소관기관명이 시·도로 시작하면 그 지역, 아니면 소관기관유형이 전국이면 전국({ sido: null }), 그 밖은 null(싣지 않는다).
 * @param {string} agency 소관기관명
 * @param {string} agencyType 소관기관유형
 * @returns {{ sido: string | null, sigungu: string | null } | null}
 */
export function programRegion(agency, agencyType) {
  const local = regionOfAgency(agency);
  if (local !== null) return local;
  return scopeOfAgencyType(agencyType) === "national" ? { sido: null, sigungu: null } : null;
}

/**
 * 정부24 상세 주소 — https + www.gov.kr만(계정·포트 없이). 아니면 null.
 * @param {unknown} raw
 * @returns {string | null}
 */
export function officialDetailUrl(raw) {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (s === "" || s.length > MAX_URL_LENGTH) return null;
  /** @type {URL} */
  let u;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.hostname !== DETAIL_HOST || u.username !== "" || u.password !== "" || u.port !== "") return null;
  return u.href.length <= MAX_URL_LENGTH ? u.href : null;
}

/**
 * 정부24 서비스 상세 화면의 정해진 주소 — 상세조회URL이 비었거나 정부24 주소가 아닐 때만 쓴다
 * (정부24 보조금24의 상세 화면 주소 모양: https://www.gov.kr/portal/rcvfvrSvc/dtlEx/{서비스ID}).
 * @param {string} serviceId
 * @returns {string | null}
 */
export function canonicalDetailUrl(serviceId) {
  if (!ID_PATTERN.test(serviceId) || serviceId.length > MAX_ID_LENGTH) return null;
  return `https://${DETAIL_HOST}/portal/rcvfvrSvc/dtlEx/${serviceId}`;
}

// MARK: - 검사 도우미

/**
 * @param {unknown} v
 * @returns {v is Record<string, unknown>}
 */
function isRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * @param {Record<string, unknown>} obj
 * @param {readonly string[]} allowed
 * @param {string} path
 * @param {string[]} problems
 */
function checkKeys(obj, allowed, path, problems) {
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) problems.push(`${path}.${k}: 모르는 항목`);
}

/**
 * 다듬은 글자인가 — 문자열, 길이 상한 이하, cleanText를 다시 거쳐도 같다(제어 문자·앞뒤 공백 없음).
 * @param {unknown} v
 * @param {number} max
 * @param {boolean} allowEmpty
 * @returns {v is string}
 */
function isClean(v, max, allowEmpty) {
  if (typeof v !== "string" || v.length > max) return false;
  if (!allowEmpty && v === "") return false;
  return cleanText(v, max) === v;
}

/**
 * 한국 날짜(YYYY-MM-DD)이고 실제로 있는 날인가
 * @param {unknown} v
 * @returns {v is string}
 */
function isDate(v) {
  if (typeof v !== "string" || !DATE_PATTERN.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

const SIDO_IDS = new Set(SIDO.map((s) => s.id));

// MARK: - 목록

/**
 * 목록 JSON → 검사한 값. 문제가 하나라도 있으면 RegionalDataError(수집 단계는 쓰기 전에, 화면은 받은 뒤에 같은 검사를 거친다).
 * @param {unknown} raw
 * @returns {RegionalDataset}
 */
export function parseDataset(raw) {
  /** @type {string[]} */
  const problems = [];
  if (!isRecord(raw)) throw new RegionalDataError(DATA_FILE, ["최상위가 객체가 아닙니다"]);
  checkKeys(raw, ["version", "asOf", "programs"], "", problems);
  if (raw.version !== DATASET_VERSION) problems.push(`version: ${DATASET_VERSION}이 아닙니다`);
  if (!isDate(raw.asOf)) problems.push("asOf: YYYY-MM-DD 날짜가 아닙니다");
  /** @type {RegionalProgram[]} */
  const programs = [];
  const seen = new Set();
  if (!Array.isArray(raw.programs)) problems.push("programs: 목록이 아닙니다");
  else if (raw.programs.length > MAX_PROGRAMS) problems.push(`programs: ${MAX_PROGRAMS}개보다 많습니다`);
  else
    raw.programs.forEach((p, i) => {
      const path = `programs[${i}]`;
      if (!isRecord(p)) {
        problems.push(`${path}: 객체가 아닙니다`);
        return;
      }
      checkKeys(p, ["id", "name", "agency", "sido", "sigungu", "summary", "url"], path, problems);
      const before = problems.length;
      const { id, name, agency, sido, sigungu, summary, url } = p;
      if (typeof id !== "string" || id.length > MAX_ID_LENGTH || !ID_PATTERN.test(id)) problems.push(`${path}.id: 서비스ID 모양이 아닙니다`);
      else if (seen.has(id)) problems.push(`${path}.id: 같은 사업이 두 번 있습니다`);
      if (!isClean(name, MAX_NAME_LENGTH, false)) problems.push(`${path}.name: 비었거나 다듬지 않은 글자입니다`);
      if (!isClean(agency, MAX_AGENCY_LENGTH, false)) problems.push(`${path}.agency: 비었거나 다듬지 않은 글자입니다`);
      if (!isClean(summary, MAX_SUMMARY_LENGTH, true)) problems.push(`${path}.summary: 다듬지 않은 글자입니다`);
      if (sido !== null && (typeof sido !== "string" || !SIDO_IDS.has(sido))) problems.push(`${path}.sido: 모르는 시·도입니다`);
      if (sigungu !== null) {
        if (typeof sigungu !== "string" || sigungu.length > MAX_SIGUNGU_LENGTH || !SIGUNGU_PATTERN.test(sigungu)) {
          problems.push(`${path}.sigungu: 시·군·구 이름 모양이 아닙니다`);
        } else if (sido === null) problems.push(`${path}.sigungu: 시·도 없이 시·군·구만 있습니다`);
      }
      if (officialDetailUrl(url) !== url) problems.push(`${path}.url: 정부24(https://${DETAIL_HOST}) 주소가 아닙니다`);
      if (problems.length > before) return;
      seen.add(id);
      programs.push({
        id: /** @type {string} */ (id),
        name: /** @type {string} */ (name),
        agency: /** @type {string} */ (agency),
        sido: /** @type {string | null} */ (sido),
        sigungu: /** @type {string | null} */ (sigungu),
        summary: /** @type {string} */ (summary),
        url: /** @type {string} */ (url),
      });
    });
  if (problems.length > 0) throw new RegionalDataError(DATA_FILE, problems);
  return { version: DATASET_VERSION, asOf: /** @type {string} */ (raw.asOf), programs };
}

/**
 * 목록 → 파일 내용(한 줄 — 받는 크기를 줄인다). 항목 순서를 고정해 같은 목록이면 같은 해시가 나온다.
 * @param {RegionalDataset} dataset
 * @returns {string}
 */
export function serializeDataset(dataset) {
  return JSON.stringify({
    version: DATASET_VERSION,
    asOf: dataset.asOf,
    programs: dataset.programs.map((p) => ({
      id: p.id,
      name: p.name,
      agency: p.agency,
      sido: p.sido,
      sigungu: p.sigungu,
      summary: p.summary,
      url: p.url,
    })),
  });
}

// MARK: - 표시

/**
 * 표시 JSON → 검사한 값. 형식이 틀리면 RegionalDataError(앱 빌드가 멈춘다 — 수집 단계가 쓰기 전에 같은 검사를 거친다).
 * @param {unknown} raw
 * @returns {RegionalMeta}
 */
export function parseMeta(raw) {
  /** @type {string[]} */
  const problems = [];
  if (!isRecord(raw)) throw new RegionalDataError("support-programs.generated.json", ["최상위가 객체가 아닙니다"]);
  checkKeys(raw, ["asOf", "count", "hash"], "", problems);
  const { asOf, count, hash } = raw;
  if (asOf !== null && !isDate(asOf)) problems.push("asOf: YYYY-MM-DD 날짜 또는 null이 아닙니다");
  if (typeof count !== "number" || !Number.isInteger(count) || count < 0 || count > MAX_PROGRAMS) problems.push("count: 0 이상 정수가 아닙니다");
  if (hash !== null && (typeof hash !== "string" || !HASH_PATTERN.test(hash))) problems.push("hash: 16진수 12자 또는 null이 아닙니다");
  if (problems.length > 0) throw new RegionalDataError("support-programs.generated.json", problems);
  return { asOf: /** @type {string | null} */ (asOf), count: /** @type {number} */ (count), hash: /** @type {string | null} */ (hash) };
}

/**
 * 기능을 켜는가 — 기준일·해시가 있고 사업이 하나 이상
 * @param {RegionalMeta} meta
 * @returns {boolean}
 */
export function isMetaEnabled(meta) {
  return meta.asOf !== null && meta.hash !== null && meta.count > 0;
}

/**
 * 표시 → 파일 내용(커밋하는 빈 표시와 같은 모양 — 들여쓰기 2칸, 끝 줄바꿈)
 * @param {RegionalMeta} meta
 * @returns {string}
 */
export function serializeMeta(meta) {
  return `${JSON.stringify({ asOf: meta.asOf, count: meta.count, hash: meta.hash }, null, 2)}\n`;
}
