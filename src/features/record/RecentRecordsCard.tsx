import { useId } from "react";
import { Card, SectionTitle } from "@/components/ui";
import { RECORD_TEXT, type RecentRecordRow } from "./recordView";

// 최근 기록 — RecordFlowView.swift:106-129. 최신 5건: 점(8) · 날짜 13 textSecondary · 오른쪽 "위험신호 없음"/"병원 신호" 13 semibold.
// 점 색과 글자 색이 같고, 글자가 상태를 말하므로 색만으로 구분하지 않는다.
export function RecentRecordsCard({ rows }: { rows: readonly RecentRecordRow[] }) {
  const titleId = useId();
  return (
    <Card as="section" aria-labelledby={titleId} className="flex flex-col gap-2">
      <SectionTitle id={titleId}>{RECORD_TEXT.recentTitle}</SectionTitle>
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-2 border-t border-divider pt-2 first:border-t-0 first:pt-0">
            <span aria-hidden className={`size-2 shrink-0 rounded-full ${r.flagged ? "bg-state-alert" : "bg-state-normal"}`} />
            <time dateTime={r.iso} className="text-[0.8125rem] text-text-secondary">
              {r.dateText}
            </time>
            <span className={`ml-auto text-[0.8125rem] font-semibold ${r.flagged ? "text-state-alert" : "text-state-normal"}`}>
              {r.label}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
