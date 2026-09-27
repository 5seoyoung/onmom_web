// 공용 컴포넌트가 쓰는 표시 라벨.
// 지표 상태·심각도 라벨은 규칙 모듈이 단일 출처다(08 §3-1 "규칙은 한 곳") — 여기서는 다시 내보내기만 한다.
//   METRIC_STATUS_LABEL: rules/redflag.ts (원문: Models.swift:59-61)
//   severityLabel: rules/recovery.ts (원문: AnalyzeComponents.swift:33-34). 모르는 코드는 null — 원시 코드를 화면에 내지 않는다.
export { METRIC_STATUS_LABEL } from "@/rules/redflag";
export { severityLabel } from "@/rules/recovery";

/**
 * 면책 문구를 첫 문장과 나머지로 나눈다.
 * iOS DisclaimerBanner(AnalyzeComponents.swift:124·127)는 두 문장을 다른 굵기로 두 줄에 보여 준다.
 * 같은 두 문장이 content.json `disclaimers.home_footer`에 한 줄로 있으므로, 재입력하지 않고 나눠 쓴다.
 * 나눌 곳이 없으면 한 줄 그대로.
 */
export function splitFirstSentence(text: string): [string] | [string, string] {
  const trimmed = text.trim();
  const match = /^(.+?[.?!])\s+(\S[\s\S]*)$/.exec(trimmed);
  return match ? [match[1], match[2]] : [trimmed];
}
