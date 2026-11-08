// 우리 지역 지원사업 — 형식·규칙(regionalCore.mjs): 기관명 → 시·도·시·군·구, 임신·출산·개인 대상 고르기, 글자 다듬기, 목록·표시 검사.
import { describe, expect, it } from "vitest";
import metaJson from "@/content/support-programs.generated.json";
import {
  EMPTY_META,
  MAX_NAME_LENGTH,
  MAX_PROGRAMS,
  SIDO,
  canonicalDetailUrl,
  cleanText,
  isForIndividuals,
  isMetaEnabled,
  isPregnancyBirthService,
  matchKey,
  officialDetailUrl,
  parseDataset,
  parseMeta,
  programRegion,
  regionOfAgency,
  scopeOfAgencyType,
  serializeDataset,
  serializeMeta,
  summaryText,
} from "./regionalCore.mjs";
import type { RegionalProgram } from "./regionalCore.mjs";

const program = (patch: Partial<RegionalProgram> = {}): RegionalProgram => ({
  id: "322000000903",
  name: "[시험] 강남구 출산 지원",
  agency: "서울특별시 강남구",
  sido: "seoul",
  sigungu: "강남구",
  summary: "시험 요약",
  url: "https://www.gov.kr/portal/rcvfvrSvc/dtlEx/322000000903",
  ...patch,
});

describe("SIDO — 정부24 지역별 출산 지원 서비스의 시도 목록(2026-11-08)", () => {
  it("16개, id·이름이 겹치지 않는다", () => {
    expect(SIDO).toHaveLength(16);
    expect(new Set(SIDO.map((s) => s.id)).size).toBe(16);
    const names = SIDO.flatMap((s) => [s.name, ...s.aliases]);
    expect(new Set(names).size).toBe(names.length);
  });

  it("광주광역시·전라남도는 전남광주통합특별시로, 강원도·전라북도는 특별자치도로 묶는다", () => {
    expect(SIDO.find((s) => s.id === "jeonnam-gwangju")).toMatchObject({ name: "전남광주통합특별시", aliases: ["광주광역시", "전라남도"] });
    expect(SIDO.find((s) => s.id === "gangwon")?.aliases).toEqual(["강원도"]);
    expect(SIDO.find((s) => s.id === "jeonbuk")?.aliases).toEqual(["전라북도"]);
  });
});

describe("regionOfAgency — 정부24 소관기관명 '{시·도} {시·군·구}'", () => {
  it.each([
    ["서울특별시 강남구", "seoul", "강남구"],
    ["서울특별시", "seoul", null],
    ["대전광역시 서구", "daejeon", "서구"],
    ["경기도 성남시", "gyeonggi", "성남시"],
    ["경기도 양평군", "gyeonggi", "양평군"],
    ["경기도 수원시 장안구", "gyeonggi", "수원시"],
    ["전남광주통합특별시 광양시", "jeonnam-gwangju", "광양시"],
    ["광주광역시 북구", "jeonnam-gwangju", "북구"],
    ["전라남도 순천시", "jeonnam-gwangju", "순천시"],
    ["강원도 춘천시", "gangwon", "춘천시"],
    ["강원특별자치도 춘천시", "gangwon", "춘천시"],
    ["전라북도 전주시", "jeonbuk", "전주시"],
    ["경상북도 경주시", "gyeongbuk", "경주시"],
    ["울산광역시", "ulsan", null],
    ["세종특별자치시", "sejong", null],
    ["세종특별자치시 조치원읍", "sejong", null],
    ["제주특별자치도 서귀포시", "jeju", "서귀포시"],
    // 시·도 뒤에 바로 붙은 이름·시·군·구가 아닌 기관은 시·도 전체
    ["서울특별시교육청", "seoul", null],
    ["경기도교육청", "gyeonggi", null],
    ["서울특별시 서울시설공단", "seoul", null],
    ["경기도 보건환경연구원", "gyeonggi", null],
    // 띄어쓰기가 여러 칸·앞뒤 공백이어도
    ["  부산광역시   해운대구 ", "busan", "해운대구"],
  ])("%s → %s / %s", (agency, sido, sigungu) => {
    expect(regionOfAgency(agency)).toEqual({ sido, sigungu });
  });

  it.each(["보건복지부", "국민건강보험공단", "강남구", "서울지방고용노동청", "부산지방국세청", "", "서울 강남구"])("시·도로 시작하지 않으면 null: %s", (agency) => {
    expect(regionOfAgency(agency)).toBeNull();
  });
});

