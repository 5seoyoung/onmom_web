"use client";

// 우리 지역 지원사업 — 지원사업 화면 아래 카드(웹 신규 기능, iOS에 없음). 정부24 공공서비스(혜택) 정보에서 고른 임신·출산 사업을
// 시·도 → 시·군·구로 골라 전국 사업과 함께 보인다. 사업 글자는 정부24 원문을 줄인 것이고, 정본은 각 사업의 정부24 상세 화면(새 탭)이다.
//
// - 기능이 꺼진 빌드(서비스 키 없음·수집 실패 — REGIONAL_ENABLED false)는 아무것도 그리지 않고 아무것도 받지 않는다.
// - 목록은 [지역 고르기]를 누를 때 받는다(이 사이트의 정적 파일 하나 — regionalPrograms.ts). 첫 화면 무게에 들어가지 않는다.
// - 고른 지역은 이 컴포넌트의 상태(useState)에만 있다 — 앱 상태(useAppStore)·localStorage·서버 어디에도 저장하지 않고, 요청에도 싣지 않는다.
//   새로 모으는 개인정보 항목이 생기지 않게(처리방침·동의를 바꾸지 않게) 일부러 그렇게 둔다. 화면을 떠나면 잊는다.
// - 링크는 supportLink(정부24 https만)를 거쳐 새 탭(noopener noreferrer)으로 연다.
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { flushSync } from "react-dom";
import { SquareArrowUpRight } from "lucide-react";
import { EXTERNAL_LINK_PROPS } from "@/api/safeUrl";
import { Card, SecondaryButton, SectionTitle, cx } from "@/components/ui";
import { config } from "@/config";
import {
  INITIAL_VISIBLE,
  REGIONAL_ENABLED,
  REGIONAL_META,
  formatAsOf,
  loadRegionalDataset,
  programsFor,
  sidoOptions,
  type RegionalDataset,
  type RegionalMeta,
  type RegionalProgram,
} from "./regionalPrograms";
import { GOV24_LOCAL_BIRTH_URL, REGIONAL_TEXT } from "./regionalText";
import { supportLink } from "./supportViewModel";

export type RegionalPhase =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; dataset: RegionalDataset };

type GroupKey = "sigungu" | "sido" | "national";

/** 기능이 켜진 빌드에서만 카드를 그린다 */
export function RegionalProgramsSection() {
  if (!REGIONAL_ENABLED) return null;
  return <RegionalPrograms meta={REGIONAL_META} basePath={config.basePath} />;
}

const SIDO_SELECT_ID = "regional-sido";
const SIGUNGU_SELECT_ID = "regional-sigungu";

function RegionalPrograms({ meta, basePath }: { meta: RegionalMeta; basePath: string }) {
  const [phase, setPhase] = useState<RegionalPhase>({ kind: "idle" });
  const [sido, setSido] = useState<string | null>(null);
  const [sigungu, setSigungu] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<GroupKey>>(() => new Set<GroupKey>());
  /** 마지막 요청 번호 — 화면을 떠났거나 다시 누른 뒤 늦게 온 결과는 버린다 */
  const requestSeq = useRef(0);
  /** 목록을 받은 직후 한 번 — [지역 고르기] 버튼이 사라지므로 초점을 시·도 선택으로 옮긴다 */
  const focusSidoOnReady = useRef(false);

  useEffect(
    () => () => {
      requestSeq.current += 1;
    },
    [],
  );

  useEffect(() => {
    if (phase.kind === "ready" && focusSidoOnReady.current) {
      focusSidoOnReady.current = false;
      document.getElementById(SIDO_SELECT_ID)?.focus();
    }
  }, [phase]);

  const open = () => {
    const seq = ++requestSeq.current;
    setPhase({ kind: "loading" });
    loadRegionalDataset(meta, basePath, (url, init) => fetch(url, init)).then(
      (dataset) => {
        if (requestSeq.current !== seq) return;
        focusSidoOnReady.current = true;
        setPhase({ kind: "ready", dataset });
      },
      () => {
        if (requestSeq.current === seq) setPhase({ kind: "error" });
      },
    );
  };

  const expand = (group: GroupKey) => {
    flushSync(() => setExpanded((prev) => new Set(prev).add(group)));
    // [더 보기] 버튼이 사라진다 — 새로 보인 첫 사업의 링크로 초점을 옮긴다
    document.getElementById(programLinkId(group, INITIAL_VISIBLE))?.focus();
  };

  return (
    <RegionalProgramsCard
      phase={phase}
      asOf={phase.kind === "ready" ? phase.dataset.asOf : meta.asOf}
      sido={sido}
      sigungu={sigungu}
      expanded={expanded}
      onOpen={open}
      onSido={(e) => {
        setSido(e.target.value === "" ? null : e.target.value);
        setSigungu(null);
        setExpanded((prev) => new Set([...prev].filter((g) => g === "national")));
      }}
      onSigungu={(e) => {
        setSigungu(e.target.value === "" ? null : e.target.value);
        setExpanded((prev) => new Set([...prev].filter((g) => g !== "sigungu")));
      }}
      onExpand={expand}
    />
  );
}

