import { JournalPostScreen } from "@/features/journal/JournalPostScreen";

// 글 상세 — /journal/post/?id=… (글은 브라우저에만 있어 정적 경로를 미리 만들 수 없다)
export default function Page() {
  return <JournalPostScreen />;
}
