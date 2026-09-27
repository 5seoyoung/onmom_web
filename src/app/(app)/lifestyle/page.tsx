import type { Metadata } from "next";
import { LifestyleScreen } from "@/features/lifestyle/LifestyleScreen";
import { LIFESTYLE_TEXT } from "@/features/lifestyle/lifestyleContent";

export const metadata: Metadata = { title: LIFESTYLE_TEXT.title };

export default function Page() {
  return <LifestyleScreen />;
}
