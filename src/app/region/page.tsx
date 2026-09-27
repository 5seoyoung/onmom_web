import type { Metadata } from "next";
import { RegionScreen } from "@/features/region/RegionScreen";
import { REGION_TEXT } from "@/features/region/regionText";

export const metadata: Metadata = { title: REGION_TEXT.title };

export default function Page() {
  return <RegionScreen />;
}
