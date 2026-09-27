"use client";

// 가까운 산부인과 — 기록 결과(레드플래그 카드 아래)와 지역 연계 화면이 함께 쓴다(NearbyClinicsView.swift).
// 동네 입력 카드 → 안내문 → (찾는 중 | 오류 카드 | 지도 + 병원 목록). 기기 위치 권한은 쓰지 않는다.
// 동네 값은 부모가 프로필(profile.neighborhood)과 묶어 넘긴다(RecordFlowView.swift:273-276, RegionResourcesView.swift:11).
// 카카오 JS 키가 없으면 입력·안내문은 그대로 두고 "준비 중" 카드만 보인다(D6).
// PC(lg 이상), 넓은 자리(layout="wide" — 지역 연계 화면): 입력·안내는 읽기 폭(READING_BLOCK — 읽기 화면의 글줄과 같은 45rem),
// 병원 목록은 두 열.
// 지도 높이는 그대로 둔다(크기가 바뀌면 SDK relayout이 필요하다).
// 기록 결과처럼 좁은 열 안에서는 기본값(layout="stack") — 폰과 같은 한 줄이다.

import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from "react";
import { Hourglass, LoaderCircle, MapPinOff, Search } from "lucide-react";
import { isClinicSearchConfigured, searchNearbyClinics } from "@/api/clinics";
import { READING_BLOCK } from "@/components/shell/pageFrame";
import { Card, SectionTitle, cx } from "@/components/ui";
import { config } from "@/config";
import { ClinicMap } from "./ClinicMap";
import { ClinicRow } from "./ClinicRow";
import {
  CLINICS_TEXT,
  clinicRowView,
  initialClinicsState,
  shouldAutoSearch,
  stateFromSearchResult,
  type ClinicsViewState,
} from "./clinicsView";

export interface NearbyClinicsProps {
  /** 내 동네(프로필에 저장된 값) */
  address: string;
  onAddressChange: (address: string) => void;
  /** 놓이는 자리의 폭 — "wide"면 PC(lg)에서 목록 두 열. 기본 "stack"(좁은 열·폰과 같은 한 줄) */
  layout?: "stack" | "wide";
}

/** PC(lg)에서 넓은 자리일 때만 붙는 클래스 — 폰은 어느 쪽이든 같다 */
const WIDE = {
  field: READING_BLOCK,
  list: "lg:grid lg:grid-cols-2",
} as const;

export function NearbyClinics({ address, onAddressChange, layout = "stack" }: NearbyClinicsProps) {
  const wide = layout === "wide";
  const titleId = useId();
  const configured = isClinicSearchConfigured();
  // 처음 나타날 때의 동네·상태 — 저장된 동네가 있으면 바로 찾는다(NearbyClinicsView.swift:70-72)
  const [mount] = useState(() => ({ address, auto: configured && shouldAutoSearch(address) }));
  const [view, setView] = useState<ClinicsViewState>(() => initialClinicsState(configured, address));
  /** 마지막 요청 번호 — 늦게 도착한 이전 검색 결과는 버린다 */
  const requestSeq = useRef(0);

  // 처음 나타날 때 한 번만(iOS .task)
  useEffect(() => {
    if (mount.auto) runSearch(mount.address, requestSeq, setView);
    return () => {
      // 화면을 떠나면 진행 중인 검색 결과를 버린다
      requestSeq.current += 1;
    };
  }, [mount]);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!configured) return;
    setView({ status: "loading" });
    runSearch(address, requestSeq, setView);
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <Card className={cx(wide && WIDE.field)}>
        <form role="search" aria-labelledby={titleId} onSubmit={handleSubmit} className="flex flex-col gap-2">
          <SectionTitle id={titleId}>{CLINICS_TEXT.addressTitle}</SectionTitle>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={address}
              onChange={(e) => onAddressChange(e.target.value)}
              placeholder={CLINICS_TEXT.addressPlaceholder}
              aria-labelledby={titleId}
              autoCapitalize="none"
              enterKeyHint="search"
              className="min-h-11 min-w-0 flex-1 bg-transparent text-base text-text-primary placeholder:text-text-subtle"
            />
            <button
              type="submit"
              disabled={!configured}
              aria-label={CLINICS_TEXT.searchLabel}
              className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-primary disabled:cursor-not-allowed disabled:text-text-subtle"
            >
              <Search aria-hidden className="size-[1.125rem]" strokeWidth={2.5} />
            </button>
          </div>
        </form>
      </Card>

      <div className={cx("w-full", wide && WIDE.field)}>
        <p className="text-[0.8125rem] text-text-secondary">{CLINICS_TEXT.intro}</p>
        {/* 상태(찾는 중·오류·준비 중)는 늘 있는 live region 안에서 바뀐다 — 스크린리더가 검색 결과 상태를 듣게.
            비어 있을 때 간격이 생기지 않도록 위 간격(16)은 안쪽 요소가 갖는다. */}
        <div aria-live="polite">
          {view.status === "loading" ? (
            <div className="flex justify-center pt-4">
              <div className="py-6">
                <LoaderCircle aria-hidden className="size-6 animate-spin text-primary motion-reduce:animate-none" />
                <span className="sr-only">{CLINICS_TEXT.loading}</span>
              </div>
            </div>
          ) : view.status === "error" ? (
            <StatusCard icon="error" text={view.message} />
          ) : view.status === "notConfigured" ? (
            <StatusCard icon="notConfigured" text={CLINICS_TEXT.notConfigured} />
          ) : null}
        </div>
      </div>

      {view.status === "results" ? (
        <>
          {config.kakaoJsKey !== null ? (
            <ClinicMap kakaoJsKey={config.kakaoJsKey} center={view.center} clinics={view.clinics} />
          ) : null}
          <ul className={cx("flex flex-col gap-4", wide && WIDE.list)}>
            {view.clinics.map((c) => (
              <li key={c.id} className="min-w-0">
                <ClinicRow row={clinicRowView(c)} />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

/** 검색을 시작하고, 마지막 요청의 결과만 화면에 반영한다. 실패도 결과 값으로 온다(api/clinics는 던지지 않는다). */
function runSearch(raw: string, seqRef: RefObject<number>, apply: (next: ClinicsViewState) => void) {
  const seq = ++seqRef.current;
  void searchNearbyClinics(raw).then((result) => {
    if (seq === seqRef.current) apply(stateFromSearchResult(result));
  });
}

/** 오류·준비 중 카드 — 아이콘 + 13 textSecondary(NearbyClinicsView.swift:57-64). 오류 아이콘은 stateWatch. */
function StatusCard({ icon, text }: { icon: "error" | "notConfigured"; text: string }) {
  const Icon = icon === "error" ? MapPinOff : Hourglass;
  return (
    <div className="pt-4">
      <Card className="flex items-start gap-2">
        <Icon aria-hidden className={`mt-0.5 size-4 shrink-0 ${icon === "error" ? "text-state-watch" : "text-text-subtle"}`} />
        <p className="text-[0.8125rem] text-text-secondary">{text}</p>
      </Card>
    </div>
  );
}
