import type { Metadata } from "next";
import { ChatScreen } from "@/features/chat/ChatScreen";
import { CHAT_TEXT } from "@/features/chat/chatModel";

export const metadata: Metadata = { title: CHAT_TEXT.title };

export default function Page() {
  return <ChatScreen />;
}
