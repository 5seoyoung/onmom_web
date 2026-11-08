import { JournalEditScreen } from "@/features/journal/JournalEditScreen";

// 글 수정 — /journal/edit/?id=… (글은 브라우저에만 있어 정적 경로를 미리 만들 수 없다)
export default function Page() {
  return <JournalEditScreen />;
}