/** 사업 링크의 id — [더 보기] 뒤 초점을 옮길 때 쓴다 */
export function programLinkId(group: GroupKey, index: number): string {
  return `regional-${group}-${index}`;
}

export interface RegionalProgramsCardProps {
  phase: RegionalPhase;
  /** 목록 기준일(YYYY-MM-DD) */
  asOf: string | null;
  sido: string | null;
  sigungu: string | null;
  expanded: ReadonlySet<GroupKey>;
  onOpen: () => void;
  onSido: (e: ChangeEvent<HTMLSelectElement>) => void;
  onSigungu: (e: ChangeEvent<HTMLSelectElement>) => void;
  onExpand: (group: GroupKey) => void;
}

const SELECT_CLASS =
  "min-h-11 w-full min-w-0 rounded-button bg-surface px-3 text-base text-text-primary ring-1 ring-control-off focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:opacity-50";

/** 카드 본체 — 상태를 받아 그리기만 한다(테스트가 상태마다 그려 본다) */
export function RegionalProgramsCard(props: RegionalProgramsCardProps) {
  const { phase, asOf } = props;
  return (
    <Card as="section" aria-labelledby="regional-programs-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <SectionTitle id="regional-programs-title">{REGIONAL_TEXT.title}</SectionTitle>
        <p className="text-[0.8125rem] text-text-subtle-aa">{REGIONAL_TEXT.intro}</p>
        <p className="text-[0.8125rem] text-text-subtle-aa">{REGIONAL_TEXT.privacy}</p>
      </div>

      {phase.kind === "idle" ? <SecondaryButton onClick={props.onOpen}>{REGIONAL_TEXT.open}</SecondaryButton> : null}
      {phase.kind === "loading" ? (
        <p role="status" className="text-[0.8125rem] text-text-secondary">
          {REGIONAL_TEXT.loading}
        </p>
      ) : null}
      {phase.kind === "error" ? (
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-[0.8125rem] text-text-secondary">
            {REGIONAL_TEXT.error}
          </p>
          <SecondaryButton onClick={props.onOpen}>{REGIONAL_TEXT.retry}</SecondaryButton>
        </div>
      ) : null}
      {phase.kind === "ready" ? <RegionalPicker {...props} dataset={phase.dataset} /> : null}

      <div className="flex flex-col gap-1 text-[0.6875rem] text-text-subtle-aa">
        {asOf !== null ? <p>{REGIONAL_TEXT.asOf(formatAsOf(asOf))}</p> : null}
        <p>{REGIONAL_TEXT.authoritative}</p>
        <p>{REGIONAL_TEXT.source}</p>
      </div>
    </Card>
  );
}

