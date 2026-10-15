import type { Metadata } from "next";
import { SubstanceCheckScreen } from "@/features/substance/SubstanceCheckScreen";
import { SUBSTANCE_TEXT } from "@/features/substance/substanceModel";

export const metadata: Metadata = { title: SUBSTANCE_TEXT.title };

export default function Page() {
  return <SubstanceCheckScreen />;
}
