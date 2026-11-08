// 우리 지역 지원사업 — 화면 쪽 보기 모델(기능을 켤지, 목록 받기, 고른 지역의 사업 묶기). 형식·규칙은 regionalCore.mjs.
//
// - 기능 표시(src/content/support-programs.generated.json)는 빌드 때 번들에 들어간다(작은 파일 — 기준일·개수·해시). 비었으면 화면에 아무것도 없다.
// - 목록(public/support-programs.json)은 번들에 넣지 않는다. 사용자가 [지역 고르기]를 누를 때 이 사이트의 정적 파일 하나를 받는다
//   (같은 origin — CSP connect-src 'self'로 충분하다. 서비스 워커는 이 파일을 캐시하지 않는다 — public/sw.js 캐시 규칙).
//   주소에 ?v=해시를 붙여 배포가 바뀌면 브라우저 캐시의 낡은 목록을 쓰지 않는다. 고른 지역은 요청에 실리지 않는다(전국 목록 한 벌).
// - 받은 목록은 수집 단계와 같은 검사(parseDataset)를 한 번 더 거친다 — 통과하지 못하면 오류로 보고 아무 사업도 그리지 않는다.

import metaJson from "@/content/support-programs.generated.json";
import { DATA_FILE, SIDO, isMetaEnabled, parseDataset, parseMeta } from "./regionalCore.mjs";
import type { RegionalDataset, RegionalMeta, RegionalProgram } from "./regionalCore.mjs";

export type { RegionalDataset, RegionalMeta, RegionalProgram };

/** 이 빌드의 표시 — 형식이 틀리면 빌드가 멈춘다(정적 내보내기에서 모듈을 읽을 때) */
export const REGIONAL_META: RegionalMeta = parseMeta(metaJson);
/** 이 빌드에 우리 지역 지원사업이 있는가 — 서비스 키가 없거나 수집이 실패한 빌드는 false(카드도 요청도 없다) */
export const REGIONAL_ENABLED: boolean = isMetaEnabled(REGIONAL_META);

/** 처음에 보이는 사업 수(묶음마다) — 나머지는 [N개 더 보기] */
export const INITIAL_VISIBLE = 10;

/** 목록 주소 — 이 사이트의 basePath 아래 정적 파일 + ?v=해시 */
export function regionalDataUrl(basePath: string, hash: string): string {
  return `${basePath.replace(/\/+$/, "")}/${DATA_FILE}?v=${encodeURIComponent(hash)}`;
}

export type FetchJson = (url: string, init: RequestInit) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** 목록 받기 — 실패(연결·HTTP·형식)는 예외. 기능이 꺼진 빌드에서는 요청하지 않고 예외. */
export async function loadRegionalDataset(meta: RegionalMeta, basePath: string, fetchImpl: FetchJson): Promise<RegionalDataset> {
  if (!isMetaEnabled(meta) || meta.hash === null) throw new Error("우리 지역 지원사업이 없는 빌드");
  const res = await fetchImpl(regionalDataUrl(basePath, meta.hash), { credentials: "same-origin", headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseDataset(await res.json());
}

export interface SidoOption {
  id: string;
  name: string;
  /** 목록에 사업이 있는 시·군·구(가나다순) — 없으면 빈 목록 */
  sigungu: string[];
}

/** 시·도 선택지 — 늘 SIDO 전부(정부24 순서), 시·군·구는 목록에 실린 이름만 */
export function sidoOptions(dataset: RegionalDataset): SidoOption[] {
  const bySido = new Map<string, Set<string>>();
  for (const p of dataset.programs) {
    if (p.sido === null || p.sigungu === null) continue;
    const set = bySido.get(p.sido) ?? new Set<string>();
    set.add(p.sigungu);
    bySido.set(p.sido, set);
  }
  return SIDO.map((s) => ({ id: s.id, name: s.name, sigungu: [...(bySido.get(s.id) ?? [])].sort((a, b) => a.localeCompare(b, "ko")) }));
}

export interface RegionalSelection {
  /** 고른 시·군·구의 사업(시·군·구를 고르지 않았으면 빈 목록) */
  sigungu: RegionalProgram[];
  /** 고른 시·도 전체 사업(시·도 기관·교육청 등 — 시·군·구 없이 등록된 것) */
  sido: RegionalProgram[];
  /** 전국 사업 */
  national: RegionalProgram[];
}

/** 고른 지역의 사업 묶음 — 목록 순서(조회수 많은 것부터) 그대로. 모르는 시·도·시·군·구면 빈 묶음. */
export function programsFor(dataset: RegionalDataset, sidoId: string | null, sigungu: string | null): RegionalSelection {
  const national = dataset.programs.filter((p) => p.sido === null);
  if (sidoId === null) return { sigungu: [], sido: [], national };
  return {
    sigungu: sigungu === null ? [] : dataset.programs.filter((p) => p.sido === sidoId && p.sigungu === sigungu),
    sido: dataset.programs.filter((p) => p.sido === sidoId && p.sigungu === null),
    national,
  };
}

/** "2026-11-08" → "2026년 11월 8일" */
export function formatAsOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${y}년 ${m}월 ${d}일`;
}
