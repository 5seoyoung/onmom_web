import type { Metadata } from "next";
import { RecordEditScreen } from "@/features/record/RecordEditScreen";
import { RECORD_HISTORY_TEXT } from "@/features/record/recordHistoryView";

export const metadata: Metadata = { title: RECORD_HISTORY_TEXT.editTitle };

// 증상 기록 수정 — /record/edit/?id=… (기록은 브라우저에만 있어 정적 경로를 미리 만들 수 없다)
export default function Page() {
  return <RecordEditScreen />;
}
