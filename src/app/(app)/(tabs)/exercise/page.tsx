import type { Metadata } from "next";
import { ExerciseScreen } from "@/features/exercise/ExerciseScreen";
import { EXERCISE_TEXT } from "@/rules/exercise";

export const metadata: Metadata = { title: EXERCISE_TEXT.headerTitle };

export default function Page() {
  return <ExerciseScreen />;
}
