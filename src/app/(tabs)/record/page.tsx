import type { Metadata } from "next";
import { RecordScreen } from "@/features/record/RecordScreen";
import { RECORD_TEXT } from "@/features/record/recordView";

export const metadata: Metadata = { title: RECORD_TEXT.title };

export default function Page() {
  return <RecordScreen />;
}
