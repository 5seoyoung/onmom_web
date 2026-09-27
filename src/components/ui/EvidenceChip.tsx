import { Children, isValidElement, type ReactNode } from "react";
import { FileSearch } from "lucide-react";
import { cx } from "./cx";
import { parseEvidenceToken } from "./evidence";

/**
 * default = 밝은 표면 위(AnalyzeComponents.swift:42-66)
 *   - 출처(src:) 칩: 문서 돋보기 아이콘 + primary 글씨 + primary 10% 배경
 *   - 근거 설명 칩: textSecondary 글씨 + background(#F9FAFB) 배경
 * inverse = RedFlagCard 안(AnalyzeResultView.swift:221-228): 둘 다 흰 글씨 + 흰 22% 배경, 아이콘 없음
 * 06 §5의 "divider 배경 / 출처는 회색"은 오기(검수 #26).
 */
export type EvidenceChipTone = "default" | "inverse";

export interface EvidenceChipProps {
  /** content.json·규칙 결과의 칩 토큰 그대로("src:" 접두 포함 가능) */
  token: string;
  tone?: EvidenceChipTone;
}

export function EvidenceChip({ token, tone = "default" }: EvidenceChipProps) {
  const { text, isSource } = parseEvidenceToken(token);
  // 스크린리더에는 아이콘 대신 "출처"를 읽어 준다(아이콘·색만으로 구분하지 않기).
  const sourceHint = isSource ? <span className="sr-only">출처: </span> : null;

  if (tone === "inverse") {
    return (
      <span className="inline-flex items-center rounded-full bg-white/22 px-2 py-1 text-xs font-medium text-white">
        {sourceHint}
        {text}
      </span>
    );
  }

  return (
    <span
      className={cx(
        "inline-flex items-center gap-0.75 rounded-full px-2 py-1 text-xs font-medium",
        isSource ? "bg-primary/10 text-primary" : "bg-background text-text-secondary",
      )}
    >
      {isSource ? <FileSearch aria-hidden className="size-2.5 shrink-0" strokeWidth={2.5} /> : null}
      {sourceHint}
      {text}
    </span>
  );
}

export interface ChipFlowProps {
  children: ReactNode;
  /** 목록의 접근성 이름(선택) */
  label?: string;
  className?: string;
}

// 줄바꿈되는 칩 나열 — FlowLayout(spacing 6, AnalyzeComponents.swift:70). 항목이 없으면 그리지 않는다.
export function ChipFlow({ children, label, className }: ChipFlowProps) {
  const items = Children.toArray(children);
  if (items.length === 0) return null;
  return (
    <ul aria-label={label} className={cx("flex flex-wrap gap-1.5", className)}>
      {items.map((child, i) => (
        <li key={isValidElement(child) && child.key != null ? child.key : i} className="flex">
          {child}
        </li>
      ))}
    </ul>
  );
}

export interface EvidenceChipListProps {
  tokens: readonly string[];
  tone?: EvidenceChipTone;
  label?: string;
  className?: string;
}

/** 칩 토큰 배열을 그대로 칩 줄로. 빈 배열이면 아무것도 그리지 않는다. */
export function EvidenceChipList({ tokens, tone = "default", label, className }: EvidenceChipListProps) {
  return (
    <ChipFlow label={label} className={className}>
      {tokens.map((token, i) => (
        <EvidenceChip key={`${i}-${token}`} token={token} tone={tone} />
      ))}
    </ChipFlow>
  );
}