describe("programRegion — 지역은 기관명이 먼저, 전국은 중앙행정기관·공공기관만", () => {
  it("지자체: 기관명의 시·도·시·군·구", () => {
    expect(programRegion("서울특별시 강남구", "지방자치단체")).toEqual({ sido: "seoul", sigungu: "강남구" });
  });
  it("중앙행정기관·공공기관 → 전국", () => {
    expect(programRegion("보건복지부", "중앙행정기관")).toEqual({ sido: null, sigungu: null });
    expect(programRegion("국민건강보험공단", "공공기관")).toEqual({ sido: null, sigungu: null });
  });
  it("공공기관이라도 이름이 시·도로 시작하면 그 지역", () => {
    expect(programRegion("서울특별시 서울시설공단", "공공기관")).toEqual({ sido: "seoul", sigungu: null });
  });
  it("지자체인데 시·도를 알 수 없거나 유형을 모르면 null(싣지 않는다 — 엉뚱한 지역·전국에 보이지 않게)", () => {
    expect(programRegion("강남구", "지방자치단체")).toBeNull();
    expect(programRegion("어느 기관", "")).toBeNull();
    expect(programRegion("어느 기관", "기타")).toBeNull();
  });
  it.each([
    ["중앙행정기관", "national"],
    ["중앙부처", "national"],
    ["공공기관", "national"],
    ["지방자치단체", "local"],
    ["지자체", "local"],
    ["교육청", "local"],
    ["지방출자·출연기관/지방공기업", "local"],
    ["", "unknown"],
    ["기타", "unknown"],
  ])("scopeOfAgencyType(%s) = %s", (t, scope) => {
    expect(scopeOfAgencyType(t)).toBe(scope);
  });
});

describe("고르는 규칙 — 임신·출산 사업, 개인·가구 대상", () => {
  it("서비스분야 '임신 · 출산'은 띄어쓰기·가운뎃점 모양과 상관없이", () => {
    for (const field of ["임신 · 출산", "임신·출산", "임신ㆍ출산", "임신・출산", " 임신 ·출산 "]) {
      expect(isPregnancyBirthService(field, "아무 사업"), field).toBe(true);
    }
    expect(matchKey("임신 ㆍ 출산")).toBe("임신·출산");
  });
  it("분야가 달라도 서비스명에 임신·임산부·출산·출생·산모·산후·신생아가 있으면", () => {
    for (const name of ["임신 축하 꾸러미", "임산부 교통비", "출산지원금", "출생축하금", "산모 건강", "산후조리비", "신생아 난청 검사"]) {
      expect(isPregnancyBirthService("보건 · 의료", name), name).toBe(true);
    }
  });
  it("그 밖은 고르지 않는다(난임만 있는 이름도 — 분야가 임신·출산이면 고른다)", () => {
    expect(isPregnancyBirthService("고용 · 창업", "청년 구직 지원")).toBe(false);
    expect(isPregnancyBirthService("보건 · 의료", "난임 시술비")).toBe(false);
    expect(isPregnancyBirthService("임신 · 출산", "난임 시술비")).toBe(true);
    expect(isPregnancyBirthService("", "")).toBe(false);
  });
  it("사용자구분: 개인·가구(여러 값 함께)만", () => {
    expect(isForIndividuals("개인")).toBe(true);
    expect(isForIndividuals("가구")).toBe(true);
    expect(isForIndividuals("개인||가구")).toBe(true);
    expect(isForIndividuals("법인/시설/단체")).toBe(false);
    expect(isForIndividuals("소상공인")).toBe(false);
    expect(isForIndividuals("")).toBe(false);
  });
});

describe("글자 다듬기", () => {
  const RLO = String.fromCharCode(0x202e);
  const ZWSP = String.fromCharCode(0x200b);
  const NUL = String.fromCharCode(0);

  it("보이지 않는 문자·방향 바꾸기 문자를 빼고 공백을 한 칸으로", () => {
    expect(cleanText(`  가${RLO}나${ZWSP}다${NUL}\n\t라  `, 50)).toBe("가 나 다 라");
  });
  it("상한을 넘으면 잘라 …(결과 길이는 상한 이하)", () => {
    const long = "가".repeat(MAX_NAME_LENGTH + 10);
    const out = cleanText(long, MAX_NAME_LENGTH);
    expect(out).toHaveLength(MAX_NAME_LENGTH);
    expect(out.endsWith("…")).toBe(true);
    expect(cleanText(out, MAX_NAME_LENGTH)).toBe(out);
  });
  it("요약: 줄머리 글머리표를 떼고 한 줄로", () => {
    expect(summaryText("○ 첫째 줄\n - 둘째 줄\n※ 셋째\n\n", 100)).toBe("첫째 줄 둘째 줄 셋째");
    expect(summaryText("", 100)).toBe("");
  });
});

