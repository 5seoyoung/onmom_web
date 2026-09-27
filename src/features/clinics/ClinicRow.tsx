import { BriefcaseMedical, Map as MapIcon, Phone } from "lucide-react";
import { EXTERNAL_LINK_PROPS } from "@/api/safeUrl";
import { Card } from "@/components/ui";
import type { ClinicRowView } from "./clinicsView";

// 병원 한 곳 — NearbyClinicsView.swift:95-144(ClinicRow).
// 코랄 12% 원(44) + 의료 가방 아이콘 · 이름 16 semibold · 직선거리 13 · 전화 13 · 오른쪽 전화/지도 원형 버튼(coralTint).
// 버튼은 iOS 40pt보다 조금 큰 44(2.75rem) — 웹 누르는 영역 기준.
const roundButton =
  "flex size-11 shrink-0 items-center justify-center rounded-full bg-coral-tint text-primary forced-colors:border forced-colors:border-[ButtonText]";

export function ClinicRow({ row }: { row: ClinicRowView }) {
  return (
    <Card as="article" className="flex items-center gap-4">
      <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
        <BriefcaseMedical className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h3 className="text-base font-semibold text-text-primary">{row.name}</h3>
        <p className="text-[0.8125rem] text-text-secondary">{row.distance}</p>
        {row.phone !== null ? <p className="truncate text-[0.8125rem] text-text-secondary">{row.phone}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {row.telHref !== null ? (
          <a href={row.telHref} aria-label={row.callLabel} className={roundButton}>
            <Phone aria-hidden className="size-[1.125rem] fill-primary" />
          </a>
        ) : null}
        {row.mapHref !== null ? (
          <a href={row.mapHref} {...EXTERNAL_LINK_PROPS} aria-label={row.mapLabel} className={roundButton}>
            <MapIcon aria-hidden className="size-[1.125rem] fill-primary/25" />
          </a>
        ) : null}
      </div>
    </Card>
  );
}
