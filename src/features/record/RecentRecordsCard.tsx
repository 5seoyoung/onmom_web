import { useId } from "react";
import { Card, SectionTitle } from "@/components/ui";
import { RECORD_TEXT, type RecentRecordRow } from "./recordView";

// 최근 기록 — RecordFlowView.swift:106-129. 최신 5건: 점(8) · 날짜 13 textSecondary · 오른쪽 "위험신호 없음"/"병원 신호" 13 semibold.
// 점 색과 글자 색이 같고, 글자가 상태를 말하므로 색만으로 구분하지 않는다.
// 웹 추가(04 §1 저장 권장, 검수 #46): 그 기록에서 켜져 있던 위험 증상 토글의 라벨을 줄 아래에 보인다(RECORD_TEXT 원문, 새 문구 없음).
// 옛 기록·필드가 없는 기록은 빈 배열이라 줄이 없다 — iOS와 같은 모양.
export function RecentRecordsCard({ rows }: { rows: readonly RecentRecordRow[] }) {
  const titleId = useId();
  return (
    <Card as="section" aria-labelledby={titleId} className="flex flex-col gap-2">
      <SectionTitle id={titleId}>{RECORD_TEXT.recentTitle}</SectionTitle>
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-col gap-1 border-t border-divider pt-2 first:border-t-0 first:pt-0">
            <div className="flex items-center gap-2">
              <span aria-hidden className={`size-2 shrink-0 rounded-full ${r.flagged ? "bg-state-alert" : "bg-state-normal"}`} />
              <time dateTime={r.iso} className="text-[0.8125rem] text-text-secondary">
                {r.dateText}
              </time>
              <span className={`ml-auto text-[0.8125rem] font-semibold ${r.flagged ? "text-state-alert-text" : "text-state-normal-text"}`}>
                {r.label}
              </span>
            </div>
            {r.signals.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5 pl-4">
                {r.signals.map((label) => (
                  <li key={label} className="rounded-full bg-state-alert/12 px-2.5 py-1 text-xs font-medium text-state-alert-text">
                    {label}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}
