import type { Metadata } from "next";
import { AnalyzeScreen } from "@/features/analyze/AnalyzeScreen";
import { ANALYZE_TEXT } from "@/features/analyze/analyzeModel";

export const metadata: Metadata = { title: ANALYZE_TEXT.title };

export default function Page() {
  return <AnalyzeScreen />;
}