describe("정부24 상세 주소", () => {
  it("https://www.gov.kr만 그대로", () => {
    expect(officialDetailUrl("https://www.gov.kr/portal/rcvfvrSvc/dtlEx/322000000109")).toBe("https://www.gov.kr/portal/rcvfvrSvc/dtlEx/322000000109");
  });
  it.each([
    [null],
    [""],
    ["http://www.gov.kr/portal"],
    ["https://gov.kr.evil.example/portal"],
    ["https://user:pw@www.gov.kr/"],
    ["https://www.gov.kr:8443/"],
    ["javascript:alert(1)"],
    [`https://www.gov.kr/${"a".repeat(400)}`],
  ])("아니면 null: %s", (raw) => {
    expect(officialDetailUrl(raw)).toBeNull();
  });
  it("정해진 상세 화면 주소는 서비스ID 모양일 때만", () => {
    expect(canonicalDetailUrl("WLF00000024")).toBe("https://www.gov.kr/portal/rcvfvrSvc/dtlEx/WLF00000024");
    expect(canonicalDetailUrl("../evil")).toBeNull();
    expect(canonicalDetailUrl("")).toBeNull();
  });
});

describe("목록 검사(parseDataset) — 수집 단계가 쓰기 전에, 화면이 받은 뒤에", () => {
  const dataset = (programs: unknown[], patch: Record<string, unknown> = {}) => ({ version: 1, asOf: "2026-11-08", programs, ...patch });

  it("맞는 목록은 그대로(직렬화 → 검사 → 직렬화가 같다)", () => {
    const ds = parseDataset(dataset([program(), program({ id: "135200000901", agency: "보건복지부", sido: null, sigungu: null, summary: "" })]));
    expect(ds.programs).toHaveLength(2);
    expect(serializeDataset(parseDataset(JSON.parse(serializeDataset(ds))))).toBe(serializeDataset(ds));
  });

  it.each<[string, unknown]>([
    ["최상위가 객체가 아님", []],
    ["버전이 다름", dataset([], { version: 2 })],
    ["기준일이 날짜가 아님", dataset([], { asOf: "2026-13-40" })],
    ["모르는 항목", dataset([], { extra: 1 })],
    ["사업이 객체가 아님", dataset(["x"])],
    ["사업의 모르는 항목", dataset([{ ...program(), views: 1 }])],
    ["같은 ID 두 번", dataset([program(), program()])],
    ["빈 이름", dataset([program({ name: "" })])],
    ["다듬지 않은 이름", dataset([program({ name: " 앞 공백" })])],
    ["너무 긴 이름", dataset([program({ name: "가".repeat(MAX_NAME_LENGTH + 1) })])],
    ["모르는 시·도", dataset([program({ sido: "tokyo" })])],
    ["시·도 없이 시·군·구", dataset([program({ sido: null })])],
    ["시·군·구 모양이 아님", dataset([program({ sigungu: "<script>" })])],
    ["정부24가 아닌 주소", dataset([program({ url: "https://evil.example/" })])],
    ["javascript 주소", dataset([program({ url: "javascript:alert(1)" })])],
    ["ID 모양이 아님", dataset([program({ id: "../x" })])],
    ["너무 많음", dataset(Array.from({ length: MAX_PROGRAMS + 1 }, (_, i) => program({ id: `id${i}` })))],
  ])("틀리면 던진다: %s", (_label, raw) => {
    expect(() => parseDataset(raw)).toThrow(/형식 오류/);
  });
});

describe("표시(parseMeta) — 앱 번들에 들어가는 기준일·개수·해시", () => {
  it("저장소의 표시는 빈 표시다(수집 단계가 만든 표시를 커밋하지 않는다 — 키가 없는 빌드는 기능 숨김)", () => {
    expect(parseMeta(metaJson)).toEqual(EMPTY_META);
    expect(isMetaEnabled(parseMeta(metaJson))).toBe(false);
    expect(serializeMeta(EMPTY_META)).toBe('{\n  "asOf": null,\n  "count": 0,\n  "hash": null\n}\n');
  });
  it("기준일·해시가 있고 1건 이상일 때만 켠다", () => {
    expect(isMetaEnabled({ asOf: "2026-11-08", count: 3, hash: "0123456789ab" })).toBe(true);
    expect(isMetaEnabled({ asOf: "2026-11-08", count: 0, hash: "0123456789ab" })).toBe(false);
    expect(isMetaEnabled({ asOf: null, count: 3, hash: "0123456789ab" })).toBe(false);
    expect(isMetaEnabled({ asOf: "2026-11-08", count: 3, hash: null })).toBe(false);
  });
  it.each<[string, unknown]>([
    ["객체가 아님", null],
    ["모르는 항목", { asOf: null, count: 0, hash: null, url: "x" }],
    ["날짜가 아님", { asOf: "어제", count: 0, hash: null }],
    ["개수가 정수가 아님", { asOf: null, count: 1.5, hash: null }],
    ["음수", { asOf: null, count: -1, hash: null }],
    ["해시 모양이 아님", { asOf: null, count: 0, hash: "../../x" }],
  ])("틀리면 던진다: %s", (_label, raw) => {
    expect(() => parseMeta(raw)).toThrow(/형식 오류/);
  });
});
