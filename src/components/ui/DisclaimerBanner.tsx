import { Info } from "lucide-react";
import content from "@/content";
import { splitFirstSentence } from "./labels";

// "의료기기 아님" 면책 배너 — AnalyzeComponents.swift:117-138.
// 첫 줄 12 semibold, 둘째 줄 13 regular, 모두 textSecondary. 배경 background, 라운드 14, 패딩 16.
// 문구는 content.json disclaimers.home_footer(= Swift :124 + :127 두 문장)에서 나눠 쓴다.
const [headline, body] = splitFirstSentence(content.disclaimers.home_footer);

export function DisclaimerBanner() {
  return (
    <div role="note" className="flex w-full items-start gap-2 rounded-button bg-background p-4">
      <Info aria-hidden className="mt-0.5 size-3.5 shrink-0 fill-text-secondary text-background" />
      <div className="flex min-w-0 flex-col gap-1 text-text-secondary">
        <p className="text-xs font-semibold">{headline}</p>
        {body ? <p className="text-[0.8125rem]">{body}</p> : null}
      </div>
    </div>
  );
}
