import type { Metadata } from "next";
import { GuideScreen } from "@/features/guide/GuideScreen";
import { GUIDE_TEXT } from "@/features/guide/guideContent";

export const metadata: Metadata = { title: GUIDE_TEXT.title };

export default function Page() {
  return <GuideScreen />;
}
