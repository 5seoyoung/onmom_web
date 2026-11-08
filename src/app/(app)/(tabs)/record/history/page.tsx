import type { Metadata } from "next";
import { RecordHistoryScreen } from "@/features/record/RecordHistoryScreen";
import { RECORD_HISTORY_TEXT } from "@/features/record/recordHistoryView";

export const metadata: Metadata = { title: RECORD_HISTORY_TEXT.title };

// 전체 기록 — 증상 기록·오늘의 질문 답 전부(수정·삭제)
export default function Page() {
  return <RecordHistoryScreen />;
}
