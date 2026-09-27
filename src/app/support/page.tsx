import type { Metadata } from "next";
import { SupportProgramScreen } from "@/features/support/SupportProgramScreen";
import { SUPPORT_TEXT } from "@/rules/support";

export const metadata: Metadata = { title: SUPPORT_TEXT.title };

export default function Page() {
  return <SupportProgramScreen />;
}
