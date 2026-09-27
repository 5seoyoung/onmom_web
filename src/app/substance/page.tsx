import type { Metadata } from "next";
import { SubstanceCheckScreen } from "@/features/substance/SubstanceCheckScreen";

export const metadata: Metadata = {
  title: "약물·음식 체크", // 원문: SubstanceCheckView.swift:56
};

export default function Page() {
  return <SubstanceCheckScreen />;
}
