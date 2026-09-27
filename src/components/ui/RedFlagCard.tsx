import { TriangleAlert } from "lucide-react";
import { EvidenceChipList } from "./EvidenceChip";
import { severityLabel } from "./labels";

export interface RedFlagCardProps {
  /** 레드플래그 severity 코드("immediate" | "urgent") — 라벨은 EngineLabel.severity 원문 */
  severity: string;
  /** 규칙 결과의 환자용 문구(content.json red_flags[].message) 그대로 */
  message: string;
  /** 칩 토큰 그대로("src:" 접두 포함 가능) */
  chips?: readonly string[];
  /**
   * 버튼을 누른 뒤 새로 나타나는 경우(기록 결과) true — 스크린리더가 바로 읽도록 role="alert".
   * 처음부터 화면에 있는 카드에는 쓰지 않는다.
   */
  announce?: boolean;
}

// 병원 신호 카드 — AnalyzeResultView.swift:202-239.
// stateAlert 배경 전면, 흰 글씨, ⚠ 22 + 라벨 15 bold, 문구 18 bold, 칩은 흰 22% 캡슐, 패딩 24.
export function RedFlagCard({ severity, message, chips = [], announce = false }: RedFlagCardProps) {
  // 모르는 severity 코드는 라벨 없이 아이콘만 — 원시 코드를 화면에 내지 않는다
  const label = severityLabel(severity);
  return (
    <div
      role={announce ? "alert" : undefined}
      className="flex w-full flex-col gap-4 rounded-card bg-state-alert p-6 text-white shadow-[0_0.25rem_1.25rem_color-mix(in_srgb,var(--color-state-alert)_30%,transparent)]"
    >
      <div className="flex items-center gap-2">
        {/* 채운 삼각형처럼 보이게: 흰 면 + 배경색 느낌표 */}
        <TriangleAlert aria-hidden className="size-[1.375rem] shrink-0 fill-white text-state-alert" />
        {label !== null ? <p className="text-[0.9375rem] font-bold">{label}</p> : null}
      </div>
      <p className="text-lg font-bold">{message}</p>
      <EvidenceChipList tokens={chips} tone="inverse" />
    </div>
  );
}