function RegionalPicker({ dataset, sido, sigungu, expanded, onSido, onSigungu, onExpand }: RegionalProgramsCardProps & { dataset: RegionalDataset }) {
  const options = sidoOptions(dataset);
  const chosen = options.find((o) => o.id === sido) ?? null;
  /** 고른 시·군·구 — 고른 시·도의 선택지에 있을 때만 */
  const place = chosen !== null && sigungu !== null && chosen.sigungu.includes(sigungu) ? sigungu : null;
  const selection = programsFor(dataset, chosen?.id ?? null, place);
  const localLink = supportLink(GOV24_LOCAL_BIRTH_URL);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 @lg:flex-row">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={SIDO_SELECT_ID} className="text-[0.8125rem] font-semibold text-text-secondary">
            {REGIONAL_TEXT.sidoLabel}
          </label>
          <select id={SIDO_SELECT_ID} className={SELECT_CLASS} value={chosen?.id ?? ""} onChange={onSido}>
            <option value="">{REGIONAL_TEXT.sidoPlaceholder}</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={SIGUNGU_SELECT_ID} className="text-[0.8125rem] font-semibold text-text-secondary">
            {REGIONAL_TEXT.sigunguLabel}
          </label>
          <select
            id={SIGUNGU_SELECT_ID}
            className={SELECT_CLASS}
            value={place ?? ""}
            onChange={onSigungu}
            disabled={chosen === null || chosen.sigungu.length === 0}
          >
            <option value="">{chosen !== null && chosen.sigungu.length === 0 ? REGIONAL_TEXT.sigunguEmpty : REGIONAL_TEXT.sigunguNone}</option>
            {(chosen?.sigungu ?? []).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {localLink !== null && localLink.kind === "web" ? (
        <p className="text-[0.8125rem] text-text-subtle-aa">
          {REGIONAL_TEXT.missingSigungu}{" "}
          <a href={localLink.href} {...EXTERNAL_LINK_PROPS} className="rounded-xs text-primary-text underline underline-offset-2">
            {REGIONAL_TEXT.missingSigunguLink}
            <span className="sr-only">{REGIONAL_TEXT.newTab}</span>
          </a>
          {REGIONAL_TEXT.missingSigunguTail}
        </p>
      ) : null}

      {chosen === null ? (
        <p className="text-[0.8125rem] text-text-secondary">{REGIONAL_TEXT.pickSido}</p>
      ) : (
        <>
          {place !== null && selection.sigungu.length > 0 ? (
            <ProgramGroup
              group="sigungu"
              title={REGIONAL_TEXT.regionTitle(`${chosen.name} ${place}`)}
              programs={selection.sigungu}
              expanded={expanded.has("sigungu")}
              onExpand={onExpand}
            />
          ) : null}
          {selection.sido.length > 0 ? (
            <ProgramGroup
              group="sido"
              title={REGIONAL_TEXT.regionTitle(chosen.name)}
              programs={selection.sido}
              expanded={expanded.has("sido")}
              onExpand={onExpand}
            />
          ) : null}
          {place === null && chosen.sigungu.length > 0 ? (
            <p className="text-[0.8125rem] text-text-secondary">{REGIONAL_TEXT.pickSigungu}</p>
          ) : selection.sido.length === 0 && selection.sigungu.length === 0 ? (
            <p className="text-[0.8125rem] text-text-secondary">{REGIONAL_TEXT.noLocal}</p>
          ) : null}
        </>
      )}

      {selection.national.length > 0 ? (
        <ProgramGroup
          group="national"
          title={REGIONAL_TEXT.nationalTitle}
          programs={selection.national}
          expanded={expanded.has("national")}
          onExpand={onExpand}
        />
      ) : null}
    </div>
  );
}

function ProgramGroup({
  group,
  title,
  programs,
  expanded,
  onExpand,
}: {
  group: GroupKey;
  title: string;
  programs: readonly RegionalProgram[];
  expanded: boolean;
  onExpand: (group: GroupKey) => void;
}) {
  const shown = expanded ? programs : programs.slice(0, INITIAL_VISIBLE);
  const hidden = programs.length - shown.length;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[0.9375rem] font-semibold text-text-primary">
        {title} <span className="font-normal text-text-subtle-aa">{REGIONAL_TEXT.count(programs.length)}</span>
      </h3>
      <ul className="flex flex-col">
        {shown.map((p, i) => (
          <li key={p.id} className={cx("flex flex-col gap-0.5 py-3", i > 0 && "border-t border-divider")}>
            <ProgramRow program={p} linkId={programLinkId(group, i)} />
          </li>
        ))}
      </ul>
      {hidden > 0 ? <SecondaryButton onClick={() => onExpand(group)}>{REGIONAL_TEXT.showMore(hidden)}</SecondaryButton> : null}
    </div>
  );
}

function ProgramRow({ program, linkId }: { program: RegionalProgram; linkId: string }) {
  const link = supportLink(program.url);
  return (
    <>
      <p className="text-[0.9375rem] font-semibold text-text-primary">{program.name}</p>
      <p className="text-[0.8125rem] text-text-secondary">{program.agency}</p>
      {program.summary !== "" ? <p className="text-[0.8125rem] text-text-subtle-aa">{program.summary}</p> : null}
      {link !== null && link.kind === "web" ? (
        <a
          id={linkId}
          href={link.href}
          {...EXTERNAL_LINK_PROPS}
          className="inline-flex min-h-11 items-center gap-1 self-start rounded-chip text-[0.875rem] font-semibold text-primary-text underline underline-offset-2"
        >
          <span className="sr-only">{program.name} </span>
          {REGIONAL_TEXT.detail}
          <SquareArrowUpRight aria-hidden className="size-4 shrink-0" />
          <span className="sr-only">{REGIONAL_TEXT.newTab}</span>
        </a>
      ) : null}
    </>
  );
}
